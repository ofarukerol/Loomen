// Graf verisi — saf modül (React/d3 çalışma zamanı istemez, node testinden çağrılır).
//
// Kenar yalnız kullanıcının notlara açıkça yazdığı bağlantılardan çıkar: [[wiki]] ve not hedefli
// markdown bağlantısı. Etiket düğümleri ve var olmayan hedefler (hayalet düğümler) seçenekle açılır.
// Çizim (.excalidraw) dosyalarının JSON içeriği ayrıştırılmaz; ekler (resim, pdf…) düğüm olmaz.

import type { SimulationNodeDatum } from "d3-force";
import { extractMarkdownLinks, extractTags, extractWikiLinks } from "../../core/markdown/links";
import { foldTr } from "../../core/search/search";

/** note: kasadaki dosya · tag: #etiket · ghost: bağlantısı yazılmış ama dosyası olmayan not. */
export type NodeKind = "note" | "tag" | "ghost";
/** Kenarın kaynağı: [[wiki]], [metin](yol.md) ya da not → #etiket. */
export type LinkKind = "wiki" | "markdown" | "tag";

export interface GNode extends SimulationNodeDatum {
  id: string; // not: path · etiket: "#"+ad · hayalet: "?"+katlanmış ad
  name: string; // ekranda görünen etiket
  deg: number;
  kind: NodeKind;
}
export interface GLink {
  source: string | GNode;
  target: string | GNode;
  kind: LinkKind;
}

export interface GraphOptions {
  /** #etiketleri düğüm olarak göster ve notları onlara bağla. */
  tags: boolean;
  /** Hiç bağlantısı olmayan notları göster. */
  orphans: boolean;
  /** Var olmayan hedef notları (hayalet) düğüm olarak göster. */
  ghosts: boolean;
}

/** Varsayılan: yalnız açık bağlantılar; bağlantısız notlar Obsidian'daki gibi görünür. */
export const GRAPH_OPTION_DEFAULTS: GraphOptions = { tags: false, orphans: true, ghosts: false };

export interface GraphModel {
  nodes: GNode[];
  links: GLink[];
  /** En çok bağlantılı not (etiket/hayalet hariç); boş grafta null. */
  hubId: string | null;
  neighbors: Map<string, Set<string>>;
  noteCount: number;
  tagCount: number;
  ghostCount: number;
}

export interface GraphNoteInput {
  path: string;
  name: string;
  /** Yoksa "note" sayılır. */
  kind?: "note" | "draw";
}

const NOTE_EXT = /\.(md|excalidraw)$/i;
// Bağlantı hedefi bunlardan biriyse ek dosyasıdır: not değil, hayalet düğüm de olmaz.
const ATTACHMENT_EXT =
  /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|heic|avif|ico|pdf|mp3|wav|m4a|ogg|oga|flac|aac|webm|mp4|mov|mkv|avi|zip|rar|7z|gz|tar|csv|tsv|xlsx?|docx?|pptx?|txt|json|canvas|base)$/i;

const nfc = (s: string) => s.normalize("NFC");
const stripExt = (p: string) => p.replace(NOTE_EXT, "");
const folderOf = (path: string) => {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
};

/** "a/./b/../c" → "a/c"; köke çıkan ".." atılır. */
function normalizePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/** Aynı anahtara düşen birden çok not varsa: kaynakla aynı klasördeki, yoksa en kısa yollu. */
function pick(cands: string[] | undefined, fromFolder: string): string | undefined {
  if (!cands || cands.length === 0) return undefined;
  if (cands.length === 1) return cands[0];
  const local = cands.find((p) => folderOf(p) === fromFolder);
  if (local) return local;
  return [...cands].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
}

function push(map: Map<string, string[]>, key: string, path: string) {
  const arr = map.get(key);
  if (arr) arr.push(path);
  else map.set(key, [path]);
}

/** Vault notları + açık bağlantılardan graf verisi (düğüm, kenar, hub, komşuluk). */
export function buildGraphModel(
  notes: readonly GraphNoteInput[],
  contents: Record<string, string>,
  opts: GraphOptions,
): GraphModel {
  // Ad ve yol indeksleri: tam (NFC) ve Türkçe harf katlamalı.
  const byName = new Map<string, string[]>();
  const byFoldName = new Map<string, string[]>();
  const byPath = new Map<string, string[]>();
  const byFoldPath = new Map<string, string[]>();
  for (const n of notes) {
    push(byName, nfc(n.name), n.path);
    push(byFoldName, foldTr(n.name), n.path);
    push(byPath, stripExt(nfc(n.path)), n.path);
    push(byFoldPath, foldTr(stripExt(n.path)), n.path);
  }

  const byPathOf = (p: string, from: string) =>
    pick(byPath.get(stripExt(nfc(p))), from) ?? pick(byFoldPath.get(foldTr(stripExt(p))), from);
  const byNameOf = (name: string, from: string) =>
    pick(byName.get(stripExt(nfc(name))), from) ?? pick(byFoldName.get(foldTr(stripExt(name))), from);

  /** [[hedef]]: ad → yol → "…/hedef" son eki (Obsidian kısmi yol). */
  const resolveWiki = (target: string, from: string): string | undefined => {
    if (!target.includes("/")) return byNameOf(target, from);
    const t = normalizePath(target);
    const direct = byPathOf(t, from);
    if (direct) return direct;
    const tail = "/" + foldTr(stripExt(t));
    return pick(
      notes.filter((n) => ("/" + foldTr(stripExt(n.path))).endsWith(tail)).map((n) => n.path),
      from,
    );
  };

  /** [metin](yol): kaynak klasöre göre göreli → kasa kökü → (eğik çizgisizse) ad. */
  const resolveMarkdown = (href: string, from: string): string | undefined => {
    if (href.startsWith("/")) return byPathOf(normalizePath(href), from);
    return (
      byPathOf(normalizePath(from ? `${from}/${href}` : href), from) ??
      byPathOf(normalizePath(href), from) ??
      (href.includes("/") ? undefined : byNameOf(href, from))
    );
  };

  const noteNodes: GNode[] = notes.map((n) => ({ id: n.path, name: n.name, deg: 0, kind: "note" }));
  const deg = new Map<string, number>(noteNodes.map((n) => [n.id, 0]));
  const links: GLink[] = [];
  const seen = new Set<string>();
  const neighbors = new Map<string, Set<string>>();
  const ghostNodes = new Map<string, GNode>();
  const tagNodes = new Map<string, GNode>();

  const near = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    neighbors.get(a)!.add(b);
  };
  const addEdge = (a: string, b: string, kind: LinkKind) => {
    if (a === b) return;
    const key = a < b ? `${a}→${b}` : `${b}→${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source: a, target: b, kind });
    deg.set(a, (deg.get(a) ?? 0) + 1);
    deg.set(b, (deg.get(b) ?? 0) + 1);
    near(a, b);
    near(b, a);
  };
  /**
   * Çözülemeyen hedef: hayalet açıksa düğüm üret. Ek dosyası hiç sayılmaz; markdown hedefi
   * yalnız uzantısızsa ya da .md ise not sayılır (`site.com`, `main.rs` not değil).
   * Kimlik dosya adıdır: [[Yok]], [y](Yok.md) ve [y](./x/Yok.md) aynı hayalete bağlanır.
   */
  const ghostFor = (target: string, markdown: boolean): string | undefined => {
    if (!opts.ghosts || ATTACHMENT_EXT.test(target)) return undefined;
    const base = normalizePath(nfc(target)).split("/").pop() ?? "";
    if (markdown && /\.[^.\s]+$/.test(base) && !/\.md$/i.test(base)) return undefined;
    const name = stripExt(base).trim();
    if (!name) return undefined;
    const id = "?" + foldTr(name);
    if (!ghostNodes.has(id)) {
      ghostNodes.set(id, { id, name, deg: 0, kind: "ghost" });
      deg.set(id, 0);
    }
    return id;
  };

  for (const n of notes) {
    if ((n.kind ?? "note") !== "note") continue; // çizim JSON'u bağlantı kaynağı değil
    const content = contents[n.path] ?? "";
    if (!content) continue;
    const from = folderOf(n.path);
    for (const target of extractWikiLinks(content)) {
      const to = resolveWiki(target, from) ?? ghostFor(target, false);
      if (to) addEdge(n.path, to, "wiki");
    }
    for (const href of extractMarkdownLinks(content)) {
      const to = resolveMarkdown(href, from) ?? ghostFor(href, true);
      if (to) addEdge(n.path, to, "markdown");
    }
    if (opts.tags) {
      for (const tag of extractTags(content)) {
        const id = "#" + tag;
        if (!tagNodes.has(id)) {
          tagNodes.set(id, { id, name: id, deg: 0, kind: "tag" });
          deg.set(id, 0);
        }
        addEdge(n.path, id, "tag");
      }
    }
  }

  let nodes: GNode[] = [...noteNodes, ...ghostNodes.values(), ...tagNodes.values()];
  nodes.forEach((n) => (n.deg = deg.get(n.id) ?? 0));

  // Yetimler: bağlantısı olmayan notları gizle (etiket/hayalet düğümleri daima en az 1 bağlantılı)
  if (!opts.orphans) nodes = nodes.filter((n) => n.kind !== "note" || n.deg > 0);

  const hubId =
    nodes.reduce<GNode | null>((a, b) => (b.kind === "note" && (!a || b.deg > a.deg) ? b : a), null)?.id ?? null;
  return {
    nodes,
    links,
    hubId,
    neighbors,
    noteCount: noteNodes.length,
    tagCount: tagNodes.size,
    ghostCount: ghostNodes.size,
  };
}

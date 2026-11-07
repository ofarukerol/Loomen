// EPUB yapısı (LOM-83, EPUB parçası). Saf: DOM istemez, node testinde koşar.
//
// container.xml → OPF yolu; OPF'ten başlık/yazar/dil, manifest, spine (okuma sırası), kapak;
// içindekiler EPUB 3 nav.xhtml'den, yoksa EPUB 2 toc.ncx'ten. Yapı dosyaları için burada küçük
// bir XML okuyucu var (DOMParser'a bağlanmadan test edilebilsin). Bölüm XHTML'i görüntüleyicide
// tarayıcının DOMParser'ıyla açılır; bölüm CSS'ini kapsamlayan `scopeCss` da buradadır.

import type { ZipArchive } from "./zip";

export class EpubError extends Error {
  constructor(
    message: string,
    readonly code: "notEpub" | "drm" | "broken" = "broken"
  ) {
    super(message);
    this.name = "EpubError";
  }
}

// ─── Küçük XML okuyucu ────────────────────────────────────────────────────────────

export interface XmlElement {
  /** Önekli ad olduğu gibi ("dc:title"). */
  name: string;
  /** Önek atılmış, küçük harf ad ("title"). */
  local: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "­",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  copy: "©",
};

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const localName = (n: string) => n.slice(n.indexOf(":") + 1).toLowerCase();

/**
 * Hoşgörülü XML okuyucu: yorum, CDATA, işlem talimatı ve DOCTYPE atlanır; kapanmamış etiketler
 * belge sonunda kapanır, eşleşmeyen kapanış yok sayılır. Kök öğeyi döndürür.
 */
export function parseXml(src: string): XmlElement {
  const root: XmlElement = { name: "#root", local: "#root", attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  let i = 0;
  const n = src.length;
  const text = (s: string) => {
    if (s) stack[stack.length - 1].children.push(decodeEntities(s));
  };
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      text(src.slice(i));
      break;
    }
    if (lt > i) text(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const e = src.indexOf("-->", lt + 4);
      i = e < 0 ? n : e + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const e = src.indexOf("]]>", lt + 9);
      stack[stack.length - 1].children.push(src.slice(lt + 9, e < 0 ? n : e));
      i = e < 0 ? n : e + 3;
    } else if (src.startsWith("<?", lt)) {
      const e = src.indexOf("?>", lt + 2);
      i = e < 0 ? n : e + 2;
    } else if (src.startsWith("<!", lt)) {
      // DOCTYPE; iç alt küme ([...]) olabilir.
      let j = lt + 2;
      let depth = 0;
      for (; j < n; j++) {
        const c = src[j];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth <= 0) break;
      }
      i = j + 1;
    } else if (src[lt + 1] === "/") {
      const e = src.indexOf(">", lt);
      const name = src.slice(lt + 2, e < 0 ? n : e).trim();
      i = e < 0 ? n : e + 1;
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
    } else {
      // Açılış etiketi: tırnak içindeki ">" etiketi bitirmez.
      let j = lt + 1;
      let quote = "";
      for (; j < n; j++) {
        const c = src[j];
        if (quote) {
          if (c === quote) quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      let body = src.slice(lt + 1, j);
      i = j + 1;
      const selfClose = body.endsWith("/");
      if (selfClose) body = body.slice(0, -1);
      const m = /^([^\s/>]+)/.exec(body);
      if (!m) {
        text("<");
        i = lt + 1;
        continue;
      }
      const el: XmlElement = { name: m[1], local: localName(m[1]), attrs: {}, children: [] };
      const re = /([^\s=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
      re.lastIndex = m[1].length;
      let a: RegExpExecArray | null;
      while ((a = re.exec(body))) el.attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
      stack[stack.length - 1].children.push(el);
      if (!selfClose) stack.push(el);
    }
  }
  const first = root.children.find((c): c is XmlElement => typeof c !== "string");
  if (!first) throw new EpubError("XML boş");
  return first;
}

export function* walkXml(el: XmlElement): Generator<XmlElement> {
  yield el;
  for (const c of el.children) if (typeof c !== "string") yield* walkXml(c);
}

export function findAll(el: XmlElement, local: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const e of walkXml(el)) if (e.local === local) out.push(e);
  return out;
}

export function findFirst(el: XmlElement, local: string): XmlElement | null {
  for (const e of walkXml(el)) if (e.local === local) return e;
  return null;
}

export function xmlText(el: XmlNode): string {
  if (typeof el === "string") return el;
  return el.children.map(xmlText).join("");
}

/** Öznitelik: önce tam adla, yoksa önek atılmış adla ("opf:role" → "role"). */
function attr(el: XmlElement, name: string): string | undefined {
  if (name in el.attrs) return el.attrs[name];
  const want = localName(name);
  for (const k of Object.keys(el.attrs)) if (localName(k) === want) return el.attrs[k];
  return undefined;
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// ─── Yollar ───────────────────────────────────────────────────────────────────────

/** Arşiv içi yolun klasörü ("OEBPS/text/ch1.xhtml" → "OEBPS/text/"). */
export function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i + 1);
}

/** `href` bir dış adres mi (http:, mailto:, data: …)? */
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href.trim()) || href.trim().startsWith("//");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Göreli bağlantıyı arşiv yoluna çöz. Parça (#…) ayrı döner. Dış adres ve arşiv kökünü aşan
 * yol için null.
 */
export function resolveHref(base: string, href: string): { path: string; fragment?: string } | null {
  const h = href.trim();
  if (!h || isExternalHref(h)) return null;
  const hash = h.indexOf("#");
  const rawPath = (hash < 0 ? h : h.slice(0, hash)).replace(/\?.*$/, "");
  const fragment = hash < 0 ? undefined : safeDecode(h.slice(hash + 1)) || undefined;
  if (!rawPath) return { path: base, fragment };
  const parts = (rawPath.startsWith("/") ? "" : dirOf(base)).split("/").filter(Boolean);
  for (const seg of safeDecode(rawPath).replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return { path: parts.join("/"), fragment };
}

// ─── Kitap yapısı ─────────────────────────────────────────────────────────────────

export interface ManifestItem {
  id: string;
  /** Arşiv yolu (çözülmüş). */
  path: string;
  mediaType: string;
  properties: string[];
}

export interface SpineItem {
  /** Okuma sırasındaki yeri (0'dan). Çizim yerindeki `spine`. */
  index: number;
  /** Arşiv yolu. Çizim yerindeki `href` budur. */
  path: string;
  mediaType: string;
  linear: boolean;
  /** Açılmış boyut (bayt) — ilerleme yüzdesinde bölüm ağırlığı. */
  size: number;
}

export interface EpubTocEntry {
  label: string;
  depth: number;
  path: string;
  fragment?: string;
  /** Bağlantı spine'da yoksa -1. */
  spine: number;
}

export interface EpubStructure {
  opfPath: string;
  title?: string;
  author?: string;
  language?: string;
  /** "rtl" | "ltr" — spine'daki page-progression-direction. */
  direction?: "rtl" | "ltr";
  manifest: ManifestItem[];
  spine: SpineItem[];
  toc: EpubTocEntry[];
  coverPath?: string;
  coverType?: string;
}

/** Yazı tipi gizleme algoritmaları: yalnız yazı tiplerini etkiler (biz zaten yüklemiyoruz). */
const FONT_OBFUSCATION = new Set(["http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"]);
const FONT_EXT = /\.(otf|ttf|woff2?|eot)$/i;

/** DRM denetimi: yazı tipi dışında şifreli içerik varsa kitap açılamaz. */
export function checkDrm(zip: ZipArchive): void {
  const enc = zip.resolve("META-INF/encryption.xml");
  if (enc) {
    let xml: XmlElement | null = null;
    let text = "";
    try {
      text = zip.readText(enc);
      xml = text.trim() ? parseXml(text) : null;
    } catch {
      xml = null;
    }
    // Okunamayan şifreleme bildirimi: içerik şifreli olabilir, kitabı açmayı deneme. Boş dosya = şifre yok.
    if (!xml && text.trim()) throw new EpubError("Kitap DRM ile korunuyor", "drm");
    if (xml) {
      for (const ed of findAll(xml, "encrypteddata")) {
        const alg = attr(findFirst(ed, "encryptionmethod") ?? ed, "Algorithm") ?? "";
        const uri = attr(findFirst(ed, "cipherreference") ?? ed, "URI") ?? "";
        if (FONT_OBFUSCATION.has(alg) || FONT_EXT.test(uri)) continue;
        throw new EpubError("Kitap DRM ile korunuyor", "drm");
      }
    }
  }
  if (zip.has("META-INF/rights.xml")) {
    // Adobe ADEPT: rights.xml + şifreli içerik. encryption.xml yukarıda yakalamadıysa yine de dene.
    for (const e of zip.entries.values()) if (e.encrypted) throw new EpubError("Kitap DRM ile korunuyor", "drm");
  }
}

/** container.xml → OPF yolu. */
export function findOpfPath(zip: ZipArchive): string {
  const c = zip.resolve("META-INF/container.xml");
  if (c) {
    const root = parseXml(zip.readText(c));
    for (const rf of findAll(root, "rootfile")) {
      const p = attr(rf, "full-path");
      const mt = attr(rf, "media-type");
      if (p && (!mt || mt === "application/oebps-package+xml")) {
        const r = zip.resolve(p.replace(/^\/+/, ""));
        if (r) return r;
      }
    }
  }
  // container.xml yok ya da bozuk: arşivdeki ilk .opf.
  for (const k of zip.entries.keys()) if (/\.opf$/i.test(k)) return k;
  throw new EpubError("EPUB paket dosyası (OPF) bulunamadı", "notEpub");
}

function parseNav(src: string, path: string, spineOf: (p: string) => number): EpubTocEntry[] {
  const root = parseXml(src);
  const navs = findAll(root, "nav");
  const nav = navs.find((n) => (attr(n, "epub:type") ?? attr(n, "type") ?? "").split(/\s+/).includes("toc")) ?? navs[0];
  if (!nav) return [];
  const out: EpubTocEntry[] = [];
  const walkList = (ol: XmlElement, depth: number) => {
    for (const li of ol.children) {
      if (typeof li === "string" || li.local !== "li") continue;
      const head = li.children.find((c): c is XmlElement => typeof c !== "string" && (c.local === "a" || c.local === "span"));
      if (head) {
        const label = clean(xmlText(head)) || clean(attr(head, "title"));
        const href = head.local === "a" ? attr(head, "href") : undefined;
        const r = href ? resolveHref(path, href) : null;
        if (label && r) out.push({ label, depth, path: r.path, fragment: r.fragment, spine: spineOf(r.path) });
      }
      for (const c of li.children) if (typeof c !== "string" && c.local === "ol") walkList(c, depth + 1);
      if (out.length >= 2000) return;
    }
  };
  for (const c of walkXml(nav)) {
    if (c.local === "ol") {
      walkList(c, 0);
      break;
    }
  }
  return out;
}

function parseNcx(src: string, path: string, spineOf: (p: string) => number): EpubTocEntry[] {
  const root = parseXml(src);
  const map = findFirst(root, "navmap");
  if (!map) return [];
  const out: EpubTocEntry[] = [];
  const walk = (el: XmlElement, depth: number) => {
    for (const np of el.children) {
      if (typeof np === "string" || np.local !== "navpoint") continue;
      const label = clean(xmlText(findFirst(np, "navlabel") ?? np));
      const content = np.children.find((c): c is XmlElement => typeof c !== "string" && c.local === "content");
      const r = content ? resolveHref(path, attr(content, "src") ?? "") : null;
      if (label && r) out.push({ label, depth, path: r.path, fragment: r.fragment, spine: spineOf(r.path) });
      if (out.length >= 2000) return;
      walk(np, depth + 1);
    }
  };
  walk(map, 0);
  return out;
}

const IMAGE_TYPE = /^image\//i;

/** EPUB'ın yapısını oku. Bozuksa EpubError. */
export function parseEpub(zip: ZipArchive): EpubStructure {
  checkDrm(zip);
  const opfPath = findOpfPath(zip);
  const opf = parseXml(zip.readText(opfPath));
  const metadata = findFirst(opf, "metadata");
  const manifestEl = findFirst(opf, "manifest");
  const spineEl = findFirst(opf, "spine");
  if (!manifestEl || !spineEl) throw new EpubError("EPUB paket dosyası eksik (manifest/spine)");

  const manifest: ManifestItem[] = [];
  const byId = new Map<string, ManifestItem>();
  for (const it of findAll(manifestEl, "item")) {
    const id = attr(it, "id");
    const href = attr(it, "href");
    if (!id || !href) continue;
    const r = resolveHref(opfPath, href);
    if (!r) continue;
    const item: ManifestItem = {
      id,
      path: zip.resolve(r.path) ?? r.path,
      mediaType: (attr(it, "media-type") ?? "").toLowerCase(),
      properties: (attr(it, "properties") ?? "").split(/\s+/).filter(Boolean),
    };
    manifest.push(item);
    if (!byId.has(id)) byId.set(id, item);
  }

  const spine: SpineItem[] = [];
  for (const ref of findAll(spineEl, "itemref")) {
    const item = byId.get(attr(ref, "idref") ?? "");
    if (!item || !zip.has(item.path)) continue;
    // Yalnız metin bölümleri (XHTML/HTML); SVG ya da resim bölümü nadir, atlanır.
    if (item.mediaType && !/html|^(?:application|text)\/xml$/i.test(item.mediaType)) continue;
    spine.push({
      index: spine.length,
      path: item.path,
      mediaType: item.mediaType,
      linear: (attr(ref, "linear") ?? "yes").toLowerCase() !== "no",
      size: zip.sizeOf(item.path),
    });
  }
  if (!spine.length) throw new EpubError("EPUB'da okunacak bölüm yok");
  const spineIdx = new Map(spine.map((s) => [s.path, s.index]));
  const spineOf = (p: string) => spineIdx.get(zip.resolve(p) ?? p) ?? -1;

  // Başlık, yazar, dil.
  let title: string | undefined;
  let author: string | undefined;
  let language: string | undefined;
  if (metadata) {
    const t = findFirst(metadata, "title");
    title = (t && clean(xmlText(t))) || undefined;
    const creators = findAll(metadata, "creator");
    // EPUB 3: role meta'sı "aut" olanı tercih et; EPUB 2: opf:role="aut".
    const metas = findAll(metadata, "meta");
    const isAuthor = (c: XmlElement) => {
      const role = attr(c, "opf:role") ?? attr(c, "role");
      if (role) return role === "aut";
      const id = attr(c, "id");
      const m = id ? metas.find((x) => attr(x, "refines") === "#" + id && attr(x, "property") === "role") : undefined;
      return m ? clean(xmlText(m)) === "aut" : true;
    };
    const names = creators.filter(isAuthor).map((c) => clean(xmlText(c))).filter(Boolean);
    if (names.length) author = names.slice(0, 3).join(", ");
    const lang = findFirst(metadata, "language");
    language = (lang && clean(xmlText(lang))) || undefined;
  }

  const ppd = (attr(spineEl, "page-progression-direction") ?? "").toLowerCase();
  const direction = ppd === "rtl" || ppd === "ltr" ? ppd : undefined;

  // Kapak: EPUB 3 properties="cover-image" → EPUB 2 <meta name="cover" content="id"> → adında "cover" geçen resim.
  let cover = manifest.find((m) => m.properties.includes("cover-image") && IMAGE_TYPE.test(m.mediaType));
  if (!cover && metadata) {
    const meta = findAll(metadata, "meta").find((m) => attr(m, "name") === "cover");
    const c = meta ? byId.get(attr(meta, "content") ?? "") : undefined;
    if (c && IMAGE_TYPE.test(c.mediaType)) cover = c;
  }
  if (!cover) cover = manifest.find((m) => IMAGE_TYPE.test(m.mediaType) && /cover/i.test(m.id + " " + m.path));
  const coverPath = cover && zip.has(cover.path) ? cover.path : undefined;

  // İçindekiler.
  let toc: EpubTocEntry[] = [];
  const navItem = manifest.find((m) => m.properties.includes("nav"));
  try {
    if (navItem && zip.has(navItem.path)) toc = parseNav(zip.readText(navItem.path), navItem.path, spineOf);
  } catch {
    toc = [];
  }
  if (!toc.length) {
    const ncxId = attr(spineEl, "toc");
    const ncx = (ncxId ? byId.get(ncxId) : undefined) ?? manifest.find((m) => m.mediaType === "application/x-dtbncx+xml");
    try {
      if (ncx && zip.has(ncx.path)) toc = parseNcx(zip.readText(ncx.path), ncx.path, spineOf);
    } catch {
      toc = [];
    }
  }

  return { opfPath, title, author, language, direction, manifest, spine, toc, coverPath, coverType: cover?.mediaType };
}

/**
 * Bölümün adı (alıntının altına yazılır): içindekilerde o bölüme giden ilk madde; yoksa ondan
 * önceki en yakın madde. Hiçbiri yoksa undefined (not "Bölüm N" yazar).
 */
export function chapterTitle(s: EpubStructure, spine: number): string | undefined {
  const exact = s.toc.filter((e) => e.spine === spine);
  if (exact.length) return exact.reduce((a, b) => (b.depth < a.depth ? b : a)).label;
  let best: EpubTocEntry | undefined;
  for (const e of s.toc) if (e.spine >= 0 && e.spine < spine && (!best || e.spine >= best.spine)) best = e;
  return best?.label;
}

/** Çizim yerindeki bölümü bul: önce yoldan (kitap aynıysa kesin), yoksa sıradan. */
export function spineIndexOf(s: EpubStructure, href: string, spine: number): number {
  const byPath = s.spine.find((x) => x.path === href);
  if (byPath) return byPath.index;
  const lower = href.toLowerCase();
  const ci = s.spine.find((x) => x.path.toLowerCase() === lower);
  if (ci) return ci.index;
  return Math.max(0, Math.min(s.spine.length - 1, spine));
}

/** Okuma ilerlemesi 0..1: bölümler açılmış boyutlarıyla ağırlıklıdır. */
export function epubProgress(s: EpubStructure, spine: number, fraction: number): number {
  const sizes = s.spine.map((x) => Math.max(1, x.size));
  const total = sizes.reduce((a, b) => a + b, 0);
  let before = 0;
  for (let i = 0; i < spine && i < sizes.length; i++) before += sizes[i];
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  return Math.min(1, (before + f * (sizes[spine] ?? 0)) / total);
}

/** Dosya uzantısından MIME (manifest boşsa). */
export function mimeOf(path: string, declared?: string): string {
  if (declared) return declared;
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    css: "text/css",
    xhtml: "application/xhtml+xml",
    html: "text/html",
  };
  return map[ext] ?? "application/octet-stream";
}

// ─── CSS kapsamlama ───────────────────────────────────────────────────────────────

/**
 * Kitabın CSS'ini okuyucu kabına kapsamla: her seçicinin başına `scope` eklenir; html/body/:root
 * kabın kendisi olur. `@import`, `@font-face`, `@namespace`, `@page`, `@charset` atılır (dış
 * istek ve yazı tipi yüklenmez). `url()` değerleri `resolveUrl` ile çevrilir; çözülemeyen url()
 * bildirimi atılır (dış adrese istek gitmesin). Mutlak yazı boyutu (px/pt/rem) kullanıcının yazı
 * ölçeğiyle çarpılır, böylece A+/A- yayıncının sabit boyutlarında da çalışır.
 */
export function scopeCss(css: string, scope: string, resolveUrl: (url: string) => string | null): string {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  const n = src.length;

  // Dengeli bir blok ({...}) içeriğini oku; dizgi içindeki parantezler sayılmaz.
  const readBlock = (): string => {
    // src[i] === "{"
    let depth = 0;
    const start = i + 1;
    let quote = "";
    for (; i < n; i++) {
      const c = src[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = "";
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const body = src.slice(start, i);
          i++;
          return body;
        }
      }
    }
    return src.slice(start);
  };
  const readPrelude = (): string => {
    const start = i;
    let quote = "";
    let paren = 0;
    for (; i < n; i++) {
      const c = src[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = "";
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === "(") paren++;
      else if (c === ")") paren--;
      else if (paren <= 0 && (c === "{" || c === ";" || c === "}")) break;
    }
    return src.slice(start, i).trim();
  };

  const scopeSelector = (sel: string): string =>
    splitTop(sel, ",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        // "body.x p" → ".scope.x p"; "html body" → ".scope"; "body > p" → ".scope > p".
        let rest = s;
        let root = false;
        const m1 = /^(?:html|:root)(?![\w-])/i.exec(rest);
        if (m1) {
          rest = rest.slice(m1[0].length);
          root = true;
          const m2 = /^\s*>?\s*body(?![\w-])/i.exec(rest);
          if (m2) rest = rest.slice(m2[0].length);
        } else {
          const m3 = /^body(?![\w-])/i.exec(rest);
          if (m3) {
            rest = rest.slice(m3[0].length);
            root = true;
          }
        }
        if (!root) return scope + " " + idToAttr(s);
        if (!rest.trim()) return scope;
        return /^[.#[:]/.test(rest) ? scope + idToAttr(rest) : scope + " " + idToAttr(rest.trim());
      })
      .join(", ");

  const fixDecls = (body: string): string => {
    const out: string[] = [];
    for (const d of splitTop(body, ";")) {
      const decl = d.trim();
      if (!decl) continue;
      const colon = decl.indexOf(":");
      if (colon < 0) continue;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      let value = decl.slice(colon + 1).trim();
      if (/^-?(?:webkit-|moz-|ms-)?behavior$/.test(prop) || prop === "-moz-binding") continue;
      if (/expression\s*\(/i.test(value) || /javascript:/i.test(value)) continue;
      // url() yazmadan adres alan işlevler ve CSS kaçışıyla gizlenmiş url (u\72l(…)) denetimi
      // atlatabilir: bildirim atılır. Kaçışlı ama zararsız değer ("\201C" tırnak) kalır.
      if (/image-set\s*\(|(?:^|[^\w-])src\s*\(/i.test(value)) continue;
      if (value.includes("\\") && /url\s*\(|image-set|src\s*\(|expression|javascript:/i.test(cssUnescape(value))) continue;
      if (/url\s*\(/i.test(value)) {
        let ok = true;
        value = value.replace(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi, (_m, a?: string, b?: string, c?: string) => {
          const raw = (a ?? b ?? c ?? "").trim();
          // Belge içi başvuru (SVG degrade, kırpma, süzgeç): olduğu gibi kalır.
          if (/^#[\w.:-]+$/.test(raw)) return `url("${raw}")`;
          const u = resolveUrl(raw);
          if (!u) {
            ok = false;
            return "none";
          }
          return `url("${u.replace(/["\\\n\r]/g, (ch) => encodeURIComponent(ch))}")`;
        });
        if (!ok) continue;
      }
      if (prop === "font-size" || prop === "line-height") {
        value = value.replace(/(^|[\s(])(\d*\.?\d+)(px|pt|rem)\b/gi, (_m, pre: string, num: string, unit: string) => `${pre}calc(${num}${unit} * var(--lo-epub-scale, 1))`);
      }
      // Fiziksel sabit konum okuyucuyu bozar.
      if (prop === "position" && /fixed|sticky/i.test(value)) continue;
      out.push(`${prop}: ${value}`);
    }
    return out.join("; ");
  };

  const walk = (stopAtClose: boolean): string => {
    const out: string[] = [];
    while (i < n) {
      while (i < n && /\s/.test(src[i])) i++;
      if (i >= n) break;
      if (src[i] === "}") {
        if (stopAtClose) {
          i++;
          return out.join("\n");
        }
        i++;
        continue;
      }
      const prelude = readPrelude();
      if (src[i] === ";") {
        i++; // @import, @charset … ya da başıboş bildirim — atılır.
        continue;
      }
      if (src[i] !== "{") continue;
      if (prelude.startsWith("@")) {
        const kw = /^@([\w-]+)/.exec(prelude)?.[1]?.toLowerCase() ?? "";
        if (kw === "media" || kw === "supports" || kw === "layer" || kw === "container") {
          i++;
          const inner = walk(true);
          if (inner) out.push(`${prelude} {\n${inner}\n}`);
        } else {
          readBlock(); // @font-face, @page, @keyframes … atılır.
        }
        continue;
      }
      const body = readBlock();
      const sel = scopeSelector(prelude);
      const decls = fixDecls(body);
      if (sel && decls) out.push(`${sel} { ${decls} }`);
    }
    return out.join("\n");
  };
  return walk(false);
}

/** CSS kaçışlarını çöz (yalnız denetim için). */
export function cssUnescape(v: string): string {
  return v.replace(/\\([0-9a-f]{1,6})\s?|\\([^\n0-9a-f])/gi, (_m, hex?: string, ch?: string) => {
    if (ch !== undefined) return ch;
    const cp = parseInt(hex!, 16);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "\ufffd";
  });
}

/**
 * Seçicideki `#kimlik` → `[data-epub-id="kimlik"]` (görüntüleyici kitabın kimliklerini bu özniteliğe
 * taşır). Köşeli parantez ve dizgi içindeki `#` dokunulmaz.
 */
export function idToAttr(sel: string): string {
  let out = "";
  let quote = "";
  let bracket = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (quote) {
      out += c;
      if (c === "\\" && i + 1 < sel.length) out += sel[++i];
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "[") bracket++;
    else if (c === "]") bracket = Math.max(0, bracket - 1);
    else if (c === "#" && !bracket) {
      const m = /^[\w-]+/.exec(sel.slice(i + 1));
      if (m) {
        out += `[data-epub-id="${m[0]}"]`;
        i += m[0].length;
        continue;
      }
    }
    out += c;
  }
  return out;
}

/** Üst seviyede (parantez ve dizgi dışında) ayır. */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === sep && depth <= 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

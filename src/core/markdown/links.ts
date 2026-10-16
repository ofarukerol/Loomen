// [[wiki-link]] ve #etiket çıkarımı — backlink, graf ve yeniden adlandırma için.

import { foldTr } from "../search/search";

// [[hedef]] / [[hedef|takma ad]] / [[hedef#başlık]] / ![[gömü]]
// Baştaki "!" gömüyü işaretler; iç metin köşeli parantez içermez (iç içe link yok).
const WIKILINK_RE = /(!?)\[\[([^[\]]+)\]\]/g;

/** Çözümlenmiş bir [[wiki-link]]. */
export interface WikiLink {
  /** Köşeli parantez içindeki ham metin (takma ad ve başlık dahil). */
  raw: string;
  /** Hedef not adı — takma ad ve #başlık atılmış, NFC. Aynı nota başlık çapası ise "". */
  target: string;
  /** Görünen metin: takma ad varsa o, yoksa hedefin ham hali. */
  label: string;
  /** Başlık çapası (`#` hariç); yoksa undefined. */
  heading?: string;
  /** ![[...]] gömüsü mü? Gömü içerik taşır, backlink sayılmaz. */
  embed: boolean;
}

/**
 * Bir [[...]] içindeki ham metinden hedef not adını çıkar.
 * Takma ad (`|`), başlık çapası (`#`) ve `.md` uzantısı atılır; sonuç NFC.
 */
export function normalizeLinkTarget(raw: string): string {
  const beforeAlias = raw.split("|")[0];
  const beforeHeading = beforeAlias.split("#")[0];
  return beforeHeading.trim().replace(/\.md$/i, "").trim().normalize("NFC");
}

/** İki not adı aynı notu mu gösteriyor (NFC + Türkçe harf katlama)? */
export function sameTarget(a: string, b: string): boolean {
  return foldTr(a.normalize("NFC")) === foldTr(b.normalize("NFC"));
}

/**
 * Kod bloklarını (``` / ~~~ çitli) ve satır içi kodu (`…`) boşlukla ört.
 * Satır sonları korunur, uzunluk değişmez — satır numarası ve konumlar aynı kalır.
 * Kod içindeki [[…]], #etiket ve [](…) metni bağlantı sayılmasın diye kullanılır.
 */
export function stripCode(content: string): string {
  const blank = (s: string) => s.replace(/[^\r\n]/g, " ");
  // 1) Çitli bloklar: ``` ya da ~~~ (3+) ile açılır, aynı karakterden en az o uzunlukta bir çitle
  //    kapanır; kapanmazsa dosya sonuna kadar sürer. Liste öğesi (`- ```, `1. ```), alıntı (`> ````)
  //    ve girintili çit de sayılır — yoksa listedeki bloğun girintili kapanışı yeni çit açıp
  //    dosyanın kalanını yutuyordu.
  // Satır sonu korunarak bölünür. Geriye bakışlı regex kullanılmaz: iOS 15 / Safari 16.4 öncesi
  // WebKit'te o regex derlenemez ve graf ile Bağlantılar paneli tümden bozulurdu.
  const lines = content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let fence: { ch: string; len: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const f = fenceAt(lines[i], !fence);
    if (fence) {
      lines[i] = blank(lines[i]);
      if (f && f.ch === fence.ch && f.len >= fence.len && f.rest.trim() === "") fence = null;
      continue;
    }
    // ``` çitinin bilgi metni ters tırnak içeremez (yoksa satır içi koddur).
    if (f && !(f.ch === "`" && f.rest.includes("`"))) {
      fence = { ch: f.ch, len: f.len };
      lines[i] = blank(lines[i]);
    }
  }
  // 2) Satır içi kod: n ters tırnakla açılır, tam n ters tırnakla kapanır; boş satırı geçmez.
  return lines
    .join("")
    .replace(
      // Öndeki karakter grupla yakalanır (geriye bakış yerine): ters tırnak dizisinin ortasından başlanmaz.
      /(^|[^`])(`+)(?!`)((?:[^\n]|\n(?![ \t]*\r?\n))*?[^`])\2(?!`)/g,
      (whole, pre: string) => pre + blank(whole.slice(pre.length)),
    );
}

/**
 * Satır, önekleri (boşluk, `>`, açılışta liste işareti) atıldıktan sonra çitle başlıyor mu?
 * Kapanışta liste işareti sayılmaz: kod içindeki `- ```` satırı bloğu kapatmasın.
 * Önek regex yerine düz döngüyle okunur: iç içe tekrarlı regex `-   -   -   …` satırında
 * katlanarak yavaşlıyordu.
 */
function fenceAt(line: string, listMarkers: boolean): { ch: string; len: number; rest: string } | null {
  let i = 0;
  for (;;) {
    while (line[i] === " " || line[i] === "\t") i++;
    if (line[i] === ">") {
      i++;
      continue;
    }
    if (!listMarkers) break;
    let j = i;
    if (line[j] === "-" || line[j] === "*" || line[j] === "+") j++;
    else {
      while (j - i < 9 && line[j] >= "0" && line[j] <= "9") j++;
      if (j > i && (line[j] === "." || line[j] === ")")) j++;
      else j = i;
    }
    if (j > i && (line[j] === " " || line[j] === "\t")) {
      i = j;
      continue;
    }
    break;
  }
  const ch = line[i];
  if (ch !== "`" && ch !== "~") return null;
  let len = 0;
  while (line[i + len] === ch) len++;
  if (len < 3) return null;
  return { ch, len, rest: line.slice(i + len) };
}

/** Takma ad ayracı: `|`, tablo hücresinde kaçışlı `\|`. Ayraçtan önceki/sonraki metni döndürür. */
function splitAlias(inner: string): { before: string; alias: string } {
  const pipe = inner.indexOf("|");
  if (pipe < 0) return { before: inner, alias: "" };
  const escaped = pipe > 0 && inner[pipe - 1] === "\\";
  return { before: inner.slice(0, escaped ? pipe - 1 : pipe), alias: inner.slice(pipe + 1) };
}

/** İçerikteki tüm [[bağlantı]]ları çözümle (gömüler de dahil — `embed` alanıyla ayırt edilir). */
export function parseWikiLinks(content: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const m of content.matchAll(WIKILINK_RE)) {
    const inner = m[2];
    const split = splitAlias(inner);
    const beforeAlias = split.before;
    const alias = split.alias.trim();
    const hash = beforeAlias.indexOf("#");
    const heading = hash >= 0 ? beforeAlias.slice(hash + 1).trim() : "";
    out.push({
      raw: inner,
      target: normalizeLinkTarget(beforeAlias),
      label: alias || beforeAlias.trim(),
      heading: heading || undefined,
      embed: m[1] === "!",
    });
  }
  return out;
}

/**
 * İçerikteki bağlantı hedeflerini döndür (backlink/graf için).
 * Gömüler (`![[...]]`) ve aynı nota başlık çapaları (`[[#Başlık]]`) hariç; hedefler normalize.
 */
export function extractWikiLinks(content: string): string[] {
  return parseWikiLinks(stripCode(content))
    .filter((l) => !l.embed && l.target !== "")
    .map((l) => l.target);
}

// [metin](hedef "başlık") — metin tek seviye iç içe köşeli parantez taşıyabilir ama `[[` ile
// başlayamaz (`[[Not]](…)` bir wiki bağlantısıdır, markdown değil);
// hedef <…> içinde (boşluklu) ya da boşluksuz ve dengeli parantezli olabilir.
const MDLINK_RE =
  /(!?)\[(?!\[)((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(\s*(<[^<>\n]*>|[^\s()<>]*(?:\([^\s()]*\)[^\s()<>]*)*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*\)/g;

/**
 * İçerikteki not hedefli markdown bağlantılarını döndür: `[metin](Klasör/Not.md#başlık)` → "Klasör/Not.md".
 * Resim gömüleri (`![](…)`), dış adresler (http:, mailto:, obsidian: … ya da `//`) ve yalnız çapa
 * (`#başlık`) atlanır. `<…>` sarmalı, URL kodlaması (`%20`), `#başlık` ve `?sorgu` temizlenir; yol
 * çözümü (göreli/kök) çağırana kalır. Kod içindeki bağlantılar sayılmaz.
 */
export function extractMarkdownLinks(content: string): string[] {
  const out: string[] = [];
  for (const m of stripCode(content).matchAll(MDLINK_RE)) {
    if (m[1] === "!") continue;
    let href = m[3].trim();
    if (href.startsWith("<") && href.endsWith(">")) href = href.slice(1, -1).trim();
    if (!href || href.startsWith("#") || href.startsWith("//")) continue;
    if (/^[a-z][a-z\d+.-]*:(?!\s)/i.test(href)) continue; // şema: http, mailto, file, obsidian… ("Toplantı: Q3.md" değil)
    href = href.replace(/[?#].*$/, "");
    try {
      href = decodeURIComponent(href);
    } catch {
      // bozuk % kodlaması — olduğu gibi kalsın
    }
    href = href.trim().normalize("NFC");
    if (href) out.push(href);
  }
  return out;
}

/** İçerik verilen nota bağlantı veriyor mu (başlık çapası ve takma ad fark etmez)? */
export function linksTo(content: string, noteName: string): boolean {
  return extractWikiLinks(content).some((t) => sameTarget(t, noteName));
}

/**
 * Bir bağlantı hedefini vault'taki nota bağla.
 * Sıra: tam ad → yol (uzantılı/uzantısız) → katlanmış ad. Bulunamazsa undefined (kırık link).
 */
export function resolveLink<T extends { path: string; name: string }>(
  rawTarget: string,
  notes: readonly T[]
): T | undefined {
  const target = normalizeLinkTarget(rawTarget);
  if (!target) return undefined;
  const folded = foldTr(target);
  const stripExt = (p: string) => p.replace(/\.(md|excalidraw)$/i, "");
  return (
    notes.find((n) => n.name.normalize("NFC") === target) ??
    notes.find((n) => stripExt(n.path.normalize("NFC")) === target) ??
    notes.find((n) => foldTr(n.name) === folded) ??
    notes.find((n) => foldTr(stripExt(n.path)) === folded)
  );
}

/**
 * Not yeniden adlandırıldığında gövdedeki bağlantıları güncelle.
 * Takma ad, `#başlık` çapası ve gömü işareti korunur; başka hiçbir karakter değişmez
 * (içerik NFC'ye çevrilmez — yalnız eşleşen bağlantılar yeniden yazılır).
 */
export function rewriteWikiLinks(content: string, oldName: string, newName: string): string {
  const from = normalizeLinkTarget(oldName);
  const to = normalizeLinkTarget(newName);
  if (!from || !to || sameTarget(from, to)) return content;
  return content.replace(WIKILINK_RE, (whole, bang: string, inner: string) => {
    const pipe = inner.indexOf("|");
    const beforeAlias = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const alias = pipe >= 0 ? inner.slice(pipe + 1) : "";
    const hash = beforeAlias.indexOf("#");
    const heading = hash >= 0 ? beforeAlias.slice(hash) : ""; // "#" dahil
    if (!sameTarget(normalizeLinkTarget(inner), from)) return whole;
    return `${bang}[[${to}${heading}${pipe >= 0 ? "|" + alias : ""}]]`;
  });
}

// #etiket çıkarımı (graf "Etiketler" görünümü için). Etiket bir satır başında veya
// boşluktan sonra gelir ve harfle başlar; böylece `## Başlık`, URL çapası
// (`https://…#readme`) ve `Issue #123` etiket sayılmaz.
const TAG_SRC = "(^|\\s)#(\\p{L}[\\p{L}\\d_/-]*)";

/** Her çağrıda taze regex — /g regexler lastIndex taşır, paylaşılmaz. */
const tagRe = () => new RegExp(TAG_SRC, "gu");

/** İçerikteki #etiketleri geçtikleri sırayla döndür (tekrarlar korunur, baştaki `#` atılır). */
export function matchTags(content: string): string[] {
  return Array.from(content.matchAll(tagRe())).map((m) => m[2]);
}

/** İçerikteki benzersiz #etiketleri döndür (baştaki `#` atılır, sıra korunur). */
export function extractTags(content: string): string[] {
  return [...new Set(matchTags(stripCode(content)))];
}

/** Metinden #etiketleri sök (öndeki boşluk korunur — kelimeler birbirine yapışmasın). */
export function stripTags(text: string): string {
  return text.replace(tagRe(), "$1");
}

/** Bir not adına işaret eden ilk satırın kısa alıntısını bul (backlink önizlemesi). */
export function excerptForLink(content: string, targetName: string): string {
  // Kod ayıklanmış metin satır satır aynı hizada: eşleşmeyi orada ara, alıntıyı ham satırdan al.
  const rawLines = content.split(/\r\n|\r|\n/);
  const codeFree = stripCode(content).split(/\r\n|\r|\n/);
  for (let i = 0; i < rawLines.length; i++) {
    if (parseWikiLinks(codeFree[i] ?? "").some((l) => !l.embed && sameTarget(l.target, targetName))) {
      return rawLines[i].replace(/^[#>\s-]+/, "").trim().slice(0, 90);
    }
  }
  return "";
}

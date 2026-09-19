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

/** İçerikteki tüm [[bağlantı]]ları çözümle (gömüler de dahil — `embed` alanıyla ayırt edilir). */
export function parseWikiLinks(content: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const m of content.matchAll(WIKILINK_RE)) {
    const inner = m[2];
    const pipe = inner.indexOf("|");
    const beforeAlias = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : "";
    const hash = beforeAlias.indexOf("#");
    const heading = hash >= 0 ? beforeAlias.slice(hash + 1).trim() : "";
    out.push({
      raw: inner,
      target: normalizeLinkTarget(inner),
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
  return parseWikiLinks(content)
    .filter((l) => !l.embed && l.target !== "")
    .map((l) => l.target);
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
  return [...new Set(matchTags(content))];
}

/** Metinden #etiketleri sök (öndeki boşluk korunur — kelimeler birbirine yapışmasın). */
export function stripTags(text: string): string {
  return text.replace(tagRe(), "$1");
}

/** Bir not adına işaret eden ilk satırın kısa alıntısını bul (backlink önizlemesi). */
export function excerptForLink(content: string, targetName: string): string {
  for (const raw of content.split(/\r\n|\r|\n/)) {
    if (parseWikiLinks(raw).some((l) => !l.embed && sameTarget(l.target, targetName))) {
      return raw.replace(/^[#>\s-]+/, "").trim().slice(0, 90);
    }
  }
  return "";
}

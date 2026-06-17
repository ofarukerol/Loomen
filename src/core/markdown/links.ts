// [[wiki-link]] çıkarımı — backlink/graph için.

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/** İçerikteki tüm [[hedef]] adlarını döndür (alias `|` kısmı atılır). */
export function extractWikiLinks(content: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(WIKILINK_RE)) {
    out.push(m[1].trim());
  }
  return out;
}

/** Bir not adına işaret eden ilk satırın kısa alıntısını bul (backlink önizlemesi). */
export function excerptForLink(content: string, targetName: string): string {
  const needle = `[[${targetName}`;
  for (const raw of content.split("\n")) {
    if (raw.includes(needle)) {
      return raw.replace(/^[#>\s-]+/, "").trim().slice(0, 90);
    }
  }
  return "";
}

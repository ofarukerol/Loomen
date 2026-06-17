import type { VaultNote } from "../vault/types";

export interface SearchHit {
  path: string;
  name: string;
  /** Eşleşen ilk satırın kısa alıntısı. */
  snippet: string;
  /** Başlıkta mı eşleşti? */
  inTitle: boolean;
}

const lower = (s: string) => s.toLocaleLowerCase("tr");

/** Vault içinde tam metin arama (başlık + içerik, Türkçe-duyarlı). */
export function searchNotes(
  notes: VaultNote[],
  contents: Record<string, string>,
  query: string,
  limit = 50
): SearchHit[] {
  const q = lower(query.trim());
  if (!q) return [];

  const hits: SearchHit[] = [];
  for (const n of notes) {
    const inTitle = lower(n.name).includes(q);
    const lines = (contents[n.path] ?? "").split("\n");
    const matchLine = lines.find((l) => lower(l).includes(q) && l.trim() !== "");
    if (!inTitle && !matchLine) continue;
    const snippet = (matchLine ?? "").replace(/^[#>\s*-]+/, "").trim().slice(0, 80);
    hits.push({ path: n.path, name: n.name, snippet, inTitle });
  }
  // Başlık eşleşmeleri önce
  hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
  return hits.slice(0, limit);
}

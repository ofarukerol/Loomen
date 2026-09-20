import type { VaultNote } from "../vault/types";

export interface SearchHit {
  path: string;
  name: string;
  /** Eşleşen ilk satırın kısa alıntısı. */
  snippet: string;
  /** Başlıkta mı eşleşti? */
  inTitle: boolean;
}

/**
 * Türkçe harf katlama — karşılaştırma öncesi metni tek biçime indirger.
 * Arama, bağlantı çözümleme ve ad eşleştirmenin ortak temeli.
 *
 * İki iş yapar:
 *  1) NFC: "İ" hem U+0130 hem "I + birleşen nokta" (U+0049 U+0307) olarak yazılabilir;
 *     ayrıştırılmış biçimler birleştirilmezse eşit metinler eşit görünmez.
 *  2) i/I ailesini tek harfe katlar. `toLocaleLowerCase("tr")` I→ı, İ→i verir; bu yüzden
 *     "Istanbul" → "ıstanbul" ile "İstanbul" → "istanbul" hiç eşleşmez. Kullanıcı hangi
 *     "i"yi yazdığını bilmediğinden dördü de "i" sayılır.
 */
export function foldTr(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[İIıi]/g, "i")
    .toLocaleLowerCase("tr");
}

/** Vault içinde tam metin arama (başlık + içerik, Türkçe-duyarlı). */
export function searchNotes(
  notes: VaultNote[],
  contents: Record<string, string>,
  query: string,
  limit = 50
): SearchHit[] {
  const q = foldTr(query.trim());
  if (!q) return [];

  const hits: SearchHit[] = [];
  for (const n of notes) {
    const inTitle = foldTr(n.name).includes(q);
    const lines = (contents[n.path] ?? "").split(/\r\n|\r|\n/);
    const matchLine = lines.find((l) => l.trim() !== "" && foldTr(l).includes(q));
    if (!inTitle && !matchLine) continue;
    const snippet = (matchLine ?? "").replace(/^[#>\s*-]+/, "").trim().slice(0, 80);
    hits.push({ path: n.path, name: n.name, snippet, inTitle });
  }
  // Başlık eşleşmeleri önce
  hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
  return hits.slice(0, limit);
}

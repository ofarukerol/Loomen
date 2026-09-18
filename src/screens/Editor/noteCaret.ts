// Not açılırken imlecin nereye konumlanacağı.

import { findFenceBlocks } from "./tableModel";

/**
 * Günlük not açılınca imlecin gideceği yer: ilk `## ` bölümünün (şablonda "Ephemeral Notlar")
 * içeriğinin sonu. Bölüm boşsa başlığın hemen altındaki boş satır; o da yoksa (bir sonraki
 * başlık hemen altındaysa ya da başlık belgenin son satırıysa) başlık satırının sonu.
 * Başlık yoksa metnin sonu. Kod bloğu (```) içindeki `##` satırları başlık sayılmaz.
 */
export function firstSectionCaret(doc: string): number {
  if (!doc) return 0;
  const lines = doc.split("\n");
  const fences = findFenceBlocks(lines);
  const inFence = (i: number) => fences.some((f) => i >= f.start && i <= f.end);
  const isHeading = (i: number, re: RegExp) => !inFence(i) && re.test(lines[i].trim());

  let h = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isHeading(i, /^##\s/)) {
      h = i;
      break;
    }
  }
  if (h < 0) return doc.length;

  // Bölümün bittiği yer: bir sonraki başlık (yoksa metin sonu).
  let end = lines.length;
  for (let i = h + 1; i < lines.length; i++) {
    if (isHeading(i, /^#{1,6}\s/)) {
      end = i;
      break;
    }
  }
  // Bölümdeki son dolu satır; hiç yoksa başlığın hemen altındaki boş satır (varsa).
  let last = h;
  for (let i = h + 1; i < end; i++) {
    if (lines[i].trim() !== "") last = i;
  }
  let target = last;
  if (last === h && h + 1 < end) target = h + 1;
  target = Math.max(0, Math.min(target, lines.length - 1));

  let pos = 0;
  for (let i = 0; i < target; i++) pos += lines[i].length + 1;
  return Math.min(pos + lines[target].length, doc.length);
}

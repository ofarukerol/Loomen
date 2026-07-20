// Not açılırken imlecin nereye konumlanacağı.

/**
 * Günlük not açılınca imlecin gideceği yer: ilk `## ` bölümünün (şablonda "Ephemeral Notlar")
 * içeriğinin sonu. Bölüm boşsa başlığın hemen altındaki satır. Başlık yoksa metnin sonu.
 */
export function firstSectionCaret(doc: string): number {
  const lines = doc.split("\n");
  const h = lines.findIndex((l) => /^##\s/.test(l.trim()));
  if (h < 0) return doc.length;

  // Bölümün bittiği yer: bir sonraki başlık (yoksa metin sonu).
  let end = lines.length;
  for (let i = h + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i].trim())) {
      end = i;
      break;
    }
  }
  // Bölümdeki son dolu satır; hiç yoksa başlığın hemen altı.
  let last = h;
  for (let i = h + 1; i < end; i++) {
    if (lines[i].trim() !== "") last = i;
  }
  const target = Math.min(last === h ? h + 1 : last, lines.length - 1);

  let pos = 0;
  for (let i = 0; i < target; i++) pos += lines[i].length + 1;
  return Math.min(pos + lines[target].length, doc.length);
}

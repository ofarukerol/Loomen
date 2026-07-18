import { format } from "date-fns";
import { tr } from "date-fns/locale";

/** Günlük not başlığı: YYYY-MM-DD-Gün (docs 06 §6.2). */
export function dailyNoteTitle(date: Date): string {
  return `${format(date, "yyyy-MM-dd")}-${format(date, "EEEE", { locale: tr })}`;
}

/** Yapılacaklar bölüm başlığını eşleyen regex (görev eklerken kullanılır). */
export const TODO_HEADING = /^#{1,6}\s.*Yapılacaklar/i;

/** Kullanıcının Obsidian günlük not şablonu. */
export function dailyNoteTemplate(_date: Date): string {
  // Başlık (tarih/gün/hafta) üstteki modern banner'da (dosya adından) gösterilir —
  // gövdeye H1/verbose metadata eklenmez. Boş satırla başlar (serbest not için).
  // Görevler ayrı 'Yapılacaklar.md'de tutulur.
  return [
    ``,
    ``,
    ``,
    ``,
    `## 💭 Ephemeral Notlar (Gün İçi Notlar)`,
    ``,
    ``,
    ``,
    `## 📝 Günün Özeti`,
    ``,
    ``,
    ``,
    `## 💡 Günün Kattıkları`,
    ``,
    ``,
    ``,
    `## 📚 Okuduklarım/İzlediklerim`,
    ``,
    ``,
    ``,
  ].join("\n");
}

/** Eski günlük notları temizle: baştaki '# YYYY-MM-DD-...' başlığını ve '#günlük' etiketini
 *  (artık üretilmiyor) kaldır. */
export function migrateDailyContent(content: string): string | null {
  const lines = content.split("\n");
  let changed = false;
  if (lines.length && /^#\s+\d{4}-\d{2}-\d{2}/.test(lines[0].trim())) {
    lines.shift();
    changed = true;
  }
  // '#günlük' etiket satırını (verbose halleri dahil) tamamen kaldır — hemen öncesindeki
  // eski '---' ayracı ve aradaki boş satırlarla birlikte.
  for (let i = 0; i < lines.length; i++) {
    if (/^#günlük\b/.test(lines[i].trim())) {
      let j = i - 1;
      while (j >= 0 && lines[j].trim() === "") j--;
      const from = j >= 0 && /^-{3,}$/.test(lines[j].trim()) ? j : i;
      lines.splice(from, i - from + 1);
      changed = true;
      i = from - 1;
    }
  }
  // Baştaki (ilk '## ' başlığından önceki) boşluğu 4 boş satıra normalize et — banner ile
  // ilk bölüm arası ferah olsun. Yalnız o bölge tamamen boşsa (kullanıcı not yazmışsa dokunma).
  {
    const firstH = lines.findIndex((l) => /^##\s/.test(l.trim()));
    if (firstH > 0 && lines.slice(0, firstH).every((l) => l.trim() === "")) {
      if (firstH !== 4) {
        lines.splice(0, firstH, "", "", "", "");
        changed = true;
      }
    }
  }
  // Boş bölümlerde (başlığın hemen ardından başka başlık geliyorsa) başlık altına
  // 3 tıklanabilir boş satır koy — kullanıcı başlığın altına tıklayıp yazabilsin. İçeriği
  // olan bölümlere dokunulmaz.
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (/^##\s/.test(lines[i].trim())) {
      let blanks = 0;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") {
        blanks++;
        j++;
      }
      const nextIsSection = j >= lines.length || /^##\s/.test(lines[j].trim());
      if (nextIsSection) {
        out.push("", "", "");
        if (blanks !== 3) changed = true;
        i = j - 1; // mevcut boş satırları atla (yeniden eklendi)
      }
    }
  }
  if (changed) return out.join("\n");
  return null;
}

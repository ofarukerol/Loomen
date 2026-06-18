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
    `## 💭 Ephemeral Notlar (Gün İçi Notlar)`,
    ``,
    `## 📝 Günün Özeti`,
    ``,
    `## 💡 Günün Kattıkları`,
    ``,
    `## 📚 Okuduklarım/İzlediklerim`,
    ``,
    `#günlük`,
    ``,
  ].join("\n");
}

/** Eski günlük notları temizle: baştaki '# YYYY-MM-DD-...' başlığını kaldır, verbose '#günlük 📅...' → '#günlük'. */
export function migrateDailyContent(content: string): string | null {
  const lines = content.split("\n");
  let changed = false;
  if (lines.length && /^#\s+\d{4}-\d{2}-\d{2}/.test(lines[0].trim())) {
    lines.shift();
    changed = true;
  }
  for (let i = 0; i < lines.length; i++) {
    if (/^#günlük\s+\S/.test(lines[i].trim())) {
      lines[i] = "#günlük";
      changed = true;
    }
  }
  // '#günlük' hemen öncesindeki eski '---' ayracını kaldır
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "#günlük") {
      let j = i - 1;
      while (j >= 0 && lines[j].trim() === "") j--;
      if (j >= 0 && /^-{3,}$/.test(lines[j].trim())) {
        lines.splice(j, 1);
        changed = true;
      }
      break;
    }
  }
  return changed ? lines.join("\n") : null;
}

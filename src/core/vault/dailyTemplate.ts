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
  // Boş bölümlerde (başlığın hemen ardından başka başlık/#günlük geliyorsa) başlık altına
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
      const nextIsSection = j >= lines.length || /^##\s/.test(lines[j].trim()) || /^#günlük/.test(lines[j].trim());
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

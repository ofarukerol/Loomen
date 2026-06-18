import { format } from "date-fns";
import { tr } from "date-fns/locale";

/** Günlük not başlığı: YYYY-MM-DD-Gün (docs 06 §6.2). */
export function dailyNoteTitle(date: Date): string {
  return `${format(date, "yyyy-MM-dd")}-${format(date, "EEEE", { locale: tr })}`;
}

/** Yapılacaklar bölüm başlığını eşleyen regex (görev eklerken kullanılır). */
export const TODO_HEADING = /^#{1,6}\s.*Yapılacaklar/i;

/** Kullanıcının Obsidian günlük not şablonu. */
export function dailyNoteTemplate(date: Date): string {
  const iso = format(date, "yyyy-MM-dd");
  const day = format(date, "EEEE", { locale: tr });
  // Minimal günlük şablonu. Tarih/gün/hafta artık üstteki modern başlıkta (dosya adından
  // türetilir) gösterilir; gövdeye verbose metadata eklenmez. Görevler ayrı 'Yapılacaklar.md'de.
  return [
    `# ${iso}-${day}`,
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

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { tr, enUS, ar } from "date-fns/locale";
import { useAppStore } from "../../store/useAppStore";

const LOCALES: Record<string, typeof tr> = { tr, en: enUS, ar };

/** Günlük not boş şablondan farklı içerik taşıyor mu? (başlık/etiket/ayraç dışında metin) */
function hasContent(text: string): boolean {
  return text.split("\n").some((line) => {
    const t = line.trim();
    if (!t) return false;
    if (/^#{1,6}\s/.test(t)) return false;
    if (/^#günlük\b/.test(t)) return false;
    if (/^-{3,}$/.test(t)) return false;
    return true;
  });
}

export function CalendarCard() {
  const { t, i18n } = useTranslation();
  const groups = useAppStore((s) => s.groups);
  const notes = useAppStore((s) => s.notes);
  const noteContents = useAppStore((s) => s.noteContents);
  const activeNote = useAppStore((s) => s.activeNote);
  const goToDate = useAppStore((s) => s.goToDate);
  const gcalEvents = useAppStore((s) => s.gcalEvents);
  const weekdays = t("calendar.weekdays", { returnObjects: true }) as string[];
  const locale = LOCALES[i18n.language] ?? tr;

  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7; // Pazartesi-ilk hizalama
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const monthLabel = format(first, "LLLL yyyy", { locale });

  // Görüntülenen ayda nokta gösterilecek günler: görevli VEYA içerik girilmiş günlük not.
  const dotDays = new Set<number>();
  for (const g of groups) {
    const [y, mo, d] = g.id.split("-").map(Number);
    if (y === view.y && mo - 1 === view.m) dotDays.add(d);
  }
  for (const note of notes) {
    const dm = note.name.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!dm || note.kind === "draw") continue;
    if (Number(dm[1]) === view.y && Number(dm[2]) - 1 === view.m && hasContent(noteContents[note.path] ?? "")) {
      dotDays.add(Number(dm[3]));
    }
  }

  // Görüntülenen ayda Google Takvim etkinliği olan günler (ayrı mavi nokta).
  const gcalDays = new Set<number>();
  for (const ev of gcalEvents) {
    const d = ev.all_day ? new Date(ev.start + "T00:00:00") : new Date(ev.start);
    if (!isNaN(d.getTime()) && d.getFullYear() === view.y && d.getMonth() === view.m) {
      gcalDays.add(d.getDate());
    }
  }

  // Açık günlük not hangi gün? (seçili vurgu)
  const am = activeNote?.match(/(\d{4})-(\d{2})-(\d{2})/);
  const openY = am ? Number(am[1]) : -1;
  const openM = am ? Number(am[2]) - 1 : -1;
  const openD = am ? Number(am[3]) : -1;

  const prev = () => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const next = () => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));
  const goToday = () => {
    const d = new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="lo-card lo-cal">
      <div className="lo-cal__head">
        <button className="lo-cal__nav" onClick={prev} aria-label="Önceki ay">
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <button className="lo-cal__month" onClick={goToday} title="Bugüne dön">
          {monthLabel}
        </button>
        <button className="lo-cal__nav" onClick={next} aria-label="Sonraki ay">
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="lo-cal__weekdays">
        {weekdays.map((d, i) => (
          <div className="lo-cal__wd" key={i}>
            {d}
          </div>
        ))}
      </div>

      <div className="lo-cal__grid">
        {Array.from({ length: offset }, (_, i) => (
          <span className="lo-cal__pad" key={"p" + i} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((n) => {
          const isToday =
            view.y === now.getFullYear() && view.m === now.getMonth() && n === now.getDate();
          const isSel = view.y === openY && view.m === openM && n === openD;
          const cls = "lo-cal__day" + (isSel ? " is-selected" : isToday ? " is-today" : "");
          return (
            <button className={cls} key={n} onClick={() => void goToDate(new Date(view.y, view.m, n))}>
              {n}
              {(dotDays.has(n) || gcalDays.has(n)) && (
                <span className="lo-cal__dots">
                  {dotDays.has(n) && <span className="lo-cal__dot" />}
                  {gcalDays.has(n) && <span className="lo-cal__dot lo-cal__dot--gcal" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

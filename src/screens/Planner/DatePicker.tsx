import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, startOfMonth, getDaysInMonth, isSameDay, parseISO, format } from "date-fns";
import { tr } from "date-fns/locale";

const WEEK = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

/** Modern, satır-içi takvim (görev detayında). value = ISO yyyy-mm-dd ("" = yok). */
export function DatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const selected = value ? parseISO(value) : null;
  const today = new Date();
  const [view, setView] = useState(() => startOfMonth(selected ?? today));

  const lead = (view.getDay() + 6) % 7; // Pazartesi-ilk hizalama
  const count = getDaysInMonth(view);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));

  const iso = (d: Date) => format(d, "yyyy-MM-dd");

  return (
    <div className="lo-dp">
      <div className="lo-dp__head">
        <button className="lo-dp__nav" type="button" onClick={() => setView(addMonths(view, -1))}>
          <ChevronLeft size={16} strokeWidth={2.2} />
        </button>
        <span className="lo-dp__month">{format(view, "LLLL yyyy", { locale: tr })}</span>
        <button className="lo-dp__nav" type="button" onClick={() => setView(addMonths(view, 1))}>
          <ChevronRight size={16} strokeWidth={2.2} />
        </button>
      </div>
      <div className="lo-dp__grid">
        {WEEK.map((w) => (
          <span className="lo-dp__wd" key={w}>
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span className="lo-dp__pad" key={"p" + i} />
          ) : (
            <button
              key={iso(d)}
              type="button"
              className={
                "lo-dp__day" +
                (selected && isSameDay(d, selected) ? " is-selected" : "") +
                (isSameDay(d, today) ? " is-today" : "")
              }
              onClick={() => onChange(iso(d))}
            >
              {d.getDate()}
            </button>
          )
        )}
      </div>
    </div>
  );
}

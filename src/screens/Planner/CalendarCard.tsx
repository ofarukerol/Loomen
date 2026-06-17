import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { taskDays } from "../../data/sampleVault";

const TODAY = 13;
const DAYS_IN_MONTH = 30; // Haziran 2026

export function CalendarCard() {
  const { t } = useTranslation();
  const selectedDay = useAppStore((s) => s.selectedDay);
  const selectDay = useAppStore((s) => s.selectDay);
  const weekdays = t("calendar.weekdays", { returnObjects: true }) as string[];

  return (
    <div className="lo-card lo-cal">
      <div className="lo-cal__head">
        <button className="lo-cal__nav" aria-label="Önceki ay">
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <span className="lo-cal__month">{t("calendar.month")}</span>
        <button className="lo-cal__nav" aria-label="Sonraki ay">
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="lo-cal__weekdays">
        {weekdays.map((d) => (
          <div className="lo-cal__wd" key={d}>
            {d}
          </div>
        ))}
      </div>

      <div className="lo-cal__grid">
        {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map((n) => {
          const isSel = n === selectedDay;
          const isToday = n === TODAY;
          const cls =
            "lo-cal__day" + (isSel ? " is-selected" : isToday ? " is-today" : "");
          return (
            <button className={cls} key={n} onClick={() => selectDay(n)}>
              {n}
              {taskDays.has(n) && <span className="lo-cal__dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

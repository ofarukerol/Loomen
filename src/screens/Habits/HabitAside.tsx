import { useTranslation } from "react-i18next";
import { dayList, isMilestone, type Habit } from "../../core/habit";
import { fmtDay } from "./habitUi";

/**
 * Gün dizisinin yan sütunu: niyet cümlesi ve dönüm noktaları (7, 14, 21 … ve son gün).
 * Ulaşılan gün dolu nokta, bugün vurgulu. Bırakılan turda bırakma gününden sonrası ulaşılmamış sayılır.
 * Masaüstünde dizinin yanında, mobilde altında.
 */
export function HabitAside({ habit, today, cutoff = null }: { habit: Habit; today: string; cutoff?: string | null }) {
  const { t, i18n } = useTranslation();
  const upTo = cutoff ?? today;
  const miles = dayList(habit)
    .map((key, i) => ({ key, no: i + 1 }))
    .filter((d) => isMilestone(d.no, habit.days));

  return (
    <aside className="lo-hab-aside">
      {habit.intent && (
        <blockquote className="lo-hab-intent">
          <span className="lo-hab-intent__label">{t("habit.intentLabel")}</span>
          <q>{habit.intent}</q>
        </blockquote>
      )}
      <div className="lo-hab-aside__miles">
        <span className="lo-hab-aside__title">{t("habit.milestones")}</span>
        <ol className="lo-hab-miles">
          {miles.map((m) => (
            <li
              key={m.key}
              className={
                "lo-hab-miles__item" + (m.key <= upTo ? " is-reached" : "") + (m.key === today ? " is-today" : "")
              }
            >
              <span className="lo-hab-miles__dot" aria-hidden />
              <span className="lo-hab-miles__day">{t("habit.dayN", { n: m.no })}</span>
              <span className="lo-hab-miles__date">{fmtDay(m.key, "d MMM", i18n.language)}</span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

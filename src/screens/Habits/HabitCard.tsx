import { useTranslation } from "react-i18next";
import { Check, Flame, ChevronRight, Moon } from "lucide-react";
import { dayIndex, isSealed, lastSevenStrip, stats, type Habit } from "../../core/habit";
import { useAppStore } from "../../store/useAppStore";
import { HabitRing } from "./HabitRing";
import { HabitStrip } from "./HabitStrip";
import { colorVars } from "./habitUi";

/**
 * Aktif listedeki alışkanlık kartı: simge, ad, "Gün 12 / 21", ilerleme halkası, seri, büyük Bugün
 * çentik düğmesi ve son 7 gün şeridi. Tur bugün tamamlandıysa halka dolar ve "21 gün" mührü basılır
 * (konfeti yok); kart o gün listede kalır, ertesi gün Geçmiş'e iner.
 */
export function HabitCard({ habit, today }: { habit: Habit; today: string }) {
  const { t } = useTranslation();
  const toggleDay = useAppStore((s) => s.habitToggleDay);
  const openDetail = useAppStore((s) => s.habitOpenDetail);

  const st = stats(habit, today);
  const dayNo = Math.min(Math.max(dayIndex(habit, today), 1), habit.days);
  const marked = st.completed + st.excused;
  const sealed = isSealed(habit, today);
  const doneToday = habit.done.includes(today);
  const excusedToday = habit.excused.includes(today);

  const open = () => openDetail(habit.id);

  return (
    <article
      className={"lo-hab-card" + (sealed ? " is-sealed" : "") + (doneToday || excusedToday ? " is-marked" : "")}
      style={colorVars(habit.color)}
      aria-label={habit.name}
    >
      <button type="button" className="lo-hab-card__head" onClick={open} aria-label={t("habit.openDetail", { name: habit.name })}>
        <HabitRing value={marked / habit.days} size={54}>
          <span className="lo-hab-card__emoji">{habit.emoji}</span>
        </HabitRing>
        <span className="lo-hab-card__info">
          <span className="lo-hab-card__name">{habit.name}</span>
          <span className="lo-hab-card__meta">
            <span className={"lo-hab-card__day" + (dayNo === 1 && marked === 0 ? " is-first" : "")}>
              {t("habit.dayOf", { day: dayNo, total: habit.days })}
            </span>
            {habit.round > 1 && <span className="lo-hab-card__round">{t("habit.round", { n: habit.round })}</span>}
          </span>
          <span className={"lo-hab-card__streak" + (st.currentStreak > 0 ? " is-on" : "")}>
            <Flame size={13} strokeWidth={2.2} aria-hidden />
            {st.currentStreak > 0 ? t("habit.streak", { count: st.currentStreak }) : t("habit.noStreak")}
          </span>
        </span>
        <ChevronRight size={17} strokeWidth={2} className="lo-hab-card__chev lo-hab-flip" aria-hidden />
      </button>

      {sealed ? (
        <div className="lo-hab-card__done" role="status">
          <Check size={16} strokeWidth={2.6} aria-hidden />
          {t("habit.sealedLine")}
        </div>
      ) : (
        <button
          type="button"
          className={"lo-hab-today" + (doneToday ? " is-done" : "") + (excusedToday ? " is-excused" : "")}
          aria-pressed={doneToday}
          onClick={() => void toggleDay(habit.id, today)}
        >
          <span className="lo-hab-today__box" aria-hidden>
            {excusedToday ? (
              <Moon size={15} strokeWidth={2.2} />
            ) : (
              <svg viewBox="0 0 20 20" width="18" height="18">
                {doneToday && <path className="lo-hab-tick" d="M5 10.5l3.2 3.2L15 6.8" pathLength={1} />}
              </svg>
            )}
          </span>
          <span className="lo-hab-today__label">
            {doneToday ? t("habit.todayDone") : excusedToday ? t("habit.todayExcused") : t("habit.todayMark")}
          </span>
        </button>
      )}

      <HabitStrip days={lastSevenStrip(habit, today)} variant="week" today={today} />

      {sealed && (
        <div className="lo-hab-seal" aria-hidden>
          <span className="lo-hab-seal__num">{habit.days}</span>
          <span className="lo-hab-seal__unit">{t("habit.sealUnit", { count: habit.days })}</span>
        </div>
      )}
    </article>
  );
}

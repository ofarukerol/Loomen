import { useTranslation } from "react-i18next";
import { ArrowUpRight, Check, ChevronDown, Moon, Sprout } from "lucide-react";
import { activeHabits, allDoneToday, dayIndex, stats, todayProgress } from "../../core/habit";
import { useAppStore } from "../../store/useAppStore";
import { HabitRing } from "../Habits/HabitRing";
import { colorVars, useToday } from "../Habits/habitUi";

/** Sağ paneldeki küçük "Bugünün alışkanlıkları" kartı (LOM-56) — ekrana girmeden bugünün
 *  çentiği. Yalnız bugünü işaretler/kaldırır; aktif alışkanlık yoksa hiç görünmez. Başlık kartı
 *  daraltır/açar (tercih kalıcı), başlıkta bugünün özeti durur; ok düğmesi ekranı açar (LOM-62). */
export function HabitsTodayCard() {
  const { t } = useTranslation();
  const habits = useAppStore((s) => s.habits);
  const loaded = useAppStore((s) => s.habitsLoaded);
  const toggleDay = useAppStore((s) => s.habitToggleDay);
  const openDetail = useAppStore((s) => s.habitOpenDetail);
  const setScreen = useAppStore((s) => s.setScreen);
  const collapsed = useAppStore((s) => s.habitTodayCollapsed);
  const toggle = useAppStore((s) => s.toggleHabitToday);
  const today = useToday();

  const list = loaded ? activeHabits(habits, today) : [];
  if (list.length === 0) return null;

  const open = () => {
    openDetail(null);
    setScreen("habits");
  };

  const sum = todayProgress(habits, today);
  const sumLabel = t("habit.todayProgress", { done: sum.done, total: sum.total });

  return (
    <div className={"lo-card lo-hab-side" + (collapsed ? " is-collapsed" : "")}>
      <div className="lo-hab-side__bar">
        <button
          type="button"
          className="lo-hab-side__head"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="lo-hab-side-panel"
        >
          <Sprout size={15} strokeWidth={2} aria-hidden />
          <span className="lo-hab-side__title">{t("habit.todayTitle")}</span>
          <span className="lo-hab-side__sum" dir="ltr" aria-label={sumLabel} title={sumLabel}>
            {sum.done}/{sum.total}
          </span>
          <ChevronDown size={16} strokeWidth={2.2} className="lo-hab-side__chev" aria-hidden />
        </button>
        <button
          type="button"
          className="lo-hab-iconbtn lo-hab-side__open"
          onClick={open}
          aria-label={t("habit.openScreen")}
          title={t("habit.openScreen")}
        >
          <ArrowUpRight size={16} strokeWidth={2} className="lo-hab-flip" aria-hidden />
        </button>
      </div>
      {/* Daraltılmış içerik etkisiz: odak almaz, tıklanmaz, okuyucuya görünmez (LOM-63). */}
      <div id="lo-hab-side-panel" className="lo-hab-side__panel" inert={collapsed}>
        <div className="lo-hab-side__panelin">
          {allDoneToday(habits, today) && (
            <div className="lo-hab-side__all" role="status">
              <Check size={14} strokeWidth={2.4} aria-hidden />
              {t("habit.allDone")}
            </div>
          )}
          <ul className="lo-hab-side__list">
            {list.map((h) => {
              const st = stats(h, today);
              const dayNo = Math.min(Math.max(dayIndex(h, today), 1), h.days);
              const done = h.done.includes(today);
              const excused = h.excused.includes(today);
              // Mazeretli günde düğme mazereti söyler; basınca gün "yapıldı"ya döner (HabitCard ile aynı).
              const label = done ? t("habit.uncheck") : excused ? t("habit.todayExcused") : t("habit.todayMark");
              return (
                <li
                  key={h.id}
                  className={"lo-hab-side__row" + (done || excused ? " is-done" : "")}
                  style={colorVars(h.color)}
                >
                  <span className="lo-hab-side__emoji" aria-hidden>
                    {h.emoji}
                  </span>
                  <span className="lo-hab-side__name">{h.name}</span>
                  <HabitRing value={(st.completed + st.excused) / h.days} size={20} stroke={3} />
                  <span className="lo-hab-side__day">{t("habit.dayOf", { day: dayNo, total: h.days })}</span>
                  <button
                    type="button"
                    className={"lo-hab-side__check" + (done ? " is-on" : "") + (excused ? " is-excused" : "")}
                    aria-pressed={done}
                    aria-label={`${h.name}: ${label}`}
                    title={label}
                    onClick={() => void toggleDay(h.id, today)}
                  >
                    {excused ? (
                      <Moon size={14} strokeWidth={2.2} aria-hidden />
                    ) : (
                      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
                        {done && <path className="lo-hab-tick" d="M5 10.5l3.2 3.2L15 6.8" pathLength={1} />}
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

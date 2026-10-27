import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flag, RotateCcw, Repeat, Trash2, ArrowRight } from "lucide-react";
import { dayIndex, endKey, isFinished, isSealed, outcome, stats, type Habit } from "../../core/habit";
import { useAppStore } from "../../store/useAppStore";
import { HabitRing } from "./HabitRing";
import { HabitGrid } from "./HabitGrid";
import { HabitConfirm } from "./HabitConfirm";
import { OutcomeBadge } from "./OutcomeBadge";
import { colorVars, fmtRange, quitDay } from "./habitUi";

type Ask = "quit" | "delete" | "restart" | null;

/**
 * Bir turun ayrıntısı: niyet, halka, özet satırı (tamamlanan, başarı, en uzun seri, kalan), gün
 * dizisi ve eylemler. Süren turda Bırak / Yeniden başlat / Sil; biten ya da mühürlü turda
 * Bir tur daha / Yeniden başlat / Sil. Aynı soyda daha yeni süren tur varsa ona gidilir.
 */
export function HabitDetail({
  habit,
  today,
  onNewRound,
}: {
  habit: Habit;
  today: string;
  onNewRound: (h: Habit) => void;
}) {
  const { t, i18n } = useTranslation();
  const habits = useAppStore((s) => s.habits);
  const openDetail = useAppStore((s) => s.habitOpenDetail);
  const habitQuit = useAppStore((s) => s.habitQuit);
  const habitDelete = useAppStore((s) => s.habitDelete);
  const habitRestart = useAppStore((s) => s.habitRestart);
  const [ask, setAsk] = useState<Ask>(null);

  const finished = isFinished(habit, today);
  const sealed = isSealed(habit, today);
  const quit = habit.status === "quit";
  // Bırakılmış tur dondurulur; süresi dolmuş tur sonradan düzeltilebilir (çekirdek izin verir).
  const readOnly = quit;
  // Bırakılmış turda bırakma gününden sonrası "kaçırıldı" sayılmaz.
  const cutoff = quit ? quitDay(habit) : null;
  const st = stats(habit, cutoff ?? today);
  const res = outcome(habit, today);
  const dayNo = finished ? habit.days : Math.min(Math.max(dayIndex(habit, today), 1), habit.days);
  const marked = st.completed + st.excused;

  const newerLive = habits.find(
    (x) => x.id !== habit.id && x.lineageId === habit.lineageId && x.createdAt >= habit.createdAt && !isFinished(x, today),
  );
  const live = !finished && !quit;

  const restart = async () => {
    const h = await habitRestart(habit.id);
    if (h) openDetail(h.id);
  };

  return (
    <div className="lo-hab-detail" style={colorVars(habit.color)}>
      <div className="lo-hab-detail__bar">
        <button type="button" className="lo-hab-back" onClick={() => openDetail(null)}>
          <ArrowLeft size={16} strokeWidth={2} className="lo-hab-flip" aria-hidden />
          {t("habit.back")}
        </button>
      </div>

      <header className="lo-hab-detail__head">
        <HabitRing value={marked / habit.days} size={76} stroke={5.5}>
          <span className="lo-hab-detail__emoji">{habit.emoji}</span>
        </HabitRing>
        <div className="lo-hab-detail__titles">
          <h1 className="lo-hab-detail__name">{habit.name}</h1>
          <div className="lo-hab-detail__meta">
            <span className="lo-hab-detail__day">{t("habit.dayOf", { day: dayNo, total: habit.days })}</span>
            {habit.round > 1 && <span className="lo-hab-card__round">{t("habit.round", { n: habit.round })}</span>}
            {res && <OutcomeBadge outcome={res} />}
            {sealed && <span className="lo-hab-badge is-completed">{t("habit.outcome.completed")}</span>}
          </div>
          <div className="lo-hab-detail__range">{fmtRange(habit.start, endKey(habit), i18n.language)}</div>
        </div>
      </header>

      {habit.intent && (
        <blockquote className="lo-hab-intent">
          <span className="lo-hab-intent__label">{t("habit.intentLabel")}</span>
          <q>{habit.intent}</q>
        </blockquote>
      )}

      <dl className="lo-hab-summary">
        <div className="lo-hab-summary__item">
          <dt>{t("habit.sum.done")}</dt>
          <dd>
            {st.completed}
            <span className="lo-hab-summary__of">/{habit.days}</span>
          </dd>
        </div>
        <div className="lo-hab-summary__item">
          <dt>{t("habit.sum.rate")}</dt>
          <dd>{t("habit.percent", { n: st.percent })}</dd>
        </div>
        <div className="lo-hab-summary__item">
          <dt>{t("habit.sum.longest")}</dt>
          <dd>{st.longestStreak}</dd>
        </div>
        <div className="lo-hab-summary__item">
          <dt>{t("habit.sum.left")}</dt>
          <dd>{finished ? 0 : st.remaining}</dd>
        </div>
      </dl>

      <section className="lo-hab-detail__grid">
        <HabitGrid habit={habit} today={today} readOnly={readOnly} cutoff={cutoff} />
        <div className="lo-hab-legend" aria-hidden>
          <span className="lo-hab-legend__item">
            <span className="lo-hab-legend__sw is-done" />
            {t("habit.state.done")}
          </span>
          <span className="lo-hab-legend__item">
            <span className="lo-hab-legend__sw is-excused" />
            {t("habit.state.excused")}
          </span>
          <span className="lo-hab-legend__item">
            <span className="lo-hab-legend__sw is-missed" />
            {t("habit.state.missed")}
          </span>
          <span className="lo-hab-legend__item">
            <span className="lo-hab-legend__sw is-future" />
            {t("habit.state.future")}
          </span>
        </div>
        {!readOnly && <p className="lo-hab-hint">{t("habit.gridHint")}</p>}
      </section>

      <div className="lo-hab-actions">
        {newerLive ? (
          <button type="button" className="lo-btn lo-btn--primary" onClick={() => openDetail(newerLive.id)}>
            {t("habit.openLive", { n: newerLive.round })}
            <ArrowRight size={15} strokeWidth={2} className="lo-hab-flip" aria-hidden />
          </button>
        ) : (
          <>
            {(finished || sealed) && (
              <button type="button" className="lo-btn lo-btn--primary" onClick={() => onNewRound(habit)}>
                <Repeat size={15} strokeWidth={2} aria-hidden />
                {t("habit.newRound")}
              </button>
            )}
            <button type="button" className="lo-btn" onClick={() => (live && !sealed ? setAsk("restart") : void restart())}>
              <RotateCcw size={15} strokeWidth={2} aria-hidden />
              {t("habit.restart")}
            </button>
            {live && !sealed && (
              <button type="button" className="lo-btn" onClick={() => setAsk("quit")}>
                <Flag size={15} strokeWidth={2} aria-hidden />
                {t("habit.quit")}
              </button>
            )}
          </>
        )}
        <button type="button" className="lo-btn lo-hab-btn--ghostdanger" onClick={() => setAsk("delete")}>
          <Trash2 size={15} strokeWidth={2} aria-hidden />
          {t("habit.delete")}
        </button>
      </div>

      {ask === "quit" && (
        <HabitConfirm
          title={t("habit.confirm.quitTitle", { name: habit.name })}
          body={t("habit.confirm.quitBody")}
          confirmLabel={t("habit.quit")}
          onConfirm={() => habitQuit(habit.id)}
          onClose={() => setAsk(null)}
        />
      )}
      {ask === "restart" && (
        <HabitConfirm
          title={t("habit.confirm.restartTitle", { name: habit.name })}
          body={t("habit.confirm.restartBody", { count: habit.days })}
          confirmLabel={t("habit.restart")}
          onConfirm={restart}
          onClose={() => setAsk(null)}
        />
      )}
      {ask === "delete" && (
        <HabitConfirm
          title={t("habit.confirm.deleteTitle", { name: habit.name })}
          body={t("habit.confirm.deleteBody")}
          confirmLabel={t("habit.delete")}
          danger
          onConfirm={() => habitDelete(habit.id)}
          onClose={() => setAsk(null)}
        />
      )}
    </div>
  );
}

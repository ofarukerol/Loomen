import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Repeat, RotateCcw, ArrowRight, History, Check, Flag } from "lucide-react";
import {
  HISTORY_FILTERS,
  cellState,
  dayList,
  endKey,
  historyGroups,
  stats,
  type Habit,
  type HabitHistoryFilter,
  type HistoryItem,
} from "../../core/habit";
import { useAppStore } from "../../store/useAppStore";
import { HabitRing } from "./HabitRing";
import { HabitStrip } from "./HabitStrip";
import { OutcomeBadge } from "./OutcomeBadge";
import { colorVars, fmtRange } from "./habitUi";

/**
 * Geçmiş: bitmiş ve bırakılmış turlar, aynı alışkanlığın turları bir kartta; turlar ince zaman
 * çizgisiyle bağlı, 1. tur üstte (gruplar yine en yeni tura göre sıralı). Her turda küçük halka,
 * tarih aralığı, sonuç rozeti, başarı yüzdesi ve bütün günlerin ısı şeridi; tamamlanan turda mühür.
 * Süzgeç (Hepsi / Tamamlanan / Bırakılan) localStorage'a giren tek alışkanlık ayarıdır.
 */
export function HabitHistory({ today, onNewRound }: { today: string; onNewRound: (h: Habit) => void }) {
  const { t } = useTranslation();
  const habits = useAppStore((s) => s.habits);
  const filter = useAppStore((s) => s.habitHistoryFilter);
  const setFilter = useAppStore((s) => s.habitSetHistoryFilter);
  const openDetail = useAppStore((s) => s.habitOpenDetail);
  const habitRestart = useAppStore((s) => s.habitRestart);

  const groups = useMemo(() => historyGroups(habits, today, filter), [habits, today, filter]);
  const anyHistory = useMemo(() => historyGroups(habits, today, "all").length > 0, [habits, today]);

  const restart = async (h: Habit) => {
    const next = await habitRestart(h.id);
    if (next) openDetail(next.id);
  };

  return (
    <div className="lo-hab-history">
      <div className="lo-hab-filter" role="radiogroup" aria-label={t("habit.filter.label")}>
        {HISTORY_FILTERS.map((f: HabitHistoryFilter) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            className={"lo-hab-chip" + (filter === f ? " is-on" : "")}
            onClick={() => setFilter(f)}
          >
            {t(`habit.filter.${f}`)}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="lo-hab-quiet">
          <History size={18} strokeWidth={1.8} aria-hidden />
          <span>{anyHistory ? t("habit.history.emptyFilter") : t("habit.history.empty")}</span>
        </div>
      ) : (
        <div className="lo-hab-hlist">
          {groups.map((g) => {
            const latest = g.items[0].habit;
            return (
              <article key={g.lineageId} className="lo-hab-hgroup" style={colorVars(latest.color)}>
                <header className="lo-hab-hgroup__head">
                  <span className="lo-hab-hgroup__emoji" aria-hidden>
                    {latest.emoji}
                  </span>
                  <span className="lo-hab-hgroup__name">{latest.name}</span>
                  {g.items.length > 1 && (
                    <span className="lo-hab-hgroup__count">{t("habit.history.rounds", { count: g.items.length })}</span>
                  )}
                </header>

                <ol className="lo-hab-rounds">
                  {/* Çekirdek en yeniyi önde verir; zaman çizgisi 1. turdan aşağı akar. */}
                  {[...g.items].reverse().map((it) => (
                    <RoundRow key={it.habit.id} item={it} today={today} showRound={g.items.length > 1 || it.habit.round > 1} />
                  ))}
                </ol>

                <div className="lo-hab-hgroup__actions">
                  {g.activeId ? (
                    <button type="button" className="lo-btn" onClick={() => openDetail(g.activeId)}>
                      {t("habit.history.openActive")}
                      <ArrowRight size={14} strokeWidth={2} className="lo-hab-flip" aria-hidden />
                    </button>
                  ) : (
                    <>
                      <button type="button" className="lo-btn lo-btn--primary" onClick={() => onNewRound(latest)}>
                        <Repeat size={14} strokeWidth={2} aria-hidden />
                        {t("habit.newRound")}
                      </button>
                      <button type="button" className="lo-btn" onClick={() => void restart(latest)}>
                        <RotateCcw size={14} strokeWidth={2} aria-hidden />
                        {t("habit.restart")}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoundRow({ item, today, showRound }: { item: HistoryItem; today: string; showRound: boolean }) {
  const { t, i18n } = useTranslation();
  const openDetail = useAppStore((s) => s.habitOpenDetail);
  const h = item.habit;
  // Bırakılan turda yüzde ve şerit bırakma gününe kadar: sonrası "kaçırıldı" sayılmaz.
  const ref = h.status === "quit" ? item.finishedOn : today;
  const st = stats(h, ref);
  const heat = dayList(h).map((key) => {
    const st0 = key > item.finishedOn ? null : (cellState(h, key, ref) ?? null);
    // Bırakma günü işaretsiz kaldıysa (ve o gün bugün değilse) kaçırılmış sayılır.
    return { key, state: st0 === "today" && key !== today ? ("missed" as const) : st0 };
  });
  const range = fmtRange(h.start, h.status === "quit" ? item.finishedOn : endKey(h), i18n.language);
  const kind = item.outcome.kind;
  const sealed = kind === "completed";
  const days = t("habit.sealUnit", { count: h.days });

  return (
    <li className="lo-hab-round">
      <div className={`lo-hab-round__ring is-${kind}`}>
        <HabitRing value={(st.completed + st.excused) / h.days} size={36} stroke={3.5}>
          {kind === "completed" ? (
            <Check size={15} strokeWidth={2.6} aria-hidden />
          ) : kind === "quit" ? (
            <Flag size={13} strokeWidth={2.2} aria-hidden />
          ) : (
            <span className="lo-hab-round__emoji">{h.emoji}</span>
          )}
        </HabitRing>
      </div>
      <button
        type="button"
        className={"lo-hab-round__btn" + (sealed ? " is-sealed" : "")}
        onClick={() => openDetail(h.id)}
        aria-label={t("habit.openDetail", { name: h.name }) + (showRound ? ` · ${t("habit.round", { n: h.round })}` : "")}
      >
        <span className="lo-hab-round__title">{showRound ? `${t("habit.round", { n: h.round })} · ${days}` : days}</span>
        <span className="lo-hab-round__range">{range}</span>
        <span className="lo-hab-round__mid">
          <OutcomeBadge outcome={item.outcome} />
          <span className="lo-hab-round__pct">{t("habit.percent", { n: st.percent })}</span>
        </span>
        <HabitStrip days={heat} variant="heat" />
        {sealed && (
          <span className="lo-hab-round__seal" aria-hidden>
            <span className="lo-hab-round__sealnum">{h.days}</span>
            <span className="lo-hab-round__sealunit">{t("habit.sealUnit", { count: h.days })}</span>
          </span>
        )}
      </button>
    </li>
  );
}

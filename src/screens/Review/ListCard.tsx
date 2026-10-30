import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { buildQueue, isoDay, listCards, listNewCaps, listProgress, type ReviewList } from "../../core/srs";
import { colorVars } from "../Habits/habitUi";

/**
 * Listenin bugünkü kuyruğu — srsStartList ile aynı hesap: listenin günlük yeni kart sayısı genel
 * sınırı aşamaz, listenin bugün kalan yeni kart hakkı da uygulanır.
 */
export function useListToday(list: ReviewList): number {
  const cfg = useAppStore((s) => s.srsSettings);
  const states = useAppStore((s) => s.srsStates);
  const daily = useAppStore((s) => s.srsDaily);
  const sec = useAppStore((s) => s.srsSecPerCard);
  return useMemo(() => {
    const now = new Date();
    const cfg2 = { ...cfg, newPerDay: Math.min(list.newPerDay ?? cfg.newPerDay, cfg.newPerDay) };
    const caps = listNewCaps([list], daily[isoDay(now)], cfg);
    return buildQueue(listCards(list), states, daily, cfg2, now, sec, caps).items.length;
  }, [list, cfg, states, daily, sec]);
}

/** Dört sayı + ilerleme çubuğu (kartta ve ayrıntıda aynı). */
export function ListStats({ list, today }: { list: ReviewList; today: number }) {
  const { t } = useTranslation();
  const states = useAppStore((s) => s.srsStates);
  const p = useMemo(() => listProgress(list, states), [list, states]);
  const stats = [
    { key: "learned", val: p.learned },
    { key: "learning", val: p.learning },
    { key: "fresh", val: p.fresh },
    { key: "dueToday", val: today },
  ];
  return (
    <>
      <div className="lo-rlist-card__stats">
        {stats.map((s) => (
          <div className="lo-rlist-stat" key={s.key}>
            <span className="lo-rlist-stat__val">{s.val}</span>
            <span className="lo-rlist-stat__label">{t(`review.lists.card.${s.key}`)}</span>
          </div>
        ))}
      </div>
      <div
        className="lo-rlist-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.percent}
        aria-label={t("review.lists.card.percent", { pct: p.percent })}
      >
        <div className="lo-rlist-bar__fill" style={{ width: `${p.percent}%` }} />
      </div>
      <div className="lo-rlist-card__pct">{t("review.lists.card.percent", { pct: p.percent })}</div>
    </>
  );
}

/** Listelerim ızgarasındaki bir liste. Karta tıklayınca ayrıntı açılır; Çalış yalnız bu listeden oturum açar. */
export function ListCard({ list }: { list: ReviewList }) {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.srsOpenList);
  const study = useAppStore((s) => s.srsStartList);
  const today = useListToday(list);

  return (
    // Kartın tamamı fareyle tıklanır; klavye ve ekran okuyucu için ayrıntıyı adın düğmesi açar
    // (kartı düğme yapmak Çalış düğmesini iç içe düğme yapardı).
    <div className="lo-card lo-rlist-card" style={colorVars(list.color)} onClick={() => open(list.id)}>
      <div className="lo-rlist-card__head">
        <span className="lo-rlist-card__emoji" aria-hidden>
          {list.emoji}
        </span>
        <div className="lo-rlist-card__titles">
          <button
            type="button"
            className="lo-rlist-card__name"
            onClick={(e) => {
              e.stopPropagation();
              open(list.id);
            }}
          >
            {list.name}
          </button>
          <div className="lo-rlist-card__rows">{t("review.lists.card.rows", { n: list.rows.length })}</div>
        </div>
      </div>
      <ListStats list={list} today={today} />
      <button
        className="lo-btn lo-btn--primary lo-rlist-card__study"
        disabled={today === 0}
        onClick={(e) => {
          e.stopPropagation();
          study(list.id);
        }}
      >
        {today === 0 ? (
          t("review.lists.card.nothingToday")
        ) : (
          <>
            <Play size={14} strokeWidth={2.2} />
            {t("review.lists.card.study")}
          </>
        )}
      </button>
    </div>
  );
}

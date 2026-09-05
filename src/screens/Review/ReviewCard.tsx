import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Repeat2, Play } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { buildQueue } from "../../core/srs";

/** Sağ paneldeki küçük tekrar kartı — bugün ne var, tek tıkla başla.
 *  Modül kapalıyken hiç görünmez. */
export function ReviewCard() {
  const { t } = useTranslation();
  const cfg = useAppStore((s) => s.srsSettings);
  const cards = useAppStore((s) => s.srsCards);
  const states = useAppStore((s) => s.srsStates);
  const daily = useAppStore((s) => s.srsDaily);
  const sec = useAppStore((s) => s.srsSecPerCard);
  const start = useAppStore((s) => s.srsStart);
  const setScreen = useAppStore((s) => s.setScreen);

  const info = useMemo(
    () => (cfg.enabled ? buildQueue(cards, states, daily, cfg, new Date(), sec) : null),
    [cfg, cards, states, daily, sec],
  );

  if (!cfg.enabled || !info) return null;

  const n = info.items.length;
  return (
    <div className="lo-card lo-revcard">
      <button className="lo-revcard__head" onClick={() => setScreen("review")}>
        <Repeat2 size={15} strokeWidth={2} />
        {t("review.title")}
      </button>
      {n === 0 ? (
        <div className="lo-revcard__empty">{t("review.cardEmpty")}</div>
      ) : (
        <>
          <div className="lo-revcard__num">
            {n} <span>{t("review.cardUnit", { min: info.minutes })}</span>
          </div>
          <button className="lo-btn lo-btn--primary lo-revcard__btn" onClick={() => start(null)}>
            <Play size={14} strokeWidth={2.2} />
            {t("review.start")}
          </button>
        </>
      )}
    </div>
  );
}

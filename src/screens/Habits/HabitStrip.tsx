import { useTranslation } from "react-i18next";
import type { CellState } from "../../core/habit";
import { fmtDay } from "./habitUi";

/**
 * İnce gün şeridi — kartın altında son 7 gün, Geçmiş kartında bütün günler (minik ısı şeridi).
 * Tur dışındaki gün (null) yer tutar ama boş görünür. Yalnız gösterir; tıklanmaz. Düğme içine girebildiği için kök `span`.
 */
export function HabitStrip({
  days,
  variant,
}: {
  days: { key: string; state: CellState | null }[];
  variant: "week" | "heat";
}) {
  const { t, i18n } = useTranslation();
  return (
    <span className={`lo-hab-strip lo-hab-strip--${variant}`} aria-hidden>
      {days.map((d) => (
        <span
          key={d.key}
          className={"lo-hab-strip__day" + (d.state ? ` is-${d.state}` : " is-out")}
          title={d.state ? `${fmtDay(d.key, "d MMM, EEE", i18n.language)} · ${t(`habit.state.${d.state}`)}` : undefined}
        />
      ))}
    </span>
  );
}

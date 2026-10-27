import { useTranslation } from "react-i18next";
import type { CellState } from "../../core/habit";
import { fmtDay } from "./habitUi";

/**
 * Gün şeridi — kartın altında son 7 gün (her hücrenin altında gün harfi, bugün vurgulu), Geçmiş
 * kartında bütün günler (satıra kırılan minik ısı şeridi). Tur dışındaki gün (null) yer tutar ama
 * boş görünür. Yalnız gösterir; tıklanmaz. Düğme içine girebildiği için kök `span`.
 */
export function HabitStrip({
  days,
  variant,
  today,
}: {
  days: { key: string; state: CellState | null }[];
  variant: "week" | "heat";
  today?: string;
}) {
  const { t, i18n } = useTranslation();
  const cell = (d: { key: string; state: CellState | null }) => (
    <span
      key={d.key}
      className={"lo-hab-strip__day" + (d.state ? ` is-${d.state}` : " is-out")}
      title={d.state ? `${fmtDay(d.key, "d MMM, EEE", i18n.language)} · ${t(`habit.state.${d.state}`)}` : undefined}
    />
  );
  return (
    <span className={`lo-hab-strip lo-hab-strip--${variant}`} aria-hidden>
      {variant === "week"
        ? days.map((d) => (
            <span key={d.key} className={"lo-hab-strip__col" + (d.key === today ? " is-now" : "")}>
              {cell(d)}
              <span className="lo-hab-strip__dow">{fmtDay(d.key, "EEEEEE", i18n.language)}</span>
            </span>
          ))
        : days.map(cell)}
    </span>
  );
}

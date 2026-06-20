import { useTranslation } from "react-i18next";
import { useFocusCounts } from "../../store/useAppStore";

export type TaskFilter = "yapilacak" | "geciken" | "planlanmamis";

export function StatCards({
  compact,
  active,
  onSelect,
}: {
  compact?: boolean;
  active?: TaskFilter;
  onSelect?: (f: TaskFilter) => void;
}) {
  const { t } = useTranslation();
  const { yapilacak, geciken, planlanmamis } = useFocusCounts();
  const sm = compact ? " lo-stat--sm" : "";

  const cards: { key: TaskFilter; num: number; label: string; variant: string }[] = [
    { key: "yapilacak", num: yapilacak, label: t("planner.todo"), variant: " lo-stat--accent" },
    { key: "geciken", num: geciken, label: t("planner.overdue"), variant: " lo-stat--danger" },
    { key: "planlanmamis", num: planlanmamis, label: t("planner.unplanned"), variant: "" },
  ];

  return (
    <div className={"lo-stats" + (compact ? " lo-stats--compact" : "") + (onSelect ? " lo-stats--filter" : "")}>
      {cards.map((c) => {
        const cls =
          "lo-stat" +
          c.variant +
          sm +
          (onSelect ? " is-clickable" : "") +
          (active === c.key ? " is-selected" : "");
        const inner = (
          <>
            <div className="lo-stat__num">{c.num}</div>
            <div className="lo-stat__label">{c.label}</div>
          </>
        );
        return onSelect ? (
          <button key={c.key} className={cls} onClick={() => onSelect(c.key)} aria-pressed={active === c.key}>
            {inner}
          </button>
        ) : (
          <div key={c.key} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

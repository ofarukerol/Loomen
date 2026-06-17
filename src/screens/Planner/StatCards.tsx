import { useTranslation } from "react-i18next";
import { useFocusCounts } from "../../store/useAppStore";

export function StatCards({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { yapilacak, geciken, planlanmamis } = useFocusCounts();
  const sm = compact ? " lo-stat--sm" : "";

  return (
    <div className={"lo-stats" + (compact ? " lo-stats--compact" : "")}>
      <div className={"lo-stat lo-stat--accent" + sm}>
        <div className="lo-stat__num">{yapilacak}</div>
        <div className="lo-stat__label">{t("planner.todo")}</div>
      </div>
      <div className={"lo-stat lo-stat--danger" + sm}>
        <div className="lo-stat__num">{geciken}</div>
        <div className="lo-stat__label">{t("planner.overdue")}</div>
      </div>
      <div className={"lo-stat" + sm}>
        <div className="lo-stat__num">{planlanmamis}</div>
        <div className="lo-stat__label">{t("planner.unplanned")}</div>
      </div>
    </div>
  );
}

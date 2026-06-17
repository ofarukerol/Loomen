import { useTranslation } from "react-i18next";
import { useFocusCounts } from "../../store/useAppStore";

export function StatCards() {
  const { t } = useTranslation();
  const { yapilacak, geciken, planlanmamis } = useFocusCounts();

  return (
    <div className="lo-stats">
      <div className="lo-stat lo-stat--accent">
        <div className="lo-stat__num">{yapilacak}</div>
        <div className="lo-stat__label">{t("planner.todo")}</div>
      </div>
      <div className="lo-stat lo-stat--danger">
        <div className="lo-stat__num">{geciken}</div>
        <div className="lo-stat__label">{t("planner.overdue")}</div>
      </div>
      <div className="lo-stat">
        <div className="lo-stat__num">{planlanmamis}</div>
        <div className="lo-stat__label">{t("planner.unplanned")}</div>
      </div>
    </div>
  );
}

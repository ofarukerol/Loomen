import { useTranslation } from "react-i18next";
import { Minimize2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { TaskRow } from "./TaskRow";

/** Odak listesinin orta gövdede genişletilmiş hali (bugünün tüm görevleri). */
export function FocusExpanded() {
  const { t } = useTranslation();
  const groups = useAppStore((s) => s.groups);
  const setFocusExpanded = useAppStore((s) => s.setFocusExpanded);

  const today = groups.filter((g) => g.kind === "today").flatMap((g) => g.tasks);
  const openCount = today.filter((tk) => !tk.done).length;

  return (
    <div className="lo-focusx lo-scroll">
      <div className="lo-focusx__head">
        <h2 className="lo-focusx__title">{t("planner.focusList")}</h2>
        <span className="lo-focusx__count">{openCount}</span>
        <div style={{ flex: 1 }} />
        <button className="lo-focusx__close" onClick={() => setFocusExpanded(false)}>
          <Minimize2 size={15} strokeWidth={2} />
          {t("planner.collapse")}
        </button>
      </div>
      <div className="lo-focusx__list">
        {today.length === 0 ? (
          <div className="lo-focus__empty">{t("planner.allClear")}</div>
        ) : (
          today.map((task) => <TaskRow task={task} key={task.id} />)
        )}
      </div>
    </div>
  );
}

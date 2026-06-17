import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, Circle } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { GroupKind } from "../../data/sampleVault";

const MAX = 6;

function labelClass(kind: GroupKind) {
  if (kind === "overdue") return "lo-mini__date--overdue";
  if (kind === "today") return "lo-mini__date--today";
  return "lo-mini__date--upcoming";
}

/** Takvim altı kompakt ajanda — orta gövdedeki timeline'ın küçük, kibar hâli. */
export function MiniAgenda() {
  const { t } = useTranslation();
  const groups = useAppStore((s) => s.groups);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const setFocusExpanded = useAppStore((s) => s.setFocusExpanded);

  const rows: ReactNode[] = [];
  let count = 0;
  for (const g of groups) {
    if (count >= MAX) break;
    const open = g.tasks.filter((tk) => !tk.done);
    if (open.length === 0) continue;
    rows.push(
      <div className={"lo-mini__date " + labelClass(g.kind)} key={"d" + g.id}>
        {g.label}
      </div>
    );
    for (const task of open) {
      if (count >= MAX) break;
      rows.push(
        <div className="lo-mini__row" key={task.id}>
          <button
            className="lo-mini__check"
            onClick={() => void toggleTask(task.id)}
            aria-label={task.text}
          >
            <Circle size={13} strokeWidth={1.9} />
          </button>
          <span className="lo-mini__text">{task.text}</span>
          <span className={"lo-mini__rel" + (task.overdue ? " is-overdue" : "")}>{task.rel}</span>
        </div>
      );
      count++;
    }
  }

  return (
    <div className="lo-card lo-mini">
      <div className="lo-mini__head">
        <span className="lo-mini__title">{t("planner.focusList")}</span>
        <button
          className="lo-focus__expand"
          onClick={() => setFocusExpanded(true)}
          title={t("planner.expand")}
        >
          <Maximize2 size={13} strokeWidth={2} />
        </button>
      </div>
      {rows.length > 0 ? (
        <div className="lo-mini__list">{rows}</div>
      ) : (
        <div className="lo-focus__empty">{t("planner.allClear")}</div>
      )}
    </div>
  );
}

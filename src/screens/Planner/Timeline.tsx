import { useAppStore } from "../../store/useAppStore";
import type { TaskGroup } from "../../data/sampleVault";
import { TaskRow } from "./TaskRow";

function pillClass(kind: TaskGroup["kind"]) {
  if (kind === "today") return "lo-pill lo-pill--today";
  if (kind === "overdue") return "lo-pill lo-pill--overdue";
  return "lo-pill lo-pill--upcoming";
}

export function Timeline() {
  const groups = useAppStore((s) => s.groups);

  return (
    <div className="lo-timeline lo-scroll">
      {groups.map((g) => (
        <div className="lo-group" key={g.id}>
          <div className="lo-group__head">
            <span
              className={
                "lo-group__label " +
                (g.kind === "overdue" ? "lo-group__label--overdue" : "lo-group__label--normal")
              }
            >
              {g.label}
            </span>
            <span className={pillClass(g.kind)}>{g.sub}</span>
            <div className="lo-group__rule" />
          </div>
          {g.tasks.map((t) => (
            <TaskRow task={t} key={t.id} />
          ))}
        </div>
      ))}
    </div>
  );
}

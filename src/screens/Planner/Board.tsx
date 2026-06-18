import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { GroupKind, Task } from "../../data/sampleVault";

function BoardCard({ task, danger }: { task: Task; danger?: boolean }) {
  const toggleTask = useAppStore((s) => s.toggleTask);
  const selectTask = useAppStore((s) => s.selectTask);
  return (
    <div className={"lo-bcard is-clickable" + (danger ? " is-danger" : "")} onClick={() => selectTask(task.id)}>
      <div className="lo-bcard__top">
        <button
          className="lo-task__check"
          onClick={(e) => {
            e.stopPropagation();
            toggleTask(task.id);
          }}
          style={{ color: task.done ? "var(--success)" : task.overdue ? "var(--danger)" : "var(--fg3)" }}
        >
          {task.done ? (
            <CheckCircle2 size={20} fill="var(--success)" color="#fff" strokeWidth={1.9} />
          ) : (
            <Circle size={20} strokeWidth={1.7} />
          )}
        </button>
        <div className={"lo-task__text" + (task.done ? " is-done" : "")} style={{ fontSize: 13.5 }}>
          {task.text}
        </div>
      </div>
      <div className="lo-bcard__meta">
        {task.rel !== "bugün" && (
          <span style={{ fontSize: 11, color: danger ? "var(--danger)" : "var(--fg3)" }}>{task.rel}</span>
        )}
        <span className="lo-chip lo-chip--tag" style={{ fontSize: 10.5 }}>
          {task.tag}
        </span>
        {task.pomos > 0 && <span className="lo-chip lo-chip--pomo" style={{ fontSize: 10.5 }}>🍅 ×{task.pomos}</span>}
      </div>
    </div>
  );
}

export function Board() {
  const { t } = useTranslation();
  const groups = useAppStore((s) => s.groups);
  const tasksOf = (kind: GroupKind) => groups.filter((g) => g.kind === kind).flatMap((g) => g.tasks);

  const columns: { key: GroupKind; label: string; dot: string; danger?: boolean }[] = [
    { key: "overdue", label: t("board.overdue"), dot: "var(--danger)", danger: true },
    { key: "today", label: t("board.today"), dot: "var(--accent)" },
    { key: "upcoming", label: t("board.upcoming"), dot: "var(--fg3)" },
  ];

  return (
    <div className="lo-board lo-scroll">
      {columns.map((col) => {
        const tasks = tasksOf(col.key);
        return (
          <div className="lo-board__col" key={col.key}>
            <div className="lo-board__colhead">
              <span className="lo-board__dot" style={{ background: col.dot }} />
              <span className="lo-board__coltitle">{col.label}</span>
              <span className="lo-board__count">{tasks.length}</span>
            </div>
            {tasks.map((task) => (
              <BoardCard task={task} danger={col.danger} key={task.id} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

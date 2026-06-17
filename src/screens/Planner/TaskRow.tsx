import { CheckCircle2, Circle, Pencil, FileText, Target } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { Task } from "../../data/sampleVault";

export function TaskRow({ task }: { task: Task }) {
  const toggleTask = useAppStore((s) => s.toggleTask);
  const setScreen = useAppStore((s) => s.setScreen);

  const open = !task.done;
  const overdueOpen = task.overdue && open;

  return (
    <div className={"lo-task" + (overdueOpen ? " is-overdue" : "")}>
      <button
        className="lo-task__check"
        onClick={() => toggleTask(task.id)}
        aria-label={task.done ? "Tamamlandı" : "Tamamla"}
        style={{ color: task.done ? "var(--success)" : task.overdue ? "var(--danger)" : "var(--fg3)" }}
      >
        {task.done ? (
          <CheckCircle2 size={22} strokeWidth={1.9} fill="var(--success)" color="#fff" />
        ) : (
          <Circle size={22} strokeWidth={1.7} />
        )}
      </button>

      <div className="lo-task__body">
        <div className={"lo-task__text" + (task.done ? " is-done" : "")}>{task.text}</div>

        <div className={"lo-task__rel" + (overdueOpen ? " is-overdue" : "")}>
          <Pencil size={12} strokeWidth={2} />
          {task.rel}
        </div>

        <div className="lo-task__meta">
          <button className="lo-chip lo-chip--source" onClick={() => setScreen("editor")}>
            <FileText size={11} strokeWidth={1.9} />
            {task.source}
          </button>
          <span className="lo-chip lo-chip--tag">
            <Target size={11} strokeWidth={2} />
            {task.tag}
          </span>
          {task.pomos > 0 && <span className="lo-chip lo-chip--pomo">🍅 ×{task.pomos}</span>}
        </div>
      </div>
    </div>
  );
}

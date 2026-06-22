import { Check, Pencil, FileText, Target } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { Task } from "../../data/sampleVault";

export function TaskRow({ task }: { task: Task }) {
  const toggleTask = useAppStore((s) => s.toggleTask);
  const openNote = useAppStore((s) => s.openNote);
  const selectTask = useAppStore((s) => s.selectTask);

  const open = !task.done;
  const overdueOpen = task.overdue && open;

  return (
    <div
      className={"lo-task is-clickable" + (overdueOpen ? " is-overdue" : "")}
      onClick={() => selectTask(task.id)}
    >
      <button
        className="lo-task__check"
        onClick={(e) => {
          e.stopPropagation();
          toggleTask(task.id);
        }}
        aria-label={task.done ? "Tamamlandı" : "Tamamla"}
      >
        <span className={"lo-checkbox-md" + (task.done ? " is-done" : "") + (overdueOpen ? " is-overdue" : "")}>
          {task.done && <Check size={14} strokeWidth={3} color="#fff" />}
        </span>
      </button>

      <div className="lo-task__body">
        <div className={"lo-task__text" + (task.done ? " is-done" : "")}>{task.text}</div>

        <div className={"lo-task__rel" + (overdueOpen ? " is-overdue" : "")}>
          <Pencil size={12} strokeWidth={2} />
          {task.rel}
        </div>

        <div className="lo-task__meta">
          <button
            className="lo-chip lo-chip--source"
            onClick={(e) => {
              e.stopPropagation();
              openNote(task.source);
            }}
          >
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

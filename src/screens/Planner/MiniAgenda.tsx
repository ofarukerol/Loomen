import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, Minimize2, FileText, GripVertical } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { GroupKind, Task } from "../../data/sampleVault";
import { StatCards, type TaskFilter } from "./StatCards";
import { QuickAdd } from "./QuickAdd";

function labelClass(kind: GroupKind) {
  if (kind === "overdue") return "lo-mini__date--overdue";
  if (kind === "today") return "lo-mini__date--today";
  return "lo-mini__date--upcoming";
}

/** Takvim altı kompakt ajanda — sayaç kartları filtre; canlı görevler kaydırılabilir listede. */
export function MiniAgenda() {
  const { t } = useTranslation();
  const groups = useAppStore((s) => s.groups);
  const unplannedTasks = useAppStore((s) => s.unplannedTasks);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const selectTask = useAppStore((s) => s.selectTask);
  const reorderTask = useAppStore((s) => s.reorderTask);
  const setFocusExpanded = useAppStore((s) => s.setFocusExpanded);
  const focusExpanded = useAppStore((s) => s.focusExpanded);
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);

  const [filter, setFilter] = useState<TaskFilter>("yapilacak");
  const dragId = useRef<string | null>(null); // senkron sürükleme kaynağı
  const [dragging, setDragging] = useState<string | null>(null); // yalnız görsel

  const expanded = focusExpanded && screen === "planner";
  const onExpand = () => {
    if (expanded) {
      setFocusExpanded(false);
    } else {
      setScreen("planner");
      setFocusExpanded(true);
    }
  };

  const taskRow = (task: Task) => (
    <div
      className={"lo-mini__row is-clickable" + (dragging === task.id ? " is-dragging" : "")}
      key={task.id}
      draggable
      onClick={() => selectTask(task.id)}
      onDragStart={(e) => {
        dragId.current = task.id;
        setDragging(task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (dragId.current && dragId.current !== task.id) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const from = dragId.current;
        if (from && from !== task.id) void reorderTask(from, task.id);
        dragId.current = null;
        setDragging(null);
      }}
      onDragEnd={() => {
        dragId.current = null;
        setDragging(null);
      }}
    >
      <span className="lo-mini__grip" aria-hidden>
        <GripVertical size={14} strokeWidth={2} />
      </span>
      <button
        className="lo-mini__check"
        onClick={(e) => {
          e.stopPropagation();
          void toggleTask(task.id);
        }}
        aria-label={task.text}
      >
        <span className="lo-checkbox-sm" />
      </button>
      <span className="lo-mini__text">{task.text}</span>
      {task.time && <span className="lo-mini__time">{task.time}</span>}
      <span className={"lo-mini__rel" + (task.overdue ? " is-overdue" : "")}>{task.rel}</span>
    </div>
  );

  // Aktif filtreye göre satırları kur (başlık = tarih ya da planlanmamışta kaynak not).
  const rows: ReactNode[] = [];
  if (filter === "planlanmamis") {
    const bySource = new Map<string, Task[]>();
    for (const tk of unplannedTasks) {
      if (!bySource.has(tk.source)) bySource.set(tk.source, []);
      bySource.get(tk.source)!.push(tk);
    }
    for (const [src, tasks] of bySource) {
      rows.push(
        <div className="lo-mini__date lo-mini__date--src" key={"s" + src}>
          <FileText size={11} strokeWidth={2} />
          {src}
        </div>
      );
      for (const tk of tasks) rows.push(taskRow(tk));
    }
  } else {
    const wanted: GroupKind[] = filter === "geciken" ? ["overdue"] : ["today", "upcoming"];
    for (const g of groups) {
      if (!wanted.includes(g.kind)) continue;
      const open = g.tasks.filter((tk) => !tk.done);
      if (open.length === 0) continue;
      rows.push(
        <div className={"lo-mini__date " + labelClass(g.kind)} key={"d" + g.id}>
          {g.label}
        </div>
      );
      for (const tk of open) rows.push(taskRow(tk));
    }
  }

  return (
    <div className="lo-card lo-mini">
      <div className="lo-mini__head">
        <span className="lo-mini__title">{t("planner.focusToday")}</span>
        <button
          className={"lo-focus__expand" + (expanded ? " is-active" : "")}
          onClick={onExpand}
          title={expanded ? t("planner.collapse") : t("planner.expand")}
        >
          {expanded ? <Minimize2 size={13} strokeWidth={2} /> : <Maximize2 size={13} strokeWidth={2} />}
        </button>
      </div>

      <StatCards compact active={filter} onSelect={setFilter} />
      <QuickAdd compact />

      {rows.length > 0 ? (
        <div className="lo-mini__list lo-mini__list--scroll lo-scroll">{rows}</div>
      ) : (
        <div className="lo-focus__empty">{t("planner.allClear")}</div>
      )}
    </div>
  );
}

import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, Minimize2, FileText, GripVertical, CalendarDays } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { GroupKind, Task } from "../../data/sampleVault";
import type { GEvent } from "../../core/google";
import { StatCards, type TaskFilter } from "./StatCards";
import { QuickAdd } from "./QuickAdd";

/** Google etkinliğinin başlangıcını yerel biçimde göster (tüm gün → tarih; saatli → tarih + saat). */
function formatEventStart(ev: GEvent, locale: string): string {
  if (ev.all_day) {
    return new Date(ev.start + "T00:00:00").toLocaleDateString(locale, { day: "2-digit", month: "short" });
  }
  return new Date(ev.start).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelClass(kind: GroupKind) {
  if (kind === "overdue") return "lo-mini__date--overdue";
  if (kind === "today") return "lo-mini__date--today";
  return "lo-mini__date--upcoming";
}

/** Takvim altı kompakt ajanda — sayaç kartları filtre; canlı görevler kaydırılabilir listede. */
export function MiniAgenda() {
  const { t, i18n } = useTranslation();
  const groups = useAppStore((s) => s.groups);
  const unplannedTasks = useAppStore((s) => s.unplannedTasks);
  const gcalEvents = useAppStore((s) => s.gcalEvents);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const selectTask = useAppStore((s) => s.selectTask);
  const reorderTask = useAppStore((s) => s.reorderTask);
  const setFocusExpanded = useAppStore((s) => s.setFocusExpanded);
  const focusExpanded = useAppStore((s) => s.focusExpanded);
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);

  const [filter, setFilter] = useState<TaskFilter>("yapilacak");
  // Pointer tabanlı sürükle-bırak — Tauri WKWebView native HTML5 DnD'yi güvenilir desteklemez.
  const downRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const overRef = useRef<{ id: string; pos: "before" | "after" } | null>(null);
  const suppressClickRef = useRef(false); // sürükleme sonrası gelen click'i yut
  const [dragging, setDragging] = useState<string | null>(null); // sürüklenen (görsel)
  const [overId, setOverId] = useState<string | null>(null); // bırakma hedefi (gösterge)
  const [overPos, setOverPos] = useState<"before" | "after">("before"); // hedefin önü/arkası

  // Satıra basıldığında: eşik aşılırsa sürüklemeye geç; aşılmazsa normal click (görev seç).
  const onRowPointerDown = (taskId: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return; // tamamla butonu vb. sürüklemez
    downRef.current = { id: taskId, x: e.clientX, y: e.clientY };
    draggingRef.current = false;

    const onMove = (ev: PointerEvent) => {
      const d = downRef.current;
      if (!d) return;
      if (!draggingRef.current) {
        if (Math.abs(ev.clientY - d.y) < 4 && Math.abs(ev.clientX - d.x) < 4) return;
        draggingRef.current = true;
        setDragging(d.id);
        document.body.style.userSelect = "none";
      }
      const row = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>(
        ".lo-mini__row"
      );
      const tid = row?.dataset.taskId;
      if (!row || !tid || tid === d.id) {
        overRef.current = null;
        setOverId(null);
        return;
      }
      const r = row.getBoundingClientRect();
      const pos: "before" | "after" = ev.clientY - r.top < r.height / 2 ? "before" : "after";
      overRef.current = { id: tid, pos };
      setOverId(tid);
      setOverPos(pos);
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
      const d = downRef.current;
      const tgt = overRef.current;
      if (draggingRef.current && d && tgt && d.id !== tgt.id) {
        void reorderTask(d.id, tgt.id, tgt.pos);
        suppressClickRef.current = true; // sürükleme bittiğinde click ile detay açma
      }
      downRef.current = null;
      overRef.current = null;
      draggingRef.current = false;
      setDragging(null);
      setOverId(null);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

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
      className={
        "lo-mini__row is-clickable" +
        (dragging === task.id ? " is-dragging" : "") +
        (overId === task.id ? (overPos === "after" ? " is-over-after" : " is-over-before") : "")
      }
      key={task.id}
      data-task-id={task.id}
      onPointerDown={onRowPointerDown(task.id)}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        selectTask(task.id);
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

  // Google Takvim etkinlikleri (salt okunur) — yalnızca "yapılacak" görünümünde, üstte.
  if (filter === "yapilacak" && gcalEvents.length > 0) {
    rows.push(
      <div className="lo-mini__date lo-mini__date--gcal" key="gcal-h">
        <CalendarDays size={11} strokeWidth={2} />
        {t("gcal.agendaTitle")}
      </div>
    );
    for (const ev of gcalEvents.slice(0, 20)) {
      rows.push(
        <div className="lo-mini__row lo-mini__row--event" key={"gc" + ev.id}>
          <span className="lo-mini__evdot" aria-hidden />
          <span className="lo-mini__text">{ev.summary}</span>
          <span className="lo-mini__time">{formatEventStart(ev, i18n.language)}</span>
        </div>
      );
    }
  }

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

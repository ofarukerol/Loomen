import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { TaskGroup } from "../../data/sampleVault";
import { TaskRow } from "./TaskRow";

function pillClass(kind: TaskGroup["kind"]) {
  if (kind === "today") return "lo-pill lo-pill--today";
  if (kind === "overdue") return "lo-pill lo-pill--overdue";
  return "lo-pill lo-pill--upcoming";
}

export function Timeline() {
  const { t } = useTranslation();
  const groups = useAppStore((s) => s.groups);
  const [showDone, setShowDone] = useState(false);

  // Açık görevler tarih gruplarında kalır; tamamlananlar tek "Tamamlananlar" bölümünde toplanır.
  const done = groups.flatMap((g) => g.tasks.filter((tk) => tk.done));

  return (
    <div className="lo-timeline lo-scroll">
      {groups.map((g) => {
        const open = g.tasks.filter((tk) => !tk.done);
        if (open.length === 0) return null; // tamamı bitmiş gün başlığı gösterilmez
        return (
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
            {open.map((tk) => (
              <TaskRow task={tk} key={tk.id} />
            ))}
          </div>
        );
      })}

      {done.length > 0 && (
        <div className="lo-group lo-group--done">
          <button
            className={"lo-done__toggle" + (showDone ? " is-open" : "")}
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
          >
            <ChevronRight size={15} strokeWidth={2.2} className="lo-done__chev" />
            <span className="lo-done__label">{t("planner.completed")}</span>
            <span className="lo-pill lo-pill--done">{done.length}</span>
          </button>
          {showDone && done.map((tk) => <TaskRow task={tk} key={tk.id} />)}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CalendarCheck, X, FileText } from "lucide-react";
import { useAppStore, useModalLayer } from "../../store/useAppStore";
import { todayISO } from "../../core/vault";
import { overdueOpenTasks } from "../../core/vault/planDay";
import { relativeLabel } from "../../lib/relativeDate";

const taskId = (t: { file: string; line: number }) => `${t.file}:${t.line}`;
const noteName = (file: string) => (file.split("/").pop() ?? file).replace(/\.md$/i, "");

/** "Günü planla" (LOM-40) — geciken açık görevleri seçtirip planlama tarihini bugüne çeker. */
export function PlanDayModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const parsedTasks = useAppStore((s) => s.parsedTasks);
  const rescheduleTasksToToday = useAppStore((s) => s.rescheduleTasksToToday);

  const today = todayISO();
  const overdue = useMemo(() => overdueOpenTasks(parsedTasks, today), [parsedTasks, today]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  // Açıkken Android geri tuşu bu pencereyi kapatsın (uygulamadan çıkmasın).
  useModalLayer();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Liste arada yenilenirse (dosya dışarıdan değişti) artık listede olmayan seçimler sayılmaz.
  const picked = overdue.filter((tk) => selected.has(taskId(tk))).map(taskId);
  const allPicked = overdue.length > 0 && picked.length === overdue.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onMove = async () => {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    try {
      await rescheduleTasksToToday(picked);
    } finally {
      setBusy(false);
    }
    onClose();
  };

  // Pencere document.body'ye çizilir: mobilde sağ panel `transform` uygulanmış çekmecenin
  // içinde; `position: fixed` orada ekrana değil çekmeceye göre konumlanıyor (bkz TrashModal).
  return createPortal(
    <div className="lo-modal" onClick={onClose}>
      <div
        className="lo-planday"
        role="dialog"
        aria-modal="true"
        aria-label={t("planner.planDay")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lo-tdetail__head">
          <span className="lo-tdetail__title">
            <CalendarCheck size={15} strokeWidth={2} style={{ marginInlineEnd: 7, verticalAlign: "-2px" }} />
            {t("planner.planDay")}
            {overdue.length > 0 && (
              <span className="lo-planday__count">{t("planner.planDayCount", { count: overdue.length })}</span>
            )}
          </span>
          <button className="lo-tdetail__close" onClick={onClose} aria-label={t("taskDetail.close")}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {overdue.length === 0 ? (
          <div className="lo-planday__empty">{t("planner.planDayNone")}</div>
        ) : (
          <>
            <div className="lo-planday__hint">{t("planner.planDayHint")}</div>
            <div className="lo-planday__list lo-scroll">
              {overdue.map((tk) => {
                const id = taskId(tk);
                const date = tk.due ?? tk.scheduled!;
                return (
                  <label className="lo-planday__row" key={id}>
                    <input
                      type="checkbox"
                      className="lo-planday__check"
                      checked={selected.has(id)}
                      onChange={() => toggle(id)}
                      disabled={busy}
                    />
                    <span className="lo-planday__info">
                      <span className="lo-planday__text">{tk.description}</span>
                      <span className="lo-planday__meta">
                        <span className="lo-planday__rel">{relativeLabel(date, today)}</span>
                        {tk.time && <span className="lo-planday__time">{tk.time}</span>}
                        <span className="lo-planday__src">
                          <FileText size={11} strokeWidth={2} />
                          {noteName(tk.file)}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="lo-planday__foot">
              <button
                className="lo-trash__ghost"
                onClick={() => setSelected(allPicked ? new Set() : new Set(overdue.map(taskId)))}
                disabled={busy}
              >
                {allPicked ? t("planner.planDayClearAll") : t("planner.planDaySelectAll")}
              </button>
              <button className="lo-planday__move" onClick={() => void onMove()} disabled={picked.length === 0 || busy}>
                {picked.length > 0
                  ? t("planner.planDayMoveCount", { count: picked.length })
                  : t("planner.planDayMove")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

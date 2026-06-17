import { useTranslation } from "react-i18next";
import { Pencil, FilePlus } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { todayDailyPath } from "../../core/vault";
import { Markdown } from "../Editor/Markdown";

/** Orta gövde varsayılanı — günün planı/notu (journal). Görev İÇERMEZ. */
export function DailyPlanView() {
  const { t } = useTranslation();
  const openNote = useAppStore((s) => s.openNote);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const createTodayNote = useAppStore((s) => s.createTodayNote);
  const path = todayDailyPath();
  const content = useAppStore((s) => s.noteContents[path]);

  return (
    <div className="lo-planner__center">
      <div className="lo-dayplan__head">
        <h1 className="lo-dayplan__title">{t("planner.dayPlan")}</h1>
        <div style={{ flex: 1 }} />
        {content != null && (
          <button className="lo-focusx__close" onClick={() => openNote(path)}>
            <Pencil size={14} strokeWidth={2} />
            {t("editor.edit")}
          </button>
        )}
      </div>

      <div className="lo-dayplan__body lo-scroll">
        {content == null ? (
          <div className="lo-dayplan__empty">
            <p>{t("planner.noDayNote")}</p>
            <button className="lo-dayplan__create" onClick={() => void createTodayNote()}>
              <FilePlus size={15} strokeWidth={2} />
              {t("planner.createDayNote")}
            </button>
          </div>
        ) : (
          <div className="lo-dayplan__note">
            <Markdown
              content={content}
              onLink={(name) => openNote(name)}
              onToggleTask={(line) => void toggleTask(`${path}:${line}`)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { Minimize2, Pencil } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { todayDailyPath } from "../../core/vault";
import { Markdown } from "../Editor/Markdown";

/** Günün notunu (tam şablon) orta gövdede genişletilmiş gösterir. */
export function FocusExpanded() {
  const { t } = useTranslation();
  const setFocusExpanded = useAppStore((s) => s.setFocusExpanded);
  const openNote = useAppStore((s) => s.openNote);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const path = todayDailyPath();
  const content = useAppStore((s) => s.noteContents[path] ?? "");

  return (
    <div className="lo-focusx lo-scroll">
      <div className="lo-focusx__head">
        <h2 className="lo-focusx__title">{t("planner.dayNote")}</h2>
        <div style={{ flex: 1 }} />
        <button className="lo-focusx__close" onClick={() => openNote(path)}>
          <Pencil size={14} strokeWidth={2} />
          {t("editor.edit")}
        </button>
        <button className="lo-focusx__close" onClick={() => setFocusExpanded(false)}>
          <Minimize2 size={15} strokeWidth={2} />
          {t("planner.collapse")}
        </button>
      </div>
      <div className="lo-focusx__note">
        <Markdown
          content={content}
          onLink={(name) => openNote(name)}
          onToggleTask={(line) => void toggleTask(`${path}:${line}`)}
        />
      </div>
    </div>
  );
}

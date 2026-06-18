import { useTranslation } from "react-i18next";
import { FileText, Pencil, Save, Eye, Link2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { Markdown } from "./Markdown";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { BacklinksPanel } from "./BacklinksPanel";

function noteName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

export function EditorScreen() {
  const { t } = useTranslation();
  const contents = useAppStore((s) => s.noteContents);
  const openTabs = useAppStore((s) => s.openTabs);
  const activeNote = useAppStore((s) => s.activeNote);
  const editing = useAppStore((s) => s.editing);
  const draft = useAppStore((s) => s.draft);
  const lineNumbers = useAppStore((s) => s.editorSettings.lineNumbers);
  const setDraft = useAppStore((s) => s.setDraft);
  const toggleEditing = useAppStore((s) => s.toggleEditing);
  const saveNote = useAppStore((s) => s.saveNote);
  const openNote = useAppStore((s) => s.openNote);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const backlinksCollapsed = useAppStore((s) => s.backlinksCollapsed);
  const toggleBacklinks = useAppStore((s) => s.toggleBacklinks);

  if (!activeNote || openTabs.length === 0) {
    return (
      <div className="lo-placeholder">
        <FileText size={40} strokeWidth={1.4} />
        <p>{t("editor.empty")}</p>
      </div>
    );
  }

  const content = contents[activeNote] ?? "";

  return (
    <div className="lo-editor">
      <div className="lo-editortoolbar">
        <span className="lo-editortoolbar__title">{noteName(activeNote)}</span>
        <div className="lo-tabs__spacer" />
        <button className="lo-tab__action" onClick={() => toggleEditing()}>
          {editing ? <Eye size={14} strokeWidth={1.9} /> : <Pencil size={14} strokeWidth={1.9} />}
          {editing ? t("editor.preview") : t("editor.edit")}
        </button>
        {editing && (
          <button className="lo-tab__action lo-tab__action--accent" onClick={() => void saveNote()}>
            <Save size={14} strokeWidth={1.9} />
            {t("editor.save")}
          </button>
        )}
        <button
          className={"lo-tab__action" + (!backlinksCollapsed ? " lo-tab__action--accent" : "")}
          onClick={toggleBacklinks}
          title={t("editor.backlinks")}
        >
          <Link2 size={14} strokeWidth={1.9} />
        </button>
      </div>

      <div className="lo-editor__body">
        <div className={"lo-editor__scroll lo-scroll" + (editing ? "" : " lo-editor__scroll--preview")}>
          {editing ? (
            <div className="lo-editor__editwrap">
              <CodeMirrorEditor
                key={`${activeNote}:${lineNumbers}`}
                value={draft}
                onChange={setDraft}
                lineNumbers={lineNumbers}
              />
            </div>
          ) : (
            <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 40px" }}>
              <Markdown
                content={content}
                onLink={(name) => openNote(name)}
                onToggleTask={(line) => void toggleTask(`${activeNote}:${line}`)}
              />
            </div>
          )}
        </div>
        {!backlinksCollapsed && <BacklinksPanel />}
      </div>
    </div>
  );
}

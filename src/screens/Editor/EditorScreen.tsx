import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, BookOpen, SquarePen, Link2 } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import { useAppStore } from "../../store/useAppStore";
import { Markdown } from "./Markdown";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { BacklinksPanel } from "./BacklinksPanel";
import { EditorToolbar } from "./EditorToolbar";
import { EditorContextMenu } from "./EditorContextMenu";
import { DailyHeader } from "./DailyHeader";

function breadcrumb(path: string): string[] {
  const segs = path.split("/");
  segs[segs.length - 1] = segs[segs.length - 1].replace(/\.md$/i, "");
  return segs;
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

  const viewRef = useRef<EditorView | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // Otomatik kayıt — düzenlerken draft değişince debounce ile yaz (Kaydet butonu yok).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editing || !activeNote) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNote(), 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, editing, activeNote, saveNote]);

  if (!activeNote || openTabs.length === 0) {
    return (
      <div className="lo-placeholder">
        <FileText size={40} strokeWidth={1.4} />
        <p>{t("editor.empty")}</p>
      </div>
    );
  }

  const content = contents[activeNote] ?? "";
  const crumbs = breadcrumb(activeNote);

  // Okuma moduna geçerken son hâli kaydet (okuma güncel içeriği göstersin).
  const toggleMode = async () => {
    if (editing) await saveNote();
    toggleEditing();
  };

  return (
    <div className="lo-editor">
      <div className="lo-editortoolbar">
        <div className="lo-crumbs">
          {crumbs.map((c, i) => (
            <span key={i} className="lo-crumbs__seg">
              {i > 0 && <span className="lo-crumbs__sep">/</span>}
              <span className={i === crumbs.length - 1 ? "is-last" : ""}>{c}</span>
            </span>
          ))}
        </div>
        <div className="lo-tabs__spacer" />
        <button
          className={"lo-tab__action" + (!backlinksCollapsed ? " lo-tab__action--accent" : "")}
          onClick={toggleBacklinks}
          title={t("editor.backlinks")}
        >
          <Link2 size={15} strokeWidth={1.9} />
        </button>
        <button
          className="lo-modetoggle"
          onClick={() => void toggleMode()}
          title={editing ? t("editor.reading") : t("editor.edit")}
        >
          {editing ? <BookOpen size={15} strokeWidth={2} /> : <SquarePen size={15} strokeWidth={2} />}
          {editing ? t("editor.reading") : t("editor.edit")}
        </button>
      </div>

      {editing && <EditorToolbar getView={() => viewRef.current} />}

      {crumbs.length > 0 && <DailyHeader noteName={crumbs[crumbs.length - 1]} />}

      <div className="lo-editor__body">
        <div className={"lo-editor__scroll lo-scroll" + (editing ? "" : " lo-editor__scroll--preview")}>
          {editing ? (
            <div className="lo-editor__editwrap">
              <CodeMirrorEditor
                key={`${activeNote}:${lineNumbers}`}
                value={draft}
                onChange={setDraft}
                lineNumbers={lineNumbers}
                onView={(v) => (viewRef.current = v)}
                onContextMenu={(x, y) => setCtxMenu({ x, y })}
              />
            </div>
          ) : (
            <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 40px" }}>
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

      {ctxMenu && (
        <EditorContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          getView={() => viewRef.current}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FileText, BookOpen, SquarePen, Link2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useIsMobile } from "../../hooks/useIsMobile";
import { Markdown } from "./Markdown";
import { PlainTextEditor } from "./PlainTextEditor";
import { PlainToolbar } from "./PlainToolbar";
import { BacklinksPanel } from "./BacklinksPanel";
import { DailyHeader } from "./DailyHeader";
import { VoiceRecorder } from "./VoiceRecorder";

function breadcrumb(path: string): string[] {
  const segs = path.split("/");
  segs[segs.length - 1] = segs[segs.length - 1].replace(/\.md$/i, "");
  return segs;
}

export function EditorScreen() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const contents = useAppStore((s) => s.noteContents);
  const openTabs = useAppStore((s) => s.openTabs);
  const activeNote = useAppStore((s) => s.activeNote);
  const editing = useAppStore((s) => s.editing);
  const draft = useAppStore((s) => s.draft);
  const spellCheck = useAppStore((s) => s.editorSettings.spellCheck);
  const setDraft = useAppStore((s) => s.setDraft);
  const toggleEditing = useAppStore((s) => s.toggleEditing);
  const saveNote = useAppStore((s) => s.saveNote);
  const openNote = useAppStore((s) => s.openNote);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const backlinksCollapsed = useAppStore((s) => s.backlinksCollapsed);
  const toggleBacklinks = useAppStore((s) => s.toggleBacklinks);

  // Düzenleme alanı yerel <textarea> — macOS sesli yazma (dictation) doğrudan çalışsın diye.
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Otomatik kayıt — düzenlerken draft değişince debounce ile yaz (saveNote değişmediyse yazmaz).
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
        <p>{isMobile ? t("editor.emptyMobile") : t("editor.empty")}</p>
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

  // Okuma modunda içeriğe tıklayınca otomatik düzenlemeye geç (link/görev tıklaması hariç —
  // onlar kendi aksiyonlarını yapsın). Düzenleyici mount olunca odaklanıp imleci sona alır.
  const enterEditFromReading = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, .lo-checkbox, .lo-wiki")) return;
    toggleEditing();
  };

  // Ses notu embed'ini "Ses Kayıtları" başlığı altına ekle (başlık yoksa not sonunda oluştur;
  // varsa altındaki son kaydın peşine ekle → tüm kayıtlar tek bölümde toplanır).
  const AUDIO_HEADING = "## 🎙️ Ses Kayıtları";
  const audioInsertion = (doc: string, embed: string): { pos: number; insert: string } => {
    const lines = doc.split("\n");
    const hIdx = lines.findIndex((l) => l.trim() === AUDIO_HEADING);
    if (hIdx >= 0) {
      let lastLine = hIdx;
      for (let j = hIdx + 1; j < lines.length && !/^#{1,6}\s/.test(lines[j].trim()); j++) {
        if (/^!\[\[.+\]\]$/.test(lines[j].trim())) lastLine = j;
      }
      let pos = 0;
      for (let i = 0; i <= lastLine; i++) pos += lines[i].length + 1;
      if (pos > doc.length) return { pos: doc.length, insert: `\n${embed}\n` };
      return { pos, insert: `${embed}\n` };
    }
    const prefix = doc.length === 0 ? "" : doc.endsWith("\n\n") ? "" : doc.endsWith("\n") ? "\n" : "\n\n";
    return { pos: doc.length, insert: `${prefix}${AUDIO_HEADING}\n${embed}\n` };
  };

  // Kontrollü <textarea> — value draft'a bağlı, setDraft yeterli.
  const insertAtEnd = (text: string) => {
    const cur = useAppStore.getState().draft;
    const { pos, insert } = audioInsertion(cur, text);
    useAppStore.getState().setDraft(cur.slice(0, pos) + insert + cur.slice(pos));
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
        {editing && <VoiceRecorder onInsert={insertAtEnd} />}
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

      {editing && <PlainToolbar getEl={() => taRef.current} onChange={setDraft} />}

      {crumbs.length > 0 && <DailyHeader noteName={crumbs[crumbs.length - 1]} />}

      <div className="lo-editor__body">
        <div className={"lo-editor__scroll lo-scroll" + (editing ? "" : " lo-editor__scroll--preview")}>
          {editing ? (
            <div className="lo-editor__editwrap">
              <PlainTextEditor ref={taRef} key={activeNote} value={draft} onChange={setDraft} spellCheck={spellCheck} />
            </div>
          ) : (
            <div className="lo-editor__preview lo-editor__preview--clickedit" onClick={enterEditFromReading}>
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

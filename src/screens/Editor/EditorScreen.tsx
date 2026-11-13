import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, BookOpen, SquarePen, Link2 } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import { notifyError, useAppStore } from "../../store/useAppStore";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useIsNarrow } from "../../hooks/useIsNarrow";
import { useFlushOnExit } from "../../hooks/useFlushOnExit";
import { Markdown } from "./Markdown";
import { CodeMirrorEditor, type EditorSelectionInfo } from "./CodeMirrorEditor";
import { BacklinksPanel } from "./BacklinksPanel";
import { EditorToolbar } from "./EditorToolbar";
import { EditorContextMenu } from "./EditorContextMenu";
import { DailyHeader } from "./DailyHeader";
import { OnThisDay } from "./OnThisDay";
import { VoiceRecorder } from "./VoiceRecorder";
import { firstSectionCaret } from "./noteCaret";
import { editorRootClass } from "./editorLayout";
import { firstHeading } from "../../core/markdown/autoTitle";
import { resolveLink } from "../../core/markdown/links";
import type { VaultNote } from "../../core/vault/types";
import { SelectionBar } from "./SelectionBar";
import { ReviewCardDialog } from "./ReviewCardDialog";
import { LinkNoteDialog } from "./LinkNoteDialog";
import {
  barVisible,
  canLink,
  canMakeCard,
  linkReplacement,
  linkTargetFor,
  planCardInsert,
  selectionInTable,
} from "./selectionActions";

/** Seçim çubuğundan açılan pencere: düğmeye basıldığı andaki seçim yakalanır (LOM-110). */
interface SelDialog {
  kind: "card" | "link";
  path: string;
  from: number;
  to: number;
  text: string;
}

function breadcrumb(path: string): string[] {
  const segs = path.split("/");
  segs[segs.length - 1] = segs[segs.length - 1].replace(/\.md$/i, "");
  return segs;
}

export function EditorScreen() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // Dar orta sütun (masaüstünde paneller açık, ör. 800x600): Bağlantılar da alttan pencere.
  const [narrowRef, narrow] = useIsNarrow();
  const fullWidth = useAppStore((s) => s.editorSettings.fullWidth);
  const sheetMode = isMobile || narrow;
  const contents = useAppStore((s) => s.noteContents);
  const openTabs = useAppStore((s) => s.openTabs);
  const activeNote = useAppStore((s) => s.activeNote);
  const editing = useAppStore((s) => s.editing);
  const draft = useAppStore((s) => s.draft);
  const lineNumbers = useAppStore((s) => s.editorSettings.lineNumbers);
  const draftEpoch = useAppStore((s) => s.draftEpoch);
  const draftConflict = useAppStore((s) => s.draftConflict);
  const draftPath = useAppStore((s) => s.draftPath);
  const resolveDraftConflict = useAppStore((s) => s.resolveDraftConflict);
  const setDraft = useAppStore((s) => s.setDraft);
  const toggleEditing = useAppStore((s) => s.toggleEditing);
  const saveNote = useAppStore((s) => s.saveNote);
  const openNote = useAppStore((s) => s.openNote);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const autoNameNote = useAppStore((s) => s.autoNameNote);
  const backlinksCollapsed = useAppStore((s) => s.backlinksCollapsed);
  const toggleBacklinks = useAppStore((s) => s.toggleBacklinks);
  const srsSettings = useAppStore((s) => s.srsSettings);
  const platformMobile = useAppStore((s) => s.platformMobile);

  const viewRef = useRef<EditorView | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; via: "mouse" | "touch" } | null>(null);
  // Seçim çubuğu (LOM-110): editörün bildirdiği güncel seçim ve çubuktan açılan pencere.
  const [sel, setSel] = useState<EditorSelectionInfo | null>(null);
  const [selDialog, setSelDialog] = useState<SelDialog | null>(null);
  const selDialogRef = useRef<SelDialog | null>(null);
  selDialogRef.current = selDialog;
  // Not değişince ya da okuma moduna geçince çubuk ve pencere kapanır.
  useEffect(() => {
    setSel(null);
    setSelDialog(null);
  }, [activeNote, editing]);
  // Mobil Bağlantılar sheet'i (masaüstünde yan panel; mobilde 288px panel editörü ezdiği
  // için alttan sheet). Not değişince kapanır (bağlantıya dokununca doğal kapanış).
  const [blSheetOpen, setBlSheetOpen] = useState(false);
  useEffect(() => setBlSheetOpen(false), [activeNote]);
  // Sütun genişleyince açık sheet kalmasın (yan panel geri gelir).
  useEffect(() => {
    if (!sheetMode) setBlSheetOpen(false);
  }, [sheetMode]);

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

  // Başlıktan otomatik ad (LOM-76): elle ad verilmemiş not, yazma durunca ilk başlığına göre
  // yeniden adlandırılır. Yeniden adlandırma editörü (key) yeniden kurar; imleç ve odak
  // `caretRestore` ile aynı yere geri verilir. Başlık satırında yazılırken (yarım ad) ve
  // mobilde odaklıyken (klavye kapanmasın) beklenir; nottan ayrılınca ya da okuma moduna
  // geçince yeniden denenir.
  const caretRestore = useRef<{ path: string; pos: number; focus: boolean; live?: boolean } | null>(null);
  const autoNameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editing || !activeNote) return;
    if (autoNameTimer.current) clearTimeout(autoNameTimer.current);
    autoNameTimer.current = setTimeout(() => {
      // Seçim penceresi açıkken adlandırma beklesin: editör yeniden kurulur ve pencere kapanırdı.
      // Pencere yazınca taslak değişir, zamanlayıcı yeniden kurulur.
      if (selDialogRef.current) return;
      const view = viewRef.current;
      const h = firstHeading(draft);
      if (!h) return;
      if (view && view.hasFocus) {
        if (isMobile) return;
        const head = view.state.selection.main.head;
        if (view.state.doc.lineAt(head).number - 1 === h.line) return;
      }
      const pos = view ? view.state.selection.main.head : 0;
      const hadFocus = view ? view.hasFocus : false;
      // Kayıt yeniden adlandırmadan ÖNCE kurulur: yeni yol activeNote olunca editör hemen
      // yeniden kurulur, sonuç dönmesini beklemek imleci kaybettirirdi.
      void autoNameNote(activeNote, (to) => {
        caretRestore.current = { path: to, pos, focus: hadFocus };
      }).then((to) => {
        if (!to) caretRestore.current = null; // adlandırılamadı → kayıt geçersiz
      });
    }, 1500);
    return () => {
      if (autoNameTimer.current) clearTimeout(autoNameTimer.current);
    };
  }, [draft, editing, activeNote, autoNameNote, isMobile]);

  // Nottan ayrılınca (sekme/not değişimi) eski not için son kez dene. Taslak zaten
  // leaveDraft ile yazılmıştır; aktif olmayan notta editör yeniden kurulmaz. Kasa değiştiyse
  // eski yol yeni kasada başka bir nota denk gelebilir — denenmez.
  const vaultPath = useAppStore((s) => s.vaultPath);
  useEffect(() => {
    // Restore kaydı yalnız yeniden adlandırmadan hemen sonraki kurulum için geçerli: editör
    // (alt bileşen) bu effect'ten önce kuruldu ve kaydı kullandı; sonraki kurulumlar
    // (satır numarası, taslak yenileme) eski konuma atlamasın.
    caretRestore.current = null;
    if (!activeNote) return;
    const left = activeNote;
    const leftVault = vaultPath;
    return () => {
      if (useAppStore.getState().vaultPath !== leftVault) return;
      // Yeniden adlandırmanın kendisi de activeNote'u değiştirir: o sırada aynı not için
      // ikinci deneme depoda atlanır (sürmekte olan adlandırma / not artık listede yok).
      void useAppStore.getState().autoNameNote(left);
    };
  }, [activeNote, vaultPath]);

  // Editörden çıkarken / kapanışta bekleyen kaydı boşalt (bkz. useFlushOnExit).
  useFlushOnExit(isMobile);

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

  // Günlük not (2026-07-19-Pazar gibi) açılınca imleç ilk bölüme — "Ephemeral Notlar" — gitsin.
  const isDaily = /^\d{4}-\d{2}-\d{2}/.test(crumbs[crumbs.length - 1] ?? "");
  // Otomatik adlandırmadan sonra editör aynı imleç konumu ve odakla yeniden kurulur (LOM-76).
  // Konum ve odak, kurulumdan hemen önce eski editörden CANLI okunur (bu render'da viewRef
  // hâlâ eski editörü gösterir): adlandırma sürerken yazılanlar imleci kaydırmış olabilir.
  const restore = caretRestore.current?.path === activeNote ? caretRestore.current : null;
  if (restore && !restore.live && viewRef.current) {
    const old = viewRef.current;
    restore.pos = old.state.selection.main.head;
    restore.focus = old.hasFocus;
    restore.live = true;
  }
  const initialCaret = restore ? restore.pos : isDaily ? firstSectionCaret(draft) : undefined;

  // — Seçim çubuğu (LOM-110) —
  const showBar =
    !!sel &&
    !ctxMenu &&
    !selDialog &&
    barVisible({
      empty: sel.from === sel.to,
      text: sel.text,
      inTable: selectionInTable(viewRef.current?.state.doc.toString() ?? draft, sel.from, sel.to),
      editing,
    });
  const barCard = showBar && canMakeCard(srsSettings, activeNote);
  // Çok satırlı seçim bağlantı olamaz (satırlar birleşir, işaretler silinirdi).
  const barLink = showBar && !!sel && canLink(sel.text);
  const openSelDialog = (kind: SelDialog["kind"]) => {
    if (!sel) return;
    setSelDialog({ kind, path: activeNote, from: sel.from, to: sel.to, text: sel.text });
    setSel(null);
  };
  /** Pencere açıkken metin değiştiyse (senkron, başka cihaz) eski konuma yazılmaz. */
  const liveView = (d: SelDialog): EditorView | null => {
    const view = viewRef.current;
    const st = useAppStore.getState();
    if (!view || !st.editing || st.activeNote !== d.path || view.state.sliceDoc(d.from, d.to) !== d.text) {
      void notifyError(t("selbar.stale"), "info");
      return null;
    }
    return view;
  };
  const saveCard = async (front: string, back: string) => {
    const d = selDialogRef.current;
    if (!d) return;
    const view = liveView(d);
    if (!view) return;
    const plan = planCardInsert(view.state.doc.toString(), d.from, d.to, front, back);
    if (!plan) return;
    view.dispatch({
      changes: { from: plan.from, to: plan.to, insert: plan.insert },
      selection: { anchor: plan.caret },
      scrollIntoView: true,
    });
    // Mobilde odak verilmez: klavye kendiliğinden açılmasın.
    if (!isMobile) view.focus();
    // Kart satırı hemen diske yazılsın ve Tekrar kartları bu notu görsün (yeni yazma yolu yok:
    // kayıt saveNote'tan, kart toplama srsLoad'dan geçer).
    await saveNote();
    const st = useAppStore.getState();
    if (st.srsLoaded) {
      try {
        await st.srsLoad();
      } catch (e) {
        console.error("[selbar] Tekrar kartları tazelenemedi:", e);
      }
    }
  };
  const pickLink = (note: VaultNote) => {
    const d = selDialogRef.current;
    setSelDialog(null);
    if (!d) return;
    const view = liveView(d);
    if (!view) return;
    const insert = linkReplacement(d.text, linkTargetFor(note, useAppStore.getState().notes));
    view.dispatch({
      changes: { from: d.from, to: d.to, insert },
      selection: { anchor: d.from + insert.length },
      scrollIntoView: true,
    });
    if (!isMobile) view.focus();
  };
  // Bağlantı, aynı adlı notlarda uzantısız yolla yazılır; okuma modunda da notla çözülür.
  const openLink = (target: string) => {
    const note = resolveLink(target, useAppStore.getState().notes);
    openNote(note ? note.path : target);
  };

  // Okuma moduna geçerken son hâli kaydet (okuma güncel içeriği göstersin).
  const toggleMode = async () => {
    if (editing) {
      await saveNote();
      toggleEditing();
      // Okuma moduna geçince başlıktan otomatik ad (LOM-76); editör kapalı, imleç gerekmez.
      void autoNameNote(activeNote);
      return;
    }
    toggleEditing();
  };

  // Okuma modunda içeriğe tıklayınca otomatik düzenlemeye geç (link/görev tıklaması hariç).
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

  // CodeMirror dış value değişikliklerini almaz (yalnız key ile yeniden kurulur) — setDraft tek
  // başına editörde görünmez ve sonraki tuş vuruşu CM'in eski içeriğiyle draft'ı ezip eklemeyi
  // SİLERDİ. Bu yüzden CM varken doğrudan dispatch edilir.
  const insertAtEnd = (text: string) => {
    const view = viewRef.current;
    if (view) {
      const docStr = view.state.doc.toString();
      const { pos, insert } = audioInsertion(docStr, text);
      view.dispatch({ changes: { from: pos, insert }, scrollIntoView: true });
      return;
    }
    const cur = useAppStore.getState().draft;
    const { pos, insert } = audioInsertion(cur, text);
    useAppStore.getState().setDraft(cur.slice(0, pos) + insert + cur.slice(pos));
  };

  return (
    <div ref={narrowRef} className={editorRootClass({ narrow, wide: fullWidth })}>
      <div className="lo-editortoolbar">
        <div className="lo-crumbs">
          {crumbs.map((c, i) => (
            <span key={i} className="lo-crumbs__seg">
              {i > 0 && <span className="lo-crumbs__sep">/</span>}
              <span className={i === crumbs.length - 1 ? "is-last" : ""}>{c}</span>
            </span>
          ))}
        </div>
        {editing && <VoiceRecorder onInsert={insertAtEnd} />}
        <button
          className={
            "lo-tab__action" +
            ((sheetMode ? blSheetOpen : !backlinksCollapsed) ? " lo-tab__action--accent" : "")
          }
          onClick={() => (sheetMode ? setBlSheetOpen(true) : toggleBacklinks())}
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

      {draftConflict && draftConflict.path === draftPath && draftPath === activeNote && (
        <div className="lo-conflict" role="alert">
          <span className="lo-conflict__msg">{t("editor.conflict")}</span>
          <div className="lo-conflict__actions">
            <button className="lo-conflict__btn" onClick={() => void resolveDraftConflict("mine")}>
              {t("editor.conflictMine")}
            </button>
            <button className="lo-conflict__btn" onClick={() => void resolveDraftConflict("disk")}>
              {t("editor.conflictDisk")}
            </button>
            <button className="lo-conflict__btn" onClick={() => void resolveDraftConflict("both")}>
              {t("editor.conflictBoth")}
            </button>
          </div>
        </div>
      )}

      {crumbs.length > 0 && <DailyHeader noteName={crumbs[crumbs.length - 1]} />}
      {crumbs.length > 0 && <OnThisDay />}

      <div className="lo-editor__body">
        <div className={"lo-editor__scroll lo-scroll" + (editing ? "" : " lo-editor__scroll--preview")}>
          {editing ? (
            <div className="lo-editor__editwrap">
              <CodeMirrorEditor
                key={`${activeNote}:${lineNumbers}:${draftEpoch}`}
                value={draft}
                onChange={setDraft}
                lineNumbers={lineNumbers}
                onView={(v) => (viewRef.current = v)}
                onContextMenu={(x, y, via) => setCtxMenu({ x, y, via })}
                onSelection={setSel}
                initialCaret={initialCaret}
                focusOnMount={restore ? restore.focus : true}
              />
            </div>
          ) : (
            <div className="lo-editor__preview lo-editor__preview--clickedit" onClick={enterEditFromReading}>
              <Markdown
                content={content}
                onLink={openLink}
                onToggleTask={(line) => void toggleTask(`${activeNote}:${line}`)}
              />
            </div>
          )}
        </div>
        {/* Yan panel yalnız geniş masaüstü — mobilde/dar sütunda 288px'lik panel editörü eziyordu; sheet var. */}
        {!sheetMode && !backlinksCollapsed && <BacklinksPanel />}
      </div>

      {/* Mobil ve dar sütun: Bağlantılar alttan sheet olarak (drawer/sekme sheet'iyle aynı desen). */}
      {sheetMode && (
        <>
          <div className={"lo-scrim" + (blSheetOpen ? " is-open" : "")} onClick={() => setBlSheetOpen(false)} />
          <div className={"lo-sheet" + (blSheetOpen ? " is-open" : "")} role="dialog" aria-hidden={!blSheetOpen}>
            <div className="lo-sheet__grip" />
            <div className="lo-sheet__list lo-scroll">
              <BacklinksPanel />
            </div>
          </div>
        </>
      )}

      {ctxMenu && (
        <EditorContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          openedBy={ctxMenu.via}
          getView={() => viewRef.current}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {showBar && sel && (barCard || barLink) && (
        <SelectionBar
          rect={sel.rect}
          touch={isMobile || platformMobile}
          showCard={barCard}
          showLink={barLink}
          onCard={() => openSelDialog("card")}
          onLink={() => openSelDialog("link")}
        />
      )}
      {selDialog?.kind === "card" && (
        <ReviewCardDialog
          initialFront={selDialog.text}
          onSave={saveCard}
          onClose={() => setSelDialog(null)}
        />
      )}
      {selDialog?.kind === "link" && (
        <LinkNoteDialog
          text={selDialog.text}
          currentPath={selDialog.path}
          onPick={pickLink}
          onClose={() => setSelDialog(null)}
        />
      )}

    </div>
  );
}

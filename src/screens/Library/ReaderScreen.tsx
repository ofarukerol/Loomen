import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileQuestion, Loader2 } from "lucide-react";
import { clampFontScale, positionOfAnchor, type BookFormat, type Highlight, type HighlightColor, type NoteLabels } from "../../core/library";
import { useAppStore } from "../../store/useAppStore";
import { HighlightMenu } from "./HighlightMenu";
import { HighlightNoteDialog } from "./HighlightNoteDialog";
import { HighlightsPanel } from "./HighlightsPanel";
import { ReaderToolbar } from "./ReaderToolbar";
import type { ReaderSelection, ReaderViewModule, ReaderViewProps, ViewRect } from "./readerTypes";

/**
 * Biçime özel görüntüleyiciler (`views/PdfView.tsx`, `views/EpubView.tsx`) tembel yüklenir.
 * Dosya henüz yoksa glob onu bulmaz ve kabuk yer tutucu gösterir (LOM-83 parça sözleşmesi).
 */
const VIEW_LOADERS = import.meta.glob<ReaderViewModule>("./views/*View.tsx");
const VIEW_NAME: Record<BookFormat, string> = { pdf: "./views/PdfView.tsx", epub: "./views/EpubView.tsx" };
const lazyViews = new Map<BookFormat, ComponentType<ReaderViewProps>>();

function viewFor(format: BookFormat): ComponentType<ReaderViewProps> | null {
  const cached = lazyViews.get(format);
  if (cached) return cached;
  const loader = VIEW_LOADERS[VIEW_NAME[format]];
  if (!loader) return null;
  const View = lazy(async () => {
    const mod = await loader();
    return { default: mod.default as ComponentType<ReaderViewProps> };
  });
  lazyViews.set(format, View);
  return View;
}

/** Görüntüleyici çökerse okuyucu ekranı boş kalmasın: hatayı gösterir. */
class ViewBoundary extends Component<{ fallback: (e: unknown) => ReactNode; children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown) {
    console.error("[library] görüntüleyici hatası:", error);
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

type Menu =
  | { kind: "selection"; sel: ReaderSelection }
  | { kind: "highlight"; id: string; rect: ViewRect };

type NoteEdit = { kind: "selection"; sel: ReaderSelection } | { kind: "highlight"; id: string };

type Load = { state: "loading" } | { state: "ready"; data: Uint8Array } | { state: "missing"; detail: string };

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Okuyucu kabuğu (LOM-83): dosyayı uygulama klasöründen okur, görüntüleyiciyi seçer; çizim
 * menüsü, not penceresi ve çizim listesi buradadır. Kalınan yer gecikmeli kaydedilir; ekran
 * gizlenince ve kapanınca hemen yazılır (K6).
 */
export function ReaderScreen() {
  const { t } = useTranslation();
  const bookId = useAppStore((s) => s.readerBookId);
  const book = useAppStore((s) => s.books.find((b) => b.id === s.readerBookId) ?? null);
  const target = useAppStore((s) => s.readerTarget);
  const prefs = useAppStore((s) => s.readerPrefs);
  const setPrefs = useAppStore((s) => s.readerSetPrefs);
  const close = useAppStore((s) => s.libraryCloseReader);
  const readFile = useAppStore((s) => s.libraryReadFile);
  const relink = useAppStore((s) => s.libraryRelink);
  const addHl = useAppStore((s) => s.libraryAddHighlight);
  const updateHl = useAppStore((s) => s.libraryUpdateHighlight);
  const removeHl = useAppStore((s) => s.libraryRemoveHighlight);
  const jump = useAppStore((s) => s.libraryJump);
  const savePosition = useAppStore((s) => s.librarySavePosition);
  const flushPosition = useAppStore((s) => s.libraryFlushPosition);
  const setMeta = useAppStore((s) => s.librarySetMeta);
  const openNote = useAppStore((s) => s.libraryOpenNote);

  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [reloadTick, setReloadTick] = useState(0);
  const [viewError, setViewError] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [noteEdit, setNoteEdit] = useState<NoteEdit | null>(null);
  const [panel, setPanel] = useState(false);
  const [relinking, setRelinking] = useState(false);

  const format = book?.format;
  // Dosyayı yalnız kitap değişince oku: çizim eklemek kaydı değiştirir ama dosyayı değil.
  useEffect(() => {
    if (!bookId) return;
    let alive = true;
    setLoad({ state: "loading" });
    setViewError(null);
    setMenu(null);
    readFile(bookId)
      .then((data) => alive && setLoad({ state: "ready", data }))
      .catch((e) => alive && setLoad({ state: "missing", detail: errText(e) }));
    return () => {
      alive = false;
    };
  }, [bookId, readFile, reloadTick]);

  // Uygulama arka plana geçince / pencere gizlenince kalınan yeri hemen yaz; ekrandan çıkınca da.
  useEffect(() => {
    const onVis = () => document.visibilityState === "hidden" && void flushPosition();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onVis);
      void flushPosition();
    };
  }, [flushPosition]);

  // İlk açılıştaki kalınan yer: kitap açıldığı andaki konum (okurken değişen kayıt görüntüleyiciyi sıfırlamasın).
  const initialRef = useRef<{ id: string | null; pos: ReaderViewProps["initialPosition"] }>({ id: null, pos: undefined });
  if (book && initialRef.current.id !== book.id) initialRef.current = { id: book.id, pos: book.position };

  const labels: NoteLabels = useMemo(
    () => ({
      quotes: t("library.note.quotes"),
      openBook: t("library.note.openBook"),
      page: t("library.note.page", { n: "{n}" }),
      section: t("library.note.section", { n: "{n}" }),
    }),
    [t]
  );

  const onSelection = useCallback((sel: ReaderSelection | null) => {
    setMenu((m) => (sel ? { kind: "selection", sel } : m?.kind === "selection" ? null : m));
  }, []);
  const onHighlightClick = useCallback((id: string, rect: ViewRect) => setMenu({ kind: "highlight", id, rect }), []);
  const onError = useCallback((e: unknown) => setViewError(errText(e)), []);
  const onMeta = useCallback((m: Parameters<ReaderViewProps["onMeta"]>[0]) => void setMeta(m), [setMeta]);

  if (!book || !bookId) {
    return (
      <div className="lo-reader">
        <div className="lo-reader__state">
          <FileQuestion size={30} strokeWidth={1.6} aria-hidden />
          <p>{t("library.missingBook")}</p>
          <button type="button" className="lo-btn" onClick={close}>
            {t("library.back")}
          </button>
        </div>
      </div>
    );
  }

  const currentHl: Highlight | undefined = menu?.kind === "highlight" ? book.highlights.find((h) => h.id === menu.id) : undefined;

  const pickColor = async (c: HighlightColor) => {
    if (!menu) return;
    setMenu(null);
    if (menu.kind === "selection") {
      window.getSelection()?.removeAllRanges();
      await addHl({ text: menu.sel.text, anchor: menu.sel.anchor, color: c, chapter: menu.sel.chapter });
    } else if (currentHl && currentHl.color !== c) {
      await updateHl(currentHl.id, { color: c });
    }
    if (c !== prefs.color) setPrefs({ color: c });
  };

  const startNote = () => {
    if (!menu) return;
    setNoteEdit(menu.kind === "selection" ? { kind: "selection", sel: menu.sel } : { kind: "highlight", id: menu.id });
    setMenu(null);
  };

  const saveNote = async (text: string) => {
    if (!noteEdit) return;
    if (noteEdit.kind === "selection") {
      window.getSelection()?.removeAllRanges();
      await addHl({ text: noteEdit.sel.text, anchor: noteEdit.sel.anchor, color: prefs.color, chapter: noteEdit.sel.chapter, note: text });
    } else {
      await updateHl(noteEdit.id, { note: text });
    }
  };

  const noteQuote =
    noteEdit?.kind === "selection" ? noteEdit.sel.text : noteEdit ? (book.highlights.find((h) => h.id === noteEdit.id)?.text ?? "") : "";
  const noteInitial = noteEdit?.kind === "highlight" ? book.highlights.find((h) => h.id === noteEdit.id)?.note : undefined;

  const doRelink = async () => {
    setRelinking(true);
    try {
      if (await relink(book.id)) setReloadTick((n) => n + 1);
    } finally {
      setRelinking(false);
    }
  };

  const View = format ? viewFor(format) : null;
  const errorBox = (detail: string) => (
    <div className="lo-reader__state" role="alert">
      <AlertTriangle size={28} strokeWidth={1.7} aria-hidden />
      <p>{t("library.reader.openError")}</p>
      <small dir="auto">{detail}</small>
    </div>
  );

  let body: ReactNode;
  if (load.state === "loading") {
    body = (
      <div className="lo-reader__state">
        <Loader2 size={24} strokeWidth={2} className="lo-spin" aria-hidden />
        <p>{t("library.loading")}</p>
      </div>
    );
  } else if (load.state === "missing") {
    body = (
      <div className="lo-reader__state">
        <FileQuestion size={30} strokeWidth={1.6} aria-hidden />
        <h2>{t("library.reader.missingTitle")}</h2>
        <p>{t("library.reader.missingBody", { name: book.fileName })}</p>
        <button type="button" className="lo-btn lo-btn--primary" disabled={relinking} onClick={() => void doRelink()}>
          {t("library.reader.relink")}
        </button>
      </div>
    );
  } else if (viewError) {
    body = errorBox(viewError);
  } else if (!View) {
    body = (
      <div className="lo-reader__state">
        <FileQuestion size={30} strokeWidth={1.6} aria-hidden />
        <p>{t("library.reader.noViewer", { format: book.format.toUpperCase() })}</p>
      </div>
    );
  } else {
    body = (
      <ViewBoundary key={book.id + ":" + reloadTick} fallback={(e) => errorBox(errText(e))}>
        <Suspense
          fallback={
            <div className="lo-reader__state">
              <Loader2 size={24} strokeWidth={2} className="lo-spin" aria-hidden />
            </div>
          }
        >
          <View
            book={book}
            data={load.data}
            fontScale={prefs.fontScale}
            theme={prefs.theme}
            highlights={book.highlights}
            initialPosition={initialRef.current.pos}
            target={target}
            onPosition={savePosition}
            onSelection={onSelection}
            onHighlightClick={onHighlightClick}
            onMeta={onMeta}
            onError={onError}
          />
        </Suspense>
      </ViewBoundary>
    );
  }

  return (
    <div className={"lo-reader is-theme-" + prefs.theme}>
      <ReaderToolbar
        book={book}
        fontScale={prefs.fontScale}
        theme={prefs.theme}
        panelOpen={panel}
        fontEnabled={load.state === "ready" && !!View}
        onBack={close}
        onFont={(n) => setPrefs({ fontScale: clampFontScale(n) })}
        onTheme={(th) => setPrefs({ theme: th })}
        onPanel={() => setPanel((p) => !p)}
        onNote={() => void openNote(book.id)}
      />
      <div className="lo-reader__main">
        <div className="lo-reader__view">{body}</div>
        {panel && (
          <HighlightsPanel
            highlights={book.highlights}
            labels={labels}
            activeId={target?.highlightId}
            onJump={(h) => jump({ anchor: h.anchor, position: positionOfAnchor(h.anchor), highlightId: h.id })}
            onClose={() => setPanel(false)}
          />
        )}
      </div>
      {menu && (menu.kind === "selection" || currentHl) && (
        <HighlightMenu
          rect={menu.kind === "selection" ? menu.sel.rect : menu.rect}
          current={currentHl?.color}
          canDelete={menu.kind === "highlight"}
          onColor={(c) => void pickColor(c)}
          onNote={startNote}
          onDelete={() => {
            const id = currentHl?.id;
            setMenu(null);
            if (id) void removeHl(id);
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {noteEdit && (
        <HighlightNoteDialog
          key={noteEdit.kind === "highlight" ? noteEdit.id : "new"}
          quote={noteQuote}
          initial={noteInitial}
          onSave={saveNote}
          onClose={() => setNoteEdit(null)}
        />
      )}
    </div>
  );
}

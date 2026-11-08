import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileQuestion, Loader2 } from "lucide-react";
import {
  bookListId,
  clampFontScale,
  comparePosition,
  positionOfAnchor,
  quoteInList,
  remotePositionAhead,
  type BookFormat,
  type BookPosition,
  type Highlight,
  type HighlightColor,
  type NoteLabels,
} from "../../core/library";
import { useAppStore } from "../../store/useAppStore";
import { HighlightMenu, type ReviewButtonState } from "./HighlightMenu";
import { HighlightNoteDialog } from "./HighlightNoteDialog";
import { HighlightsPanel } from "./HighlightsPanel";
import { ReaderToolbar } from "./ReaderToolbar";
import type { ReaderSelection, ReaderViewModule, ReaderViewProps, ViewRect } from "./readerTypes";

/**
 * Biçime özel görüntüleyiciler (`views/PdfView.tsx`, `views/EpubView.tsx`) tembel yüklenir.
 * Dosya henüz yoksa glob onu bulmaz ve kabuk yer tutucu gösterir (LOM-83 parça sözleşmesi).
 */
const VIEW_LOADERS = import.meta.glob<ReaderViewModule>("./views/*View.tsx");
// Kindle kitabının dosyası yok; okuyucuda açılmaz (kart notu açar), görüntüleyicisi de yoktur.
const VIEW_NAME: Partial<Record<BookFormat, string>> = { pdf: "./views/PdfView.tsx", epub: "./views/EpubView.tsx" };
const lazyViews = new Map<BookFormat, ComponentType<ReaderViewProps>>();

function viewFor(format: BookFormat): ComponentType<ReaderViewProps> | null {
  const cached = lazyViews.get(format);
  if (cached) return cached;
  const name = VIEW_NAME[format];
  const loader = name ? VIEW_LOADERS[name] : undefined;
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
  const toReview = useAppStore((s) => s.libraryHighlightToReview);
  const ensureLists = useAppStore((s) => s.srsEnsureLists);
  // Kitabın Tekrar listesi (LOM-91): düğme "Tekrar'da" mı, buradan anlaşılır.
  const bookList = useAppStore((s) => (s.readerBookId ? s.srsLists.find((l) => l.id === bookListId(s.readerBookId!)) : undefined));

  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [reloadTick, setReloadTick] = useState(0);
  const [viewError, setViewError] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [noteEdit, setNoteEdit] = useState<NoteEdit | null>(null);
  const [panel, setPanel] = useState(false);
  const [relinking, setRelinking] = useState(false);
  /** Tekrar'a eklenmekte olan: çizim kimliği ya da seçim için "selection". */
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const menuRef = useRef<Menu | null>(null);
  menuRef.current = menu;

  // Okuyucu açılınca Tekrar listeleri hazır olsun: düğme durumu ilk anda doğru görünsün.
  useEffect(() => {
    void ensureLists();
  }, [ensureLists]);

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
  // Okuyucunun bildiği son yer ve o an (LOM-92): kendi yazdığımız konumu "başka cihazdan" sanmamak için.
  const localRef = useRef<{ id: string | null; pos?: BookPosition; at: number }>({ id: null, at: 0 });
  if (book && initialRef.current.id !== book.id) {
    initialRef.current = { id: book.id, pos: book.position };
    // Açılıştaki "bilinen an" kaydın kendi konum zamanıdır (açılış anı DEĞİL): kitap açıldıktan
    // sonra eşitlemeyle gelen ama başka cihazda açılıştan önce okunmuş ileri yer de şerit çıkarır.
    localRef.current = { id: book.id, pos: book.position, at: book.positionSavedAt ?? 0 };
  }
  const [remoteHint, setRemoteHint] = useState<{ id: string; pos: BookPosition; savedAt: number } | null>(null);
  const dismissedAt = useRef<number | null>(null);

  const onPosition = useCallback(
    (pos: BookPosition, progress: number) => {
      localRef.current = { id: localRef.current.id, pos, at: Date.now() };
      // Okur o yere kendisi vardıysa şerit gereksiz.
      setRemoteHint((h) => (h && h.pos.kind === pos.kind && comparePosition(pos, h.pos) >= 0 ? null : h));
      savePosition(pos, progress);
    },
    [savePosition]
  );

  // Kitap açıkken başka cihazdan ileri bir yer gelirse şerit çıkar; sayfa kendiliğinden atlamaz.
  const bookPos = book?.position;
  const bookSavedAt = book?.positionSavedAt;
  useEffect(() => {
    if (!book || localRef.current.id !== book.id) return;
    const ahead = remotePositionAhead(book, localRef.current);
    const savedAt = book.positionSavedAt ?? 0;
    if (ahead && savedAt !== dismissedAt.current) setRemoteHint({ id: book.id, pos: ahead, savedAt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, bookPos, bookSavedAt]);

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

  const reviewState: ReviewButtonState = !menu
    ? "add"
    : quoteInList(bookList, menu.kind === "selection" ? menu.sel.text : (currentHl?.text ?? ""))
      ? "done"
      : reviewBusy && (menu.kind === "selection" ? reviewBusy === "selection" : reviewBusy === menu.id)
        ? "busy"
        : "add";

  /** Çizimi Tekrar'a ekle; seçimdeyse önce çizim oluşturulur, menü o çizime geçer (açık kalır). */
  const sendToReview = async (hlId: string) => {
    setReviewBusy(hlId);
    try {
      await toReview(hlId);
    } finally {
      setReviewBusy((b) => (b === hlId ? null : b));
    }
  };

  const reviewFromMenu = async () => {
    if (!menu || reviewBusy) return;
    if (menu.kind === "highlight") {
      if (currentHl) await sendToReview(currentHl.id);
      return;
    }
    const sel = menu.sel;
    setReviewBusy("selection");
    let created: Highlight | null = null;
    try {
      created = await addHl({ text: sel.text, anchor: sel.anchor, color: prefs.color, chapter: sel.chapter });
    } finally {
      setReviewBusy(null);
    }
    if (!created) return;
    const id = created.id;
    // Menü yeni çizime geçer, sonra seçim kalkar: seçimin kalkması menüyü kapatmasın.
    // Kullanıcı bu arada başka yer seçtiyse menüye de seçime de dokunulmaz.
    const m = menuRef.current;
    if (m?.kind === "selection" && m.sel === sel) {
      setMenu({ kind: "highlight", id, rect: sel.rect });
      window.getSelection()?.removeAllRanges();
    }
    await sendToReview(id);
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
  const hint = remoteHint && remoteHint.id === book.id && load.state === "ready" ? remoteHint : null;
  const hintWhere = (pos: BookPosition): string =>
    pos.kind === "pdf"
      ? t("library.note.page", { n: pos.page })
      : pos.kind === "epub"
        ? t("library.note.section", { n: pos.spine + 1 })
        : String(pos.location);
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
            onPosition={onPosition}
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
        {hint && (
          <div className="lo-reader__hint" role="status">
            <span>{t("library.reader.remotePos", { where: hintWhere(hint.pos) })}</span>
            <div className="lo-reader__hint-actions">
              <button
                type="button"
                className="lo-btn lo-btn--primary"
                onClick={() => {
                  localRef.current = { id: book.id, pos: hint.pos, at: Date.now() };
                  setRemoteHint(null);
                  jump({ position: hint.pos });
                }}
              >
                {t("library.reader.goThere")}
              </button>
              <button
                type="button"
                className="lo-btn"
                onClick={() => {
                  dismissedAt.current = hint.savedAt;
                  setRemoteHint(null);
                }}
              >
                {t("library.reader.dismiss")}
              </button>
            </div>
          </div>
        )}
        {panel && (
          <HighlightsPanel
            highlights={book.highlights}
            labels={labels}
            activeId={target?.highlightId}
            onJump={(h) => jump({ anchor: h.anchor, position: positionOfAnchor(h.anchor), highlightId: h.id })}
            inReview={(h) => quoteInList(bookList, h.text)}
            busyId={reviewBusy}
            onReview={(h) => void sendToReview(h.id)}
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
          reviewState={reviewState}
          onReview={() => void reviewFromMenu()}
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

import { useTranslation } from "react-i18next";
import { ArrowLeft, AArrowDown, AArrowUp, Highlighter, NotebookText, Palette } from "lucide-react";
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP, READER_THEMES, type Book, type ReaderTheme } from "../../core/library";

/** Okuyucunun üst çubuğu (LOM-83): geri, başlık, yazı boyutu, tema, çizimler ve not. */
export function ReaderToolbar({
  book,
  fontScale,
  theme,
  panelOpen,
  fontEnabled,
  onBack,
  onFont,
  onTheme,
  onPanel,
  onNote,
}: {
  book: Book;
  fontScale: number;
  theme: ReaderTheme;
  panelOpen: boolean;
  /** PDF'te yazı boyutu yakınlaştırmadır; görüntüleyici yoksa düğmeler kapalı. */
  fontEnabled: boolean;
  onBack: () => void;
  onFont: (next: number) => void;
  onTheme: (next: ReaderTheme) => void;
  onPanel: () => void;
  onNote: () => void;
}) {
  const { t } = useTranslation();
  const nextTheme = READER_THEMES[(READER_THEMES.indexOf(theme) + 1) % READER_THEMES.length];
  const count = book.highlights.length;
  return (
    <div className="lo-reader-bar">
      <button type="button" className="lo-lib-iconbtn" onClick={onBack} title={t("library.back")} aria-label={t("library.back")}>
        <ArrowLeft size={18} strokeWidth={2} />
      </button>
      <div className="lo-reader-bar__title" title={book.title}>
        <span>{book.title}</span>
        {book.author && <small>{book.author}</small>}
      </div>
      <div className="lo-reader-bar__tools">
        <button
          type="button"
          className="lo-lib-iconbtn"
          disabled={!fontEnabled || fontScale <= FONT_SCALE_MIN}
          onClick={() => onFont(fontScale - FONT_SCALE_STEP)}
          title={t("library.reader.smaller")}
          aria-label={t("library.reader.smaller")}
        >
          <AArrowDown size={18} strokeWidth={2} />
        </button>
        <span className="lo-reader-bar__scale" aria-live="polite">
          %{Math.round(fontScale * 100)}
        </span>
        <button
          type="button"
          className="lo-lib-iconbtn"
          disabled={!fontEnabled || fontScale >= FONT_SCALE_MAX}
          onClick={() => onFont(fontScale + FONT_SCALE_STEP)}
          title={t("library.reader.larger")}
          aria-label={t("library.reader.larger")}
        >
          <AArrowUp size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="lo-lib-iconbtn"
          onClick={() => onTheme(nextTheme)}
          title={t("library.reader.theme", { name: t(`library.reader.themes.${theme}`) })}
          aria-label={t("library.reader.theme", { name: t(`library.reader.themes.${theme}`) })}
        >
          <Palette size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={"lo-lib-iconbtn lo-reader-bar__hl" + (panelOpen ? " is-on" : "")}
          onClick={onPanel}
          aria-pressed={panelOpen}
          title={t("library.reader.highlights")}
          aria-label={t("library.reader.highlights")}
        >
          <Highlighter size={18} strokeWidth={2} />
          {count > 0 && <span className="lo-reader-bar__badge">{count}</span>}
        </button>
        <button type="button" className="lo-lib-iconbtn" onClick={onNote} title={t("library.openNote")} aria-label={t("library.openNote")}>
          <NotebookText size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

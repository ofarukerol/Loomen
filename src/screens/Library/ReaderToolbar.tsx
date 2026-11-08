import { useTranslation } from "react-i18next";
import { ArrowLeft, AArrowDown, AArrowUp, Coffee, Highlighter, NotebookText, Palette, Pause, Play, Timer } from "lucide-react";
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP, READER_THEMES, type Book, type ReaderTheme } from "../../core/library";
import { useAppStore } from "../../store/useAppStore";

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (sec: number) => pad(Math.floor(sec / 60)) + ":" + pad(sec % 60);

/**
 * Okurken Pomodoro (LOM-93): Planner'daki ana düğmenin aynısı (togglePomo). Boşta yalnız simge;
 * çalışırken ya da duraklatılmışken kalan süre, molada mola kalanı görünür. Sayaç App'te işler.
 */
function ReaderPomoButton() {
  const { t } = useTranslation();
  const running = useAppStore((s) => s.pomoRunning);
  const remaining = useAppStore((s) => s.pomoRemaining);
  const focusSec = useAppStore((s) => s.pomo.focusMin * 60);
  const breakActive = useAppStore((s) => s.pomoBreakActive);
  const breakRemaining = useAppStore((s) => s.pomoBreakRemaining);
  const togglePomo = useAppStore((s) => s.togglePomo);

  const onBreak = !running && breakActive;
  const paused = !running && !onBreak && remaining !== focusSec;
  const label = running ? t("library.reader.pomoPause") : onBreak ? t("library.reader.pomoBreak") : t("library.reader.pomoStart");
  const Icon = running ? Pause : onBreak ? Coffee : paused ? Play : Timer;
  const time = running || paused ? clock(remaining) : onBreak ? clock(breakRemaining) : null;
  return (
    <button
      type="button"
      className={"lo-lib-iconbtn lo-reader-bar__pomo" + (running ? " is-on" : "") + (onBreak ? " is-break" : "")}
      onClick={togglePomo}
      aria-pressed={running}
      title={label}
      aria-label={label}
    >
      <Icon size={18} strokeWidth={2} />
      {time && (
        <span className="lo-reader-bar__pomo-time" aria-live="polite">
          {time}
        </span>
      )}
    </button>
  );
}

/** Okuyucunun üst çubuğu (LOM-83): geri, başlık, yazı boyutu, tema, çizimler, Pomodoro (LOM-93) ve not. */
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
        <ReaderPomoButton />
        <button type="button" className="lo-lib-iconbtn" onClick={onNote} title={t("library.openNote")} aria-label={t("library.openNote")}>
          <NotebookText size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

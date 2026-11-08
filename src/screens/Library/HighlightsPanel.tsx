import { useTranslation } from "react-i18next";
import { Check, Repeat, X } from "lucide-react";
import { locationLabel, type Highlight, type NoteLabels } from "../../core/library";
import { HIGHLIGHT_CSS } from "./readerTypes";

/**
 * Okuyucunun yan paneli (LOM-83): kitabın çizimleri kitap sırasıyla; dokununca o yere gider.
 * Her çizimin yanında Tekrar kartı düğmesi (LOM-91) — atlama düğmesinin kardeşi, içinde değil.
 */
export function HighlightsPanel({
  highlights,
  labels,
  activeId,
  onJump,
  inReview,
  busyId,
  onReview,
  onClose,
}: {
  highlights: Highlight[];
  labels: NoteLabels;
  activeId?: string | null;
  onJump: (h: Highlight) => void;
  inReview: (h: Highlight) => boolean;
  /** Tekrar'a eklenmekte olan çizim. */
  busyId?: string | null;
  onReview: (h: Highlight) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="lo-hlpanel" aria-label={t("library.reader.highlights")}>
      <div className="lo-hlpanel__head">
        <span>{t("library.reader.highlights")}</span>
        <button type="button" className="lo-lib-iconbtn" onClick={onClose} aria-label={t("library.close")} title={t("library.close")}>
          <X size={16} strokeWidth={2} />
        </button>
      </div>
      {highlights.length === 0 ? (
        <p className="lo-hlpanel__empty">{t("library.reader.noHighlights")}</p>
      ) : (
        <ul className="lo-hlpanel__list">
          {highlights.map((h) => {
            const done = inReview(h);
            const label = t(done ? "library.review.done" : "library.review.add");
            return (
              <li key={h.id} className="lo-hlpanel__row">
                <button
                  type="button"
                  className={"lo-hlpanel__item" + (activeId === h.id ? " is-on" : "")}
                  style={{ ["--hl" as string]: HIGHLIGHT_CSS[h.color] }}
                  onClick={() => onJump(h)}
                >
                  <span className="lo-hlpanel__quote">{h.text}</span>
                  {h.note && <span className="lo-hlpanel__note">{h.note}</span>}
                  <span className="lo-hlpanel__loc">{locationLabel(h, labels)}</span>
                </button>
                <button
                  type="button"
                  className={"lo-hlpanel__review" + (done ? " is-done" : "")}
                  disabled={done || busyId === h.id}
                  aria-pressed={done}
                  aria-busy={busyId === h.id || undefined}
                  onClick={() => !done && onReview(h)}
                  title={label}
                >
                  {done ? <Check size={13} strokeWidth={2.4} aria-hidden /> : <Repeat size={13} strokeWidth={2} aria-hidden />}
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

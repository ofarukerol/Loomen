import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useModalLayer } from "../../store/useAppStore";

/**
 * Çizime not yazma penceresi (LOM-83). Alıntı üstte görünür; Kaydet notu kitabın kaydına ve
 * kasadaki nota yazar. Escape / zemin / Android geri vazgeçer; Cmd/Ctrl+Enter kaydeder.
 */
export function HighlightNoteDialog({
  quote,
  initial,
  onSave,
  onClose,
}: {
  quote: string;
  initial?: string;
  onSave: (note: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useModalLayer();

  useEffect(() => {
    const el = areaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(text);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="lo-modal" onClick={onClose}>
      <div
        className="lo-hlnote"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lo-hlnote-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lo-hlnote-title" className="lo-hlnote__title">
          {initial ? t("library.reader.editNote") : t("library.reader.addNote")}
        </h2>
        <blockquote className="lo-hlnote__quote">{quote}</blockquote>
        <textarea
          ref={areaRef}
          className="lo-hlnote__area"
          value={text}
          rows={5}
          placeholder={t("library.reader.notePlaceholder")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            }
          }}
        />
        <div className="lo-hlnote__actions">
          <button type="button" className="lo-btn" onClick={onClose}>
            {t("library.cancel")}
          </button>
          <button type="button" className="lo-btn lo-btn--primary" disabled={busy} onClick={() => void save()}>
            {t("library.save")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

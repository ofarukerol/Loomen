import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useModalLayer } from "../../store/useAppStore";

/**
 * Seçili metinden Tekrar kartı penceresi (LOM-110). Ön yüz seçili metinle dolu gelir, odak
 * arka yüzdedir; ikisi de doluyken Kaydet açılır. Escape / zemin vazgeçer; Cmd/Ctrl+Enter kaydeder.
 */
export function ReviewCardDialog({
  initialFront,
  onSave,
  onClose,
}: {
  initialFront: string;
  onSave: (front: string, back: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [front, setFront] = useState(initialFront.replace(/\s+/g, " ").trim());
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const backRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useModalLayer();

  useEffect(() => {
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ready = front.trim() !== "" && back.trim() !== "";
  const save = async () => {
    if (busy || !ready) return;
    setBusy(true);
    try {
      await onSave(front, back);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void save();
    }
  };

  return createPortal(
    <div className="lo-modal" onClick={onClose}>
      <div
        className="lo-selcard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lo-selcard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lo-selcard-title" className="lo-selcard__title">
          {t("selbar.cardTitle")}
        </h2>
        <label className="lo-selcard__label" htmlFor="lo-selcard-front">
          {t("selbar.front")}
        </label>
        <textarea
          id="lo-selcard-front"
          className="lo-selcard__area"
          value={front}
          rows={2}
          onChange={(e) => setFront(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <label className="lo-selcard__label" htmlFor="lo-selcard-back">
          {t("selbar.back")}
        </label>
        <textarea
          id="lo-selcard-back"
          ref={backRef}
          className="lo-selcard__area"
          value={back}
          rows={3}
          placeholder={t("selbar.backPlaceholder")}
          onChange={(e) => setBack(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="lo-selcard__actions">
          <button type="button" className="lo-btn" onClick={onClose}>
            {t("selbar.cancel")}
          </button>
          <button
            type="button"
            className="lo-btn lo-btn--primary"
            disabled={busy || !ready}
            onClick={() => void save()}
          >
            {t("selbar.save")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

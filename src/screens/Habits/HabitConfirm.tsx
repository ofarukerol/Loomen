import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useModalLayer } from "../../store/useAppStore";

/**
 * Uygulama içi onay penceresi. window.confirm Tauri'de sessizce false döndüğü için Bırak/Sil
 * hiç çalışmazdı. Escape ve zemine tıklama vazgeçer; odak vazgeç düğmesinde başlar (yanlışlıkla
 * Enter'a basmak silmesin).
 */
export function HabitConfirm({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useModalLayer();

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return createPortal(
    <div className="lo-modal" onClick={onClose}>
      <div
        className="lo-hab-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lo-hab-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lo-hab-confirm-title" className="lo-hab-confirm__title">
          {title}
        </h2>
        {body && <p className="lo-hab-confirm__body">{body}</p>}
        <div className="lo-hab-confirm__actions">
          <button ref={cancelRef} type="button" className="lo-btn" onClick={onClose}>
            {t("habit.cancel")}
          </button>
          <button
            type="button"
            className={"lo-btn " + (danger ? "lo-hab-btn--danger" : "lo-btn--primary")}
            disabled={busy}
            onClick={() => void go()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

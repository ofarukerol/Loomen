import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BookPlus } from "lucide-react";
import { useAppStore, useModalLayer } from "../../store/useAppStore";

/** Önizlemede alıntının en çok bu kadar karakteri. */
const PREVIEW_MAX = 220;

/**
 * Paylaş ile gelen alıntı hangi kitaba gitsin (LOM-96)? Başlık raftaki tek kitapla eşleşmediyse
 * açılır: aday kitaplar (birden çok eşleşmede yalnız onlar, yoksa bütün raf) ve başlık tanındıysa
 * "Yeni kayıt" seçeneği. Bir kitaba dokunmak alıntıyı oraya ekler. Vazgeç, Escape ve zemine
 * dokunma hiçbir şeyi değiştirmez. Pencere HabitConfirm desenindedir (body'ye çizilir, geri tuşu
 * katmanına `useModalLayer` ile girer).
 */
export function SharePickDialog() {
  const pending = useAppStore((s) => s.pendingShare);
  if (!pending) return null;
  return <SharePickInner />;
}

function SharePickInner() {
  const { t } = useTranslation();
  const pending = useAppStore((s) => s.pendingShare)!;
  const books = useAppStore((s) => s.books);
  const resolve = useAppStore((s) => s.libraryResolveShare);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useModalLayer();

  const close = () => void resolve(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { parsed } = pending;
  const list = pending.candidates.flatMap((id) => books.filter((b) => b.id === id));
  const quote = parsed.quote.length > PREVIEW_MAX ? parsed.quote.slice(0, PREVIEW_MAX).trimEnd() + "…" : parsed.quote;
  const from = parsed.title ? (parsed.author ? `${parsed.title} · ${parsed.author}` : parsed.title) : null;

  return createPortal(
    <div className="lo-modal" onClick={close}>
      <div
        className="lo-hab-confirm lo-share-pick"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lo-share-pick-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lo-share-pick-title" className="lo-hab-confirm__title">
          {t("library.share.pickTitle")}
        </h2>
        <blockquote className="lo-share-pick__quote">{quote}</blockquote>
        <p className="lo-hab-confirm__body">{from ? t("library.share.pickFrom", { name: from }) : t("library.share.pickBody")}</p>
        <div className="lo-share-pick__list">
          {list.map((b) => (
            <button key={b.id} type="button" className="lo-share-pick__item" onClick={() => void resolve({ bookId: b.id })}>
              <span className="lo-share-pick__name">{b.title}</span>
              {b.author && <span className="lo-share-pick__author">{b.author}</span>}
            </button>
          ))}
          {pending.canCreate && parsed.title && (
            <button type="button" className="lo-share-pick__item lo-share-pick__item--new" onClick={() => void resolve({ create: true })}>
              <BookPlus size={16} strokeWidth={2} aria-hidden="true" />
              <span className="lo-share-pick__name">{t("library.share.create", { name: parsed.title })}</span>
            </button>
          )}
        </div>
        <div className="lo-hab-confirm__actions">
          <button ref={cancelRef} type="button" className="lo-btn" onClick={close}>
            {t("library.share.cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

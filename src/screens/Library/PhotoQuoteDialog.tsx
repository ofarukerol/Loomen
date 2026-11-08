import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BookPlus, Camera, ImagePlus, Loader2, Settings2 } from "lucide-react";
import { isTauri } from "../../core/vault";
import { useAppStore, useModalLayer } from "../../store/useAppStore";
import { pickImageDesktop, pickImageFile, shrinkImage } from "./photoCapture";

/** Kitap seçicisinde "yeni basılı kitap" seçeneğinin değeri. */
const NEW_BOOK = "__new__";

type Step = { kind: "pick" } | { kind: "reading" } | { kind: "edit" };

/**
 * Fotoğraftan alıntı penceresi (LOM-87). Üç adım:
 *  1. Fotoğraf çek / seç — sayfanın etkin yapay zekâ sağlayıcısına gönderileceği yazar. Asistan
 *     kapalıysa ya da sağlayıcı yoksa ne yapılacağını söyler, Ayarlar'a götürür.
 *  2. "Metin okunuyor…" — sağlayıcı yazıyı metne çevirir; hata pencerede gösterilir.
 *  3. Okunan metin düzenlenebilir kutuda. Bir kısmı seçiliyse yalnız o, değilse hepsi eklenir.
 *     İsteğe bağlı sayfa; kitap raftan seçilir ya da başlık/yazarla yeni basılı kitap açılır.
 * Ekleyince kitabın notu açılır; aynı alıntı kitapta varsa pencere açık kalır ve bunu söyler.
 * Fotoğraf hiçbir yere kaydedilmez.
 */
export function PhotoQuoteDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const aiEnabled = useAppStore((s) => s.aiEnabled);
  const provider = useAppStore((s) => s.aiProviders.find((p) => p.id === s.aiActiveProviderId) ?? null);
  const mobile = useAppStore((s) => s.platformMobile);
  const books = useAppStore((s) => s.books);
  const ocr = useAppStore((s) => s.libraryOcrPhoto);
  const addQuote = useAppStore((s) => s.libraryAddPhotoQuote);
  const setScreen = useAppStore((s) => s.setScreen);
  useModalLayer();

  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [page, setPage] = useState("");
  const shelf = useMemo(
    () =>
      [...books].sort(
        (a, b) =>
          Number(b.status === "reading") - Number(a.status === "reading") ||
          Math.max(b.positionSavedAt ?? 0, b.updatedAt) - Math.max(a.positionSavedAt ?? 0, a.updatedAt),
      ),
    [books],
  );
  const [bookId, setBookId] = useState<string>(() => shelf[0]?.id ?? NEW_BOOK);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [saving, setSaving] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const aliveRef = useRef(true);
  /** Süren okuma; pencere kapanınca ya da yeni fotoğrafla geçersiz olur. */
  const runRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Seçili kitap raftan kalktıysa (eşitleme) ilk kitaba ya da yeni kayda dön.
  useEffect(() => {
    if (bookId !== NEW_BOOK && !books.some((b) => b.id === bookId)) setBookId(shelf[0]?.id ?? NEW_BOOK);
  }, [books, bookId, shelf]);

  const ready = aiEnabled && !!provider;
  const app = isTauri();

  /** Görseli küçült, sağlayıcıya gönder, metni kutuya koy. */
  const readImage = async (blob: Blob) => {
    // Seçici açıkken pencere kapandıysa fotoğraf sağlayıcıya gitmez.
    if (!aliveRef.current) return;
    const run = ++runRef.current;
    setError(null);
    setInfo(null);
    setStep({ kind: "reading" });
    try {
      let img;
      try {
        img = await shrinkImage(blob);
      } catch (e) {
        console.error("[library] görsel açılamadı:", e);
        throw new Error(t("library.photo.badImage"));
      }
      if (!aliveRef.current || run !== runRef.current) return;
      const out = await ocr(img.bytes, img.mime);
      if (!aliveRef.current || run !== runRef.current) return;
      setText(out);
      setStep({ kind: "edit" });
    } catch (e) {
      if (!aliveRef.current || run !== runRef.current) return;
      console.error("[library] fotoğraf okunamadı:", e);
      setError(e instanceof Error && e.message ? e.message : t("library.photo.error", { detail: String(e) }));
      setStep({ kind: "pick" });
    }
  };

  const pick = async (camera: boolean) => {
    setError(null);
    try {
      if (mobile) {
        const f = await pickImageFile(camera);
        if (f && aliveRef.current) await readImage(f);
      } else {
        const got = await pickImageDesktop(t("library.photo.pickTitle"), t("library.photo.pickFilter"));
        if (got && aliveRef.current) await readImage(got.blob);
      }
    } catch (e) {
      if (!aliveRef.current) return;
      console.error("[library] fotoğraf seçilemedi:", e);
      setError(t("library.photo.pickError", { detail: e instanceof Error ? e.message : String(e) }));
      setStep({ kind: "pick" });
    }
  };

  /**
   * Eklenecek metin: kutuda seçim varsa yalnız o kısım. Seçim o anda kutudan okunur (düğmeye basınca
   * kutu odağı kaybetse de seçimini korur); saklanan eski bir aralık kullanılmaz.
   */
  const chosenText = (): string => {
    const el = taRef.current;
    const a = el?.selectionStart ?? 0;
    const b = el?.selectionEnd ?? 0;
    const part = b > a ? text.slice(a, b) : "";
    return (part.trim() ? part : text).trim();
  };

  const pageNum = page.trim() ? Number(page.trim()) : undefined;
  const pageBad = pageNum !== undefined && (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > 100000);
  const isNew = bookId === NEW_BOOK;
  const canAdd = !saving && text.trim().length > 0 && !pageBad && (!isNew || title.trim().length > 0);

  const add = async () => {
    if (!canAdd) return;
    const quote = chosenText();
    if (!quote) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const target = isNew ? { title: title.trim(), author: author.trim() || undefined } : { bookId };
      const res = await addQuote(target, quote, pageNum);
      if (!aliveRef.current) return;
      if (res.status === "added") onClose();
      else if (res.status === "duplicate") setInfo(res.message ?? t("library.photo.duplicate", { name: "" }));
      else setError(res.message ?? t("library.photo.addError", { detail: "" }));
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  };

  const providerName = provider?.label?.trim() || provider?.kind || "";

  let body: React.ReactNode;
  if (!app) {
    body = <p className="lo-hab-confirm__body">{t("library.appOnly")}</p>;
  } else if (!ready) {
    body = (
      <>
        <p className="lo-hab-confirm__body" role="status">
          {!aiEnabled ? t("library.photo.needAi") : t("library.photo.needProvider")}
        </p>
        <div className="lo-photo__actions">
          <button
            type="button"
            className="lo-btn lo-btn--primary"
            onClick={() => {
              onClose();
              setScreen("settings");
            }}
          >
            <Settings2 size={15} strokeWidth={2} aria-hidden />
            <span>{t("library.photo.openSettings")}</span>
          </button>
        </div>
      </>
    );
  } else if (step.kind === "reading") {
    body = (
      <div className="lo-photo__reading" role="status">
        <Loader2 size={22} strokeWidth={2} className="lo-spin" aria-hidden />
        <span>{t("library.photo.reading", { name: providerName })}</span>
      </div>
    );
  } else if (step.kind === "pick") {
    body = (
      <>
        <p className="lo-hab-confirm__body">{t("library.photo.sent", { name: providerName })}</p>
        <div className="lo-photo__actions">
          {mobile && (
            <button type="button" className="lo-btn lo-btn--primary" onClick={() => void pick(true)}>
              <Camera size={16} strokeWidth={2} aria-hidden />
              <span>{t("library.photo.camera")}</span>
            </button>
          )}
          <button type="button" className={"lo-btn" + (mobile ? "" : " lo-btn--primary")} onClick={() => void pick(false)}>
            <ImagePlus size={16} strokeWidth={2} aria-hidden />
            <span>{mobile ? t("library.photo.gallery") : t("library.photo.choose")}</span>
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <div className="lo-photo__form">
        <div className="lo-hab-field">
          <label className="lo-hab-field__label" htmlFor="lo-photo-text">
            {t("library.photo.textLabel")}
          </label>
          <textarea
            id="lo-photo-text"
            ref={taRef}
            className="lo-hab-input lo-photo__text"
            value={text}
            rows={8}
            aria-describedby="lo-photo-hint"
            onChange={(e) => setText(e.target.value)}
          />
          <span id="lo-photo-hint" className="lo-photo__hint">
            {t("library.photo.selectHint")}
          </span>
        </div>
        <label className="lo-hab-field">
          <span className="lo-hab-field__label">{t("library.photo.book")}</span>
          <select className="lo-hab-input lo-hab-select" value={bookId} onChange={(e) => setBookId(e.target.value)}>
            {shelf.map((b) => (
              <option key={b.id} value={b.id}>
                {b.author ? `${b.title} — ${b.author}` : b.title}
              </option>
            ))}
            <option value={NEW_BOOK}>{t("library.photo.newBook")}</option>
          </select>
        </label>
        {isNew && (
          <div className="lo-photo__row">
            <label className="lo-hab-field lo-photo__grow">
              <span className="lo-hab-field__label">{t("library.photo.titleLabel")}</span>
              <input className="lo-hab-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="lo-hab-field lo-photo__grow">
              <span className="lo-hab-field__label">
                {t("library.photo.authorLabel")} <span className="lo-hab-field__opt">{t("library.photo.optional")}</span>
              </span>
              <input className="lo-hab-input" value={author} maxLength={200} onChange={(e) => setAuthor(e.target.value)} />
            </label>
          </div>
        )}
        <label className="lo-hab-field">
          <span className="lo-hab-field__label">
            {t("library.photo.page")} <span className="lo-hab-field__opt">{t("library.photo.optional")}</span>
          </span>
          <input
            className={"lo-hab-input lo-hab-input--num" + (pageBad ? " is-invalid" : "")}
            inputMode="numeric"
            aria-invalid={pageBad || undefined}
            value={page}
            onChange={(e) => setPage(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
          />
        </label>
      </div>
    );
  }

  return createPortal(
    <div className="lo-modal" onClick={onClose}>
      <div
        className="lo-hab-confirm lo-photo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lo-photo-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lo-photo-title" className="lo-hab-confirm__title">
          {t("library.photo.title")}
        </h2>
        {body}
        {error && (
          <p className="lo-photo__error" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="lo-photo__info" role="status">
            {info}
          </p>
        )}
        <div className="lo-hab-confirm__actions">
          {step.kind === "edit" && ready && (
            <button type="button" className="lo-btn" onClick={() => setStep({ kind: "pick" })} disabled={saving}>
              <Camera size={15} strokeWidth={2} aria-hidden />
              <span>{t("library.photo.retake")}</span>
            </button>
          )}
          <button type="button" className="lo-btn" onClick={onClose}>
            {t("library.cancel")}
          </button>
          {step.kind === "edit" && ready && (
            <button type="button" className="lo-btn lo-btn--primary" onClick={() => void add()} disabled={!canAdd}>
              {saving ? <Loader2 size={15} strokeWidth={2} className="lo-spin" aria-hidden /> : isNew ? <BookPlus size={15} strokeWidth={2} aria-hidden /> : null}
              <span>{t("library.photo.add")}</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

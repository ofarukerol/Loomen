import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { messageKeyFor, writeErrorKey, type WriteErrorState } from "../core/vault/writeError";

/**
 * Kasaya yazılamıyor uyarısı (LOM-20). Otomatik kayıt her başarısız olduğunda yeni bir pencere
 * açmak yerine burada tek bir sabit şerit durur; ilk başarılı yazmada kendiliğinden kalkar.
 * Teknik hata metni "Ayrıntılar" altında kalır.
 */
export function WriteErrorBar() {
  const { t } = useTranslation();
  const writeError = useAppStore((s) => s.writeError);
  const retryWrite = useAppStore((s) => s.retryWrite);
  const dismissWriteError = useAppStore((s) => s.dismissWriteError);

  if (!writeError || writeError.dismissed) return null;

  // Anahtar yeni hatada değişir: gövde yeniden kurulur, Ayrıntılar kapalı başlar (LOM-21).
  return (
    <WriteErrorBarBody
      key={writeErrorKey(writeError)}
      error={writeError}
      t={t}
      onRetry={() => void retryWrite()}
      onDismiss={dismissWriteError}
    />
  );
}

interface BodyProps {
  error: WriteErrorState;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Şeridin kendisi; store ve i18n'e bağlı değil (node testinde çizilir). İki satır: üstte ikon,
 * metin ve kapat düğmesi; altta sarılabilen düğmeler. Dar sütunda X hep üst satırda kalır (LOM-21).
 */
export function WriteErrorBarBody({ error, t, onRetry, onDismiss }: BodyProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lo-writebar" role="alert">
      <div className="lo-writebar__head">
        <AlertTriangle className="lo-writebar__icon" size={15} strokeWidth={2} />
        <div className="lo-writebar__text">
          <div>{t(messageKeyFor(error.code) ?? "errors.writeVault")}</div>
          <div className="lo-writebar__sub">{t("writeBar.notSaved", { n: error.count })}</div>
        </div>
        <button
          type="button"
          className="lo-writebar__btn lo-writebar__close"
          aria-label={t("writeBar.dismiss")}
          title={t("writeBar.dismiss")}
          onClick={onDismiss}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="lo-writebar__actions">
        <button type="button" className="lo-writebar__btn" onClick={onRetry}>
          {t("writeBar.retry")}
        </button>
        <button
          type="button"
          className="lo-writebar__btn"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t("writeBar.details")}
        </button>
      </div>
      {open && <code className="lo-writebar__detail">{error.detail}</code>}
    </div>
  );
}

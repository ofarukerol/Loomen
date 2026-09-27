import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { messageKeyFor } from "../core/vault/writeError";

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
  const [showDetail, setShowDetail] = useState(false);

  if (!writeError || writeError.dismissed) return null;

  return (
    <div className="lo-writebar" role="alert">
      <AlertTriangle className="lo-writebar__icon" size={15} strokeWidth={2} />
      <div className="lo-writebar__text">
        <div>{t(messageKeyFor(writeError.code) ?? "errors.writeVault")}</div>
        <div className="lo-writebar__sub">{t("writeBar.notSaved", { n: writeError.count })}</div>
        {showDetail && <code className="lo-writebar__detail">{writeError.detail}</code>}
      </div>
      <div className="lo-writebar__actions">
        <button type="button" className="lo-writebar__btn" onClick={() => void retryWrite()}>
          {t("writeBar.retry")}
        </button>
        <button
          type="button"
          className="lo-writebar__btn"
          aria-expanded={showDetail}
          onClick={() => setShowDetail((v) => !v)}
        >
          {t("writeBar.details")}
        </button>
        <button
          type="button"
          className="lo-writebar__close"
          aria-label={t("writeBar.dismiss")}
          title={t("writeBar.dismiss")}
          onClick={dismissWriteError}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

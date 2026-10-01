import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { openErrorKey, openErrorMessageKey, vaultLabel, type VaultOpenError } from "../core/vault/openError";

/**
 * Kasa açılamadı uyarısı (LOM-23). Açılışta aynı kasa birkaç kez denenir; her denemede yeni pencere
 * açmak yerine burada tek bir şerit durur. Kasa açılınca kendiliğinden kalkar.
 * Teknik hata metni ve tam yol "Ayrıntılar" altında kalır.
 */
export function VaultOpenErrorBar() {
  const { t } = useTranslation();
  const error = useAppStore((s) => s.vaultOpenError);
  const vaults = useAppStore((s) => s.vaults);
  const mobile = useAppStore((s) => s.platformMobile);
  const dismiss = useAppStore((s) => s.dismissVaultOpenError);
  const repick = useAppStore((s) => s.repickFailedVault);
  const retry = useAppStore((s) => s.retryVaultOpen);
  const hasError = error !== null;

  // Pencere öne gelince bir kez yeniden dene: klasör geri geldiyse şerit kendiliğinden kalkar.
  // Çalışan bir deneme varken store yenisini başlatmaz.
  useEffect(() => {
    if (!hasError) return;
    const onFocus = () => void retry(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void retry(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasError, retry]);

  if (!error) return null;
  const name = vaults.find((v) => v.path === error.path)?.name || vaultLabel(error.path);

  // Anahtar yeni hatada değişir: gövde yeniden kurulur, Ayrıntılar kapalı başlar.
  return (
    <VaultOpenErrorBarBody
      key={openErrorKey(error)}
      error={error}
      name={name}
      t={t}
      mobile={mobile}
      onRepick={mobile ? null : () => void repick()}
      onRetry={() => void retry()}
      onDismiss={dismiss}
    />
  );
}

interface BodyProps {
  error: VaultOpenError;
  name: string;
  /** Mobilde "klasörü yeniden seçin" denmez; yeniden deneme metni gösterilir. */
  mobile?: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
  /** Mobilde klasör seçici yok: null ise düğme gösterilmez. */
  onRepick: (() => void) | null;
  onRetry: () => void;
  onDismiss: () => void;
}

/** İki satır: üstte ikon, metin ve kapat düğmesi; altta sarılabilen düğmeler. Dar sütunda X taşmaz. */
export function VaultOpenErrorBarBody({ error, name, t, mobile, onRepick, onRetry, onDismiss }: BodyProps) {
  const [open, setOpen] = useState(false);
  const detailId = useId();

  return (
    <div className="lo-vaultbar" role="alert">
      <div className="lo-vaultbar__head">
        <AlertTriangle className="lo-vaultbar__icon" size={15} strokeWidth={2} />
        <div className="lo-vaultbar__text">{mobile ? t("vaultBar.mobileMessage", { name }) : t(openErrorMessageKey(error.code), { name })}</div>
        <button
          type="button"
          className="lo-vaultbar__btn lo-vaultbar__close"
          aria-label={t("vaultBar.dismiss")}
          title={t("vaultBar.dismiss")}
          onClick={onDismiss}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="lo-vaultbar__actions">
        {onRepick && (
          <button type="button" className="lo-vaultbar__btn" onClick={onRepick}>
            {t("vaultBar.repick")}
          </button>
        )}
        <button type="button" className="lo-vaultbar__btn" onClick={onRetry}>
          {t("vaultBar.retry")}
        </button>
        <button
          type="button"
          className="lo-vaultbar__btn"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((v) => !v)}
        >
          {t("vaultBar.details")}
        </button>
      </div>
      <code id={detailId} dir="ltr" hidden={!open} className="lo-vaultbar__detail">
        {error.path}
        {"\n"}
        {error.detail}
      </code>
    </div>
  );
}

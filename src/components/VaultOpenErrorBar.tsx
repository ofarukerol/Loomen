import { useState } from "react";
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

  if (!error) return null;
  const name = vaults.find((v) => v.path === error.path)?.name || vaultLabel(error.path);

  // Anahtar yeni hatada değişir: gövde yeniden kurulur, Ayrıntılar kapalı başlar.
  return (
    <Body
      key={openErrorKey(error)}
      error={error}
      name={name}
      t={t}
      onRepick={mobile ? null : () => void repick()}
      onDismiss={dismiss}
    />
  );
}

interface BodyProps {
  error: VaultOpenError;
  name: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  /** Mobilde klasör seçici yok: null ise düğme gösterilmez. */
  onRepick: (() => void) | null;
  onDismiss: () => void;
}

/** İki satır: üstte ikon, metin ve kapat düğmesi; altta sarılabilen düğmeler. Dar sütunda X taşmaz. */
function Body({ error, name, t, onRepick, onDismiss }: BodyProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lo-vaultbar" role="alert">
      <div className="lo-vaultbar__head">
        <AlertTriangle className="lo-vaultbar__icon" size={15} strokeWidth={2} />
        <div className="lo-vaultbar__text">{t(openErrorMessageKey(error.code), { name })}</div>
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
        <button
          type="button"
          className="lo-vaultbar__btn"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t("vaultBar.details")}
        </button>
      </div>
      {open && (
        <code className="lo-vaultbar__detail">
          {error.path}
          {"\n"}
          {error.detail}
        </code>
      )}
    </div>
  );
}

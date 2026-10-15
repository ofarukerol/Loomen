import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Download, X } from "lucide-react";
import { progressPercent, runUpdateCheck, runUpdateInstall, dismissUpdate, updateStore } from "../core/updater";

/** Açılıştan sonra ilk kontrol için bekleme: kasa yüklenirken ağ ve disk meşgul edilmesin. */
const FIRST_CHECK_MS = 5000;
/** Uygulama uzun süre açık kalırsa arada bir yeniden sor. */
const RECHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Yeni sürüm şeridi (LOM-31). Yalnız masaüstünde ve güncelleme destekli derlemede çalışır;
 * mobil ve App Store derlemesinde `runUpdateCheck` hiçbir şey yapmaz, şerit hiç çıkmaz.
 * Yapı ve görünüm kasa şeridiyle (`lo-vaultbar`) aynı.
 */
export function UpdateBanner({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const status = useSyncExternalStore(updateStore.subscribe, updateStore.get);
  const dismissed = useSyncExternalStore(updateStore.subscribe, updateStore.dismissed);

  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(() => void runUpdateCheck(), FIRST_CHECK_MS);
    const again = setInterval(() => void runUpdateCheck(), RECHECK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(again);
    };
  }, [enabled]);

  if (!enabled) return null;
  if (status.kind !== "available" && status.kind !== "installing" && status.kind !== "error") return null;
  // Kendiliğinden kontrolde çıkan hata (ağ yok vb.) şerit olarak gösterilmez; yalnız kurulum hatası.
  if (status.kind === "error" && !status.info) return null;
  const info = status.info!;
  if (status.kind !== "installing" && dismissed === info.version) return null;

  const installing = status.kind === "installing";
  const pct = installing ? progressPercent(status.progress) : null;
  const text = installing
    ? pct === null
      ? t("update.downloading")
      : t("update.downloadingPct", { pct })
    : status.kind === "error"
      ? t("update.failed")
      : t("update.available", { version: info.version });

  return (
    <div className="lo-vaultbar lo-updatebar" role="status">
      <div className="lo-vaultbar__head">
        <Download className="lo-vaultbar__icon" style={{ color: "var(--accent)" }} size={15} strokeWidth={2} />
        <div className="lo-vaultbar__text">{text}</div>
        {!installing && (
          <button
            type="button"
            className="lo-vaultbar__btn lo-vaultbar__close"
            aria-label={t("update.later")}
            title={t("update.later")}
            onClick={dismissUpdate}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>
      {!installing && (
        <div className="lo-vaultbar__actions">
          <button type="button" className="lo-vaultbar__btn" onClick={() => void runUpdateInstall()}>
            {status.kind === "error"
              ? t("update.retry")
              : t("update.install")}
          </button>
          <button type="button" className="lo-vaultbar__btn" onClick={dismissUpdate}>
            {t("update.later")}
          </button>
        </div>
      )}
      {status.kind === "error" && (
        <code dir="ltr" className="lo-vaultbar__detail">
          {status.message}
        </code>
      )}
    </div>
  );
}

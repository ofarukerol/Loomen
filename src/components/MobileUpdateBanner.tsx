import { useTranslation } from "react-i18next";
import { ArrowUpCircle } from "lucide-react";
import { useMobileUpdate } from "../hooks/useMobileUpdate";

/**
 * Mobil güncelleme şeridi (LOM-32): mağazada yeni sürüm varsa yüzen alt çubuğun hemen üstünde
 * küçük bir şerit; pencere ya da tam ekran değil. Ayrı kapat düğmesi yok, "Sonra" kapatır.
 */
export function MobileUpdateBanner() {
  const { t } = useTranslation();
  const { update, later, openStore } = useMobileUpdate();
  if (!update) return null;

  return (
    <div className="lo-mupd" role="status">
      <ArrowUpCircle size={18} strokeWidth={1.8} />
      <span className="lo-mupd__text">{t("update.ready", { version: update.version })}</span>
      <button type="button" className="lo-mupd__btn lo-mupd__btn--primary" onClick={openStore}>
        {t("update.now")}
      </button>
      <button type="button" className="lo-mupd__btn" onClick={later}>
        {t("update.later")}
      </button>
    </div>
  );
}

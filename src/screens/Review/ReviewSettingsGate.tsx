import { useId, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  status: "loading" | "error";
  detail: string | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onRetry: () => void;
}

/**
 * Tekrar ayarı henüz okunmadı ya da okunamadı (LOM-71). Bu sürede "Tekrarı kullan" anahtarı
 * çizilmez: varsayılan (kapalı) ayar gerçekmiş gibi görünmesin ve dokunulunca kişinin ayar
 * dosyası varsayılanla ezilmesin. Store ve i18n'e bağlı değil (node testinde çizilir).
 */
export function ReviewSettingsGate({ status, detail, t, onRetry }: Props) {
  const [open, setOpen] = useState(false);
  const detailId = useId();

  if (status === "loading") {
    return (
      <div className="lo-card lo-set__card">
        <div className="lo-set__row" aria-busy="true">
          <div>
            <div className="lo-set__rowtitle">{t("review.set.enable")}</div>
            <div className="lo-set__rowsub">{t("review.set.loading")}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lo-card lo-set__card lo-srsgate" role="alert">
      <div className="lo-srsgate__head">
        <AlertTriangle className="lo-srsgate__icon" size={15} strokeWidth={2} />
        <div className="lo-srsgate__text">
          <div className="lo-set__rowtitle">{t("review.set.readErrorTitle")}</div>
          <div className="lo-set__rowsub">{t("review.set.readErrorSub")}</div>
        </div>
      </div>
      <div className="lo-srsgate__actions">
        <button type="button" className="lo-writebar__btn" onClick={onRetry}>
          {t("review.set.retry")}
        </button>
        {detail && (
          <button
            type="button"
            className="lo-writebar__btn"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((v) => !v)}
          >
            {t("review.set.details")}
          </button>
        )}
      </div>
      {detail && (
        <code id={detailId} dir="ltr" hidden={!open} className="lo-writebar__detail">
          {detail}
        </code>
      )}
    </div>
  );
}

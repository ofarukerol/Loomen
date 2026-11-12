import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { tr, enUS, ar } from "date-fns/locale";
import { useAppStore } from "../store/useAppStore";
import { CHECK_EVERY_MS, parseSyncTime, syncHealth, type SyncHealth } from "../core/sync/autoSync";

const DATE_LOCALES: Record<string, typeof tr> = { tr, en: enUS, ar };

/**
 * Senkron uzun süredir olmadı / yapılamıyor uyarısı (LOM-105). Otomatik senkron açıkken son
 * başarılı senkron 15 dakikadan eskiyse ya da son deneme hata verdiyse çıkar; senkron sürerken
 * ve her şey yolundayken hiçbir şey çizmez. Telefon günlerce sessizce senkronsuz kalmasın.
 */
export function SyncStaleBar() {
  const { t, i18n } = useTranslation();
  const ghOn = useAppStore((s) => s.features.github);
  const ghAutoSync = useAppStore((s) => s.ghAutoSync);
  const connected = useAppStore((s) => !!s.ghToken && !!s.ghRepo && !!s.vaultPath);
  const syncing = useAppStore((s) => s.ghSyncing);
  const lastSync = useAppStore((s) => s.ghLastSync);
  const failed = useAppStore((s) => s.ghSyncFailed);
  const status = useAppStore((s) => s.ghStatus);
  const ghSync = useAppStore((s) => s.ghSync);

  // Zaman ilerledikçe "eskidi" kararı değişir: 30 sn'de bir ve görünür olunca tazele.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const lastSuccessAt = parseSyncTime(lastSync);
  const health = syncHealth({
    enabled: ghOn && ghAutoSync && connected,
    syncing,
    lastSuccessAt,
    failed,
    now: Math.max(now, Date.now()),
  });
  if (health === "ok") return null;

  const lastSyncText =
    lastSuccessAt == null
      ? t("syncBar.never")
      : formatDistanceToNow(new Date(lastSuccessAt), {
          addSuffix: true,
          locale: DATE_LOCALES[i18n.language] ?? tr,
        });

  return (
    <SyncStaleBarBody
      health={health}
      lastSyncText={lastSyncText}
      detail={failed ? status : null}
      t={t}
      onRetry={() => void ghSync()}
      busy={syncing}
    />
  );
}

interface BodyProps {
  health: SyncHealth;
  lastSyncText: string;
  detail: string | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onRetry: () => void;
  busy: boolean;
}

/** Şeridin kendisi; store ve i18n'e bağlı değil (node testinde çizilir). */
export function SyncStaleBarBody({ health, lastSyncText, detail, t, onRetry, busy }: BodyProps) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  if (health === "ok") return null;
  const isError = health === "error";

  return (
    <div className={`lo-syncbar${isError ? " lo-syncbar--error" : ""}`} role="status">
      <div className="lo-syncbar__head">
        <AlertTriangle className="lo-syncbar__icon" size={15} strokeWidth={2} />
        <div className="lo-syncbar__text">
          <div>{t(isError ? "syncBar.failed" : "syncBar.stale")}</div>
          <div className="lo-syncbar__sub">{t("syncBar.lastSync", { when: lastSyncText })}</div>
        </div>
      </div>
      <div className="lo-syncbar__actions">
        <button type="button" className="lo-syncbar__btn" onClick={onRetry} disabled={busy}>
          {t("syncBar.retry")}
        </button>
        {isError && detail && (
          <button
            type="button"
            className="lo-syncbar__btn"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((v) => !v)}
          >
            {t("syncBar.details")}
          </button>
        )}
      </div>
      {isError && detail && (
        <code id={detailId} dir="ltr" hidden={!open} className="lo-syncbar__detail">
          {detail}
        </code>
      )}
    </div>
  );
}

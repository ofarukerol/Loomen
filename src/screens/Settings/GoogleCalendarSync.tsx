import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, RefreshCw, LogOut, AlertTriangle, Loader2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { isTauri } from "../../core/vault";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, mobileClientId, type GCalendar } from "../../core/google";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={"lo-switch" + (on ? " is-on" : "")} onClick={onClick} aria-pressed={on}>
      <span className="lo-switch__knob" />
    </button>
  );
}

function statusText(t: (k: string) => string, status: string | null): string | null {
  if (!status) return null;
  if (status === "synced") return t("gcal.synced");
  if (status === "needVault") return t("gcal.needVault");
  if (status === "needAuth") return t("gcal.needAuth");
  if (status === "noClientId") return t("gcal.noClientId");
  return status; // ham hata
}

/** Ayarlar → Google Takvim bölümü (çift yönlü senkron). */
export function GoogleCalendarSync() {
  const { t } = useTranslation();
  const tokens = useAppStore((s) => s.gcalTokens);
  const user = useAppStore((s) => s.gcalUser);
  const calendarId = useAppStore((s) => s.gcalCalendarId);
  const calendarName = useAppStore((s) => s.gcalCalendarName);
  const connecting = useAppStore((s) => s.gcalConnecting);
  const syncing = useAppStore((s) => s.gcalSyncing);
  const lastSync = useAppStore((s) => s.gcalLastSync);
  const status = useAppStore((s) => s.gcalStatus);
  const autoSync = useAppStore((s) => s.gcalAutoSync);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const connect = useAppStore((s) => s.gcalConnect);
  const disconnect = useAppStore((s) => s.gcalDisconnect);
  const loadCalendars = useAppStore((s) => s.gcalLoadCalendars);
  const selectCalendar = useAppStore((s) => s.gcalSelectCalendar);
  const sync = useAppStore((s) => s.gcalSync);
  const setAutoSync = useAppStore((s) => s.gcalSetAutoSync);
  const platformMobile = useAppStore((s) => s.platformMobile);
  const platformOs = useAppStore((s) => s.platformOs);

  const [calendars, setCalendars] = useState<GCalendar[]>([]);
  const tauri = isTauri();
  // Mobil: platforma özel (iOS/Android) client id yeter (secret yok). Masaüstü: client id + secret.
  const hasCreds = platformMobile
    ? !!mobileClientId(platformOs)
    : !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET;

  // Bağlıyken takvim listesini bir kez yükle.
  useEffect(() => {
    if (!tokens) return;
    let alive = true;
    void loadCalendars().then((cals) => {
      if (alive) setCalendars(cals);
    });
    return () => {
      alive = false;
    };
  }, [tokens, loadCalendars]);

  return (
    <>
      <div className="lo-set__section">{t("gcal.title")}</div>
      <div className="lo-card lo-set__card">
        {!tauri ? (
          <div className="lo-set__row">
            <div className="lo-set__rowsub">{t("gcal.desktopOnly")}</div>
          </div>
        ) : !tokens ? (
          <div className="lo-set__row">
            <div>
              <div className="lo-set__rowtitle">{t("gcal.connectTitle")}</div>
              <div className="lo-set__rowsub">{t("gcal.desc")}</div>
              {!hasCreds && (
                <div className="lo-gh__warn">
                  <AlertTriangle size={13} strokeWidth={2} />
                  {t("gcal.noClientId")}
                </div>
              )}
              {status && status !== "noClientId" && <div className="lo-gh__status">{statusText(t, status)}</div>}
            </div>
            <button className="lo-gh__connect" disabled={!hasCreds || connecting} onClick={() => void connect()}>
              {connecting ? (
                <Loader2 size={15} strokeWidth={2} className="lo-spin" />
              ) : (
                <CalendarDays size={15} strokeWidth={2} />
              )}
              {connecting ? t("gcal.connecting") : t("gcal.connect")}
            </button>
          </div>
        ) : (
          <>
            {/* Hesap */}
            <div className="lo-set__row lo-set__row--border">
              <div className="lo-gh__acct">
                {user?.picture && <img className="lo-gh__avatar" src={user.picture} alt="" />}
                <div>
                  <div className="lo-set__rowtitle">{user?.name || user?.email}</div>
                  <div className="lo-set__rowsub">{user?.email}</div>
                </div>
              </div>
              <button className="lo-gh__ghost" onClick={disconnect}>
                <LogOut size={14} strokeWidth={2} />
                {t("gcal.disconnect")}
              </button>
            </div>

            {/* Takvim seçimi */}
            <div className="lo-set__row lo-set__row--border">
              <div>
                <div className="lo-set__rowtitle">{t("gcal.calendar")}</div>
                <div className="lo-set__rowsub">{t("gcal.calendarSub")}</div>
              </div>
              <select
                className="lo-set__select"
                value={calendarId ?? "primary"}
                onChange={(e) => {
                  const cal = calendars.find((c) => c.id === e.target.value);
                  selectCalendar(e.target.value, cal?.summary ?? e.target.value);
                }}
              >
                {calendars.length === 0 && (
                  <option value={calendarId ?? "primary"}>{calendarName ?? t("gcal.primary")}</option>
                )}
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.primary ? `${c.summary} ★` : c.summary}
                  </option>
                ))}
              </select>
            </div>

            {/* Senkron */}
            <div className="lo-set__row lo-set__row--border">
              <div>
                <div className="lo-set__rowtitle">{t("gcal.syncTitle")}</div>
                <div className="lo-set__rowsub">
                  {t("gcal.lastSync")} {lastSync ? new Date(lastSync).toLocaleString("tr") : t("gcal.never")}
                </div>
                {status && <div className="lo-gh__status">{statusText(t, status)}</div>}
                {!vaultPath && <div className="lo-gh__warn">{t("gcal.needVault")}</div>}
              </div>
              <button className="lo-gh__connect" disabled={!vaultPath || syncing} onClick={() => void sync()}>
                <RefreshCw size={15} strokeWidth={2} className={syncing ? "lo-spin" : undefined} />
                {syncing ? t("gcal.syncing") : t("gcal.syncNow")}
              </button>
            </div>

            {/* Otomatik senkron */}
            <div className="lo-set__row">
              <div>
                <div className="lo-set__rowtitle">{t("gcal.autoSync")}</div>
                <div className="lo-set__rowsub">{t("gcal.autoSyncSub")}</div>
              </div>
              <Toggle on={autoSync} onClick={() => setAutoSync(!autoSync)} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

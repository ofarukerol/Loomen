import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Github, RefreshCw, LogOut, Copy, Check, X, AlertTriangle, Plus, ChevronDown } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { isTauri } from "../../core/vault";
import { useIsMobile } from "../../hooks/useIsMobile";
import { GITHUB_CLIENT_ID, type GhRepo } from "../../core/github";
import { RepoPickerSheet } from "./RepoPickerSheet";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={"lo-switch" + (on ? " is-on" : "")} onClick={onClick} aria-pressed={on}>
      <span className="lo-switch__knob" />
    </button>
  );
}

/** Device-flow bağlan modalı — kullanıcı kodunu gösterir ve onayı bekler. */
export function GitHubDeviceModal() {
  const { t } = useTranslation();
  const device = useAppStore((s) => s.ghDevice);
  const poll = useAppStore((s) => s.ghPoll);
  const cancel = useAppStore((s) => s.ghCancelAuth);
  const copyAndOpen = useAppStore((s) => s.ghCopyCodeAndOpen);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!device) return;
    setErr(null);
    setCopied(false);
    let stop = false;
    const id = setInterval(async () => {
      if (stop) return;
      try {
        const st = await poll();
        if (st === "ok") return; // device temizlendi, modal kapanır
        if (st === "access_denied") setErr(t("github.deviceDenied"));
        else if (st === "expired_token") setErr(t("github.deviceExpired"));
      } catch (e) {
        setErr(String(e));
      }
    }, Math.max(device.interval, 5) * 1000 + 500);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [device, poll, t]);

  if (!device) return null;

  return (
    <div className="lo-modal" onClick={cancel}>
      <div className="lo-ghdev" onClick={(e) => e.stopPropagation()}>
        <div className="lo-tdetail__head">
          <Github size={18} strokeWidth={1.9} />
          <span className="lo-tdetail__title">{t("github.deviceTitle")}</span>
          <button className="lo-tdetail__close" onClick={cancel} aria-label={t("github.cancel")}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <p className="lo-ghdev__step">{t("github.deviceStep")}</p>
        <div className="lo-ghdev__code">{device.user_code}</div>
        <p className="lo-ghdev__hint">{t("github.deviceCopyHint")}</p>

        <button
          className="lo-ghdev__open"
          onClick={() => {
            setCopied(true);
            void copyAndOpen();
          }}
        >
          {copied ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={2} />}
          {copied ? t("github.deviceCopied") : t("github.deviceCopyOpen")}
        </button>

        {err ? (
          <div className="lo-ghdev__err">
            <AlertTriangle size={14} strokeWidth={2} />
            {err}
          </div>
        ) : (
          <div className="lo-ghdev__wait">
            <RefreshCw size={14} strokeWidth={2} className="lo-spin" />
            {t("github.deviceWaiting")}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Mobil depo seçici — masaüstündeki "Kasalar" (VaultManager, klasör seçici içerir ve mobilde
 * gizli) yerine, tek mobil kasa için sade seç/oluştur kontrolü. GitHubSync içinde, depo
 * bağlanmamışken gösterilir. Native <select> yerine aranabilir sheet (RepoPickerSheet).
 */
function MobileRepoPicker({ vaultPath }: { vaultPath: string }) {
  const { t } = useTranslation();
  const setVaultRepo = useAppStore((s) => s.setVaultRepo);
  const createRepoForVault = useAppStore((s) => s.createRepoForVault);
  const loadRepos = useAppStore((s) => s.ghLoadRepos);

  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrivate, setNewPrivate] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadRepos().then(setRepos).catch(() => {});
  }, [loadRepos]);

  return (
    <div className="lo-set__row lo-set__row--border">
      <div style={{ width: "100%" }}>
        <div className="lo-set__rowtitle">{t("settings.vaultRepo")}</div>
        {creating ? (
          <div className="lo-vdetail__create">
            <input
              className="lo-gh__input"
              placeholder={t("github.repoName")}
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value.replace(/\s+/g, "-"))}
            />
            <label className="lo-gh__priv">
              <Toggle on={newPrivate} onClick={() => setNewPrivate((x) => !x)} />
              {t("github.private")}
            </label>
            <button
              className="lo-gh__connect"
              disabled={!newName.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await createRepoForVault(vaultPath, newName.trim(), newPrivate);
                  setCreating(false);
                  setNewName("");
                  setRepos(await loadRepos());
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check size={14} strokeWidth={2} />
              {t("github.create")}
            </button>
            <button className="lo-gh__ghost" onClick={() => setCreating(false)}>
              {t("github.cancel")}
            </button>
          </div>
        ) : (
          <div className="lo-vdetail__repoctl">
            <button className="lo-repopick__trigger" onClick={() => setPickerOpen(true)}>
              <Github size={15} strokeWidth={1.9} />
              <span className="lo-repopick__triggertext">{t("github.selectRepo")}</span>
              <ChevronDown size={15} strokeWidth={2} />
            </button>
            <button className="lo-gh__ghost" onClick={() => setCreating(true)}>
              <Plus size={14} strokeWidth={2} />
              {t("github.createRepo")}
            </button>
            <RepoPickerSheet
              repos={repos}
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              onSelect={(r) => setVaultRepo(vaultPath, r)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function statusText(t: (k: string) => string, status: string | null): string | null {
  if (!status) return null;
  if (status === "pushed") return t("github.pushed");
  if (status === "pulledPushed") return t("github.pulledPushed");
  if (status === "needVault") return t("github.needVault");
  return status; // ham hata
}

/** Ayarlar → GitHub Senkronizasyonu bölümü. */
export function GitHubSync() {
  const { t, i18n } = useTranslation();
  const token = useAppStore((s) => s.ghToken);
  const user = useAppStore((s) => s.ghUser);
  const repo = useAppStore((s) => s.ghRepo);
  const syncing = useAppStore((s) => s.ghSyncing);
  const lastSync = useAppStore((s) => s.ghLastSync);
  const status = useAppStore((s) => s.ghStatus);
  const autoSync = useAppStore((s) => s.ghAutoSync);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const beginAuth = useAppStore((s) => s.ghBeginAuth);
  const disconnect = useAppStore((s) => s.ghDisconnect);
  const sync = useAppStore((s) => s.ghSync);
  const setAutoSync = useAppStore((s) => s.ghSetAutoSync);

  const tauri = isTauri();
  const isMobile = useIsMobile();

  return (
    <>
      <div className="lo-set__section">{t("github.title")}</div>
      <div className="lo-card lo-set__card">
        {!tauri ? (
          <div className="lo-set__row">
            <div className="lo-set__rowsub">{t("github.desktopOnly")}</div>
          </div>
        ) : !token ? (
          <div className="lo-set__row">
            <div>
              <div className="lo-set__rowtitle">{t("github.connectTitle")}</div>
              <div className="lo-set__rowsub">{t("github.desc")}</div>
              {!GITHUB_CLIENT_ID && (
                <div className="lo-gh__warn">
                  <AlertTriangle size={13} strokeWidth={2} />
                  {t("github.noClientId")}
                </div>
              )}
            </div>
            <button
              className="lo-gh__connect"
              disabled={!GITHUB_CLIENT_ID}
              onClick={() => void beginAuth()}
            >
              <Github size={15} strokeWidth={2} />
              {t("github.connect")}
            </button>
          </div>
        ) : (
          <>
            {/* Hesap */}
            <div className="lo-set__row lo-set__row--border">
              <div className="lo-gh__acct">
                {user?.avatar_url && <img className="lo-gh__avatar" src={user.avatar_url} alt="" />}
                <div>
                  <div className="lo-set__rowtitle">{user?.name || user?.login}</div>
                  <div className="lo-set__rowsub">@{user?.login}</div>
                </div>
              </div>
              <button className="lo-gh__ghost" onClick={disconnect}>
                <LogOut size={14} strokeWidth={2} />
                {t("github.disconnect")}
              </button>
            </div>

            {/* Mobilde depo seçimi burada (Kasalar/VaultManager mobilde gizli — klasör seçici içerir). */}
            {isMobile && vaultPath && !repo && <MobileRepoPicker vaultPath={vaultPath} />}

            {/* Senkron — masaüstünde depo seçimi Kasalar bölümünden yapılır */}
            <div className="lo-set__row lo-set__row--border">
              <div>
                <div className="lo-set__rowtitle">{t("github.syncTitle")}</div>
                <div className="lo-set__rowsub">
                  {t("github.lastSync")}{" "}
                  {lastSync ? new Date(lastSync).toLocaleString(i18n.language) : t("github.never")}
                </div>
                {status && <div className="lo-gh__status">{statusText(t, status)}</div>}
                {!vaultPath ? (
                  <div className="lo-gh__warn">{t("github.needVault")}</div>
                ) : !repo ? (
                  !isMobile && <div className="lo-gh__warn">{t("github.repoInVaults")}</div>
                ) : (
                  <div className="lo-set__rowsub">{repo.full_name}</div>
                )}
              </div>
              <button
                className="lo-gh__connect"
                disabled={!repo || !vaultPath || syncing}
                onClick={() => void sync()}
              >
                <RefreshCw size={15} strokeWidth={2} className={syncing ? "lo-spin" : undefined} />
                {syncing ? t("github.syncing") : t("github.syncNow")}
              </button>
            </div>

            {/* Otomatik senkron */}
            <div className="lo-set__row">
              <div>
                <div className="lo-set__rowtitle">{t("github.autoSync")}</div>
                <div className="lo-set__rowsub">{t("github.autoSyncSub")}</div>
              </div>
              <Toggle on={autoSync} onClick={() => setAutoSync(!autoSync)} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

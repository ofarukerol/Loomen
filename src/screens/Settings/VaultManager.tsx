import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderPlus,
  Trash2,
  HardDrive,
  ChevronRight,
  ChevronDown,
  Check,
  Github,
  FolderOpen,
  Plus,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { isTauri } from "../../core/vault";
import type { GhRepo } from "../../core/github";
import { RepoPickerSheet } from "./RepoPickerSheet";

function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={"lo-switch" + (on ? " is-on" : "")} onClick={onClick} aria-pressed={on}>
      <span className="lo-switch__knob" />
    </button>
  );
}

/** Ayarlar → Kasalar: çoklu yerel kasa; her kasaya tıkla → detay (ad, yerel konum, git repo). */
export function VaultManager() {
  const { t } = useTranslation();
  const vaults = useAppStore((s) => s.vaults);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const token = useAppStore((s) => s.ghToken);
  const addVault = useAppStore((s) => s.addVault);
  const switchVault = useAppStore((s) => s.switchVault);
  const removeVault = useAppStore((s) => s.removeVault);
  const setVaultRepo = useAppStore((s) => s.setVaultRepo);
  const renameVault = useAppStore((s) => s.renameVault);
  const changeVaultPath = useAppStore((s) => s.changeVaultPath);
  const createRepoForVault = useAppStore((s) => s.createRepoForVault);
  const loadRepos = useAppStore((s) => s.ghLoadRepos);

  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Repo oluşturma formu / depo seçici sheet'i (hangi kasa için — aynı anda tek kasa).
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPrivate, setNewPrivate] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) loadRepos().then(setRepos).catch(() => {});
  }, [token, loadRepos]);

  const tauri = isTauri();

  // Aynı anda tek sheet açık olabilir — pickerOpenFor'a ait kasanın seçeneklerini (pinned + repos) üret.
  const pickerVault = vaults.find((v) => v.path === pickerOpenFor);
  const pickerOpts = pickerVault
    ? pickerVault.repo && !repos.some((r) => r.full_name === pickerVault.repo!.full_name)
      ? [pickerVault.repo, ...repos]
      : repos
    : [];

  return (
    <>
      <div className="lo-set__section">{t("settings.vaults")}</div>
      <div className="lo-card lo-set__card">
        {vaults.length === 0 ? (
          <div className="lo-set__tplempty">{t("settings.noVaults")}</div>
        ) : (
          vaults.map((v, i) => {
            const active = v.path === vaultPath;
            const open = expanded === v.path;
            const display = v.name || folderName(v.path);
            return (
              <div
                className={"lo-vault" + (i < vaults.length - 1 || open ? " lo-set__row--border" : "")}
                key={v.path}
              >
                <button
                  className="lo-vault__head"
                  onClick={() => {
                    setExpanded(open ? null : v.path);
                    setCreatingFor(null);
                  }}
                >
                  <ChevronRight
                    className="lo-vault__chev"
                    size={15}
                    strokeWidth={2}
                    style={{ transform: open ? "rotate(90deg)" : "none" }}
                  />
                  <span className={"lo-vault__dot" + (active ? " is-active" : "")}>
                    <HardDrive size={15} strokeWidth={1.8} />
                  </span>
                  <span className="lo-vault__info">
                    <span className="lo-vault__name">
                      {display}
                      {active && <span className="lo-vault__badge">{t("settings.activeVault")}</span>}
                    </span>
                    <span className="lo-vault__path">{v.path}</span>
                  </span>
                  {v.repo && <Github className="lo-vault__gh" size={14} strokeWidth={1.9} />}
                </button>

                {open && (
                  <div className="lo-vdetail">
                    {/* Ad */}
                    <label className="lo-vdetail__row">
                      <span className="lo-vdetail__label">{t("settings.vaultName")}</span>
                      <input
                        className="lo-gh__input"
                        value={v.name ?? ""}
                        placeholder={folderName(v.path)}
                        onChange={(e) => renameVault(v.path, e.target.value)}
                      />
                    </label>

                    {/* Yerel konum */}
                    <div className="lo-vdetail__row">
                      <span className="lo-vdetail__label">{t("settings.vaultLocation")}</span>
                      <div className="lo-vdetail__pathline">
                        <span className="lo-vdetail__path">{v.path}</span>
                        <button
                          className="lo-set__change"
                          disabled={!tauri}
                          onClick={() => void changeVaultPath(v.path)}
                        >
                          <FolderOpen size={14} strokeWidth={1.9} />
                          {t("settings.change")}
                        </button>
                      </div>
                    </div>

                    {/* GitHub deposu */}
                    <div className="lo-vdetail__row">
                      <span className="lo-vdetail__label">{t("settings.vaultRepo")}</span>
                      {!token ? (
                        <span className="lo-vdetail__hint">{t("settings.connectGhFirst")}</span>
                      ) : creatingFor === v.path ? (
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
                                await createRepoForVault(v.path, newName.trim(), newPrivate);
                                setCreatingFor(null);
                                setNewName("");
                                const r = await loadRepos();
                                setRepos(r);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <Check size={14} strokeWidth={2} />
                            {t("github.create")}
                          </button>
                          <button className="lo-gh__ghost" onClick={() => setCreatingFor(null)}>
                            {t("github.cancel")}
                          </button>
                        </div>
                      ) : (
                        <div className="lo-vdetail__repoctl">
                          <button className="lo-repopick__trigger" onClick={() => setPickerOpenFor(v.path)}>
                            <Github size={15} strokeWidth={1.9} />
                            <span className="lo-repopick__triggertext">
                              {v.repo?.full_name ?? t("settings.noRepo")}
                            </span>
                            <ChevronDown size={15} strokeWidth={2} />
                          </button>
                          <button
                            className="lo-gh__ghost"
                            onClick={() => {
                              setCreatingFor(v.path);
                              setNewName("");
                            }}
                          >
                            <Plus size={14} strokeWidth={2} />
                            {t("github.createRepo")}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Aksiyonlar */}
                    <div className="lo-vdetail__actions">
                      {!active && (
                        <button className="lo-gh__connect" onClick={() => void switchVault(v.path)}>
                          <Check size={14} strokeWidth={2} />
                          {t("settings.switchVault")}
                        </button>
                      )}
                      <button
                        className="lo-vdetail__del"
                        onClick={() => {
                          void removeVault(v.path);
                          setExpanded(null);
                        }}
                      >
                        <Trash2 size={14} strokeWidth={1.9} />
                        {t("settings.removeVault")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <button className="lo-vault__add" onClick={() => void addVault()} disabled={!tauri}>
          <FolderPlus size={15} strokeWidth={1.9} />
          {t("settings.addVault")}
        </button>
        {!tauri && <div className="lo-vault__hint">{t("github.desktopOnly")}</div>}
      </div>

      <RepoPickerSheet
        repos={pickerOpts}
        open={pickerOpenFor != null}
        onClose={() => setPickerOpenFor(null)}
        onSelect={(r) => {
          if (pickerOpenFor) setVaultRepo(pickerOpenFor, r);
        }}
      />
    </>
  );
}

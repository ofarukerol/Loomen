import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderPlus, Trash2, HardDrive } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { isTauri } from "../../core/vault";
import type { GhRepo } from "../../core/github";

function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

/** Ayarlar → Kasalar: birden fazla yerel kasa + her birine git reposu. */
export function VaultManager() {
  const { t } = useTranslation();
  const vaults = useAppStore((s) => s.vaults);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const token = useAppStore((s) => s.ghToken);
  const addVault = useAppStore((s) => s.addVault);
  const switchVault = useAppStore((s) => s.switchVault);
  const removeVault = useAppStore((s) => s.removeVault);
  const setVaultRepo = useAppStore((s) => s.setVaultRepo);
  const loadRepos = useAppStore((s) => s.ghLoadRepos);
  const [repos, setRepos] = useState<GhRepo[]>([]);

  useEffect(() => {
    if (token) loadRepos().then(setRepos).catch(() => {});
  }, [token, loadRepos]);

  const tauri = isTauri();

  return (
    <>
      <div className="lo-set__section">{t("settings.vaults")}</div>
      <div className="lo-card lo-set__card">
        {vaults.length === 0 ? (
          <div className="lo-set__tplempty">{t("settings.noVaults")}</div>
        ) : (
          vaults.map((v, i) => {
            const active = v.path === vaultPath;
            // Kayıtlı repo henüz listede yoksa (yüklenmedi/silindi) seçenek olarak ekle.
            const opts =
              v.repo && !repos.some((r) => r.full_name === v.repo!.full_name)
                ? [v.repo, ...repos]
                : repos;
            return (
              <div
                className={"lo-vault" + (i < vaults.length - 1 ? " lo-set__row--border" : "")}
                key={v.path}
              >
                <button
                  className="lo-vault__main"
                  onClick={() => {
                    if (!active) void switchVault(v.path);
                  }}
                  title={active ? "" : t("settings.switchVault")}
                >
                  <span className={"lo-vault__dot" + (active ? " is-active" : "")}>
                    <HardDrive size={15} strokeWidth={1.8} />
                  </span>
                  <span className="lo-vault__info">
                    <span className="lo-vault__name">
                      {folderName(v.path)}
                      {active && <span className="lo-vault__badge">{t("settings.activeVault")}</span>}
                    </span>
                    <span className="lo-vault__path">{v.path}</span>
                  </span>
                </button>
                <div className="lo-vault__ctl">
                  {token && (
                    <select
                      className="lo-set__select lo-vault__repo"
                      value={v.repo?.full_name ?? ""}
                      onChange={(e) => {
                        const r = opts.find((x) => x.full_name === e.target.value) ?? null;
                        setVaultRepo(v.path, r);
                      }}
                    >
                      <option value="">{t("settings.noRepo")}</option>
                      {opts.map((r) => (
                        <option key={r.full_name} value={r.full_name}>
                          {r.full_name}
                          {r.private ? " 🔒" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    className="lo-vault__del"
                    onClick={() => void removeVault(v.path)}
                    title={t("settings.removeVault")}
                  >
                    <Trash2 size={14} strokeWidth={1.9} />
                  </button>
                </div>
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
    </>
  );
}

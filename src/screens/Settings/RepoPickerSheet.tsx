import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Github, Search, Lock } from "lucide-react";
import type { GhRepo } from "../../core/github";

/**
 * Aranabilir depo seçici — alttan açılan sheet (bkz MobileTabsSheet ile aynı .lo-sheet deseni).
 * Masaüstü (VaultManager, çoklu kasa) ve mobil (GitHubSync, tek kasa) tarafından paylaşılır.
 */
export function RepoPickerSheet({
  repos,
  open,
  onClose,
  onSelect,
}: {
  repos: GhRepo[];
  open: boolean;
  onClose: () => void;
  onSelect: (r: GhRepo) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.full_name.toLowerCase().includes(q));
  }, [repos, query]);

  return (
    <>
      <div className={"lo-scrim" + (open ? " is-open" : "")} onClick={onClose} />
      <div className={"lo-sheet" + (open ? " is-open" : "")} role="dialog" aria-hidden={!open}>
        <div className="lo-sheet__grip" />
        <div className="lo-repopick__search">
          <Search size={15} strokeWidth={2} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("github.searchRepo")}
            autoFocus
          />
        </div>
        <div className="lo-sheet__list">
          {filtered.length === 0 && <div className="lo-sheet__empty">{t("github.noRepoMatch")}</div>}
          {filtered.map((r) => (
            <div
              key={r.full_name}
              className="lo-sheet__row"
              onClick={() => {
                onSelect(r);
                onClose();
              }}
            >
              <Github size={16} strokeWidth={1.7} />
              <span className="lo-sheet__name">{r.full_name}</span>
              {r.private && <Lock size={13} strokeWidth={2} className="lo-repopick__lock" />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

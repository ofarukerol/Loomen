import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Folder, FileText, Clock, FolderOpen, PanelLeftClose } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { VaultNote } from "../core/vault/types";
import { searchNotes } from "../core/search/search";

function FileItem({ note }: { note: VaultNote }) {
  const openNote = useAppStore((s) => s.openNote);
  return (
    <button className="lo-tree__file" onClick={() => openNote(note.name)}>
      <FileText size={14} strokeWidth={1.7} color="var(--fg3)" />
      {note.name}
    </button>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="lo-tree__group">
      <ChevronRight size={14} strokeWidth={2} />
      <Folder size={15} strokeWidth={1.8} color="var(--accent-2)" />
      {label}
    </div>
  );
}

export function Explorer() {
  const { t } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const contents = useAppStore((s) => s.noteContents);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const openVault = useAppStore((s) => s.openVault);
  const openNote = useAppStore((s) => s.openNote);
  const toggleLeft = useAppStore((s) => s.toggleLeft);
  const [query, setQuery] = useState("");
  const hits = searchNotes(notes, contents, query);

  // Klasöre göre grupla
  const byFolder = new Map<string, VaultNote[]>();
  for (const n of notes) {
    if (!byFolder.has(n.folder)) byFolder.set(n.folder, []);
    byFolder.get(n.folder)!.push(n);
  }
  const rootFiles = (byFolder.get("") ?? []).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const folders = [...byFolder.keys()].filter((f) => f !== "").sort((a, b) => a.localeCompare(b, "tr"));

  const pathLabel = vaultPath ? "~/" + vaultPath.split("/").filter(Boolean).pop() : "~/Loomen (örnek)";

  return (
    <div className="lo-explorer">
      <div className="lo-explorer__head">
        <span className="lo-explorer__title">{t("explorer.vault")}</span>
        <div className="lo-explorer__actions">
          <button className="lo-explorer__open" title="Kasa klasörü aç" onClick={() => void openVault()}>
            <FolderOpen size={14} strokeWidth={1.8} />
          </button>
          <button className="lo-explorer__open" title={t("planner.toggleLeft")} onClick={toggleLeft}>
            <PanelLeftClose size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <div className="lo-explorer__pathline">{pathLabel}</div>

      <div className="lo-explorer__searchwrap">
        <div className="lo-search">
          <Search size={15} strokeWidth={2} color="var(--fg3)" />
          <input
            placeholder={t("explorer.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button className="lo-search__clear" onClick={() => setQuery("")} aria-label="Temizle">
              ✕
            </button>
          ) : (
            <kbd className="lo-kbd">⌘K</kbd>
          )}
        </div>
      </div>

      {query ? (
        <div className="lo-tree lo-scroll">
          <div className="lo-search__count">
            {t("explorer.results", { count: hits.length })}
          </div>
          {hits.map((h) => (
            <button className="lo-search__hit" key={h.path} onClick={() => openNote(h.path)}>
              <div className="lo-search__hitname">
                <FileText size={13} strokeWidth={1.7} color="var(--accent)" />
                {h.name}
              </div>
              {h.snippet && <div className="lo-search__hitsnip">{h.snippet}</div>}
            </button>
          ))}
        </div>
      ) : (
        <div className="lo-tree lo-scroll">
          {rootFiles.map((n) => (
            <FileItem note={n} key={n.path} />
          ))}
          {folders.map((folder) => (
            <div key={folder}>
              <GroupHeader label={folder} />
              {byFolder
                .get(folder)!
                .sort((a, b) => a.name.localeCompare(b.name, "tr"))
                .map((n) => (
                  <FileItem note={n} key={n.path} />
                ))}
            </div>
          ))}
        </div>
      )}

      <div className="lo-explorer__foot">
        <Clock size={13} strokeWidth={2} />
        {t("explorer.localNoSync")}
      </div>
    </div>
  );
}

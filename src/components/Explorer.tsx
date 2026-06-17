import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Folder, FileText, Clock, FolderOpen } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { VaultNote } from "../core/vault/types";

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
  const vaultPath = useAppStore((s) => s.vaultPath);
  const openVault = useAppStore((s) => s.openVault);

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
        <button
          className="lo-explorer__open"
          title="Kasa klasörü aç"
          onClick={() => void openVault()}
        >
          <FolderOpen size={14} strokeWidth={1.8} />
        </button>
      </div>
      <div className="lo-explorer__pathline">{pathLabel}</div>

      <div className="lo-explorer__searchwrap">
        <div className="lo-search">
          <Search size={15} strokeWidth={2} color="var(--fg3)" />
          <input placeholder={t("explorer.search")} />
          <kbd className="lo-kbd">⌘K</kbd>
        </div>
      </div>

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

      <div className="lo-explorer__foot">
        <Clock size={13} strokeWidth={2} />
        {t("explorer.localNoSync")}
      </div>
    </div>
  );
}

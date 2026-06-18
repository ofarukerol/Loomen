import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, ChevronDown, Folder, FileText, Clock, FolderOpen, PanelLeftClose } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { VaultNote } from "../core/vault/types";
import { searchNotes } from "../core/search/search";

/** Klasör ağacı düğümü (iç içe). */
interface TreeNode {
  name: string;
  path: string; // tam klasör yolu ("" = kök)
  folders: Map<string, TreeNode>;
  files: VaultNote[];
}

/** Düz not listesinden iç içe klasör ağacı kur. */
function buildTree(notes: VaultNote[]): TreeNode {
  const root: TreeNode = { name: "", path: "", folders: new Map(), files: [] };
  for (const note of notes) {
    const segments = note.folder ? note.folder.split("/") : [];
    let cur = root;
    let acc = "";
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      let child = cur.folders.get(seg);
      if (!child) {
        child = { name: seg, path: acc, folders: new Map(), files: [] };
        cur.folders.set(seg, child);
      }
      cur = child;
    }
    cur.files.push(note);
  }
  return root;
}

function FileItem({ note, depth }: { note: VaultNote; depth: number }) {
  const openNote = useAppStore((s) => s.openNote);
  const activeNote = useAppStore((s) => s.activeNote);
  return (
    <button
      className={"lo-tree__file" + (activeNote === note.path ? " is-active" : "")}
      style={{ paddingInlineStart: 10 + depth * 14 }}
      onClick={() => openNote(note.path)}
    >
      <FileText size={14} strokeWidth={1.7} color="var(--fg3)" />
      {note.name}
    </button>
  );
}

function FolderNode({
  node,
  depth,
  collapsed,
  toggle,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (path: string) => void;
}) {
  const open = !collapsed.has(node.path);
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  return (
    <div>
      <button
        className="lo-tree__group"
        style={{ paddingInlineStart: 8 + depth * 14 }}
        onClick={() => toggle(node.path)}
      >
        {open ? (
          <ChevronDown size={14} strokeWidth={2} />
        ) : (
          <ChevronRight size={14} strokeWidth={2} />
        )}
        <Folder size={15} strokeWidth={1.8} color="var(--accent-2)" />
        {node.name}
      </button>
      {open && (
        <>
          {folders.map((f) => (
            <FolderNode key={f.path} node={f} depth={depth + 1} collapsed={collapsed} toggle={toggle} />
          ))}
          {files.map((n) => (
            <FileItem note={n} depth={depth + 1} key={n.path} />
          ))}
        </>
      )}
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const hits = searchNotes(notes, contents, query);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const root = buildTree(notes);
  const rootFolders = [...root.folders.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const rootFiles = [...root.files].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const pathLabel = vaultPath ? "~/" + vaultPath.split("/").filter(Boolean).pop() : "~/Loomen (örnek)";

  return (
    <div className="lo-explorer">
      <div className="lo-explorer__head">
        <span className="lo-explorer__title">{t("explorer.vault")}</span>
        <div className="lo-explorer__actions">
          <button className="lo-explorer__open" title="Kasa klasörü aç" onClick={() => void openVault()}>
            <FolderOpen size={14} strokeWidth={1.8} />
          </button>
          <button
            className="lo-explorer__open lo-explorer__collapse"
            title={t("planner.toggleLeft")}
            onClick={toggleLeft}
          >
            <PanelLeftClose size={17} strokeWidth={1.9} />
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
          {rootFolders.map((f) => (
            <FolderNode key={f.path} node={f} depth={0} collapsed={collapsed} toggle={toggle} />
          ))}
          {rootFiles.map((n) => (
            <FileItem note={n} depth={0} key={n.path} />
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

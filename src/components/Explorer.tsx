import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { tr, enUS, ar } from "date-fns/locale";
import {
  Search,
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  Clock,
  SquarePen,
  FolderPlus,
  ChevronsDownUp,
  PanelLeftClose,
  Pencil,
  FilePlus,
  Cloud,
  RefreshCw,
  Shapes,
  Star,
  CalendarDays,
  LayoutTemplate,
  HardDrive,
  Check,
  Trash2,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { VaultNote } from "../core/vault/types";
import { TEMPLATES_DIR, DRAW_DIR, DAILY_DIR } from "../core/vault";
import { searchNotes } from "../core/search/search";
import { TrashModal } from "./TrashModal";

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

type Renaming = { kind: "file" | "folder"; path: string } | null;
type Menu = { x: number; y: number; kind: "file" | "folder"; path: string } | null;

interface RowCtx {
  onContext: (e: React.MouseEvent, kind: "file" | "folder", path: string) => void;
  renaming: Renaming;
  commit: (value: string) => void;
  cancel: () => void;
}

/** Satır-içi yeniden adlandırma kutusu. */
function RenameInput({
  initial,
  depth,
  kind,
  commit,
  cancel,
}: {
  initial: string;
  depth: number;
  kind: "file" | "folder";
  commit: (v: string) => void;
  cancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div
      className={"lo-rename " + (kind === "folder" ? "lo-rename--folder" : "lo-rename--file")}
      style={{ paddingInlineStart: (kind === "folder" ? 8 : 10) + depth * 14 }}
    >
      {kind === "folder" ? (
        <Folder size={15} strokeWidth={1.8} color="var(--accent-2)" />
      ) : (
        <FileText size={14} strokeWidth={1.7} color="var(--fg3)" />
      )}
      <input
        ref={ref}
        className="lo-rename__input"
        defaultValue={initial}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          else if (e.key === "Escape") cancel();
        }}
        onBlur={(e) => commit(e.target.value)}
      />
    </div>
  );
}

function FileItem({ note, depth, ctx }: { note: VaultNote; depth: number; ctx: RowCtx }) {
  const openNote = useAppStore((s) => s.openNote);
  const activeNote = useAppStore((s) => s.activeNote);
  if (ctx.renaming?.kind === "file" && ctx.renaming.path === note.path) {
    return (
      <RenameInput initial={note.name} depth={depth} kind="file" commit={ctx.commit} cancel={ctx.cancel} />
    );
  }
  return (
    <button
      className={"lo-tree__file" + (activeNote === note.path ? " is-active" : "")}
      style={{ paddingInlineStart: 10 + depth * 14 }}
      onClick={() => openNote(note.path)}
      onContextMenu={(e) => ctx.onContext(e, "file", note.path)}
    >
      {note.kind === "draw" ? (
        <Shapes size={14} strokeWidth={1.7} color="var(--accent-2)" />
      ) : (
        <FileText size={14} strokeWidth={1.7} color="var(--fg3)" />
      )}
      {note.name}
    </button>
  );
}

function FolderNode({
  node,
  depth,
  collapsed,
  toggle,
  ctx,
  variant,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (path: string) => void;
  ctx: RowCtx;
  variant?: "tpl" | "draw" | "daily";
}) {
  const open = !collapsed.has(node.path);
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const isRenaming = ctx.renaming?.kind === "folder" && ctx.renaming.path === node.path;
  return (
    <div>
      {isRenaming ? (
        <RenameInput initial={node.name} depth={depth} kind="folder" commit={ctx.commit} cancel={ctx.cancel} />
      ) : (
        <button
          className={
            "lo-tree__group" + (variant ? " lo-tree__group--pin" : "") + (variant === "daily" ? " lo-tree__group--pin-daily" : "")
          }
          style={{ paddingInlineStart: 8 + depth * 14 }}
          onClick={() => toggle(node.path)}
          onContextMenu={(e) => ctx.onContext(e, "folder", node.path)}
        >
          {open ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
          {variant === "daily" ? (
            <CalendarDays size={15} strokeWidth={1.8} color="var(--daily)" />
          ) : variant === "tpl" ? (
            <LayoutTemplate size={15} strokeWidth={1.8} color="var(--accent-2)" />
          ) : variant === "draw" ? (
            <Shapes size={15} strokeWidth={1.8} color="var(--accent-2)" />
          ) : (
            <Folder size={15} strokeWidth={1.8} color="var(--accent-2)" />
          )}
          {node.name}
        </button>
      )}
      {open && (
        <>
          {folders.map((f) => (
            <FolderNode key={f.path} node={f} depth={depth + 1} collapsed={collapsed} toggle={toggle} ctx={ctx} />
          ))}
          {files.map((n) => (
            <FileItem note={n} depth={depth + 1} key={n.path} ctx={ctx} />
          ))}
        </>
      )}
    </div>
  );
}

const SYNC_LOCALES: Record<string, typeof tr> = { tr, en: enUS, ar };
const KNOWN_SYNC = new Set(["pushed", "pulledPushed", "needVault"]);

export function Explorer() {
  const { t, i18n } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const contents = useAppStore((s) => s.noteContents);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const vaults = useAppStore((s) => s.vaults);
  const switchVault = useAppStore((s) => s.switchVault);
  const openNote = useAppStore((s) => s.openNote);
  const newNote = useAppStore((s) => s.newNote);
  const newFolder = useAppStore((s) => s.newFolder);
  const renameNote = useAppStore((s) => s.renameNote);
  const renameFolder = useAppStore((s) => s.renameFolder);
  const deleteNote = useAppStore((s) => s.deleteNote);
  const trashCount = useAppStore((s) => s.trash.length);
  const toggleLeft = useAppStore((s) => s.toggleLeft);
  const ghToken = useAppStore((s) => s.ghToken);
  const ghRepo = useAppStore((s) => s.ghRepo);
  const ghSyncing = useAppStore((s) => s.ghSyncing);
  const ghLastSync = useAppStore((s) => s.ghLastSync);
  const ghStatus = useAppStore((s) => s.ghStatus);
  const ghSync = useAppStore((s) => s.ghSync);
  const openVault = useAppStore((s) => s.openVault);
  const favorites = useAppStore((s) => s.favorites);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const activeNote = useAppStore((s) => s.activeNote);
  const [query, setQuery] = useState("");
  const [favOpen, setFavOpen] = useState(true);
  // Sabit özel klasörler (Günlük / Çizimler / Şablonlar) varsayılan KAPALI gelir.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set([DAILY_DIR, DRAW_DIR, TEMPLATES_DIR]));
  const [menu, setMenu] = useState<Menu>(null);
  const [renaming, setRenaming] = useState<Renaming>(null);
  const [vaultMenu, setVaultMenu] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const hits = searchNotes(notes, contents, query);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  // Tüm klasör yollarını (ara seviyeler dahil) topla — hepsini daralt/genişlet için.
  const allFolderPaths = () => {
    const set = new Set<string>();
    for (const n of notes) {
      if (!n.folder) continue;
      let acc = "";
      for (const seg of n.folder.split("/")) {
        acc = acc ? `${acc}/${seg}` : seg;
        set.add(acc);
      }
    }
    return set;
  };
  const collapseAll = () => setCollapsed((prev) => (prev.size > 0 ? new Set() : allFolderPaths()));

  // Menü açıkken dışarı tıklamada kapat.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  // Kasa seçici açıkken dışarı tıklamada kapat.
  useEffect(() => {
    if (!vaultMenu) return;
    const close = () => setVaultMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [vaultMenu]);

  const onContext = (e: React.MouseEvent, kind: "file" | "folder", path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, kind, path });
  };
  const ctx: RowCtx = {
    onContext,
    renaming,
    commit: (value) => {
      const r = renaming;
      setRenaming(null);
      if (!r) return;
      if (r.kind === "file") void renameNote(r.path, value);
      else void renameFolder(r.path, value);
    },
    cancel: () => setRenaming(null),
  };

  const folderName = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
  const activeVault = vaults.find((v) => v.path === vaultPath);
  const vaultTitle = activeVault?.name || (vaultPath ? folderName(vaultPath) : t("explorer.vault"));
  const hasMultipleVaults = vaults.length > 1;

  const root = buildTree(notes);
  // Günlük klasörü normal ağaçtan ayrılır; en BAŞTA (Çizimler'in üstünde) ayrı soft renkle sabitlenir.
  const dailyFolder = root.folders.get(DAILY_DIR);
  // Çizimler klasörü normal ağaçtan ayrılır; Günlük'ün altında ayrı (soft) stille sabitlenir.
  const drawFolder = root.folders.get(DRAW_DIR);
  // Şablonlar klasörü normal ağaçtan ayrılır; en alta ayrı stille sabitlenir.
  const tplFolder = root.folders.get(TEMPLATES_DIR);
  const rootFolders = [...root.folders.values()]
    .filter((f) => f.name !== TEMPLATES_DIR && f.name !== DRAW_DIR && f.name !== DAILY_DIR)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const rootFiles = [...root.files].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const pathLabel = vaultPath ? "~/" + vaultPath.split("/").filter(Boolean).pop() : "~/Loomen (örnek)";

  // Favori notları çöz (silinmiş yolları at).
  const favNotes = favorites
    .map((p) => notes.find((n) => n.path === p))
    .filter((n): n is VaultNote => !!n);

  return (
    <div className="lo-explorer">
      {/* Üst araç şeridi — başlık-çubuğu hizasında, sürüklenebilir */}
      <div className="lo-explorer__bar" data-tauri-drag-region>
        <div className="lo-explorer__actions">
          <button className="lo-explorer__open" title={t("explorer.newNote")} onClick={() => void newNote()}>
            <SquarePen size={16} strokeWidth={1.8} />
          </button>
          <button className="lo-explorer__open" title={t("explorer.newFolder")} onClick={() => void newFolder()}>
            <FolderPlus size={16} strokeWidth={1.8} />
          </button>
          <button className="lo-explorer__open" title={t("explorer.collapseAll")} onClick={collapseAll}>
            <ChevronsDownUp size={16} strokeWidth={1.8} />
          </button>
          <button
            className="lo-explorer__open lo-explorer__trash"
            title={t("trash.title")}
            onClick={() => setTrashOpen(true)}
          >
            <Trash2 size={16} strokeWidth={1.8} />
            {trashCount > 0 && <span className="lo-explorer__trashbadge">{trashCount}</span>}
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
      <div className="lo-explorer__head">
        <button
          className={"lo-explorer__vaultbtn" + (hasMultipleVaults ? " is-switchable" : "")}
          disabled={!hasMultipleVaults}
          onClick={(e) => {
            e.stopPropagation();
            setVaultMenu((v) => !v);
          }}
          title={hasMultipleVaults ? t("explorer.switchVault") : undefined}
        >
          <span className="lo-explorer__title">{vaultTitle}</span>
          {hasMultipleVaults && (
            <ChevronDown
              className="lo-explorer__vchev"
              size={14}
              strokeWidth={2}
              style={{ transform: vaultMenu ? "rotate(180deg)" : "none" }}
            />
          )}
        </button>
        <span className="lo-explorer__pathline">{pathLabel}</span>

        {vaultMenu && (
          <div className="lo-vaultmenu" onClick={(e) => e.stopPropagation()}>
            {vaults.map((v) => {
              const active = v.path === vaultPath;
              return (
                <button
                  key={v.path}
                  className={"lo-vaultmenu__item" + (active ? " is-active" : "")}
                  onClick={() => {
                    setVaultMenu(false);
                    if (!active) void switchVault(v.path);
                  }}
                >
                  <HardDrive size={14} strokeWidth={1.8} />
                  <span className="lo-vaultmenu__name">{v.name || folderName(v.path)}</span>
                  {active && <Check size={14} strokeWidth={2.2} className="lo-vaultmenu__check" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="lo-explorer__searchwrap">
        <div className="lo-search">
          <Search size={15} strokeWidth={2} color="var(--fg3)" />
          <input placeholder={t("explorer.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query ? (
            <button className="lo-search__clear" onClick={() => setQuery("")} aria-label={t("explorer.clearSearch")}>
              ✕
            </button>
          ) : (
            <kbd className="lo-kbd">⌘K</kbd>
          )}
        </div>
      </div>

      {!query && favNotes.length > 0 && (
        <div className="lo-fav">
          <button className="lo-fav__head" onClick={() => setFavOpen((v) => !v)}>
            <ChevronDown
              size={13}
              strokeWidth={2.2}
              style={{ transform: favOpen ? "none" : "rotate(-90deg)", transition: "transform .12s" }}
            />
            <Star size={12} strokeWidth={2} fill="var(--accent-2)" color="var(--accent-2)" />
            {t("explorer.favorites")}
          </button>
          {favOpen &&
            favNotes.map((n) => (
              <button
                key={n.path}
                className={"lo-fav__item" + (activeNote === n.path ? " is-active" : "")}
                onClick={() => openNote(n.path)}
                onContextMenu={(e) => onContext(e, "file", n.path)}
              >
                {n.kind === "draw" ? (
                  <Shapes size={13} strokeWidth={1.7} color="var(--accent-2)" />
                ) : (
                  <FileText size={13} strokeWidth={1.7} color="var(--fg3)" />
                )}
                {n.name}
              </button>
            ))}
        </div>
      )}

      {/* Günlük — en başta sabit, ayrı soft renk (teal) bölüm */}
      {!query && dailyFolder && (
        <div className="lo-explorer__daily lo-scroll">
          <FolderNode
            node={dailyFolder}
            depth={0}
            collapsed={collapsed}
            toggle={toggle}
            ctx={ctx}
            variant="daily"
          />
        </div>
      )}

      {/* Çizimler — Günlük'ün altında sabit, belirgin (soft) bölüm */}
      {!query && drawFolder && (
        <div className="lo-explorer__draw lo-scroll">
          <FolderNode
            node={drawFolder}
            depth={0}
            collapsed={collapsed}
            toggle={toggle}
            ctx={ctx}
            variant="draw"
          />
        </div>
      )}

      {query ? (
        <div className="lo-tree lo-scroll">
          <div className="lo-search__count">{t("explorer.results", { count: hits.length })}</div>
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
            <FolderNode key={f.path} node={f} depth={0} collapsed={collapsed} toggle={toggle} ctx={ctx} />
          ))}
          {rootFiles.map((n) => (
            <FileItem note={n} depth={0} key={n.path} ctx={ctx} />
          ))}
        </div>
      )}

      {/* Şablonlar — klasörlerin en altında sabit, belirgin bölüm (kaydırmadan ayrı) */}
      {!query && tplFolder && (
        <div className="lo-explorer__tpl lo-scroll">
          <FolderNode
            node={tplFolder}
            depth={0}
            collapsed={collapsed}
            toggle={toggle}
            ctx={ctx}
            variant="tpl"
          />
        </div>
      )}

      <div className="lo-explorer__foot">
        {!ghToken ? (
          <span className="lo-foot__label">
            <Clock size={13} strokeWidth={2} />
            {t("explorer.localNoSync")}
          </span>
        ) : (
          <>
            <span className="lo-foot__label">
              {ghSyncing ? (
                <RefreshCw size={13} strokeWidth={2} className="lo-spin" />
              ) : (
                <Cloud size={13} strokeWidth={2} color="var(--accent-2)" />
              )}
              {ghRepo ? ghRepo.name : t("github.selectRepo")}
            </span>

            {ghRepo && (
              <span className="lo-foot__right">
                {!vaultPath ? (
                  <button className="lo-foot__hint" onClick={() => void openVault()}>
                    {t("github.selectVault")}
                  </button>
                ) : (
                  <>
                    {ghStatus && !KNOWN_SYNC.has(ghStatus) ? (
                      <span className="lo-foot__time is-error" title={ghStatus}>
                        {t("syncStatus.error")}
                      </span>
                    ) : (
                      ghLastSync &&
                      !ghSyncing && (
                        <span className="lo-foot__time">
                          {formatDistanceToNow(new Date(ghLastSync), {
                            addSuffix: true,
                            locale: SYNC_LOCALES[i18n.language] ?? tr,
                          })}
                        </span>
                      )
                    )}
                    <button
                      className="lo-foot__sync"
                      title={t("github.syncNow")}
                      disabled={ghSyncing}
                      onClick={() => void ghSync()}
                    >
                      <RefreshCw size={13} strokeWidth={2} className={ghSyncing ? "lo-spin" : undefined} />
                    </button>
                  </>
                )}
              </span>
            )}
          </>
        )}
      </div>

      {/* Sağ-tık bağlam menüsü */}
      {menu && (
        <div
          className="lo-ctxmenu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="lo-ctxmenu__item"
            onClick={() => {
              setRenaming({ kind: menu.kind, path: menu.path });
              setMenu(null);
            }}
          >
            <Pencil size={13} strokeWidth={1.9} />
            {t("explorer.rename")}
          </button>
          {menu.kind === "file" && (
            <button
              className="lo-ctxmenu__item"
              onClick={() => {
                toggleFavorite(menu.path);
                setMenu(null);
              }}
            >
              <Star
                size={13}
                strokeWidth={1.9}
                fill={favorites.includes(menu.path) ? "currentColor" : "none"}
              />
              {favorites.includes(menu.path) ? t("explorer.removeFavorite") : t("explorer.addFavorite")}
            </button>
          )}
          {menu.kind === "folder" && (
            <button
              className="lo-ctxmenu__item"
              onClick={() => {
                void newNote(menu.path);
                setMenu(null);
              }}
            >
              <FilePlus size={13} strokeWidth={1.9} />
              {t("explorer.newNoteHere")}
            </button>
          )}
          {menu.kind === "file" && (
            <button
              className="lo-ctxmenu__item lo-ctxmenu__item--danger"
              onClick={() => {
                void deleteNote(menu.path);
                setMenu(null);
              }}
            >
              <Trash2 size={13} strokeWidth={1.9} />
              {t("explorer.delete")}
            </button>
          )}
        </div>
      )}

      {trashOpen && <TrashModal onClose={() => setTrashOpen(false)} />}
    </div>
  );
}

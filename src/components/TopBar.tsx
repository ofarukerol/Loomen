import { useTranslation } from "react-i18next";
import { PanelLeft, PanelRight, Plus, X, Pin, FileText, Shapes } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { VaultNote } from "../core/vault/types";

function tabName(path: string, notes: VaultNote[]): string {
  const n = notes.find((x) => x.path === path);
  if (n) return n.name;
  return (path.split("/").pop() ?? path).replace(/\.(md|excalidraw)$/i, "");
}
function tabKind(path: string, notes: VaultNote[]): "note" | "draw" {
  return notes.find((x) => x.path === path)?.kind ?? "note";
}

/** Obsidian tarzı global üst çubuk: köşelerde panel butonları + sekme şeridi. */
export function TopBar() {
  const { t } = useTranslation();
  const openTabs = useAppStore((s) => s.openTabs);
  const pinnedTabs = useAppStore((s) => s.pinnedTabs);
  const notes = useAppStore((s) => s.notes);
  const activeNote = useAppStore((s) => s.activeNote);
  const activeDraw = useAppStore((s) => s.activeDraw);
  const screen = useAppStore((s) => s.screen);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const togglePin = useAppStore((s) => s.togglePin);
  const newNote = useAppStore((s) => s.newNote);
  const leftCollapsed = useAppStore((s) => s.leftCollapsed);
  const rightCollapsed = useAppStore((s) => s.rightCollapsed);
  const toggleLeft = useAppStore((s) => s.toggleLeft);
  const toggleRight = useAppStore((s) => s.toggleRight);

  const activePath = screen === "draw" ? activeDraw : screen === "editor" ? activeNote : null;
  const pinned = new Set(pinnedTabs);
  // Sabitlenmiş sekmeler önce (kararlı sıralama grup içi sırayı korur).
  const ordered = [...openTabs].sort((a, b) => (pinned.has(b) ? 1 : 0) - (pinned.has(a) ? 1 : 0));

  return (
    <div className="lo-topbar">
      <button
        className={"lo-topbar__toggle" + (leftCollapsed ? "" : " is-active")}
        title={t("planner.toggleLeft")}
        onClick={toggleLeft}
      >
        <PanelLeft size={17} strokeWidth={1.9} />
      </button>

      <div className="lo-topbar__tabs">
        {ordered.map((path) => {
          const isPinned = pinned.has(path);
          const isActive = path === activePath;
          const kind = tabKind(path, notes);
          return (
            <div
              key={path}
              className={"lo-wtab" + (isActive ? " is-active" : "") + (isPinned ? " is-pinned" : "")}
              onClick={() => setActiveTab(path)}
              title={tabName(path, notes)}
            >
              {kind === "draw" ? (
                <Shapes size={13} strokeWidth={1.7} className="lo-wtab__icon" />
              ) : (
                <FileText size={13} strokeWidth={1.7} className="lo-wtab__icon" />
              )}
              <span className="lo-wtab__name">{tabName(path, notes)}</span>
              <button
                className="lo-wtab__pin"
                title={t("tabs.pin")}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(path);
                }}
              >
                <Pin size={12} strokeWidth={2} fill={isPinned ? "currentColor" : "none"} />
              </button>
              {!isPinned && (
                <button
                  className="lo-wtab__x"
                  title={t("tabs.close")}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(path);
                  }}
                >
                  <X size={13} strokeWidth={2} />
                </button>
              )}
            </div>
          );
        })}
        <button className="lo-topbar__new" title={t("explorer.newNote")} onClick={() => void newNote()}>
          <Plus size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="lo-topbar__spacer" />

      <button
        className={"lo-topbar__toggle" + (rightCollapsed ? "" : " is-active")}
        title={t("planner.toggleRight")}
        onClick={toggleRight}
      >
        <PanelRight size={17} strokeWidth={1.9} />
      </button>
    </div>
  );
}

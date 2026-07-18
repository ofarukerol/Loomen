import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, FileText, Shapes } from "lucide-react";
import { Ribbon } from "./Ribbon";
import { Explorer } from "./Explorer";
import { useAppStore } from "../store/useAppStore";
import type { VaultNote } from "../core/vault/types";

function tabName(path: string, notes: VaultNote[]): string {
  const n = notes.find((x) => x.path === path);
  if (n) return n.name;
  return (path.split("/").pop() ?? path).replace(/\.(md|excalidraw)$/i, "");
}

/**
 * Mobil sol drawer: masaüstündeki Ribbon + Explorer'ı slide-over olarak barındırır
 * (yeniden yazmadan). "menü" ya da "ara" ile açılır; ara ile açılınca arama kutusuna odaklanır.
 */
export function MobileDrawer({
  open,
  focusSearch,
  onClose,
}: {
  open: boolean;
  focusSearch: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (open && focusSearch) {
      const id = setTimeout(
        () => document.querySelector<HTMLInputElement>(".lo-drawer .lo-explorer__searchwrap input")?.focus(),
        220
      );
      return () => clearTimeout(id);
    }
  }, [open, focusSearch]);

  // Swipe-to-close (pointer tabanlı — Tauri WKWebView native DnD güvenilir değil).
  // Yatay sürükleme kapatır (LTR sola, RTL sağa); dikey hareket Explorer'ı kaydırır.
  const drag = useRef<{ x: number; y: number; decided: boolean; horiz: boolean; delta: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const isRtl = () => document.documentElement.getAttribute("dir") === "rtl";

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, decided: false, horiz: false, delta: 0 };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // niyet belirene kadar bekle
      d.decided = true;
      d.horiz = Math.abs(dx) > Math.abs(dy);
      if (d.horiz) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (!d.horiz) return; // dikey → kaydırmaya bırak
    // Yalnız kapatma yönü: LTR'de sola (dx<0), RTL'de sağa (dx>0). Ters yön 0'a kenetli.
    d.delta = isRtl() ? Math.max(0, dx) : Math.min(0, dx);
    setDragX(d.delta);
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    setDragX(0);
    if (!d || !d.horiz) return;
    const threshold = 70;
    const past = isRtl() ? d.delta > threshold : d.delta < -threshold;
    if (past) onClose();
  };

  return (
    <>
      <div className={"lo-scrim" + (open ? " is-open" : "")} onClick={onClose} />
      <div
        className={"lo-drawer" + (open ? " is-open" : "") + (dragging ? " is-dragging" : "")}
        role="dialog"
        aria-hidden={!open}
        style={dragX ? { transform: `translateX(${dragX}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <Ribbon />
        <Explorer />
      </div>
    </>
  );
}

/** Mobil sekme değiştirici — alt sheet olarak açık sekmeleri listeler. */
export function MobileTabsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const openTabs = useAppStore((s) => s.openTabs);
  const notes = useAppStore((s) => s.notes);
  const activeNote = useAppStore((s) => s.activeNote);
  const activeDraw = useAppStore((s) => s.activeDraw);
  const screen = useAppStore((s) => s.screen);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const closeTab = useAppStore((s) => s.closeTab);

  const activePath = screen === "draw" ? activeDraw : screen === "editor" ? activeNote : null;

  return (
    <>
      <div className={"lo-scrim" + (open ? " is-open" : "")} onClick={onClose} />
      <div className={"lo-sheet" + (open ? " is-open" : "")} role="dialog" aria-hidden={!open}>
        <div className="lo-sheet__grip" />
        <div className="lo-sheet__title">{t("mobile.openTabs")}</div>
        <div className="lo-sheet__list">
          {openTabs.length === 0 && <div className="lo-sheet__empty">{t("mobile.noTabs")}</div>}
          {openTabs.map((path) => {
            const kind = notes.find((x) => x.path === path)?.kind ?? "note";
            const isActive = path === activePath;
            return (
              <div
                key={path}
                className={"lo-sheet__row" + (isActive ? " is-active" : "")}
                onClick={() => {
                  setActiveTab(path);
                  onClose();
                }}
              >
                {kind === "draw" ? (
                  <Shapes size={16} strokeWidth={1.7} />
                ) : (
                  <FileText size={16} strokeWidth={1.7} />
                )}
                <span className="lo-sheet__name">{tabName(path, notes)}</span>
                <button
                  className="lo-sheet__x"
                  title={t("tabs.close")}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(path);
                  }}
                >
                  <X size={17} strokeWidth={2.1} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

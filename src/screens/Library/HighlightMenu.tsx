import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, MessageSquarePlus, Trash2 } from "lucide-react";
import { HIGHLIGHT_COLORS, type HighlightColor } from "../../core/library";
import { useModalLayer } from "../../store/useAppStore";
import { HIGHLIGHT_CSS, type ViewRect } from "./readerTypes";

/**
 * Seçimin ya da var olan çizimin yanında açılan küçük menü (LOM-83): renkler, not, sil.
 * Seçimin üstünde durur; yer yoksa altına iner, ekrandan taşmaz.
 */
export function HighlightMenu({
  rect,
  current,
  canDelete,
  onColor,
  onNote,
  onDelete,
  onClose,
}: {
  rect: ViewRect;
  /** Var olan çizimin rengi; yeni seçimde vurgusuz. */
  current?: HighlightColor;
  canDelete: boolean;
  onColor: (c: HighlightColor) => void;
  onNote: () => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Android geri tuşu önce menüyü kapatsın (okuyucuyu değil); kapatma yolu Escape.
  useModalLayer();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = rect.y - h - gap;
    if (top < gap) top = Math.min(vh - h - gap, rect.y + rect.h + gap);
    const left = Math.max(gap, Math.min(vw - w - gap, rect.x + rect.w / 2 - w / 2));
    setPos({ left, top: Math.max(gap, top) });
  }, [rect.x, rect.y, rect.w, rect.h]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    // Menüyü açan dokunuşun kendisi kapatmasın.
    const id = window.setTimeout(() => document.addEventListener("pointerdown", onDoc), 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDoc);
    };
  }, []);

  return createPortal(
    <div
      ref={ref}
      className="lo-hlmenu"
      role="toolbar"
      aria-label={t("library.reader.highlightMenu")}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      // Seçim kaybolmasın: düğmeye basmak odağı/seçimi almaz.
      onPointerDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={"lo-hlmenu__color" + (current === c ? " is-on" : "")}
          style={{ background: HIGHLIGHT_CSS[c] }}
          onClick={() => onColor(c)}
          title={t(`library.colors.${c}`)}
          aria-label={t(`library.colors.${c}`)}
          aria-pressed={current === c}
        >
          {current === c && <Check size={13} strokeWidth={2.6} aria-hidden />}
        </button>
      ))}
      <span className="lo-hlmenu__sep" aria-hidden />
      <button type="button" className="lo-lib-iconbtn" onClick={onNote} title={t("library.reader.addNote")} aria-label={t("library.reader.addNote")}>
        <MessageSquarePlus size={16} strokeWidth={2} />
      </button>
      {canDelete && onDelete && (
        <button
          type="button"
          className="lo-lib-iconbtn is-danger"
          onClick={onDelete}
          title={t("library.reader.deleteHighlight")}
          aria-label={t("library.reader.deleteHighlight")}
        >
          <Trash2 size={16} strokeWidth={2} />
        </button>
      )}
    </div>,
    document.body
  );
}

import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Link2 } from "lucide-react";
import { placeBar } from "./selectionActions";

/**
 * Seçim çubuğu (LOM-110): notta metin seçilince seçimin üstünde (dokunmatikte altında)
 * çıkan küçük düğme şeridi. Düğmeye basmak editörün odağını ve seçimini çalmaz.
 */
export function SelectionBar({
  rect,
  touch,
  showCard,
  showLink,
  onCard,
  onLink,
}: {
  rect: { top: number; bottom: number; left: number; right: number };
  touch: boolean;
  showCard: boolean;
  showLink: boolean;
  onCard: () => void;
  onLink: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Çubuğu ÖLÇTÜKTEN sonra yerleştir (dar ekranda ve Arapça düzende taşmasın).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const p = placeBar({
      selTop: rect.top,
      selBottom: rect.bottom,
      selLeft: rect.left,
      barW: width,
      barH: height,
      vw: window.innerWidth,
      vh: window.innerHeight,
      touch,
    });
    setPos({ left: p.left, top: p.top });
  }, [rect.top, rect.bottom, rect.left, touch, showCard, showLink]);

  return (
    <div
      ref={ref}
      className="lo-selbar"
      role="toolbar"
      aria-label={t("selbar.barLabel")}
      // İlk ölçüm yapılana kadar görünmez (yanlış yerde bir an parlamasın).
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
      // Düğmeye basmak editörün odağını çalmasın: odak giderse seçim kaybolur.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {showCard && (
        <button type="button" className="lo-selbar__btn" onClick={onCard}>
          <Layers size={14} strokeWidth={1.9} aria-hidden />
          {t("selbar.makeCard")}
        </button>
      )}
      {showLink && (
        <button type="button" className="lo-selbar__btn" onClick={onLink}>
          <Link2 size={14} strokeWidth={1.9} aria-hidden />
          {t("selbar.addLink")}
        </button>
      )}
    </div>
  );
}

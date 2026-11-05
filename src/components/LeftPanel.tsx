import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Explorer } from "./Explorer";
import { useAppStore } from "../store/useAppStore";
import {
  LEFT_PANEL_MAX,
  LEFT_PANEL_MIN,
  leftDragStartWidth,
  leftWidthForKey,
  nextLeftWidth,
} from "../core/layout/leftPanel";

const isRtl = () => document.documentElement.getAttribute("dir") === "rtl";
/** Sağ panelin dar pencere formülü `.lo-app`teki --left-w'yi düşer (App yazar). Sürüklerken
 *  canlı değer oraya da yazılır ki orta sütun anlık olarak da ≥336 px kalsın; bırakınca App
 *  kayıtlı değerle aynısını yazar. */
const setAppLeftVar = (px: number) =>
  document.querySelector<HTMLElement>(".lo-app")?.style.setProperty("--left-w", `${px}px`);

/** Masaüstü sol panel (gezgin) + genişlik tutamağı (LOM-80). RightPanel'in aynası:
 *  tutamak panelin iç (bitiş) kenarında; sürükleme, oklar, Home/End, Enter ve çift tık.
 *  Yalnız masaüstünde çizilir (App); mobil çekmece Explorer'ı doğrudan kullanır, tutamak yok. */
export function LeftPanel() {
  const { t } = useTranslation();
  const width = useAppStore((s) => s.leftWidth);
  const setWidth = useAppStore((s) => s.setLeftWidth);
  const resetWidth = useAppStore((s) => s.resetLeftWidth);
  // Sürükleme sırasında genişlik yalnız burada tutulur; kayda bırakınca bir kez yazılır.
  const [live, setLive] = useState<number | null>(null);
  const drag = useRef<{ id: number; x: number; start: number; rtl: boolean; cur: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Dar pencerede CSS paneli kayıtlı genişlikten dar gösterir; sürükleme ve ok tuşları ekranda
  // görünen genişlikten başlar. Tutamak absolute olduğu için sarmalayıcı = gezgin genişliği.
  const startWidth = () => {
    const el = wrapRef.current;
    return leftDragStartWidth(el ? el.getBoundingClientRect().width : NaN, width);
  };

  const shown = live ?? width;
  // Sürükleme ortasında panel kapanırsa imleç/seçim kilidi kalmasın.
  useEffect(
    () => () => {
      drag.current = null;
      document.querySelector(".lo-app")?.classList.remove("is-resizing");
    },
    [],
  );

  const endDrag = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    document.querySelector(".lo-app")?.classList.remove("is-resizing");
    if (d && commit && d.cur !== d.start) setWidth(d.cur);
    else if (d) setAppLeftVar(useAppStore.getState().leftWidth);
    setLive(null);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = startWidth();
    drag.current = { id: e.pointerId, x: e.clientX, start, rtl: isRtl(), cur: start };
    document.querySelector(".lo-app")?.classList.add("is-resizing");
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.cur = nextLeftWidth(d.start, e.clientX - d.x, d.rtl);
    setAppLeftVar(d.cur);
    setLive(d.cur);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    endDrag(true);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Alt+Sol gibi tarayıcı/sistem kısayollarını yutma.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const next = leftWidthForKey(e.key, startWidth(), e.shiftKey, isRtl());
    if (next == null) return;
    e.preventDefault();
    setWidth(next);
  };

  return (
    <div ref={wrapRef} className="lo-leftwrap" style={{ "--left-w": `${shown}px` } as CSSProperties}>
      <Explorer />
      <div
        className={"lo-left__grip" + (live != null ? " is-active" : "")}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("planner.resizeLeft")}
        title={t("planner.resizeLeft")}
        aria-valuenow={shown}
        aria-valuemin={LEFT_PANEL_MIN}
        aria-valuemax={LEFT_PANEL_MAX}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => endDrag(false)}
        onLostPointerCapture={() => drag.current && endDrag(true)}
        onDoubleClick={() => {
          endDrag(false);
          resetWidth();
        }}
        onKeyDown={onKey}
      />
    </div>
  );
}

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { PomodoroCard } from "../screens/Planner/PomodoroCard";
import { HabitsTodayCard } from "../screens/Planner/HabitsTodayCard";
import { CalendarCard } from "../screens/Planner/CalendarCard";
import { MiniAgenda } from "../screens/Planner/MiniAgenda";
import { ReviewCard } from "../screens/Review/ReviewCard";
import { useAppStore } from "../store/useAppStore";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  dragStartWidth,
  nextRightWidth,
  RIGHT_PANEL_MAX,
  RIGHT_PANEL_MIN,
  rightWidthForKey,
} from "../core/layout/rightPanel";

const isRtl = () => document.documentElement.getAttribute("dir") === "rtl";

/** Global sağ blok — her ekranda kalıcı (Pomodoro + Alışkanlıklar + Takvim + Tekrar + Bugüne Odaklan).
 *  Masaüstünde iç kenarındaki tutamakla genişliği ayarlanır (LOM-63); çift tık varsayılana döndürür.
 *  Klavye: oklar adım adım, Home en dar, End en geniş, Enter varsayılan (LOM-67).
 *  Mobilde (planner gövdesi) tutamak yok, genişlik CSS'te `auto` kalır. */
export function RightPanel() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const width = useAppStore((s) => s.rightWidth);
  const setWidth = useAppStore((s) => s.setRightWidth);
  const resetWidth = useAppStore((s) => s.resetRightWidth);
  // Sürükleme sırasında genişlik yalnız burada tutulur; kayda bırakınca bir kez yazılır.
  const [live, setLive] = useState<number | null>(null);
  const drag = useRef<{ id: number; x: number; start: number; rtl: boolean; cur: number } | null>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  // Dar pencerede CSS bloğu kayıtlı genişlikten dar gösterir (LOM-67); sürükleme ve
  // ok tuşları ekranda görünen genişlikten başlar ki imleç boşa gidip blok zıplamasın.
  const startWidth = () => {
    const el = sideRef.current;
    return dragStartWidth(el ? parseFloat(getComputedStyle(el).width) : NaN, width);
  };

  const shown = live ?? width;
  // Sürükleme ortasında panel kapanır ya da telefon düzenine geçilirse (tutamak kalkar)
  // imleç/seçim kilidi ve yarım sürükleme kalmasın.
  useEffect(
    () => () => {
      drag.current = null;
      setLive(null);
      document.querySelector(".lo-app")?.classList.remove("is-resizing");
    },
    [isMobile],
  );

  const endDrag = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    document.querySelector(".lo-app")?.classList.remove("is-resizing");
    if (d && commit && d.cur !== d.start) setWidth(d.cur);
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
    d.cur = nextRightWidth(d.start, e.clientX - d.x, d.rtl);
    setLive(d.cur);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    endDrag(true);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Alt+Sol gibi tarayıcı/sistem kısayollarını yutma.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const next = rightWidthForKey(e.key, startWidth(), e.shiftKey, isRtl());
    if (next == null) return;
    e.preventDefault();
    setWidth(next);
  };

  const cards = (
    <>
      <PomodoroCard />
      <HabitsTodayCard />
      <CalendarCard />
      <ReviewCard />
      <MiniAgenda />
    </>
  );

  // Mobil: planner gövdesinin içinde, eski düzen (CSS `width: auto`), tutamak yok.
  if (isMobile) return <div className="lo-side lo-scroll">{cards}</div>;

  // Masaüstü: tutamak kayan sütunun DIŞINDA durur, kaydırınca yerinden oynamaz.
  return (
    <div className="lo-sidewrap" style={{ "--side-w": `${shown}px` } as CSSProperties}>
      <div
        className={"lo-side__grip" + (live != null ? " is-active" : "")}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("planner.resizeRight")}
        title={t("planner.resizeRight")}
        aria-valuenow={shown}
        aria-valuemin={RIGHT_PANEL_MIN}
        aria-valuemax={RIGHT_PANEL_MAX}
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
      <div ref={sideRef} className="lo-side lo-scroll">{cards}</div>
    </div>
  );
}

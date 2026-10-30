import { useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { isDefaultSideCardOrder, reorderSideCards, sideCardIndexAt } from "../../core/layout/sideCards";

/** Ayarlar → Sağ blok kartları (LOM-72): Planner sağ bloğundaki kartların sırası.
 *  Beş kart her zaman listelenir; kapalı modülün kartı burada durur ama Planner'da çizilmez.
 *  Sürükleme tutamaktan, işaretçi olaylarıyla yapılır (fare ve dokunma): tarayıcının
 *  sürükle-bırak olayları Windows'ta Tauri dosya bırakma açıkken tetiklenmiyor.
 *  Yukarı/aşağı düğmeleri her yerde çalışır. */
export function SideCardsSettings() {
  const { t } = useTranslation();
  const order = useAppStore((s) => s.sideCardOrder);
  const setOrder = useAppStore((s) => s.setSideCardOrder);
  const move = useAppStore((s) => s.moveSideCard);
  const reset = useAppStore((s) => s.resetSideCardOrder);
  const reviewOn = useAppStore((s) => s.srsSettings.enabled);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; from: number; to: number } | null>(null);

  const endDrag = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (d && commit && d.to >= 0 && d.to !== d.from) setOrder(reorderSideCards(order, d.from, d.to));
    setDragFrom(null);
    setOver(null);
  };
  const onDown = (e: PointerEvent<HTMLSpanElement>, i: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, from: i, to: i };
    setDragFrom(i);
    setOver(i);
  };
  const onMove = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !listRef.current) return;
    const rows = Array.from(listRef.current.children, (el) => el.getBoundingClientRect());
    d.to = sideCardIndexAt(e.clientY, rows);
    setOver(d.to);
  };

  return (
    <>
      <div className="lo-set__section">{t("settings.sideCards")}</div>
      <div className="lo-card lo-set__card">
        <div className="lo-set__row lo-set__row--border">
          <div className="lo-set__rowsub">{t("settings.sideCardsSub")}</div>
        </div>
        <div className="lo-set__cards" ref={listRef}>
          {order.map((id, i) => (
            <div
              key={id}
              className={
                "lo-set__cardrow" +
                (dragFrom === i ? " is-dragging" : "") +
                (over === i && dragFrom !== null && dragFrom !== i ? (dragFrom < i ? " is-over-after" : " is-over") : "")
              }
            >
              <span
                className="lo-set__cardgrip"
                aria-hidden
                onPointerDown={(e) => onDown(e, i)}
                onPointerMove={onMove}
                onPointerUp={(e) => drag.current?.id === e.pointerId && endDrag(true)}
                onPointerCancel={() => endDrag(false)}
                onLostPointerCapture={() => drag.current && endDrag(true)}
              >
                <GripVertical size={16} />
              </span>
              <div className="lo-set__cardname">
                <div className="lo-set__rowtitle">
                  {t(`settings.sideCard.${id}`)}
                  {id === "review" && !reviewOn && <span className="lo-set__cardbadge">{t("settings.sideCardOff")}</span>}
                </div>
                {id === "habits" && <div className="lo-set__rowsub">{t("settings.sideCardHabitsSub")}</div>}
              </div>
              <button
                type="button"
                className="lo-set__cardbtn"
                aria-label={t("settings.moveUp")}
                title={t("settings.moveUp")}
                disabled={i === 0}
                onClick={() => move(id, -1)}
              >
                <ChevronUp size={16} />
              </button>
              <button
                type="button"
                className="lo-set__cardbtn"
                aria-label={t("settings.moveDown")}
                title={t("settings.moveDown")}
                disabled={i === order.length - 1}
                onClick={() => move(id, 1)}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="lo-set__row">
          <span />
          <button type="button" className="lo-set__change" disabled={isDefaultSideCardOrder(order)} onClick={reset}>
            <RotateCcw size={14} />
            {t("settings.sideCardReset")}
          </button>
        </div>
      </div>
    </>
  );
}

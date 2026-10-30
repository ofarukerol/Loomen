import { useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { isDefaultSideCardOrder, reorderSideCards } from "../../core/layout/sideCards";

/** Ayarlar → Sağ blok kartları (LOM-72): Planner sağ bloğundaki kartların sırası.
 *  Beş kart her zaman listelenir; kapalı modülün kartı burada durur ama Planner'da çizilmez.
 *  Sürükleme masaüstü içindir; yukarı/aşağı düğmeleri her yerde (telefonda da) çalışır. */
export function SideCardsSettings() {
  const { t } = useTranslation();
  const order = useAppStore((s) => s.sideCardOrder);
  const setOrder = useAppStore((s) => s.setSideCardOrder);
  const move = useAppStore((s) => s.moveSideCard);
  const reset = useAppStore((s) => s.resetSideCardOrder);
  const reviewOn = useAppStore((s) => s.srsSettings.enabled);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const endDrag = () => {
    setDragFrom(null);
    setOver(null);
  };
  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom != null) setOrder(reorderSideCards(order, dragFrom, to));
    endDrag();
  };

  return (
    <>
      <div className="lo-set__section">{t("settings.sideCards")}</div>
      <div className="lo-card lo-set__card">
        <div className="lo-set__row lo-set__row--border">
          <div className="lo-set__rowsub">{t("settings.sideCardsSub")}</div>
        </div>
        <div className="lo-set__cards">
          {order.map((id, i) => (
            <div
              key={id}
              className={
                "lo-set__cardrow" +
                (dragFrom === i ? " is-dragging" : "") +
                (over === i && dragFrom !== null && dragFrom !== i ? (dragFrom < i ? " is-over-after" : " is-over") : "")
              }
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
                setDragFrom(i);
              }}
              onDragOver={(e) => {
                if (dragFrom == null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== i) setOver(i);
              }}
              onDrop={(e) => onDrop(e, i)}
              onDragEnd={endDrag}
            >
              <GripVertical size={16} className="lo-set__cardgrip" aria-hidden />
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

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, RotateCcw, X, FileText, Shapes, AlertTriangle } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { daysLeft, TRASH_RETENTION_DAYS } from "../core/vault/trash";

/** Çöp kutusu — silinen notları listeler; geri yükle / kalıcı sil / boşalt. */
export function TrashModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const trash = useAppStore((s) => s.trash);
  const loadTrash = useAppStore((s) => s.loadTrash);
  const restoreNote = useAppStore((s) => s.restoreNote);
  const purgeNote = useAppStore((s) => s.purgeNote);
  const emptyTrash = useAppStore((s) => s.emptyTrash);

  const [confirmPurge, setConfirmPurge] = useState<string | null>(null); // trashName
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const now = Date.now();

  return (
    <div className="lo-modal" onClick={onClose}>
      <div className="lo-trash" onClick={(e) => e.stopPropagation()}>
        <div className="lo-tdetail__head">
          <span className="lo-tdetail__title">
            <Trash2 size={15} strokeWidth={2} style={{ marginInlineEnd: 7, verticalAlign: "-2px" }} />
            {t("trash.title")}
            {trash.length > 0 && <span className="lo-trash__count">{trash.length}</span>}
          </span>
          <button className="lo-tdetail__close" onClick={onClose} aria-label={t("trash.close")}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="lo-trash__hint">{t("trash.retention", { days: TRASH_RETENTION_DAYS })}</div>

        {trash.length === 0 ? (
          <div className="lo-trash__empty">{t("trash.emptyState")}</div>
        ) : (
          <div className="lo-trash__list lo-scroll">
            {trash.map((e) => {
              const left = daysLeft(e.deletedAt, now);
              const isPurging = confirmPurge === e.trashName;
              return (
                <div className="lo-trash__row" key={e.trashName}>
                  {e.kind === "draw" ? (
                    <Shapes size={15} strokeWidth={1.7} color="var(--accent-2)" />
                  ) : (
                    <FileText size={15} strokeWidth={1.7} color="var(--fg3)" />
                  )}
                  <div className="lo-trash__info">
                    <div className="lo-trash__name">{e.name}</div>
                    <div className="lo-trash__meta">
                      {e.folder ? e.folder + " · " : ""}
                      {t("trash.daysLeft", { days: left })}
                    </div>
                  </div>
                  {isPurging ? (
                    <div className="lo-trash__confirm">
                      <span>{t("trash.sure")}</span>
                      <button
                        className="lo-trash__danger"
                        onClick={() => {
                          setConfirmPurge(null);
                          void purgeNote(e.trashName);
                        }}
                      >
                        {t("trash.yes")}
                      </button>
                      <button className="lo-trash__ghost" onClick={() => setConfirmPurge(null)}>
                        {t("trash.no")}
                      </button>
                    </div>
                  ) : (
                    <div className="lo-trash__actions">
                      <button
                        className="lo-trash__btn"
                        title={t("trash.restore")}
                        onClick={() => void restoreNote(e.trashName)}
                      >
                        <RotateCcw size={14} strokeWidth={2} />
                        {t("trash.restore")}
                      </button>
                      <button
                        className="lo-trash__btn lo-trash__btn--danger"
                        title={t("trash.deletePermanent")}
                        onClick={() => setConfirmPurge(e.trashName)}
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {trash.length > 0 && (
          <div className="lo-trash__foot">
            {confirmEmpty ? (
              <div className="lo-trash__confirm">
                <AlertTriangle size={14} strokeWidth={2} color="var(--danger)" />
                <span>{t("trash.confirmEmpty")}</span>
                <button
                  className="lo-trash__danger"
                  onClick={() => {
                    setConfirmEmpty(false);
                    void emptyTrash();
                  }}
                >
                  {t("trash.emptyConfirmYes")}
                </button>
                <button className="lo-trash__ghost" onClick={() => setConfirmEmpty(false)}>
                  {t("trash.no")}
                </button>
              </div>
            ) : (
              <button className="lo-trash__empty-btn" onClick={() => setConfirmEmpty(true)}>
                <Trash2 size={14} strokeWidth={2} />
                {t("trash.emptyAll")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

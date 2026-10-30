import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, ClipboardPaste, FileUp } from "lucide-react";
import { addRows, findDuplicates, parsePasted, type ReviewList } from "../../core/srs";
import { useAppStore, useModalLayer } from "../../store/useAppStore";
import { colorVars } from "../Habits/habitUi";

const PREVIEW_ROWS = 30;

/**
 * Toplu yapıştırma / dosyadan alma penceresi. Her satır bir kart; ayıraç tanınmayan satırlar
 * atlanır. Önizleme ilk 30 satırı gösterir (1000+ satırda da akıcı). Listede ön yüzü zaten olan
 * satırlar uyarıyla atlanır. Kayıt yalnız srsListSave ile liste dosyasına gider.
 */
export function PasteDialog({
  list,
  initialText = "",
  csv = false,
  fromFile = false,
  onClose,
}: {
  list: ReviewList;
  initialText?: string;
  /** .csv dosyasından gelen metin: virgül de ayıraç sayılır. */
  csv?: boolean;
  fromFile?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useAppStore((s) => s.srsListSave);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const downOnBackdrop = useRef(false);
  // Uzun metinde her tuşta yeniden ayrıştırma yazmayı yavaşlatmasın.
  const deferred = useDeferredValue(text);

  useModalLayer();

  useEffect(() => {
    areaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const parsed = useMemo(() => parsePasted(deferred, { csv }), [deferred, csv]);
  const inList = useMemo(() => findDuplicates(parsed.rows, list.rows).length, [parsed, list.rows]);
  // Listede ön yüzü olan satır hep atlanır: aynı ön yüz aynı kartı verir, ikinci satır hiç sorulmazdı.
  const toAdd = parsed.rows.length - inList;

  const submit = async () => {
    if (busy || toAdd <= 0) return;
    setBusy(true);
    setError(null);
    try {
      // Pencere açıkken liste değişmiş olabilir: en güncel listeye eklenir.
      const latest = useAppStore.getState().srsLists.find((l) => l.id === list.id) ?? list;
      const res = addRows(latest, parsePasted(text, { csv }).rows);
      if (res.added > 0) await save(res.list);
      onClose();
    } catch (err) {
      console.error("[srs] liste kaydedilemedi:", err);
      setError(t("review.lists.detail.saveError"));
    } finally {
      setBusy(false);
    }
  };

  const preview = parsed.rows.slice(0, PREVIEW_ROWS);
  const rest = parsed.rows.length - preview.length;

  return createPortal(
    <div
      className="lo-modal"
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (e.target !== e.currentTarget) downOnBackdrop.current = false;
      }}
      onClick={(e) => {
        // Yazılmış metin yanlış tıkla kaybolmasın.
        const fromBackdrop = downOnBackdrop.current && e.target === e.currentTarget;
        downOnBackdrop.current = false;
        if (fromBackdrop && !text.trim() && !busy) onClose();
      }}
    >
      <div
        className="lo-hab-form lo-rpaste"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lo-rpaste-title"
        style={colorVars(list.color)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lo-hab-form__head">
          <span id="lo-rpaste-title" className="lo-hab-form__title">
            {fromFile ? <FileUp size={15} strokeWidth={2.2} aria-hidden /> : <ClipboardPaste size={15} strokeWidth={2.2} aria-hidden />}
            {fromFile ? t("review.lists.paste.importTitle") : t("review.lists.paste.title")}
          </span>
          <button type="button" className="lo-hab-iconbtn" onClick={onClose} aria-label={t("review.close")}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="lo-hab-form__body">
          <p className="lo-rpaste__hint">{t("review.lists.paste.hint")}</p>
          <textarea
            ref={areaRef}
            className="lo-hab-input lo-rpaste__area"
            value={text}
            dir="auto"
            spellCheck={false}
            placeholder={t("review.lists.paste.placeholder")}
            aria-label={t("review.lists.paste.title")}
            onChange={(e) => setText(e.target.value)}
          />

          {deferred.trim() && (
            <>
              <ul className="lo-rpaste__counts">
                <li className="is-ok">{t("review.lists.paste.recognized", { n: parsed.rows.length })}</li>
                {parsed.skipped > 0 && <li>{t("review.lists.paste.skipped", { n: parsed.skipped })}</li>}
                {parsed.duplicates > 0 && <li className="is-warn">{t("review.lists.paste.dupInText", { n: parsed.duplicates })}</li>}
                {inList > 0 && <li className="is-warn">{t("review.lists.paste.dupInList", { n: inList })}</li>}
              </ul>
              {parsed.rows.length === 0 ? (
                <div className="lo-rpaste__none">{t("review.lists.paste.none")}</div>
              ) : (
                <div className="lo-rpaste__preview">
                  {preview.map((r, i) => (
                    <div className="lo-rpaste__row" key={i}>
                      <span className="lo-rpaste__front" dir="auto">
                        {r.front}
                      </span>
                      <span className="lo-rpaste__back" dir="auto">
                        {r.back}
                        {r.note && <span className="lo-rpaste__note">{r.note}</span>}
                      </span>
                    </div>
                  ))}
                  {rest > 0 && <div className="lo-rpaste__more">{t("review.lists.paste.more", { n: rest })}</div>}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="lo-hab-form__error" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="lo-hab-form__foot">
          <button type="button" className="lo-btn" onClick={onClose}>
            {t("review.lists.detail.cancel")}
          </button>
          <button
            type="button"
            className="lo-btn lo-btn--primary"
            disabled={busy || toAdd <= 0 || deferred !== text}
            onClick={() => void submit()}
          >
            {t("review.lists.paste.add", { n: Math.max(0, toAdd) })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

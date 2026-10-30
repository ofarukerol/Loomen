import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, ListPlus, Pencil } from "lucide-react";
import {
  DEFAULT_LIST_COLOR,
  LIST_COLORS,
  LIST_EMOJIS,
  newListId,
  type ListColor,
  type ListDirection,
  type ReviewList,
} from "../../core/srs";
import { useAppStore, useModalLayer } from "../../store/useAppStore";
import { colorVars } from "../Habits/habitUi";

const DIRECTIONS: { id: ListDirection; key: string }[] = [
  { id: "front", key: "dirFront" },
  { id: "back", key: "dirBack" },
  { id: "both", key: "dirBoth" },
];
const MAX_NEW = 999;

/**
 * Yeni liste / listeyi düzenle penceresi (HabitForm kalıbı). Ad zorunlu; simge, renk, yön ve günlük
 * yeni kart sayısı ("Genel ayar" ya da 1–999) seçilir. Kayıt srsListSave ile liste dosyasına gider;
 * notlara yazılmaz. Hata pencerede görünür, yazılanlar kaybolmaz.
 */
export function ListForm({
  list,
  onClose,
  onDone,
}: {
  /** Verilirse düzenleme modu. */
  list?: ReviewList;
  onClose: () => void;
  onDone?: (l: ReviewList) => void;
}) {
  const { t } = useTranslation();
  const save = useAppStore((s) => s.srsListSave);
  const [name, setName] = useState(list?.name ?? "");
  const [emoji, setEmoji] = useState<string>(list?.emoji ?? LIST_EMOJIS[0]);
  const [color, setColor] = useState<ListColor>(list?.color ?? DEFAULT_LIST_COLOR);
  const [direction, setDirection] = useState<ListDirection>(list?.direction ?? "front");
  const [general, setGeneral] = useState(list ? list.newPerDay == null : true);
  const [perDay, setPerDay] = useState(String(list?.newPerDay ?? 15));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const downOnBackdrop = useRef(false);

  useModalLayer();

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nameOk = name.trim().length > 0;
  const perDayNum = Number(perDay);
  const perDayOk = general || (perDay !== "" && Number.isInteger(perDayNum) && perDayNum >= 1 && perDayNum <= MAX_NEW);
  const valid = nameOk && perDayOk;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!valid || busy) {
      if (!nameOk) nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    // Pencere açıkken satırlar değişmiş olabilir (senkron): en güncel satırlar korunur.
    const latest = list ? (useAppStore.getState().srsLists.find((l) => l.id === list.id) ?? list) : undefined;
    const now = Date.now();
    const next: ReviewList = {
      id: latest?.id ?? newListId(now),
      name: name.trim(),
      emoji,
      color,
      direction,
      newPerDay: general ? null : perDayNum,
      createdAt: latest?.createdAt ?? now,
      rows: latest?.rows ?? [],
    };
    try {
      await save(next);
      onDone?.(next);
      onClose();
    } catch (err) {
      console.error("[srs] liste kaydedilemedi:", err);
      setError(t("review.lists.detail.saveError"));
    } finally {
      setBusy(false);
    }
  };

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
        const fromBackdrop = downOnBackdrop.current && e.target === e.currentTarget;
        downOnBackdrop.current = false;
        if (fromBackdrop && !error && !busy) onClose();
      }}
    >
      <form
        className="lo-hab-form lo-rlist-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lo-rlist-form-title"
        style={colorVars(color)}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        noValidate
      >
        <div className="lo-hab-form__head">
          <span id="lo-rlist-form-title" className="lo-hab-form__title">
            {list ? <Pencil size={15} strokeWidth={2.2} aria-hidden /> : <ListPlus size={15} strokeWidth={2.2} aria-hidden />}
            {list ? t("review.lists.form.editTitle") : t("review.lists.form.title")}
          </span>
          <button type="button" className="lo-hab-iconbtn" onClick={onClose} aria-label={t("review.close")}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="lo-hab-form__body">
          <label className="lo-hab-field">
            <span className="lo-hab-field__label">{t("review.lists.form.name")}</span>
            <input
              ref={nameRef}
              className={"lo-hab-input" + (tried && !nameOk ? " is-invalid" : "")}
              value={name}
              maxLength={80}
              placeholder={t("review.lists.form.namePlaceholder")}
              aria-invalid={tried && !nameOk}
              onChange={(e) => setName(e.target.value)}
            />
            {tried && !nameOk && <span className="lo-hab-field__err">{t("review.lists.form.nameRequired")}</span>}
          </label>

          <div className="lo-hab-field">
            <span className="lo-hab-field__label" id="lo-rlist-emoji-l">
              {t("review.lists.form.icon")}
            </span>
            <div className="lo-hab-emojis" role="radiogroup" aria-labelledby="lo-rlist-emoji-l">
              {LIST_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  role="radio"
                  aria-checked={emoji === em}
                  className={"lo-hab-emoji" + (emoji === em ? " is-on" : "")}
                  onClick={() => setEmoji(em)}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div className="lo-hab-field">
            <span className="lo-hab-field__label" id="lo-rlist-color-l">
              {t("review.lists.form.color")}
            </span>
            <div className="lo-hab-colors" role="radiogroup" aria-labelledby="lo-rlist-color-l">
              {LIST_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={t(`habit.color.${c}`)}
                  title={t(`habit.color.${c}`)}
                  className={"lo-hab-swatch" + (color === c ? " is-on" : "")}
                  style={colorVars(c)}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="lo-hab-field">
            <span className="lo-hab-field__label" id="lo-rlist-dir-l">
              {t("review.lists.form.direction")}
            </span>
            <div className="lo-hab-chips" role="radiogroup" aria-labelledby="lo-rlist-dir-l">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={direction === d.id}
                  className={"lo-hab-chip" + (direction === d.id ? " is-on" : "")}
                  onClick={() => setDirection(d.id)}
                >
                  {t(`review.lists.form.${d.key}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="lo-hab-field">
            <span className="lo-hab-field__label" id="lo-rlist-new-l">
              {t("review.lists.form.newPerDay")}
            </span>
            <div className="lo-hab-chips" role="group" aria-labelledby="lo-rlist-new-l">
              <button
                type="button"
                className={"lo-hab-chip" + (general ? " is-on" : "")}
                aria-pressed={general}
                onClick={() => setGeneral(true)}
              >
                {t("review.lists.form.newPerDayGeneral")}
              </button>
              <input
                className={"lo-hab-input lo-hab-input--num" + (!general && !perDayOk ? " is-invalid" : "")}
                inputMode="numeric"
                value={general ? "" : perDay}
                placeholder={perDay}
                aria-label={t("review.lists.form.newPerDay")}
                aria-invalid={!general && !perDayOk}
                onChange={(e) => {
                  setGeneral(false);
                  setPerDay(e.target.value.replace(/[^\d]/g, "").slice(0, 3));
                }}
              />
            </div>
            <span className="lo-hab-hint">{t("review.lists.form.newPerDayHint")}</span>
          </div>

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
          <button type="submit" className="lo-btn lo-btn--primary" disabled={busy || (tried && !valid)}>
            {list ? t("review.lists.form.save") : t("review.lists.form.create")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, Sprout, Repeat, Pencil } from "lucide-react";
import {
  DEFAULT_COLOR,
  DEFAULT_DAYS,
  DURATION_CHIPS,
  HABIT_COLORS,
  HABIT_EMOJIS,
  MAX_DAYS,
  MAX_GOAL_PAGES,
  MIN_DAYS,
  MIN_GOAL_PAGES,
  addDays,
  dayKey,
  endKey,
  isDayKey,
  isFinished,
  type Habit,
  type HabitColor,
  type ReadingGoal,
} from "../../core/habit";
import { hasBookFile } from "../../core/library";
import { useAppStore, useModalLayer } from "../../store/useAppStore";
import { colorVars, fmtRange } from "./habitUi";

export type HabitFormMode = { kind: "new" } | { kind: "round"; from: Habit } | { kind: "edit"; habit: Habit };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Bu soyda bu turdan sonra açılmış ve süren bir tur var mı (store o durumda yeni tur açmaz). */
function hasLiveSibling(from: Habit): boolean {
  const today = dayKey(new Date());
  return useAppStore
    .getState()
    .habits.some((x) => x.id !== from.id && x.lineageId === from.lineageId && x.createdAt >= from.createdAt && !isFinished(x, today));
}

/**
 * Alışkanlık ekleme / "Bir tur daha" penceresi. Yeni modda ad (zorunlu), simge, renk, süre,
 * başlangıç ve niyet sorulur; tur modunda ad/simge/renk/niyet önceki turdan gelir, yalnız süre ve
 * başlangıç seçilir (ör. 21 bitti, 41'e geçiliyor). İleri tarih seçilemez. Düzenleme modunda
 * (LOM-62) yalnız ad/simge/renk/niyet değişir; süre ve başlangıç gösterilmez, çentikler korunur.
 */
export function HabitForm({
  mode,
  today,
  onClose,
  onDone,
}: {
  mode: HabitFormMode;
  today: string;
  onClose: () => void;
  /** Yeni tur/alışkanlık kaydedildi. Düzenlemede verilmez: ayrıntı açık kalır. */
  onDone?: (h: Habit) => void;
}) {
  const { t, i18n } = useTranslation();
  const habitAdd = useAppStore((s) => s.habitAdd);
  const habitNewRound = useAppStore((s) => s.habitNewRound);
  const habitEdit = useAppStore((s) => s.habitEdit);
  const from = mode.kind === "round" ? mode.from : null;
  const editing = mode.kind === "edit" ? mode.habit : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [emoji, setEmoji] = useState<string>(editing?.emoji ?? HABIT_EMOJIS[0]);
  const [color, setColor] = useState<HabitColor>(editing?.color ?? DEFAULT_COLOR);
  const initialDays = from?.days ?? DEFAULT_DAYS;
  const [days, setDays] = useState<number>(initialDays);
  const [custom, setCustom] = useState(!(DURATION_CHIPS as readonly number[]).includes(initialDays));
  const [customText, setCustomText] = useState(String(initialDays));
  const [start, setStart] = useState(today);
  const [intent, setIntent] = useState(editing?.intent ?? "");
  // Günlük sayfa hedefi (LOM-93): boş = hedef yok. Kitap boş = herhangi bir kitap.
  const [pagesText, setPagesText] = useState(editing?.reading ? String(editing.reading.pages) : "");
  const [bookId, setBookId] = useState(editing?.reading?.bookId ?? "");
  const libraryOn = useAppStore((s) => s.features.library);
  const books = useAppStore((s) => s.books);
  const booksLoaded = useAppStore((s) => s.booksLoaded);
  const libraryLoad = useAppStore((s) => s.libraryLoad);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Basış ve bırakış arka planın kendisinde mi: forma taşan tık kapatmasın (LOM-67).
  const downOnBackdrop = useRef(false);

  useModalLayer();

  useEffect(() => {
    if (!from) nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [from]);

  // Kitap listesi için raf henüz okunmadıysa oku (kütüphane açıkken).
  const showGoal = !from;
  useEffect(() => {
    if (showGoal && libraryOn && !booksLoaded) void libraryLoad().catch(() => {});
  }, [showGoal, libraryOn, booksLoaded, libraryLoad]);
  const shelf = useMemo(
    () => books.filter(hasBookFile).sort((a, b) => a.title.localeCompare(b.title, i18n.language)),
    [books, i18n.language]
  );

  const yesterday = addDays(today, -1);
  const nameOk = from != null || name.trim().length > 0;
  const daysOk = Number.isInteger(days) && days >= MIN_DAYS && days <= MAX_DAYS;
  const startOk = isDayKey(start) && start <= today;
  const goalPages = pagesText ? Number(pagesText) : null;
  const pagesOk = goalPages === null || (Number.isInteger(goalPages) && goalPages >= MIN_GOAL_PAGES && goalPages <= MAX_GOAL_PAGES);
  const reading: ReadingGoal | null = goalPages !== null && pagesOk ? (bookId ? { pages: goalPages, bookId } : { pages: goalPages }) : null;
  // Düzenlemede süre ve başlangıç değişmez; ad ve sayfa hedefi denetlenir. Tur modunda hedef önceki turdan gelir.
  const valid = editing ? nameOk && pagesOk : from ? daysOk && startOk : nameOk && daysOk && startOk && pagesOk;

  const pickChip = (n: number) => {
    setCustom(false);
    setDays(n);
    setCustomText(String(n));
  };
  const onCustomText = (v: string) => {
    const clean = v.replace(/[^\d]/g, "").slice(0, 3);
    setCustomText(clean);
    setDays(clean ? Number(clean) : NaN);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!valid || busy) {
      if (!nameOk) nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        // null: değişiklik yok ya da kasa değişti → kapat. Kayıt hatası fırlar (catch): pencere açık, yazılanlar kalır (LOM-63).
        const h = await habitEdit(editing.id, { name: name.trim(), emoji, color, intent: intent.trim(), reading });
        if (h) onDone?.(h);
        onClose();
        return;
      }
      const h = from
        ? await habitNewRound(from.id, { days, start })
        : await habitAdd({ name: name.trim(), emoji, color, intent: intent.trim() || undefined, days, start, reading });
      // null: bu soyda zaten süren bir tur var ya da kayıt sırasında kasa değişti (sessizce kapanır,
      // LOM-67). Kayıt hatası fırlar ve aşağıda pencerede gösterilir.
      if (h) {
        onDone?.(h);
        onClose();
      } else if (from && hasLiveSibling(from)) {
        setError(t("habit.form.roundExists"));
      } else {
        onClose();
      }
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const shownColor = from?.color ?? color;
  const preview = !editing && daysOk && startOk ? fmtRange(start, addDays(start, days - 1), i18n.language) : null;

  return createPortal(
    <div
      className="lo-modal"
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        // Arka planda başlayıp formda biten sürüklemede tık arka plana düşer; onu da sayma.
        if (e.target !== e.currentTarget) downOnBackdrop.current = false;
      }}
      onClick={(e) => {
        // Hata görünürken ya da kayıt sürerken yanlış tık yazılanları silmesin (LOM-67).
        const fromBackdrop = downOnBackdrop.current && e.target === e.currentTarget;
        downOnBackdrop.current = false;
        if (fromBackdrop && !error && !busy) onClose();
      }}
    >
      <form
        className="lo-hab-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lo-hab-form-title"
        style={colorVars(shownColor)}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        noValidate
      >
        <div className="lo-hab-form__head">
          <span id="lo-hab-form-title" className="lo-hab-form__title">
            {editing ? (
              <Pencil size={15} strokeWidth={2.2} aria-hidden />
            ) : from ? (
              <Repeat size={15} strokeWidth={2.2} aria-hidden />
            ) : (
              <Sprout size={15} strokeWidth={2.2} aria-hidden />
            )}
            {editing ? t("habit.form.editTitle") : from ? t("habit.form.roundTitle") : t("habit.form.title")}
          </span>
          <button type="button" className="lo-hab-iconbtn" onClick={onClose} aria-label={t("habit.close")}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="lo-hab-form__body">
          {from ? (
            <div className="lo-hab-form__from">
              <span className="lo-hab-form__fromemoji" aria-hidden>
                {from.emoji}
              </span>
              <span className="lo-hab-form__fromname">{from.name}</span>
              <span className="lo-hab-form__fromround">{t("habit.round", { n: from.round + 1 })}</span>
            </div>
          ) : (
            <>
              <label className="lo-hab-field">
                <span className="lo-hab-field__label">{t("habit.form.name")}</span>
                <input
                  ref={nameRef}
                  className={"lo-hab-input" + (tried && !nameOk ? " is-invalid" : "")}
                  value={name}
                  maxLength={80}
                  placeholder={t("habit.form.namePlaceholder")}
                  aria-invalid={tried && !nameOk}
                  onChange={(e) => setName(e.target.value)}
                />
                {tried && !nameOk && <span className="lo-hab-field__err">{t("habit.form.nameRequired")}</span>}
              </label>

              <div className="lo-hab-field">
                <span className="lo-hab-field__label" id="lo-hab-emoji-l">
                  {t("habit.form.icon")}
                </span>
                <div className="lo-hab-emojis" role="radiogroup" aria-labelledby="lo-hab-emoji-l">
                  {HABIT_EMOJIS.map((em) => (
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
                <span className="lo-hab-field__label" id="lo-hab-color-l">
                  {t("habit.form.color")}
                </span>
                <div className="lo-hab-colors" role="radiogroup" aria-labelledby="lo-hab-color-l">
                  {HABIT_COLORS.map((c) => (
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
            </>
          )}

          {!editing && (
            <>
              <div className="lo-hab-field">
                <span className="lo-hab-field__label" id="lo-hab-days-l">
                  {t("habit.form.duration")}
                </span>
                <div className="lo-hab-chips" role="radiogroup" aria-labelledby="lo-hab-days-l">
                  {DURATION_CHIPS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={!custom && days === n}
                      className={"lo-hab-chip lo-hab-chip--num" + (!custom && days === n ? " is-on" : "")}
                      onClick={() => pickChip(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={custom}
                    className={"lo-hab-chip" + (custom ? " is-on" : "")}
                    onClick={() => setCustom(true)}
                  >
                    {t("habit.form.custom")}
                  </button>
                </div>
                {custom && (
                  <span className="lo-hab-custom">
                    <input
                      className={"lo-hab-input lo-hab-input--num" + (!daysOk ? " is-invalid" : "")}
                      inputMode="numeric"
                      value={customText}
                      aria-label={t("habit.form.customLabel", { min: MIN_DAYS, max: MAX_DAYS })}
                      aria-invalid={!daysOk}
                      autoFocus
                      onChange={(e) => onCustomText(e.target.value)}
                    />
                    <span className="lo-hab-custom__unit">{t("habit.form.days")}</span>
                    {!daysOk && (
                      <span className="lo-hab-field__err">{t("habit.form.customRange", { min: MIN_DAYS, max: MAX_DAYS })}</span>
                    )}
                  </span>
                )}
              </div>

              <div className="lo-hab-field">
                <span className="lo-hab-field__label" id="lo-hab-start-l">
                  {t("habit.form.start")}
                </span>
                <div className="lo-hab-start" role="group" aria-labelledby="lo-hab-start-l">
                  <button
                    type="button"
                    className={"lo-hab-chip" + (start === today ? " is-on" : "")}
                    aria-pressed={start === today}
                    onClick={() => setStart(today)}
                  >
                    {t("habit.form.today")}
                  </button>
                  <button
                    type="button"
                    className={"lo-hab-chip" + (start === yesterday ? " is-on" : "")}
                    aria-pressed={start === yesterday}
                    onClick={() => setStart(yesterday)}
                  >
                    {t("habit.form.yesterday")}
                  </button>
                  <input
                    type="date"
                    className={"lo-hab-input lo-hab-input--date" + (!startOk ? " is-invalid" : "")}
                    value={start}
                    max={today}
                    aria-label={t("habit.form.startDate")}
                    aria-invalid={!startOk}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                {!startOk && <span className="lo-hab-field__err">{t("habit.form.noFuture")}</span>}
              </div>
            </>
          )}

          {!from && (
            <label className="lo-hab-field">
              <span className="lo-hab-field__label">
                {t("habit.form.intent")} <span className="lo-hab-field__opt">{t("habit.form.optional")}</span>
              </span>
              <input
                className="lo-hab-input"
                value={intent}
                maxLength={200}
                placeholder={t("habit.form.intentPlaceholder")}
                onChange={(e) => setIntent(e.target.value)}
              />
            </label>
          )}

          {showGoal && (
            <div className="lo-hab-field">
              <label className="lo-hab-field__label" htmlFor="lo-hab-pages">
                {t("habit.form.pagesGoal")} <span className="lo-hab-field__opt">{t("habit.form.optional")}</span>
              </label>
              <span className="lo-hab-custom">
                <input
                  id="lo-hab-pages"
                  className={"lo-hab-input lo-hab-input--num" + (!pagesOk ? " is-invalid" : "")}
                  inputMode="numeric"
                  value={pagesText}
                  placeholder="20"
                  aria-invalid={!pagesOk}
                  aria-describedby="lo-hab-pages-hint"
                  onChange={(e) => setPagesText(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                />
                <span className="lo-hab-custom__unit">{t("habit.form.pagesUnit")}</span>
                {!pagesOk && (
                  <span className="lo-hab-field__err">{t("habit.form.pagesRange", { min: MIN_GOAL_PAGES, max: MAX_GOAL_PAGES })}</span>
                )}
              </span>
              <span className="lo-hab-field__opt" id="lo-hab-pages-hint">
                {t("habit.form.pagesHint")}
              </span>
              {goalPages !== null && libraryOn && (
                <label className="lo-hab-field">
                  <span className="lo-hab-field__label">{t("habit.form.book")}</span>
                  <select className="lo-hab-input lo-hab-select" value={bookId} onChange={(e) => setBookId(e.target.value)}>
                    <option value="">{t("habit.form.anyBook")}</option>
                    {shelf.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                    {bookId && !shelf.some((b) => b.id === bookId) && <option value={bookId}>{t("habit.form.missingBook")}</option>}
                  </select>
                </label>
              )}
            </div>
          )}

          {editing && (
            <div className="lo-hab-form__note">
              <span className="lo-hab-form__noterange">
                {t("habit.sealUnit", { count: editing.days })} · {fmtRange(editing.start, endKey(editing), i18n.language)}
              </span>
              <span>{t("habit.form.editFixed")}</span>
            </div>
          )}

          {preview && (
            <div className="lo-hab-form__preview">
              <span className="lo-hab-form__previewdays">{t("habit.sealUnit", { count: days })}</span>
              <span className="lo-hab-form__previewrange">{preview}</span>
            </div>
          )}
          {error && (
            <div className="lo-hab-form__error" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="lo-hab-form__foot">
          <button type="button" className="lo-btn" onClick={onClose}>
            {t("habit.cancel")}
          </button>
          <button type="submit" className="lo-btn lo-btn--primary" disabled={busy || (tried && !valid)}>
            {editing ? t("habit.form.save") : from ? t("habit.form.startRound") : t("habit.form.add")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

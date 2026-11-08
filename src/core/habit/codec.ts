// Alışkanlık dosyasının okunması/yazılması (saf).
//
// Yazma deterministiktir: alanlar sabit sırayla, girintili, sonda tek satır sonu. Aynı kayıt
// her zaman aynı metni üretir; store bu sayede değişmeyen dosyayı yeniden yazmaz ve git farkı
// okunur kalır. Okuma şüphecidir: bozuk JSON, bilinmeyen sürüm ya da zorunlu alanı eksik/yanlış
// dosya null döner (store onu "bozuk" sayar ve asla üstüne yazmaz).

import { READING_BOOK_ID_RE, isDayKey, isGoalPages } from "./model";
import {
  DEFAULT_COLOR,
  HABIT_COLORS,
  HABIT_EMOJIS,
  HABIT_FILE_VERSION,
  MAX_DAYS,
  MIN_DAYS,
  type Habit,
  type HabitColor,
} from "./types";

/** Dosya adı olarak güvenli kimlik (yol ayırıcısı, nokta, boşluk yok). */
export const HABIT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const keyList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter(isDayKey))].sort() : [];

/** Gün → sayfa eşlemesini temizle: geçerli gün, pozitif tam sayı; anahtarlar sıralı. */
function pageMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof v !== "object" || v === null || Array.isArray(v)) return out;
  const src = v as Record<string, unknown>;
  for (const k of Object.keys(src).sort()) {
    const n = src[k];
    if (isDayKey(k) && typeof n === "number" && Number.isInteger(n) && n > 0) out[k] = n;
  }
  return out;
}

/** Kaydı dosya metnine çevir. */
export function encodeHabit(h: Habit): string {
  // Sıra burada sabitlenir; isteğe bağlı alan yoksa hiç yazılmaz.
  const habit: Record<string, unknown> = {
    id: h.id,
    name: h.name,
    emoji: h.emoji,
    color: h.color,
  };
  if (h.intent) habit.intent = h.intent;
  habit.days = h.days;
  habit.start = h.start;
  habit.round = h.round;
  if (h.prevId) habit.prevId = h.prevId;
  habit.lineageId = h.lineageId;
  habit.status = h.status;
  habit.done = keyList(h.done);
  habit.excused = keyList(h.excused);
  // Yarım listesi yalnız doluyken yazılır: dokunulmamış eski dosyanın metni değişmez.
  const half = keyList(h.half).filter((k) => !h.done.includes(k) && !h.excused.includes(k));
  if (half.length) habit.half = half;
  // Okuma hedefi ve sayfa sayımı (LOM-93) yalnız doluyken; anahtarlar sıralı.
  if (h.reading) {
    habit.reading = h.reading.bookId ? { pages: h.reading.pages, bookId: h.reading.bookId } : { pages: h.reading.pages };
  }
  const pages = pageMap(h.pagesRead);
  if (Object.keys(pages).length) habit.pagesRead = pages;
  habit.createdAt = h.createdAt;
  if (h.quitAt !== undefined) habit.quitAt = h.quitAt;
  const file = { v: HABIT_FILE_VERSION, habit };
  return JSON.stringify(file, null, 2) + "\n";
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Dosya metnini kayda çevir; okunamıyorsa null. Eksik isteğe bağlı alanlar varsayılanla dolar. */
export function decodeHabit(raw: string): Habit | null {
  let file: unknown;
  try {
    file = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(file) || file.v !== HABIT_FILE_VERSION || !isObj(file.habit)) return null;
  const h = file.habit;

  // Zorunlu alanlar
  if (typeof h.id !== "string" || !HABIT_ID_RE.test(h.id)) return null;
  if (typeof h.name !== "string" || !h.name.trim()) return null;
  if (typeof h.days !== "number" || !Number.isInteger(h.days) || h.days < MIN_DAYS || h.days > MAX_DAYS) return null;
  if (!isDayKey(h.start)) return null;
  if (typeof h.lineageId !== "string" || !h.lineageId) return null;

  // İsteğe bağlı alanlar — güvenli varsayılan
  const color: HabitColor = HABIT_COLORS.includes(h.color as HabitColor) ? (h.color as HabitColor) : DEFAULT_COLOR;
  const emoji = typeof h.emoji === "string" && h.emoji.trim() ? h.emoji : HABIT_EMOJIS[0];
  const round = typeof h.round === "number" && Number.isInteger(h.round) && h.round >= 1 ? h.round : 1;
  const status = h.status === "quit" ? "quit" : "active";
  const excused = keyList(h.excused);
  const done = keyList(h.done).filter((k) => !excused.includes(k));
  const half = keyList(h.half).filter((k) => !excused.includes(k) && !done.includes(k));

  const out: Habit = {
    id: h.id,
    name: h.name,
    emoji,
    color,
    days: h.days,
    start: h.start,
    round,
    lineageId: h.lineageId,
    status,
    done,
    excused,
    half,
    createdAt: typeof h.createdAt === "number" && Number.isFinite(h.createdAt) ? h.createdAt : 0,
  };
  if (typeof h.intent === "string" && h.intent.trim()) out.intent = h.intent;
  if (typeof h.prevId === "string" && h.prevId) out.prevId = h.prevId;
  if (typeof h.quitAt === "number" && Number.isFinite(h.quitAt)) out.quitAt = h.quitAt;
  // Okuma hedefi (LOM-93): bozuk hedef ya da kitap kimliği alanı tümden düşürür.
  if (isObj(h.reading) && isGoalPages(h.reading.pages)) {
    const bookId = h.reading.bookId;
    if (bookId === undefined) out.reading = { pages: h.reading.pages };
    else if (typeof bookId === "string" && READING_BOOK_ID_RE.test(bookId)) out.reading = { pages: h.reading.pages, bookId };
  }
  const pages = pageMap(h.pagesRead);
  if (Object.keys(pages).length) out.pagesRead = pages;
  return out;
}

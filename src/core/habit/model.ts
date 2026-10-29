// Alışkanlık hesapları — saf fonksiyonlar (React/i18n/dosya yok).
//
// Gün anahtarı yerel takvim günüdür. UTC (toISOString) kullanılmaz: gece yarısına yakın
// saatlerde ve yaz saati geçişinde gün kayardı. Gün ekleme new Date(y, m, d + n) ile yapılır;
// tarih yerel öğlen değil gece yarısı olsa da yalnız yıl/ay/gün bileşenleri okunur.

import {
  DEFAULT_COLOR,
  HABIT_COLORS,
  HABIT_EMOJIS,
  MAX_DAYS,
  MIN_DAYS,
  type CellState,
  type Habit,
  type HabitColor,
  type HabitStats,
  type Outcome,
} from "./types";

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** Tarihin yerel gün anahtarı: YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Anahtarı yerel gece yarısı tarihine çevir; geçersizse null. */
export function parseKey(key: string): Date | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dayKey(d) === key ? d : null; // 2026-02-30 gibi taşan tarihleri reddet
}

export function isDayKey(key: unknown): key is string {
  return typeof key === "string" && parseKey(key) !== null;
}

/** Anahtara n gün ekle (n eksi olabilir). */
export function addDays(key: string, n: number): string {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`Geçersiz gün: ${key}`);
  return dayKey(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
}

/** Turun bütün günleri, başlangıçtan süre kadar. */
export function dayList(habit: Pick<Habit, "start" | "days">): string[] {
  const out: string[] = [];
  for (let i = 0; i < habit.days; i++) out.push(addDays(habit.start, i));
  return out;
}

/** Turun son günü. */
export function endKey(habit: Pick<Habit, "start" | "days">): string {
  return addDays(habit.start, habit.days - 1);
}

/** Günün tur içindeki numarası (1 tabanlı); tur dışındaysa 0. */
export function dayIndex(habit: Pick<Habit, "start" | "days">, key: string): number {
  if (!isDayKey(key) || key < habit.start || key > endKey(habit)) return 0;
  const a = parseKey(habit.start)!;
  const b = parseKey(key)!;
  // Yaz saati günü 23/25 saat sürer; yuvarlama bunu düzeltir.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

const inRound = (habit: Habit, key: string) => dayIndex(habit, key) > 0;

/** Hücre durumu; gün tur dışındaysa null. */
export function cellState(habit: Habit, key: string, today: string): CellState | null {
  if (!inRound(habit, key)) return null;
  if (habit.excused.includes(key)) return "excused";
  if (habit.done.includes(key)) return "done";
  if (key === today) return "today";
  if (key < today) return "missed";
  return "future";
}

export function stats(habit: Habit, today: string): HabitStats {
  const days = dayList(habit);
  const done = new Set(habit.done);
  const excused = new Set(habit.excused);
  let completed = 0;
  let exc = 0;
  let elapsed = 0;
  let remaining = 0;
  let longest = 0;
  let run = 0;
  for (const k of days) {
    const isDone = done.has(k);
    const isExc = excused.has(k);
    if (isDone) completed++;
    if (isExc) exc++;
    if (k > today || (k === today && !isDone && !isExc)) {
      remaining++;
      continue;
    }
    if (!isExc) elapsed++;
    if (isDone) run++;
    else if (!isExc) run = 0; // mazeretli gün seriyi bozmaz, uzatmaz da
    if (run > longest) longest = run;
  }

  // Güncel seri: son geçmiş günden geriye. Bugün henüz işaretsizse dünden başlar.
  let current = 0;
  const end = endKey(habit);
  let k = today > end ? end : today;
  if (k === today && !done.has(k) && !excused.has(k)) k = addDays(k, -1);
  while (k >= habit.start) {
    if (done.has(k)) current++;
    else if (!excused.has(k)) break;
    k = addDays(k, -1);
  }

  return {
    completed,
    excused: exc,
    elapsed,
    percent: elapsed > 0 ? Math.round((100 * completed) / elapsed) : 0,
    currentStreak: current,
    longestStreak: longest,
    remaining,
  };
}

/** Tur bitti mi: bırakıldı ya da süresi doldu (son gün geçti). */
export function isFinished(habit: Habit, today: string): boolean {
  return habit.status === "quit" || today > endKey(habit);
}

/** Bitmiş turun sonucu; sürmekteyse null. Mazeretli gün tamamlanmış sayılır. */
export function outcome(habit: Habit, today: string): Outcome | null {
  if (habit.status === "quit") return { kind: "quit" };
  if (!isFinished(habit, today)) return null;
  const days = dayList(habit);
  const done = new Set(habit.done);
  const excused = new Set(habit.excused);
  if (days.every((k) => done.has(k) || excused.has(k))) return { kind: "completed" };
  return { kind: "ended", done: days.filter((k) => done.has(k)).length, total: days.length };
}

const sortedUnique = (keys: string[]) => [...new Set(keys)].sort();

/** Değiştirilebilir gün mü: tur içinde, bugünden ileri değil, tur bırakılmamış. */
function editable(habit: Habit, key: string, today: string): boolean {
  return habit.status !== "quit" && inRound(habit, key) && key <= today;
}

/** Günün çentiğini aç/kapat. Gelecek gün, tur dışı gün ya da bırakılmış turda aynı nesne döner. */
export function toggleDay(habit: Habit, key: string, today: string): Habit {
  if (!editable(habit, key, today)) return habit;
  if (habit.done.includes(key)) return { ...habit, done: habit.done.filter((k) => k !== key) };
  return {
    ...habit,
    done: sortedUnique([...habit.done, key]),
    excused: habit.excused.filter((k) => k !== key),
  };
}

/** Günü mazeretli işaretle ya da işareti kaldır. Mazeretli gün "yapıldı"dan düşer. */
export function setExcused(habit: Habit, key: string, excused: boolean, today: string): Habit {
  if (!editable(habit, key, today)) return habit;
  const has = habit.excused.includes(key);
  if (excused === has) return habit;
  if (!excused) return { ...habit, excused: habit.excused.filter((k) => k !== key) };
  return {
    ...habit,
    excused: sortedUnique([...habit.excused, key]),
    done: habit.done.filter((k) => k !== key),
  };
}

/** Dosya adına uygun kimlik: zaman damgası (base36) + 6 rastgele karakter, yalnız [a-z0-9]. */
export function newId(now: number): string {
  let rnd = "";
  while (rnd.length < 6) rnd += Math.random().toString(36).slice(2);
  return `${Math.max(0, Math.floor(now)).toString(36)}${rnd.slice(0, 6)}`;
}

export interface NewHabitInput {
  name: string;
  emoji?: string;
  color?: HabitColor;
  intent?: string;
  days: number;
  start: string;
}

function checkSpan(days: number, start: string, today: string): void {
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
    throw new Error(`Süre ${MIN_DAYS}-${MAX_DAYS} gün arasında olmalı`);
  }
  if (!isDayKey(start)) throw new Error(`Geçersiz başlangıç günü: ${start}`);
  if (start > today) throw new Error("Başlangıç günü ileri bir tarih olamaz");
}

/** Yeni alışkanlık (1. tur). Boş ad, aralık dışı süre ya da ileri başlangıç reddedilir. */
export function newHabit(input: NewHabitInput, today: string, now: number): Habit {
  const name = input.name.trim();
  if (!name) throw new Error("Alışkanlığın adı boş olamaz");
  checkSpan(input.days, input.start, today);
  const id = newId(now);
  const intent = input.intent?.trim();
  return {
    id,
    name,
    emoji: input.emoji?.trim() || HABIT_EMOJIS[0],
    color: input.color ?? DEFAULT_COLOR,
    ...(intent ? { intent } : {}),
    days: input.days,
    start: input.start,
    round: 1,
    lineageId: id,
    status: "active",
    done: [],
    excused: [],
    createdAt: now,
  };
}

/** Önceki turdan bağlı yeni kayıt: aynı ad/simge/renk/niyet, boş günler. */
function successor(prev: Habit, days: number, start: string, round: number, now: number): Habit {
  const id = newId(now);
  return {
    id,
    name: prev.name,
    emoji: prev.emoji,
    color: prev.color,
    ...(prev.intent ? { intent: prev.intent } : {}),
    days,
    start,
    round,
    prevId: prev.id,
    lineageId: prev.lineageId,
    status: "active",
    done: [],
    excused: [],
    createdAt: now,
  };
}

/** "Bir tur daha": tur numarası bir artar, süre değişebilir (ör. 21 bitti, 41'e geçildi). */
export function newRound(prev: Habit, opts: { days: number; start: string }, today: string, now: number): Habit {
  checkSpan(opts.days, opts.start, today);
  return successor(prev, opts.days, opts.start, prev.round + 1, now);
}

/** "Yeniden başlat": aynı süreyle bugünden baştan; tur numarası aynı, öncekine bağlı. */
export function restart(habit: Habit, today: string, now: number): Habit {
  checkSpan(habit.days, today, today);
  return successor(habit, habit.days, today, habit.round, now);
}

/** "Bırak": tur Geçmiş'e Bırakıldı olarak iner. */
export function quitHabit(habit: Habit, now: number): Habit {
  if (habit.status === "quit") return habit;
  return { ...habit, status: "quit", quitAt: now };
}

export interface EditHabitInput {
  name: string;
  emoji?: string;
  color?: HabitColor;
  intent?: string;
}

/**
 * Düzenle: yalnız ad, simge, renk ve niyet değişir. Süre, başlangıç, tur, soy, durum ve
 * çentikler olduğu gibi kalır. Boş ad ya da bilinmeyen renk reddedilir; niyet boşaltılırsa
 * alan kalkar. Hiçbir şey değişmiyorsa aynı nesne döner (store yazmaz).
 */
export function editHabit(habit: Habit, input: EditHabitInput): Habit {
  const name = input.name.trim();
  if (!name) throw new Error("Alışkanlığın adı boş olamaz");
  const color = input.color ?? habit.color;
  if (!(HABIT_COLORS as readonly string[]).includes(color)) throw new Error(`Geçersiz renk: ${color}`);
  const emoji = input.emoji?.trim() || habit.emoji;
  const intent = input.intent?.trim() || undefined;
  if (name === habit.name && emoji === habit.emoji && color === habit.color && intent === habit.intent) return habit;
  const next: Habit = { ...habit, name, emoji, color };
  if (intent) next.intent = intent;
  else delete next.intent;
  return next;
}

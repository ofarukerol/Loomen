// Alışkanlık ekranının saf görünüm yardımcıları (LOM-55).
//
// Ekran ne göstereceğine burada karar verir: Aktif listede kim, hangi sırayla; mühür ne zaman;
// son 7 gün şeridi; Geçmiş'in soy grupları ve süzgeci. React/i18n/dosya yok — node testi koşar.

import { addDays, cellState, dayIndex, endKey, isFinished, outcome } from "./model";
import type { CellState, Habit, Outcome } from "./types";

/** Geçmiş süzgeci — localStorage'a giren tek alışkanlık ayarı. */
export type HabitHistoryFilter = "all" | "completed" | "quit";
export const HISTORY_FILTERS: readonly HabitHistoryFilter[] = ["all", "completed", "quit"];

export function isHistoryFilter(v: unknown): v is HabitHistoryFilter {
  return typeof v === "string" && (HISTORY_FILTERS as readonly string[]).includes(v);
}

const byCreated = (a: Habit, b: Habit) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Bugün işaretli mi (yapıldı ya da mazeretli). */
export function markedToday(habit: Habit, today: string): boolean {
  return habit.done.includes(today) || habit.excused.includes(today);
}

/** Bugün herhangi bir işaret var mı (yapıldı, yarım ya da mazeretli) — Aktif liste sırası için. */
export function touchedToday(habit: Habit, today: string): boolean {
  return markedToday(habit, today) || habit.half.includes(today);
}

/**
 * Tur bitti ve bütün günleri işaretli, ama son günü hâlâ bugün: kart mühürle Aktif listede
 * kalır, ertesi gün Geçmiş'e iner. Bırakılmış tur mühürlenmez; yarım gün işaretli sayılmaz.
 */
export function isSealed(habit: Habit, today: string): boolean {
  if (habit.status !== "active" || endKey(habit) !== today) return false;
  for (let k = habit.start; k <= today; k = addDays(k, 1)) {
    if (!habit.done.includes(k) && !habit.excused.includes(k)) return false;
  }
  return true;
}

/**
 * Aktif listedeki turlar: bırakılmamış ve süresi dolmamış. Bugün henüz hiç dokunulmamışlar
 * üstte (yarım yapılan alta iner); her grubun içinde oluşturulma sırası korunur. Başlangıcı ileride olan tur olmaz
 * (çekirdek ileri tarihi reddeder), yine de gelirse işaretsizler arasında durur.
 */
export function activeHabits(habits: Habit[], today: string): Habit[] {
  const live = habits.filter((h) => !isFinished(h, today)).sort(byCreated);
  return [...live.filter((h) => !touchedToday(h, today)), ...live.filter((h) => touchedToday(h, today))];
}

/** "Bugünün hepsi tamam": en az bir aktif tur var ve hepsi bugün işaretli (yarım sayılmaz). */
export function allDoneToday(habits: Habit[], today: string): boolean {
  const live = habits.filter((h) => !isFinished(h, today));
  return live.length > 0 && live.every((h) => markedToday(h, today));
}

/** Planner kartı özeti: süren turlardan bugün işaretli olanlar (yapıldı ya da mazeretli; yarım değil) / süren tur sayısı. */
export function todayProgress(habits: Habit[], today: string): { done: number; total: number } {
  const live = habits.filter((h) => !isFinished(h, today));
  return { done: live.filter((h) => markedToday(h, today)).length, total: live.length };
}

export interface StripDay {
  key: string;
  /** Tur dışındaki gün (başlangıçtan önce) null. */
  state: CellState | null;
}

/**
 * Son 7 günün şeridi, eskiden yeniye. Süren turda bugünde, süresi dolan turda son günde,
 * bırakılan turda bırakma gününde biter. Tur 7 günden kısaysa ya da yeni başladıysa baştaki
 * günler tur dışıdır (null).
 */
export function lastSevenStrip(habit: Habit, today: string): StripDay[] {
  const end = habit.status === "quit" ? finishedOn(habit) : endKey(habit);
  const last = today > end ? end : today;
  const out: StripDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = addDays(last, -i);
    out.push({ key, state: cellState(habit, key, today) });
  }
  return out;
}

/** 7, 14, 21 … ve son gün dönüm noktasıdır (gün numarası 1 tabanlı). */
export function isMilestone(dayNo: number, total: number): boolean {
  return dayNo > 0 && dayNo <= total && (dayNo % 7 === 0 || dayNo === total);
}

export interface HistoryItem {
  habit: Habit;
  outcome: Outcome;
  /** Turun kapandığı gün: bırakıldıysa bırakma günü (son günden sonra değil), değilse son gün. */
  finishedOn: string;
}

export interface HistoryGroup {
  lineageId: string;
  /** Turlar, en yenisi başta. */
  items: HistoryItem[];
  /** Aynı soydan süren bir tur varsa onun kimliği ("Bir tur daha" yerine ona gidilir). */
  activeId: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Turun kapandığı gün: bırakıldıysa bırakma günü (son günden sonra olamaz), değilse son gün. */
export function finishedOn(habit: Habit): string {
  const end = endKey(habit);
  if (habit.status === "quit" && habit.quitAt != null && Number.isFinite(habit.quitAt)) {
    const q = localKey(habit.quitAt);
    return q < end ? q : end;
  }
  return end;
}

/**
 * Bırakılan turun bırakma gününün tur içindeki sırası (1 tabanlı, 1..days); bırakılmadıysa null.
 * Bırakma anı başlangıçtan önceyse 1 sayılır.
 */
export function quitDayNo(habit: Habit): number | null {
  if (habit.status !== "quit") return null;
  return Math.min(Math.max(dayIndex(habit, finishedOn(habit)), 1), habit.days);
}

/**
 * Önceki sırayı koru: `prevIds` sırasıyla hâlâ listede olan turlar (güncel nesneleriyle), ardından
 * öncekinde olmayan yeniler kendi sıralarıyla. Çentik atılan kart parmağın altından kaçmasın diye.
 */
export function keepOrder(prevIds: string[], next: Habit[]): Habit[] {
  if (prevIds.length === 0) return next;
  const byId = new Map(next.map((h) => [h.id, h]));
  const seen = new Set<string>();
  const out: Habit[] = [];
  for (const id of prevIds) {
    const h = byId.get(id);
    if (h && !seen.has(id)) {
      out.push(h);
      seen.add(id);
    }
  }
  for (const h of next) if (!seen.has(h.id)) out.push(h);
  return out;
}

function passes(o: Outcome, filter: HabitHistoryFilter): boolean {
  if (filter === "completed") return o.kind === "completed";
  if (filter === "quit") return o.kind === "quit";
  return true;
}

/**
 * Geçmiş: bitmiş turlar soylarına göre gruplu. Süzgeç tur tur uygulanır ("Bitti 17/21" yalnız
 * Hepsi'nde görünür); boş kalan grup düşer. Gruplar en son kapanan turuna göre yeniden eskiye.
 */
export function historyGroups(habits: Habit[], today: string, filter: HabitHistoryFilter = "all"): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>();
  const activeOf = new Map<string, Habit>();
  for (const h of [...habits].sort(byCreated)) {
    if (!isFinished(h, today)) {
      activeOf.set(h.lineageId, h); // en yeni süren tur kazanır
      continue;
    }
    const o = outcome(h, today);
    if (!o || !passes(o, filter)) continue;
    let g = groups.get(h.lineageId);
    if (!g) {
      g = { lineageId: h.lineageId, items: [], activeId: null };
      groups.set(h.lineageId, g);
    }
    g.items.push({ habit: h, outcome: o, finishedOn: finishedOn(h) });
  }
  const latest = (g: HistoryGroup) => g.items.reduce((m, it) => (it.finishedOn > m ? it.finishedOn : m), "");
  const list = [...groups.values()];
  for (const g of list) {
    g.activeId = activeOf.get(g.lineageId)?.id ?? null;
    // En yeni tur başta: tur numarası, sonra oluşturulma anı.
    g.items.sort((a, b) => b.habit.round - a.habit.round || byCreated(b.habit, a.habit));
  }
  return list.sort((a, b) => {
    const la = latest(a);
    const lb = latest(b);
    return la < lb ? 1 : la > lb ? -1 : a.lineageId < b.lineageId ? -1 : a.lineageId > b.lineageId ? 1 : 0;
  });
}

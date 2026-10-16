// Tekrar eden görev (🔁) kuralını çözer ve bir sonraki tarihi hesaplar — Obsidian Tasks uyumlu.
// Desteklenen biçimler TaskDetail'in ürettikleri: "every day", "every 2 days",
// "every week on Monday", "every month on the 15th", "every year"; sonda "when done" eki
// varsa baz tarih bugündür. Tanınmayan kuralda null/undefined döner: çağıran yalnız işaretler.

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  getDaysInMonth,
  getISODay,
  parseISO,
  setDate,
  startOfMonth,
} from "date-fns";

export type RecurrenceUnit = "day" | "week" | "month" | "year";

export interface Recurrence {
  interval: number;
  unit: RecurrenceUnit;
  /** ISO hafta günü: 1 = Pazartesi … 7 = Pazar (yalnız haftalık). */
  weekday?: number;
  /** Ayın günü (yalnız aylık). */
  dom?: number;
  whenDone: boolean;
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Kural metnini çöz; tanınmazsa null. */
export function parseRecurrence(rule: string | undefined): Recurrence | null {
  if (!rule) return null;
  let s = rule.toLowerCase().replace(/\s+/g, " ").trim();
  const whenDone = /\bwhen done$/.test(s);
  if (whenDone) s = s.replace(/\s*when done$/, "").trim();
  const m = s.match(/^every (?:(\d+) )?(day|week|month|year)s?(?: (.*))?$/);
  if (!m) return null;
  const interval = m[1] ? Number(m[1]) : 1;
  if (!Number.isFinite(interval) || interval < 1) return null;
  const unit = m[2] as RecurrenceUnit;
  const rest = (m[3] ?? "").trim();
  const r: Recurrence = { interval, unit, whenDone };
  if (!rest) return r;
  if (unit === "week") {
    const w = rest.match(/^on ([a-z]+)$/);
    const idx = w ? WEEKDAYS.indexOf(w[1]) : -1;
    if (idx < 0) return null;
    r.weekday = idx + 1;
    return r;
  }
  if (unit === "month") {
    const d = rest.match(/^on the (\d{1,2})(?:st|nd|rd|th)?$/);
    const dom = d ? Number(d[1]) : 0;
    if (dom < 1 || dom > 31) return null;
    r.dom = dom;
    return r;
  }
  return null; // tanınmayan ek ("every day at 9" vb.)
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Ayın `dom` gününe git; ay kısaysa son güne kırp (31 → 30, 29 Şubat → 28). */
const clampDom = (monthStart: Date, dom: number) => setDate(monthStart, Math.min(dom, getDaysInMonth(monthStart)));

/**
 * Bir sonraki tekrarın tarihi (ISO). Aday, max(baz, bugün) tarihinden sonraki ilk tekrardır:
 * kaçırılan geçmiş tekrarlar atlanır, toplu kopya birikmez. Tanınmayan kuralda undefined.
 */
export function nextRecurrenceDate(rule: string | undefined, baseISO: string, todayISO: string): string | undefined {
  const r = parseRecurrence(rule);
  if (!r) return undefined;
  const base = parseISO(r.whenDone ? todayISO : baseISO);
  const today = parseISO(todayISO);
  if (Number.isNaN(base.getTime()) || Number.isNaN(today.getTime())) return undefined;
  const floor = today > base ? today : base;
  const n = r.interval;

  // k. tekrar (k ≥ 1) — her biri bazdan hesaplanır, ay sonu kırpması kaymaz.
  let occ: (k: number) => Date;
  let k = 1;
  if (r.unit === "day") {
    occ = (i) => addDays(base, i * n);
    k = Math.max(1, Math.floor(differenceInCalendarDays(floor, base) / n));
  } else if (r.unit === "week" && r.weekday) {
    // Baz haftasında o gün henüz gelmediyse ilk tekrar bu hafta, yoksa N hafta sonra
    // (Obsidian Tasks gibi: "every 2 weeks on Monday" Pazartesi bazdan 2 hafta sonraya).
    const wd = getISODay(base);
    const thisWeek = addDays(base, r.weekday - wd);
    const first = r.weekday > wd ? thisWeek : addWeeks(thisWeek, n);
    occ = (i) => addWeeks(first, (i - 1) * n);
    k = Math.max(1, Math.floor(differenceInCalendarDays(floor, first) / (7 * n)));
  } else if (r.unit === "week") {
    occ = (i) => addWeeks(base, i * n);
    k = Math.max(1, Math.floor(differenceInCalendarDays(floor, base) / (7 * n)));
  } else if (r.unit === "month" && r.dom) {
    const m0 = startOfMonth(base);
    const sameMonth = clampDom(m0, r.dom) > base; // bu ayın o günü henüz gelmediyse önce o
    const off = sameMonth ? 0 : n;
    occ = (i) => clampDom(addMonths(m0, off + (i - 1) * n), r.dom!);
  } else if (r.unit === "month") {
    occ = (i) => addMonths(base, i * n);
  } else {
    occ = (i) => addYears(base, i * n);
  }

  for (let guard = 0; guard < 100000; guard++, k++) {
    const d = occ(k);
    if (d > floor) return iso(d);
  }
  return undefined;
}

/** İki ISO tarih arasındaki gün farkı (b - a). */
export function daysBetweenISO(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

/** ISO tarihe gün ekle. */
export function shiftISO(d: string, days: number): string {
  return iso(addDays(parseISO(d), days));
}

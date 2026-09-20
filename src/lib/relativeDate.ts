import { differenceInCalendarDays, parseISO } from "date-fns";
import i18n from "../i18n";

/** Göreli tarih anahtarı + yer tutucu değeri (metin taşımaz — çeviri dosyasından gelir). */
export interface RelativeKey {
  key: string;
  n: number;
}

const DAYS_IN_WEEK = 7;
const DAYS_IN_MONTH = 30.44;
const DAYS_IN_YEAR = 365.25;

/**
 * Gün farkını kademeye ayır: bugün → gün → hafta → ay → yıl.
 * Metin üretmez; yalnız anahtar ve {{n}} değerini döndürür (test edilebilir saf fonksiyon).
 */
export function relativeKey(dateISO: string, todayISO: string): RelativeKey {
  const d = differenceInCalendarDays(parseISO(dateISO), parseISO(todayISO));
  if (d === 0) return { key: "rel.today", n: 0 };

  const abs = Math.abs(d);
  const future = d > 0;
  const pick = (one: string, many: string, n: number): RelativeKey =>
    n === 1 ? { key: one, n } : { key: many, n };

  if (abs < DAYS_IN_WEEK) {
    return future
      ? pick("rel.inOneDay", "rel.inDays", abs)
      : pick("rel.oneDayAgo", "rel.daysAgo", abs);
  }
  if (abs < 28) {
    const n = Math.round(abs / DAYS_IN_WEEK);
    return future
      ? pick("rel.inOneWeek", "rel.inWeeks", n)
      : pick("rel.oneWeekAgo", "rel.weeksAgo", n);
  }
  if (abs < DAYS_IN_YEAR) {
    const n = Math.max(1, Math.round(abs / DAYS_IN_MONTH));
    return future
      ? pick("rel.inOneMonth", "rel.inMonths", n)
      : pick("rel.oneMonthAgo", "rel.monthsAgo", n);
  }
  const n = Math.max(1, Math.round(abs / DAYS_IN_YEAR));
  return future ? pick("rel.inOneYear", "rel.inYears", n) : pick("rel.oneYearAgo", "rel.yearsAgo", n);
}

/** Göreli tarih etiketi — aktif dilde ("bugün", "6 gün sonra", "bir ay önce"…). */
export function relativeLabel(dateISO: string, todayISO: string): string {
  const { key, n } = relativeKey(dateISO, todayISO);
  return i18n.t(key, { n });
}

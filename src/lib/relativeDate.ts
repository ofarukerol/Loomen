import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Göreli tarih etiketi (Türkçe) — prototip diliyle birebir:
 * "bugün", "bir gün sonra", "6 gün sonra", "bir ay sonra", "bir gün önce", "5 gün önce", "bir ay önce".
 */
export function relativeLabel(dateISO: string, todayISO: string): string {
  const d = differenceInCalendarDays(parseISO(dateISO), parseISO(todayISO));
  if (d === 0) return "bugün";
  const abs = Math.abs(d);
  const ay = abs >= 28;
  if (d > 0) {
    if (d === 1) return "bir gün sonra";
    return ay ? "bir ay sonra" : `${d} gün sonra`;
  }
  if (d === -1) return "bir gün önce";
  return ay ? "bir ay önce" : `${abs} gün önce`;
}

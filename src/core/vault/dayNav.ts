// Günlük notta gün gün gezinme (önceki/sonraki gün) için saf tarih yardımcıları.
// Saf modül: i18n/date-fns içermez, node testinde koşar. Milisaniye toplamak yerine yerel
// tarih parçaları (yıl/ay/gün) üzerinden çalışır → yaz saati geçişi günü kaydıramaz.

import { noteDateOf } from "./planDate";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** ISO tarihe (`YYYY-MM-DD`) `days` gün ekler (negatif = geri); ay/yıl sınırını geçer. Geçersiz girdi → undefined. */
export function addDaysISO(iso: string, days: number): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || !Number.isInteger(days)) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // UTC gece yarısı: yerel saat dilimi/yaz saati hesaba hiç girmez.
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return undefined;
  t.setUTCDate(t.getUTCDate() + days);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** `Date` → yerel `YYYY-MM-DD`. */
export function localISO(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO tarih → o günün yerel `Date`'i (öğlen 12:00 değil, gece yarısı; yalnız tarih parçaları önemlidir). */
export function isoToLocalDate(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return localISO(dt) === iso ? dt : undefined;
}

/** Günlük not dosya adı/yolundan tarih: `Günlük/2026/11-Kasım/2026-11-28-Cumartesi.md` → `2026-11-28`. */
export function dailyDateOfPath(path: string): string | undefined {
  return noteDateOf(path);
}

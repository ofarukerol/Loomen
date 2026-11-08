// Okuma istatistiği (LOM-87) — saf fonksiyonlar (React/i18n/dosya yok).
//
// Okuyucu iki şey bildirir: bugün ilk kez okunan sayfa birimi (habit/reading.ts settleNewUnit) ve
// aktif okuma süresi (aşağıdaki saat). İkisi gün → kitap → [sayfa, saniye] biçiminde biriktirilir.
// Kayıt cihaza özeldir (ayarlar kaydında durur), kasaya yazılmaz ve eşitlenmez; gece yarısı
// sıfırlanmaz, PRUNE_DAYS günden eskisi budanır. Biten kitap sayısı kasadaki kitap kayıtlarından
// (durum "done") gelir, o yüzden cihazlar arası zaten ortaktır.
//
// Gün anahtarı alışkanlıktaki gibi yerel takvim günüdür (YYYY-MM-DD).

import { addDays, dayKey, isDayKey, READING_BOOK_ID_RE } from "../habit/model";
import type { Book } from "./types";

/** Kayıt sürümü. */
export const STATS_VERSION = 1;
/** Bu kadar günden eski kayıt budanır. */
export const PRUNE_DAYS = 400;
/** Son etkinlikten bu kadar süre sonra okuma süresi sayılmaz (ekran açık bırakıldı). */
export const IDLE_MS = 90_000;
/** Bir günde bir kitaba yazılabilecek en çok sayfa ve saniye (bozuk/aşırı kaydı sınırlar). */
const MAX_PAGES_PER_DAY = 5000;
const MAX_SECONDS_PER_DAY = 86_400;
/** Bir günde tutulan en çok kitap. */
const MAX_BOOKS_PER_DAY = 200;

/** Bir günde bir kitap: [okunan sayfa, aktif saniye]. */
export type DayBook = [pages: number, seconds: number];

export interface ReadingStats {
  v: typeof STATS_VERSION;
  /** Gün anahtarı → kitap kimliği → [sayfa, saniye]. Boş gün/kitap tutulmaz. */
  days: Record<string, Record<string, DayBook>>;
}

export const emptyStats = (): ReadingStats => ({ v: STATS_VERSION, days: {} });

/** Kitap kimliği geçerli mi. `__proto__` düz nesnede alan değil prototip olurdu, reddedilir. */
const validId = (id: string): boolean => id !== "__proto__" && READING_BOOK_ID_RE.test(id);

const cleanInt = (n: unknown, max: number): number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : 0;

/** Kayıttan gelen istatistiği temizle. Bozuk gün, kimlik ve sayı atılır; hiçbir şey hata atmaz. */
export function normalizeStats(v: unknown): ReadingStats {
  const out = emptyStats();
  if (typeof v !== "object" || v === null || Array.isArray(v)) return out;
  const days = (v as Record<string, unknown>).days;
  if (typeof days !== "object" || days === null || Array.isArray(days)) return out;
  for (const [day, books] of Object.entries(days as Record<string, unknown>)) {
    if (!isDayKey(day) || typeof books !== "object" || books === null || Array.isArray(books)) continue;
    const clean: Record<string, DayBook> = {};
    let n = 0;
    for (const [id, rec] of Object.entries(books as Record<string, unknown>)) {
      if (n >= MAX_BOOKS_PER_DAY) break;
      if (!validId(id) || !Array.isArray(rec)) continue;
      const pages = cleanInt(rec[0], MAX_PAGES_PER_DAY);
      const seconds = cleanInt(rec[1], MAX_SECONDS_PER_DAY);
      if (!pages && !seconds) continue;
      clean[id] = [pages, seconds];
      n++;
    }
    if (n) out.days[day] = clean;
  }
  return out;
}

/**
 * Bir güne bir kitabın sayfa ve/veya saniyesini ekle. Geçersiz gün/kimlik ya da sıfır ekleme
 * aynı nesneyi döndürür (gereksiz kayıt tetiklenmesin). Günlük üst sınırlar aşılmaz.
 */
export function statsAdd(
  stats: ReadingStats,
  day: string,
  bookId: string,
  add: { pages?: number; seconds?: number },
): ReadingStats {
  if (!isDayKey(day) || !validId(bookId)) return stats;
  const dp = cleanInt(add.pages, MAX_PAGES_PER_DAY);
  const ds = cleanInt(add.seconds, MAX_SECONDS_PER_DAY);
  if (!dp && !ds) return stats;
  const dayRec = stats.days[day] ?? {};
  const prev = dayRec[bookId];
  if (!prev && Object.keys(dayRec).length >= MAX_BOOKS_PER_DAY) return stats;
  const pages = Math.min(MAX_PAGES_PER_DAY, (prev?.[0] ?? 0) + dp);
  const seconds = Math.min(MAX_SECONDS_PER_DAY, (prev?.[1] ?? 0) + ds);
  if (prev && prev[0] === pages && prev[1] === seconds) return stats;
  return { v: STATS_VERSION, days: { ...stats.days, [day]: { ...dayRec, [bookId]: [pages, seconds] } } };
}

/** `today`den `keepDays` gün öncesinden eski günleri at. Değişiklik yoksa aynı nesne döner. */
export function pruneStats(stats: ReadingStats, today: string, keepDays = PRUNE_DAYS): ReadingStats {
  if (!isDayKey(today)) return stats;
  const cutoff = addDays(today, -keepDays);
  const keep = Object.keys(stats.days).filter((d) => d > cutoff);
  if (keep.length === Object.keys(stats.days).length) return stats;
  const days: ReadingStats["days"] = {};
  for (const d of keep) days[d] = stats.days[d];
  return { v: STATS_VERSION, days };
}

// ——— Aktif okuma süresi ———

/**
 * İki an arasında sayılacak aktif okuma süresi (ms). Aradaki boşluk IDLE_MS'i geçerse en çok
 * IDLE_MS sayılır: sayfada uzun düşünmek okumaya girer, ekranı açık bırakıp gitmek girmez. Saat
 * geri giderse 0.
 */
export function activeSeconds(fromMs: number, lastActivityMs: number, nowMs: number, idleMs = IDLE_MS): number {
  if (![fromMs, lastActivityMs, nowMs].every(Number.isFinite)) return 0;
  const end = Math.min(nowMs, Math.max(fromMs, lastActivityMs) + idleMs);
  return Math.max(0, end - fromMs) / 1000;
}

/** Okuyucu açıkken süren saat: `from`a kadar sayıldı, son etkinlik `last`. Kalıcı değil. */
export interface ReadClock {
  bookId: string;
  from: number;
  last: number;
}

/**
 * Saatten çıkan süre: kitaba yazılacak tam saniye. Gün bilgisi taşımaz; çağıran, yazıldığı anın
 * gününe ekler (gece yarısını aşan en çok IDLE_MS yeni güne düşer).
 */
export interface ReadCredit {
  bookId: string;
  seconds: number;
}

/**
 * Okuyucuda etkinlik (konum değişimi, dokunma, kaydırma). Kitap aynıysa ve kullanıcı boşta
 * kalmadıysa geçen tam saniyeler yazılır, artan kesir saatte kalır. Boşta kalındıysa ya da kitap
 * değiştiyse eski saat kapanır, sayaç şimdiden başlar.
 */
export function clockStep(prev: ReadClock | null, bookId: string, now: number): { next: ReadClock; credit: ReadCredit | null } {
  if (!prev || prev.bookId !== bookId || now - prev.last > IDLE_MS || now < prev.from) {
    return { next: { bookId, from: now, last: now }, credit: clockFinish(prev, now) };
  }
  const secs = Math.floor(activeSeconds(prev.from, prev.last, now));
  const next = { bookId, from: prev.from + secs * 1000, last: now };
  return { next, credit: secs > 0 ? { bookId, seconds: secs } : null };
}

/** Okuyucu kapanınca/gizlenince: kalan aktif süreyi (en çok IDLE_MS) yaz. */
export function clockFinish(prev: ReadClock | null, now: number): ReadCredit | null {
  if (!prev) return null;
  const secs = Math.round(activeSeconds(prev.from, prev.last, now));
  return secs > 0 ? { bookId: prev.bookId, seconds: secs } : null;
}

// ——— Özet ———

export interface StatsTotal {
  pages: number;
  seconds: number;
}

export interface StatsDay extends StatsTotal {
  day: string;
}

export interface StatsSummary {
  today: StatsTotal;
  /** Bugün dahil son 7 gün. */
  week: StatsTotal;
  /** Kayıttaki bütün günler (en çok PRUNE_DAYS). */
  total: StatsTotal;
  /** Bugün dahil son 7 gün, eskiden yeniye; okuma olmayan gün sıfırla gelir. */
  last7: StatsDay[];
  /** Okuma yapılan gün sayısı. */
  activeDays: number;
  /** Rafta durumu "bitti" olan kitap sayısı (kasadan, cihazlar arası ortak). */
  finishedBooks: number;
  /** Bugün dahil son 7 günde bitirilen kitap sayısı (finishedAt'e göre). */
  finishedThisWeek: number;
  /** Son 7 günde en çok okunan kitaplar (süre, sonra sayfa sırasıyla; en çok 5). */
  topBooks: Array<StatsTotal & { bookId: string }>;
  /** Hiç sayfa ya da süre yoksa true (boş durum metni için). */
  empty: boolean;
}

const sumDay = (rec: Record<string, DayBook> | undefined): StatsTotal => {
  let pages = 0;
  let seconds = 0;
  for (const [p, s] of Object.values(rec ?? {})) {
    pages += p;
    seconds += s;
  }
  return { pages, seconds };
};

/**
 * Raporlar ve raf için özet. `books` kasadaki kitap kayıtlarıdır (biten kitap sayısı için).
 * `today` geçersizse hata atmaz; bugünün yerel günü kullanılır.
 */
export function summarizeStats(
  stats: ReadingStats,
  books: ReadonlyArray<Pick<Book, "id" | "status" | "finishedAt">>,
  today: string,
): StatsSummary {
  if (!isDayKey(today)) today = dayKey(new Date());
  const last7: StatsDay[] = [];
  const weekDays = new Set<string>();
  const per = new Map<string, StatsTotal>();
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    weekDays.add(day);
    last7.push({ day, ...sumDay(stats.days[day]) });
    for (const [id, [p, s]] of Object.entries(stats.days[day] ?? {})) {
      const t = per.get(id) ?? { pages: 0, seconds: 0 };
      per.set(id, { pages: t.pages + p, seconds: t.seconds + s });
    }
  }
  const week = last7.reduce((a, d) => ({ pages: a.pages + d.pages, seconds: a.seconds + d.seconds }), { pages: 0, seconds: 0 });
  const total = { pages: 0, seconds: 0 };
  let activeDays = 0;
  for (const rec of Object.values(stats.days)) {
    const t = sumDay(rec);
    total.pages += t.pages;
    total.seconds += t.seconds;
    if (t.pages || t.seconds) activeDays++;
  }
  const done = books.filter((b) => b.status === "done");
  const finishedThisWeek = done.filter(
    (b) => typeof b.finishedAt === "number" && Number.isFinite(b.finishedAt) && weekDays.has(dayKey(new Date(b.finishedAt))),
  ).length;
  const topBooks = [...per.entries()]
    .map(([bookId, t]) => ({ bookId, ...t }))
    .sort((a, b) => b.seconds - a.seconds || b.pages - a.pages || a.bookId.localeCompare(b.bookId))
    .slice(0, 5);
  return {
    today: { pages: last7[6].pages, seconds: last7[6].seconds },
    week,
    total,
    last7,
    activeDays,
    finishedBooks: done.length,
    finishedThisWeek,
    topBooks,
    empty: total.pages === 0 && total.seconds === 0,
  };
}

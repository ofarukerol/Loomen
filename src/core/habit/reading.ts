// Okuma alışkanlığı: okuyucudaki konumdan okunan sayfayı saymak (LOM-93) — saf fonksiyonlar.
//
// Akış: okuyucu her konum değişiminde bir "birim" (PDF'te sayfa, EPUB'da sanal sayfa) bildirir.
// Birim en az READ_DWELL_MS ekranda kalırsa "okundu" sayılır (hızlı kaydırma sayfaları saymasın).
// Oturan birim cihaza özel günlük kütüğe yazılır; aynı gün aynı birim ikinci kez sayılmaz. Yeni
// birim, hedefi olan ve kitabı eşleşen süren turlara bir sayfa olarak eklenir.
//
// Kütük cihaza özeldir (ayarlar kaydında durur), kasaya yazılmaz ve eşitlenmez.

import type { BookPosition } from "../library/types";
import { addPagesRead, isFinished, READING_BOOK_ID_RE } from "./model";
import type { Habit } from "./types";

/** EPUB'da bir sanal sayfa: açılmış bölüm HTML'inin bu kadar baytı (basılı sayfaya yakın). */
export const EPUB_PAGE_BYTES = 2000;
/** Birim bu kadar süre ekranda kalınca okundu sayılır. */
export const READ_DWELL_MS = 3000;
/** Bir kitap için günlük kütükte tutulan en çok birim (bozuk/aşırı kaydı sınırlar). */
const MAX_UNITS_PER_BOOK = 5000;

/**
 * Konumun sayılabilir birimi. PDF: sayfa numarası. EPUB: ilerleme × sanal sayfa sayısı (bölüm
 * boyutu bilinmiyorsa null). Kindle ve KOReader: null (dosyası yok, okuyucuda açılmaz).
 */
export function pageUnit(pos: BookPosition, progress: number, textBytes?: number): number | null {
  if (pos.kind === "pdf") return Number.isInteger(pos.page) && pos.page >= 1 ? pos.page : null;
  if (pos.kind !== "epub") return null;
  if (typeof textBytes !== "number" || !Number.isFinite(textBytes) || textBytes <= 0) return null;
  if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
  const pages = Math.max(1, Math.ceil(textBytes / EPUB_PAGE_BYTES));
  const p = Math.min(1, Math.max(0, progress));
  return Math.min(pages - 1, Math.floor(p * pages));
}

/** Cihazın bugünkü okuma kütüğü: kitap → görülen birimler (sıralı, tekil). */
export interface ReadingLog {
  day: string;
  seen: Record<string, number[]>;
}

const emptyLog = (today: string): ReadingLog => ({ day: today, seen: {} });

/** Kayıttan gelen kütüğü temizle. Başka günün kaydı ya da bozuk veri boş kütüğe döner. */
export function normalizeReadingLog(v: unknown, today: string): ReadingLog {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return emptyLog(today);
  const o = v as Record<string, unknown>;
  if (o.day !== today) return emptyLog(today);
  const seen: Record<string, number[]> = {};
  const src = o.seen;
  if (typeof src === "object" && src !== null && !Array.isArray(src)) {
    for (const [id, units] of Object.entries(src as Record<string, unknown>)) {
      if (!READING_BOOK_ID_RE.test(id) || !Array.isArray(units)) continue;
      const clean = [...new Set(units.filter((u): u is number => typeof u === "number" && Number.isInteger(u) && u >= 0))]
        .sort((a, b) => a - b)
        .slice(0, MAX_UNITS_PER_BOOK);
      if (clean.length) seen[id] = clean;
    }
  }
  return { day: today, seen };
}

/** Birimi kütüğe ekle. Gün değiştiyse kütük sıfırlanır; birim bugün zaten görüldüyse `added` false. */
export function logAdd(log: ReadingLog, today: string, bookId: string, unit: number): { log: ReadingLog; added: boolean } {
  const base = log.day === today ? log : emptyLog(today);
  const units = base.seen[bookId] ?? [];
  if (units.includes(unit) || units.length >= MAX_UNITS_PER_BOOK) return { log: base, added: false };
  const next = [...units, unit].sort((a, b) => a - b);
  return { log: { day: today, seen: { ...base.seen, [bookId]: next } }, added: true };
}

/** Ekranda bekleyen birim. */
export interface Dwell {
  bookId: string;
  unit: number;
  since: number;
}

/** Okundu sayılan birim. */
export interface SettledUnit {
  bookId: string;
  unit: number;
}

/**
 * Yeni konum bildirimi. Birim aynıysa bekleme sürer. Değiştiyse eski birim yeterince beklediyse
 * oturur (`settled`), yeni birim için sayaç baştan başlar. Birimi olmayan konum beklemeyi bitirir.
 */
export function dwellStep(
  prev: Dwell | null,
  bookId: string,
  unit: number | null,
  now: number,
): { next: Dwell | null; settled: SettledUnit | null } {
  if (prev && unit !== null && prev.bookId === bookId && prev.unit === unit) return { next: prev, settled: null };
  const settled = dwellFinish(prev, now);
  return { next: unit === null ? null : { bookId, unit, since: now }, settled };
}

/** Okuyucu kapanınca/gizlenince: bekleyen birim yeterince ekranda kaldıysa oturur. */
export function dwellFinish(prev: Dwell | null, now: number): SettledUnit | null {
  return prev && now - prev.since >= READ_DWELL_MS ? { bookId: prev.bookId, unit: prev.unit } : null;
}

/**
 * Okunan sayfaları süren, hedefi olan ve kitabı eşleşen (hedefte kitap yoksa her kitap) turlara
 * ekle. Yalnız değişen turların yeni kopyaları döner.
 */
export function applyReading(habits: Habit[], bookId: string, pages: number, today: string): Habit[] {
  const out: Habit[] = [];
  for (const h of habits) {
    if (!h.reading || isFinished(h, today)) continue;
    if (h.reading.bookId !== undefined && h.reading.bookId !== bookId) continue;
    const next = addPagesRead(h, today, pages, today);
    if (next !== h) out.push(next);
  }
  return out;
}

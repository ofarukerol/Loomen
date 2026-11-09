/**
 * Tablonun gizli not satırı: sütun para birimi (LOM-89).
 *
 * Seçim tablonun HEMEN altındaki satırda HTML yorumu olarak saklanır:
 *   `<!-- loomen: para B=TRY D=USD -->`
 * Anahtar sütun harfidir (formüldeki gibi A, B, … AA); değer ISO kodudur. Dosyadaki sayılar
 * ve formül metinleri değişmez; biçim (binlik ayracı + simge) yalnız ekranda uygulanır.
 * Başka görüntüleyiciler (Obsidian/GitHub okuma görünümü) HTML yorumunu göstermez.
 *
 * LOM-98: aynı satırda isteğe bağlı `bicim` bölümü (satır/hücre/sütun biçimi, bkz. tableStyle.ts):
 *   `<!-- loomen: para B=TRY bicim B=kalin 2=orta,italik B2=sag,-kalin -->`
 * `para` her zaman önce ve eskisiyle birebir aynı yazılır; `bicim` yalnız doluysa eklenir.
 *
 * Saf modül: DOM, i18n, CodeMirror bilmez (node testlerinden koşulur).
 */

import { formatFormulaResult, isFormulaCell, parseLocalizedNumber } from "./tableFormula";
import {
  isEmptyStyle,
  parseStyleFlags,
  parseStyleKey,
  serializeStyleFlags,
  styleKey,
  type CellStyle,
  type StyleTarget,
} from "./tableStyle";

export type CurrencyCode = "TRY" | "USD" | "EUR" | "GBP";

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
}

/** Sunulan para birimleri (seçim şeridindeki sırayla; "Yok" ayrıca eklenir). */
export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: "TRY", symbol: "₺" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
];

export function isCurrencyCode(s: string): s is CurrencyCode {
  return CURRENCIES.some((c) => c.code === s);
}

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? "";
}

export interface TableMeta {
  /** Sütun indeksi (0-tabanlı) → para birimi. */
  currency: Partial<Record<number, CurrencyCode>>;
  /** Biçim (LOM-98): styleKey ("B", "2", "B2") → stil. Yoksa biçim yok. */
  style?: Record<string, CellStyle>;
}

export function emptyTableMeta(): TableMeta {
  return { currency: {} };
}

/** Sütunun para birimi (yoksa null). */
export function columnCurrency(meta: TableMeta | null | undefined, col: number): CurrencyCode | null {
  return meta?.currency[col] ?? null;
}

const META_LINE = /^\s*<!--\s*loomen:\s*(.*?)\s*-->\s*$/;

/** "A" → 0, "AA" → 26; geçersizse -1. */
function letterToIndex(letters: string): number {
  if (!/^[A-Z]+$/.test(letters)) return -1;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 0 → "A", 26 → "AA". */
export function indexToLetter(idx: number): string {
  let n = idx + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Satır tablonun not satırı mı (`<!-- loomen: … -->`)? */
export function isTableMetaLine(line: string): boolean {
  return META_LINE.test(line ?? "");
}

/**
 * Not satırını okur. Not satırı değilse null. Tanınmayan parçalar yok sayılır
 * (ileride başka ayar eklenirse eski sürüm bozulmasın diye).
 */
export function parseTableMeta(line: string): TableMeta | null {
  const m = (line ?? "").match(META_LINE);
  if (!m) return null;
  const meta = emptyTableMeta();
  const style: Record<string, CellStyle> = {};
  const tokens = m[1].split(/\s+/).filter(Boolean);
  let section: "para" | "bicim" | null = null;
  for (const tok of tokens) {
    if (tok === "para" || tok === "bicim") {
      section = tok;
      continue;
    }
    if (section === "para") {
      const kv = tok.match(/^([A-Za-z]+)=([A-Za-z]+)$/);
      if (!kv) {
        section = null;
        continue;
      }
      const col = letterToIndex(kv[1].toUpperCase());
      const code = kv[2].toUpperCase();
      if (col >= 0 && isCurrencyCode(code)) meta.currency[col] = code;
    } else if (section === "bicim") {
      const kv = tok.match(/^([A-Za-z]*\d*)=(\S+)$/);
      if (!kv) {
        section = null;
        continue;
      }
      const target = parseStyleKey(kv[1]);
      const st = parseStyleFlags(kv[2]);
      if (target && st) style[styleKey(target)] = st;
    }
  }
  if (Object.keys(style).length) meta.style = style;
  return meta;
}

/** bicim anahtarlarının yazım sırası: sütunlar, satırlar, hücreler (satır, sonra sütun). */
function styleOrder(key: string): [number, number, number] {
  const t = parseStyleKey(key);
  if (!t) return [3, 0, 0];
  if (t.kind === "col") return [0, t.col, 0];
  if (t.kind === "row") return [1, t.row, 0];
  return [2, t.row, t.col];
}

/** Not satırı metni; saklanacak bir şey yoksa null (çağıran satırı siler). */
export function serializeTableMeta(meta: TableMeta | null | undefined): string | null {
  if (!meta) return null;
  const sections: string[] = [];
  const cols = Object.keys(meta.currency)
    .map(Number)
    .filter((c) => Number.isInteger(c) && c >= 0 && meta.currency[c])
    .sort((a, b) => a - b);
  if (cols.length) sections.push(`para ${cols.map((c) => `${indexToLetter(c)}=${meta.currency[c]}`).join(" ")}`);
  const style = meta.style ?? {};
  const keys = Object.keys(style)
    .filter((k) => parseStyleKey(k) && serializeStyleFlags(style[k]))
    .sort((a, b) => {
      const x = styleOrder(a);
      const y = styleOrder(b);
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    });
  if (keys.length) sections.push(`bicim ${keys.map((k) => `${k}=${serializeStyleFlags(style[k])}`).join(" ")}`);
  if (sections.length === 0) return null;
  return `<!-- loomen: ${sections.join(" ")} -->`;
}

/** Hedefin kendi (kalıtılmamış) stili; yoksa boş nesne. */
export function targetStyle(meta: TableMeta | null | undefined, target: StyleTarget): CellStyle {
  return { ...(meta?.style?.[styleKey(target)] ?? {}) };
}

/** Hedefin stilini değiştirir; boş stilde anahtar silinir. Girdi değişmez. */
export function setTargetStyle(
  meta: TableMeta | null | undefined,
  target: StyleTarget,
  style: CellStyle | null | undefined
): TableMeta {
  const out: TableMeta = { currency: { ...(meta?.currency ?? {}) } };
  const next: Record<string, CellStyle> = { ...(meta?.style ?? {}) };
  const key = styleKey(target);
  const clean: CellStyle = {};
  if (style?.align != null) clean.align = style.align;
  if (style?.bold != null) clean.bold = style.bold;
  if (style?.italic != null) clean.italic = style.italic;
  if (isEmptyStyle(clean)) delete next[key];
  else next[key] = clean;
  if (Object.keys(next).length) out.style = next;
  return out;
}

/** Sütunun para birimini değiştirir (null = "Yok"). Girdi değişmez. */
export function setColumnCurrency(
  meta: TableMeta | null | undefined,
  col: number,
  code: CurrencyCode | null
): TableMeta {
  const out: TableMeta = { currency: { ...(meta?.currency ?? {}) } };
  if (meta?.style) out.style = { ...meta.style };
  if (code) out.currency[col] = code;
  else delete out.currency[col];
  return out;
}

/** moveItem anlamında yeni indeks: `from` öğesi `to`ya gider, aradakiler bir kayar. */
function shiftIndex(i: number, from: number, to: number): number {
  if (from === to) return i;
  if (i === from) return to;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  if (i >= lo && i <= hi) return from < to ? i - 1 : i + 1;
  return i;
}

function copyStyle(meta: TableMeta | null | undefined): Record<string, CellStyle> | undefined {
  return meta?.style ? { ...meta.style } : undefined;
}

/** Biçim anahtarlarını verilen eşlemeyle yeniden adlandırır (stil nesneleri kopyalanır). */
function remapStyle(
  style: Record<string, CellStyle> | undefined,
  map: (t: StyleTarget) => StyleTarget
): Record<string, CellStyle> | undefined {
  if (!style) return undefined;
  const out: Record<string, CellStyle> = {};
  for (const [k, v] of Object.entries(style)) {
    const t = parseStyleKey(k);
    if (!t) {
      out[k] = { ...v };
      continue;
    }
    out[styleKey(map(t))] = { ...v };
  }
  return out;
}

/**
 * Sütun taşınınca (moveTableColumn ile aynı anlam: sonuçta `from` sütunu `to` indeksinde)
 * para birimlerini ve sütun/hücre biçim anahtarlarını yeni sütun indekslerine taşır.
 * Satır anahtarları aynen kalır. `cols` (sütun sayısı) verilirse sınır dışı taşıma girdiyi
 * aynen döndürür. Girdi değişmez.
 */
export function moveMetaColumn(
  meta: TableMeta | null | undefined,
  from: number,
  to: number,
  cols?: number
): TableMeta {
  const src = meta?.currency ?? {};
  // moveTableColumn sınır dışında tabloyu aynen bırakır; para birimi de kaymasın.
  const outOfRange = from < 0 || to < 0 || (cols != null && (from >= cols || to >= cols));
  if (outOfRange) {
    const same: TableMeta = { currency: { ...src } };
    const st = copyStyle(meta);
    if (st) same.style = st;
    return same;
  }
  const out: TableMeta = { currency: {} };
  for (const k of Object.keys(src)) {
    const c = Number(k);
    const code = src[c];
    if (!code) continue;
    out.currency[shiftIndex(c, from, to)] = code;
  }
  const style = remapStyle(meta?.style, (t) =>
    t.kind === "row" ? t : { ...t, col: shiftIndex(t.col, from, to) }
  );
  if (style) out.style = style;
  return out;
}

/**
 * Gövde satırı taşınınca (moveTableRow ile aynı anlam: 0-tabanlı gövde sırası, sonuçta `from`
 * satırı `to` indeksinde) satır ve hücre biçim anahtarlarını taşır. Başlık (-1), sütun
 * anahtarları ve para birimleri aynen kalır. `rows` (gövde satırı sayısı) verilirse sınır dışı
 * taşıma girdiyi aynen döndürür. Girdi değişmez.
 */
export function moveMetaRow(
  meta: TableMeta | null | undefined,
  from: number,
  to: number,
  rows?: number
): TableMeta {
  const out: TableMeta = { currency: { ...(meta?.currency ?? {}) } };
  const outOfRange = from < 0 || to < 0 || (rows != null && (from >= rows || to >= rows));
  const style = outOfRange
    ? copyStyle(meta)
    : remapStyle(meta?.style, (t) =>
        t.kind === "col" || t.row < 0 ? t : { ...t, row: shiftIndex(t.row, from, to) }
      );
  if (style) out.style = style;
  return out;
}

/** Sayıyı para birimiyle biçimler: 212500, TRY, "tr" → "212.500 ₺" (sayı + boşluk + simge). */
export function formatCurrency(value: number, code: CurrencyCode, locale: string): string {
  return `${formatFormulaResult(value, locale)} ${currencySymbol(code)}`;
}

/**
 * Para birimli sütundaki DÜZ hücrenin ekran metni. Sayı değilse (metin, boş) ya da formülse
 * null döner — çağıran hücreyi olduğu gibi bırakır (formül sonucu formatCurrency ile biçimlenir).
 */
export function formatCellDisplay(text: string, code: CurrencyCode | null, locale: string): string | null {
  if (!code) return null;
  const t = (text ?? "").trim();
  if (t === "" || isFormulaCell(t)) return null;
  const n = parseLocalizedNumber(t);
  if (n === null) return null;
  return formatCurrency(n, code, locale);
}

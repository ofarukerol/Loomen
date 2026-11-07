/**
 * Tablonun gizli not satırı: sütun para birimi (LOM-89).
 *
 * Seçim tablonun HEMEN altındaki satırda HTML yorumu olarak saklanır:
 *   `<!-- loomen: para B=TRY D=USD -->`
 * Anahtar sütun harfidir (formüldeki gibi A, B, … AA); değer ISO kodudur. Dosyadaki sayılar
 * ve formül metinleri değişmez; biçim (binlik ayracı + simge) yalnız ekranda uygulanır.
 * Başka görüntüleyiciler (Obsidian/GitHub okuma görünümü) HTML yorumunu göstermez.
 *
 * Saf modül: DOM, i18n, CodeMirror bilmez (node testlerinden koşulur).
 */

import { formatFormulaResult, isFormulaCell, parseLocalizedNumber } from "./tableFormula";

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
  const tokens = m[1].split(/\s+/).filter(Boolean);
  let inPara = false;
  for (const tok of tokens) {
    if (tok === "para") {
      inPara = true;
      continue;
    }
    const kv = tok.match(/^([A-Za-z]+)=([A-Za-z]+)$/);
    if (!kv) {
      inPara = false;
      continue;
    }
    if (!inPara) continue;
    const col = letterToIndex(kv[1].toUpperCase());
    const code = kv[2].toUpperCase();
    if (col >= 0 && isCurrencyCode(code)) meta.currency[col] = code;
  }
  return meta;
}

/** Not satırı metni; saklanacak bir şey yoksa null (çağıran satırı siler). */
export function serializeTableMeta(meta: TableMeta | null | undefined): string | null {
  if (!meta) return null;
  const cols = Object.keys(meta.currency)
    .map(Number)
    .filter((c) => Number.isInteger(c) && c >= 0 && meta.currency[c])
    .sort((a, b) => a - b);
  if (cols.length === 0) return null;
  const parts = cols.map((c) => `${indexToLetter(c)}=${meta.currency[c]}`);
  return `<!-- loomen: para ${parts.join(" ")} -->`;
}

/** Sütunun para birimini değiştirir (null = "Yok"). Girdi değişmez. */
export function setColumnCurrency(
  meta: TableMeta | null | undefined,
  col: number,
  code: CurrencyCode | null
): TableMeta {
  const out: TableMeta = { currency: { ...(meta?.currency ?? {}) } };
  if (code) out.currency[col] = code;
  else delete out.currency[col];
  return out;
}

/**
 * Sütun taşınınca (moveTableColumn ile aynı anlam: sonuçta `from` sütunu `to` indeksinde)
 * para birimlerini yeni sütun indekslerine taşır. `cols` (sütun sayısı) verilirse sınır dışı
 * taşıma girdiyi aynen döndürür. Girdi değişmez.
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
  if (outOfRange) return { currency: { ...src } };
  const out: TableMeta = { currency: {} };
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  for (const k of Object.keys(src)) {
    const c = Number(k);
    const code = src[c];
    if (!code) continue;
    let n = c;
    if (from !== to) {
      if (c === from) n = to;
      else if (c >= lo && c <= hi) n = from < to ? c - 1 : c + 1;
    }
    out.currency[n] = code;
  }
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

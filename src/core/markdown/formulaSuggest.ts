// Tablo formülü öneri listesi (LOM-88) — saf mantık; DOM, i18n, CodeMirror yok.
//
// Hücre kutusunda "=" ile başlayan metinde imlecin solundaki harf dizisine bakar ve
// Excel gibi fonksiyon (TOPLA/SUM…) ve sütun (B · Tutar) önerir. Tek kelimelik başlıklı
// sütunda seçilince başlık adı, diğerlerinde harf yazılır. Ekrandaki liste
// tableWidget.ts openCellEditor içinde; açıklama metinleri i18n anahtarıyla gelir.
//
// Otomatik aralık (LOM-99): toplu fonksiyon (TOPLA, ORTALAMA, MIN, MAX, SAY) Tab ile
// seçilince hücrenin üstündeki kesintisiz sayı dizisi (yoksa soldaki) Excel'deki otomatik
// toplam gibi kendiliğinden yazılır: =TOPLA(B2:B5). Hesap autoRangeRef'te.

import {
  columnDisplayName,
  isFormulaCell,
  isPlainColumnName,
  normalizeColumnName,
  parseLocalizedNumber,
} from "./tableFormula";

export interface FormulaSuggestion {
  kind: "fn" | "column";
  /** Listede büyük yazılan ad: TOPLA ya da B. */
  label: string;
  /** Diğer dildeki ad (fonksiyonda); aynıysa ya da sütunda boş. */
  alias: string;
  /** Sütunun başlık adı (listede "B · Tutar"); fonksiyonda ya da boş başlıkta boş. */
  name: string;
  /** Kelimenin yerine yazılacak metin: "TOPLA(", "Tutar" ya da "B". */
  insert: string;
  /** Açıklama çeviri anahtarı. */
  descKey: string;
  /** Açıklamaya giren ad (sütun başlığı); fonksiyonda boş. */
  descParam: string;
  /** Örnek yazım: "=TOPLA(B2:B9)". */
  example: string;
  /** Toplu fonksiyon mu (TOPLA, ORTALAMA…): Tab ile aralık kendiliğinden gelir (LOM-99). */
  aggregate: boolean;
}

export interface FormulaSuggestResult {
  items: FormulaSuggestion[];
  /** Değiştirilecek kelimenin aralığı [replaceFrom, replaceTo). */
  replaceFrom: number;
  replaceTo: number;
}

interface FnEntry {
  tr: string;
  en: string;
  descKey: string;
  /** Örnek; {F} fonksiyon adıyla değişir. */
  example: string;
  /** Aralık alan toplu fonksiyon (LOM-99). */
  aggregate: boolean;
}

/** Formül motorunun (tableFormula.ts) tanıdığı yedi fonksiyon. */
export const FORMULA_FUNCTIONS: readonly FnEntry[] = [
  { tr: "TOPLA", en: "SUM", descKey: "tableFormula.fnSum", example: "={F}(B2:B9)", aggregate: true },
  { tr: "ORTALAMA", en: "AVERAGE", descKey: "tableFormula.fnAverage", example: "={F}(B:B)", aggregate: true },
  { tr: "MIN", en: "MIN", descKey: "tableFormula.fnMin", example: "={F}(B2:B9)", aggregate: true },
  { tr: "MAX", en: "MAX", descKey: "tableFormula.fnMax", example: "={F}(B2:B9)", aggregate: true },
  { tr: "SAY", en: "COUNT", descKey: "tableFormula.fnCount", example: "={F}(B:B)", aggregate: true },
  { tr: "YUVARLA", en: "ROUND", descKey: "tableFormula.fnRound", example: "={F}(B2;2)", aggregate: false },
  { tr: "ABS", en: "ABS", descKey: "tableFormula.fnAbs", example: "={F}(B2)", aggregate: false },
];

/** 0 → A, 25 → Z, 26 → AA (tableFormula.ts colIndex'in tersi). */
export function colLetter(index: number): string {
  let n = Math.max(0, Math.floor(index)) + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Her dildeki harf (Arapça, aksanlı başlıklar dahil); motorun kelime kuralıyla aynı.
const LETTER = /\p{L}/u;
const WORD_OR_PAREN = /[\p{L}\p{N}(]/u;
/** Kelimenin önünde durabilecek karakterler (boşsa satır başı). */
const BEFORE_WORD = new Set(["=", "+", "-", "*", "/", "^", "&", "<", ">", "(", ";", ":", ",", " ", "\t"]);

/** Türkçe i/ı farkı eşleşmeyi bozmasın: Türkçe büyük harf + İ → I (motorla aynı kural). */
const norm = normalizeColumnName;

export function suggestFormula(
  text: string,
  caret: number,
  header: string[],
  locale: string,
): FormulaSuggestResult | null {
  const eq = text.indexOf("=");
  if (!text.trim().startsWith("=") || eq < 0) return null;
  const pos = Math.max(0, Math.min(caret, text.length));
  if (pos <= eq) return null;
  // İmlecin sağı kelime/sayı/parantez ise kelimenin ortasındayız.
  const right = text[pos];
  if (right !== undefined && WORD_OR_PAREN.test(right)) return null;

  let start = pos;
  while (start > eq + 1 && LETTER.test(text[start - 1])) start--;
  const word = text.slice(start, pos);
  const prev = text[start - 1];
  if (prev === undefined || !BEFORE_WORD.has(prev)) return null;
  if (!word && prev !== "=" && prev !== "(") return null;

  const q = norm(word);
  const trFirst = locale.toLowerCase().startsWith("tr");

  const fns: FormulaSuggestion[] = [];
  for (const f of FORMULA_FUNCTIONS) {
    const primary = trFirst ? f.tr : f.en;
    const other = trFirst ? f.en : f.tr;
    let label: string;
    if (primary.startsWith(q)) label = primary;
    else if (other.startsWith(q)) label = other;
    else continue;
    const alias = label === primary ? other : primary;
    fns.push({
      kind: "fn",
      label,
      alias: alias === label ? "" : alias,
      name: "",
      insert: `${label}(`,
      descKey: f.descKey,
      descParam: "",
      example: f.example.replace("{F}", label),
      aggregate: f.aggregate,
    });
  }

  const sumName = trFirst ? "TOPLA" : "SUM";
  const cols: FormulaSuggestion[] = [];
  header.forEach((h, i) => {
    const letter = colLetter(i);
    const name = columnDisplayName(h);
    const byLetter = letter.startsWith(q);
    const byName = q !== "" && name !== "" && norm(name).startsWith(q);
    if (!byLetter && !byName) return;
    const plain = isPlainColumnName(name);
    // Tam harf yazıldıysa (=B) harf kalır: Enter hücreyi kaydeder. Ad eşleşiyorsa ya da
    // kelime boşsa düz başlık adı yazılır; boşluklu başlıkta harf.
    const useName = plain && q !== letter && (byName || q === "");
    cols.push({
      kind: "column",
      label: letter,
      alias: "",
      name,
      insert: useName ? name : letter,
      descKey: plain || !name ? "tableFormula.column" : "tableFormula.columnLetterOnly",
      descParam: name || letter,
      example: plain ? `=${name} · =${sumName}(${name})` : `=${letter}2 · =${letter}:${letter}`,
      aggregate: false,
    });
  });

  // Parantez/aralık içinde sütun başvurusu daha olası.
  const columnsFirst = prev === "(" || prev === ":" || prev === ";";
  const items = columnsFirst ? [...cols, ...fns] : [...fns, ...cols];
  // Kelime tam bir sütun harfi ya da adıysa (=B*C'deki C, =Tutar) o sütun başa gelir: Enter
  // yeni bir şey yazmaz, hücreyi kaydeder (aynı satır kısaltması, LOM-79).
  const exact = q ? items.findIndex((i) => i.kind === "column" && norm(i.insert) === q) : -1;
  if (exact > 0) items.unshift(...items.splice(exact, 1));
  if (!items.length) return null;
  return { items, replaceFrom: start, replaceTo: pos };
}

/** [from, to) aralığını insert ile değiştirir; imleç insert'in sonuna gelir. */
export function applySuggestion(
  text: string,
  from: number,
  to: number,
  insert: string,
): { text: string; caret: number } {
  return { text: text.slice(0, from) + insert + text.slice(to), caret: from + insert.length };
}

/** Hücre aralığa girebilecek bir sayı mı: yerel sayı ya da formül (sonucu sayıdır). */
function isNumericCell(raw: string | undefined): boolean {
  if (raw == null) return false;
  return parseLocalizedNumber(raw) !== null || isFormulaCell(raw);
}

/**
 * Excel'deki otomatik toplam gibi (LOM-99): `rows` gövde satırları, (row, col) gövdedeki hücre.
 * Hücrenin üstündeki boş hücreler atlanır, sonra yukarı doğru kesintisiz sayı dizisi alınır
 * (metin ya da boş hücrede durur). Üstte sayı yoksa aynı kural sola uygulanır. Satır numarası
 * Excel gibidir: başlık 1, ilk gövde satırı 2. Sonuç "B2:B5", tek hücrede "B2"; yoksa null.
 */
export function autoRangeRef(rows: string[][], row: number, col: number): string | null {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) return null;
  if (row >= rows.length || col >= (rows[row]?.length ?? 0)) return null;
  const blank = (v: string | undefined) => (v ?? "").trim() === "";

  // Yukarı
  let r = row - 1;
  while (r >= 0 && blank(rows[r]?.[col])) r--;
  let top = r;
  while (top >= 0 && isNumericCell(rows[top]?.[col])) top--;
  top++;
  if (r >= 0 && top <= r) {
    const L = colLetter(col);
    return top === r ? `${L}${r + 2}` : `${L}${top + 2}:${L}${r + 2}`;
  }

  // Sola
  const cells = rows[row];
  let c = col - 1;
  while (c >= 0 && blank(cells[c])) c--;
  let left = c;
  while (left >= 0 && isNumericCell(cells[left])) left--;
  left++;
  if (c >= 0 && left <= c) {
    const n = row + 2;
    return left === c ? `${colLetter(c)}${n}` : `${colLetter(left)}${n}:${colLetter(c)}${n}`;
  }
  return null;
}

/** Otomatik aralıkla fonksiyon metni: ("TOPLA", "B2:B5") → "TOPLA(B2:B5)". */
export function autoFunctionInsert(label: string, ref: string): string {
  return `${label}(${ref})`;
}

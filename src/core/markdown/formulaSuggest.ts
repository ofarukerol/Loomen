// Tablo formülü öneri listesi (LOM-88) — saf mantık; DOM, i18n, CodeMirror yok.
//
// Hücre kutusunda "=" ile başlayan metinde imlecin solundaki harf dizisine bakar ve
// Excel gibi fonksiyon (TOPLA/SUM…) ve sütun harfi (B — "Tutar") önerir. Ekrandaki liste
// tableWidget.ts openCellEditor içinde; açıklama metinleri i18n anahtarıyla gelir.

export interface FormulaSuggestion {
  kind: "fn" | "column";
  /** Listede büyük yazılan ad: TOPLA ya da B. */
  label: string;
  /** Diğer dildeki ad (fonksiyonda); aynıysa ya da sütunda boş. */
  alias: string;
  /** Kelimenin yerine yazılacak metin: "TOPLA(" ya da "B". */
  insert: string;
  /** Açıklama çeviri anahtarı. */
  descKey: string;
  /** Açıklamaya giren ad (sütun başlığı); fonksiyonda boş. */
  descParam: string;
  /** Örnek yazım: "=TOPLA(B2:B9)". */
  example: string;
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
}

/** Formül motorunun (tableFormula.ts) tanıdığı yedi fonksiyon. */
export const FORMULA_FUNCTIONS: readonly FnEntry[] = [
  { tr: "TOPLA", en: "SUM", descKey: "tableFormula.fnSum", example: "={F}(B2:B9)" },
  { tr: "ORTALAMA", en: "AVERAGE", descKey: "tableFormula.fnAverage", example: "={F}(B:B)" },
  { tr: "MIN", en: "MIN", descKey: "tableFormula.fnMin", example: "={F}(B2:B9)" },
  { tr: "MAX", en: "MAX", descKey: "tableFormula.fnMax", example: "={F}(B2:B9)" },
  { tr: "SAY", en: "COUNT", descKey: "tableFormula.fnCount", example: "={F}(B:B)" },
  { tr: "YUVARLA", en: "ROUND", descKey: "tableFormula.fnRound", example: "={F}(B2;2)" },
  { tr: "ABS", en: "ABS", descKey: "tableFormula.fnAbs", example: "={F}(B2)" },
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

const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşü]/;
const WORD_OR_PAREN = /[A-Za-zÇĞİÖŞÜçğıöşü0-9(]/;
/** Kelimenin önünde durabilecek karakterler (boşsa satır başı). */
const BEFORE_WORD = new Set(["=", "+", "-", "*", "/", "^", "&", "<", ">", "(", ";", ":", ",", " ", "\t"]);

/** Türkçe i/ı farkı eşleşmeyi bozmasın: büyük harf + İ → I. */
function norm(s: string): string {
  return s.toUpperCase().replace(/İ/g, "I");
}

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
      insert: `${label}(`,
      descKey: f.descKey,
      descParam: "",
      example: f.example.replace("{F}", label),
    });
  }

  const cols: FormulaSuggestion[] = [];
  header.forEach((h, i) => {
    const letter = colLetter(i);
    const name = h.trim();
    if (!letter.startsWith(q) && !(q && norm(name).startsWith(q))) return;
    cols.push({
      kind: "column",
      label: letter,
      alias: "",
      insert: letter,
      descKey: "tableFormula.column",
      descParam: name || letter,
      example: `=${letter}2 · =${letter}:${letter}`,
    });
  });

  // Parantez/aralık içinde sütun başvurusu daha olası.
  const columnsFirst = prev === "(" || prev === ":" || prev === ";";
  const items = columnsFirst ? [...cols, ...fns] : [...fns, ...cols];
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

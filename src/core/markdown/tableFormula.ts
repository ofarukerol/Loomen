/**
 * Tabloda Excel benzeri formül (LOM-79).
 *
 * "=" ile başlayan hücre formüldür. Sonuç yalnız ekranda hesaplanır; dosyada formül metni
 * kalır. Saf modül: DOM, i18n, CodeMirror bilmez (node testlerinden koşulur).
 *
 * Başvuru Excel gibi: sütun harfi (A, B, … AA) + satır numarası. Satır 1 başlıktır, ilk
 * gövde satırı 2'dir (`=B2-C2`). Satır numarası yazılmazsa (`=B-C`) formülün kendi satırı
 * kullanılır. Aralık `B2:B9`, tam sütun `B:B` (bütün gövde satırları, formülün kendi
 * hücresi hariç — alt toplam satırı döngüye girmesin diye).
 *
 * Sütun başlık adıyla da yazılır (LOM-88): `=Tutar-Ödenen` aynı satırı, `=TOPLA(Tutar)` bütün
 * sütunu (kendi hücresi hariç) kullanır. Büyük/küçük harf ve Türkçe i/ı farkı önemsizdir. Yalnız
 * tek kelimelik başlıklar adıyla yazılır; boşluklu başlık harfiyle. Ad, aynı yazılan harf
 * başvurusunu yener (`Ad` başlığı AD sütununu değil o sütunu gösterir); harf + rakam (`B2`) her
 * zaman hücre başvurusudur. Toplu fonksiyonlara (TOPLA, ORTALAMA, MIN, MAX, SAY) doğrudan
 * verilen satırsız başvuru (`B` ya da `Tutar`) bütün sütundur; başka yerde aynı satırdır.
 */

export type FormulaError = "syntax" | "ref" | "cycle" | "div0" | "value";

export interface CellResult {
  formula: string | null;
  value: number | null;
  error: FormulaError | null;
}

/** Kırpılmış metin "=" ile başlıyor ve devamı var mı. */
export function isFormulaCell(text: string): boolean {
  const t = (text ?? "").trim();
  return t.length > 1 && t.startsWith("=");
}

const THOUSANDS_GROUPED = /^\d{1,3}(\.\d{3})+$/;

/**
 * Türkçe/yerel yazılmış sayıyı okur: "212.500" → 212500, "212.500,50" → 212500.5,
 * "1,5" → 1.5, "1.5" → 1.5, "₺ 1.200" → 1200. Sayı değilse null.
 */
export function parseLocalizedNumber(text: string): number | null {
  if (text == null) return null;
  let s = String(text).replace(/[₺$€]/g, "").replace(/\bTL\b/gi, "");
  s = s.replace(/[\s  ]/g, "");
  if (s === "") return null;
  let sign = 1;
  if (s[0] === "-" || s[0] === "+") {
    if (s[0] === "-") sign = -1;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  let normalized: string;
  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length !== 2) return null;
    const [intPart, frac] = parts;
    if (!/^\d*$/.test(frac)) return null;
    let int = intPart;
    if (int.includes(".")) {
      if (!THOUSANDS_GROUPED.test(int)) return null;
      int = int.replace(/\./g, "");
    }
    if (int === "" && frac === "") return null;
    normalized = `${int || "0"}.${frac || "0"}`;
  } else if (s.includes(".")) {
    if (THOUSANDS_GROUPED.test(s)) normalized = s.replace(/\./g, "");
    else if ((s.match(/\./g) ?? []).length === 1) normalized = s;
    else return null;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? sign * n : null;
}

/** Sonucu dile göre biçimler (en çok 2 ondalık); geçersiz dilde "tr" kullanılır. */
export function formatFormulaResult(value: number, locale: string): string {
  const v = Object.is(value, -0) ? 0 : value;
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat(locale || "tr", { maximumFractionDigits: 2 });
  } catch {
    fmt = new Intl.NumberFormat("tr", { maximumFractionDigits: 2 });
  }
  return fmt.format(v);
}

// ─── Sütun adı ──────────────────────────────────────────────────────────────

/** Başlığın görünen adı: baştaki/sondaki boşluk ve Markdown işaretleri (* _) atılır. */
export function columnDisplayName(s: string): string {
  return (s ?? "").trim().replace(/^[\s*_]+|[\s*_]+$/g, "");
}

/** Karşılaştırma anahtarı: görünen ad, Türkçe büyük harf, İ → I ("ıpTal" → "IPTAL"). */
export function normalizeColumnName(s: string): string {
  return columnDisplayName(s).toLocaleUpperCase("tr").replace(/İ/g, "I");
}

/**
 * Başlık formülde adıyla yazılabilir mi: tek kelime (harfle başlar; harf, rakam, _) ve
 * hücre başvurusuna benzemez (`B2` gibi harf + rakam her zaman hücredir).
 */
export function isPlainColumnName(s: string): boolean {
  const n = columnDisplayName(s);
  return /^\p{L}[\p{L}\p{N}_]*$/u.test(n) && !/^[A-Za-z]+\d+$/.test(n);
}

/** Normalize edilmiş ad → ilk sütun indeksi (aynı ad iki kez varsa ilki). */
export function headerNameIndex(header: string[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => {
    if (!isPlainColumnName(h)) return;
    const k = normalizeColumnName(h);
    if (!m.has(k)) m.set(k, i);
  });
  return m;
}

// ─── Ayrıştırıcı ────────────────────────────────────────────────────────────

class FormulaFail extends Error {
  constructor(public code: FormulaError) {
    super(code);
  }
}

type Tok =
  | { t: "num"; v: number }
  | { t: "ref"; col: number; row: number | null }
  | { t: "fn"; name: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "^" }
  | { t: "(" }
  | { t: ")" }
  | { t: ":" }
  | { t: ";" };

type Node =
  | { t: "num"; v: number }
  | { t: "ref"; col: number; row: number | null }
  | { t: "range"; a: { col: number; row: number | null }; b: { col: number; row: number | null } }
  | { t: "neg"; e: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "^"; l: Node; r: Node }
  | { t: "call"; name: string; args: Node[] };

/** "A" → 0, "Z" → 25, "AA" → 26. */
function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const isLetter = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c);
const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

function tokenize(src: string, names: Map<string, number>): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
      let j = i;
      while (j < src.length) {
        const d = src[j];
        if (isDigit(d)) j++;
        else if ((d === "." || d === ",") && isDigit(src[j - 1]) && isDigit(src[j + 1])) j++;
        else if (d === "." && j === i && isDigit(src[j + 1])) j++;
        else break;
      }
      const v = parseLocalizedNumber(src.slice(i, j));
      if (v === null) throw new FormulaFail("syntax");
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (isLetter(c)) {
      let j = i;
      while (isWordChar(src[j])) j++;
      const word = src.slice(i, j);
      let k = j;
      while (/\s/.test(src[k] ?? "")) k++;
      if (src[k] === "(") {
        out.push({ t: "fn", name: word.toUpperCase() });
        i = j;
        continue;
      }
      i = j;
      // Harf + rakam her zaman hücre (B2); sonra başlık adı; sonra satırsız harf (B).
      const cell = /^([A-Za-z]+)(\d+)$/.exec(word);
      if (cell) {
        out.push({ t: "ref", col: colIndex(cell[1]), row: Number(cell[2]) });
        continue;
      }
      const named = names.get(normalizeColumnName(word));
      if (named !== undefined) {
        out.push({ t: "ref", col: named, row: null });
        continue;
      }
      if (/^[A-Za-z]+$/.test(word)) {
        out.push({ t: "ref", col: colIndex(word), row: null });
        continue;
      }
      throw new FormulaFail("ref");
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^") {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === ":") {
      out.push({ t: c });
      i++;
      continue;
    }
    if (c === ";" || c === ",") {
      out.push({ t: ";" });
      i++;
      continue;
    }
    throw new FormulaFail("syntax");
  }
  return out;
}

function parse(src: string, names: Map<string, number>): Node {
  const toks = tokenize(src, names);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = toks[p];
    return t !== undefined && t.t === "op" && t.v === v;
  };

  const expr = (): Node => add();
  const add = (): Node => {
    let l = mul();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: "+" | "-" }).v;
      l = { t: "bin", op, l, r: mul() };
    }
    return l;
  };
  const mul = (): Node => {
    let l = pow();
    while (isOp("*") || isOp("/")) {
      const op = (toks[p++] as { v: "*" | "/" }).v;
      l = { t: "bin", op, l, r: pow() };
    }
    return l;
  };
  // Excel'de tekli eksi üs alma işleminden önce gelir (-2^2 = 4); ^ soldan bağlanır.
  const pow = (): Node => {
    let l = unary();
    while (isOp("^")) {
      p++;
      l = { t: "bin", op: "^", l, r: unary() };
    }
    return l;
  };
  const unary = (): Node => {
    if (isOp("-")) {
      p++;
      return { t: "neg", e: unary() };
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    return primary();
  };
  const primary = (): Node => {
    const t = peek();
    if (!t) throw new FormulaFail("syntax");
    if (t.t === "num") {
      p++;
      return { t: "num", v: t.v };
    }
    if (t.t === "(") {
      p++;
      const e = expr();
      if (peek()?.t !== ")") throw new FormulaFail("syntax");
      p++;
      return e;
    }
    if (t.t === "fn") {
      p++;
      if (peek()?.t !== "(") throw new FormulaFail("syntax");
      p++;
      const args: Node[] = [];
      if (peek()?.t !== ")") {
        args.push(expr());
        while (peek()?.t === ";") {
          p++;
          args.push(expr());
        }
      }
      if (peek()?.t !== ")") throw new FormulaFail("syntax");
      p++;
      return { t: "call", name: t.name, args };
    }
    if (t.t === "ref") {
      p++;
      const a = { col: t.col, row: t.row };
      if (peek()?.t === ":") {
        p++;
        const b = peek();
        if (!b || b.t !== "ref") throw new FormulaFail("syntax");
        p++;
        // Ya iki uç da satırlı (B2:B9) ya ikisi de satırsız (B:B).
        if ((a.row === null) !== (b.row === null)) throw new FormulaFail("syntax");
        return { t: "range", a, b: { col: b.col, row: b.row } };
      }
      return { t: "ref", col: a.col, row: a.row };
    }
    throw new FormulaFail("syntax");
  };

  const node = expr();
  if (p !== toks.length) throw new FormulaFail("syntax");
  return node;
}

// ─── Değerlendirme ──────────────────────────────────────────────────────────

const FN_ALIASES: Record<string, string> = {
  SUM: "SUM",
  TOPLA: "SUM",
  AVERAGE: "AVERAGE",
  ORTALAMA: "AVERAGE",
  MIN: "MIN",
  MAX: "MAX",
  COUNT: "COUNT",
  SAY: "COUNT",
  ROUND: "ROUND",
  YUVARLA: "ROUND",
  ABS: "ABS",
};

function roundHalfAway(x: number, digits: number): number {
  const d = Math.trunc(digits);
  const f = 10 ** d;
  return (Math.sign(x) * Math.round(Math.abs(x) * f * (1 + Number.EPSILON))) / f;
}

/**
 * Tablonun bütün gövde hücrelerini hesaplar. Sonuç `rows` ile aynı biçimde; formül olmayan
 * hücrede `formula` null'dır. Başlık hücrelerinde formül değerlendirilmez.
 */
export function evaluateTable(header: string[], rows: string[][]): CellResult[][] {
  const cols = header.length;
  const names = headerNameIndex(header);
  const memo = new Map<string, CellResult>();
  const visiting = new Set<string>();
  const key = (r: number, c: number) => `${r}:${c}`;

  /** r: gövde satırı indeksi (0-tabanlı), -1 = başlık. */
  const rawAt = (r: number, c: number): string => (r < 0 ? header[c] ?? "" : rows[r]?.[c] ?? "");

  const evalCell = (r: number, c: number): CellResult => {
    const raw = rawAt(r, c);
    if (r < 0 || !isFormulaCell(raw)) return { formula: null, value: null, error: null };
    const k = key(r, c);
    const cached = memo.get(k);
    if (cached) return cached;
    if (visiting.has(k)) throw new FormulaFail("cycle");
    visiting.add(k);
    const formula = raw.trim();
    let res: CellResult;
    try {
      const v = evalNode(parse(formula.slice(1), names), r, c);
      res = Number.isFinite(v) ? { formula, value: v, error: null } : { formula, value: null, error: "value" };
    } catch (e) {
      const code = e instanceof FormulaFail ? e.code : "syntax";
      res = { formula, value: null, error: code };
    } finally {
      visiting.delete(k);
    }
    memo.set(k, res);
    return res;
  };

  /** Hücrenin sayı değeri: null = boş/sayı değil. Formül hatası fırlatılır. */
  const cellNumber = (r: number, c: number): { n: number | null; empty: boolean } => {
    const raw = rawAt(r, c);
    if (r >= 0 && isFormulaCell(raw)) {
      const res = evalCell(r, c);
      if (res.error) throw new FormulaFail(res.error);
      return { n: res.value, empty: false };
    }
    if (raw.trim() === "") return { n: null, empty: true };
    return { n: parseLocalizedNumber(raw), empty: false };
  };

  /** Excel satır numarasını gövde indeksine çevirir (1 → başlık = -1). */
  const resolveRow = (row: number | null, selfRow: number): number => (row === null ? selfRow : row - 2);

  const checkBounds = (r: number, c: number) => {
    if (c < 0 || c >= cols || r < -1 || r >= rows.length) throw new FormulaFail("ref");
  };

  const scalarRef = (col: number, row: number | null, selfRow: number): number => {
    const r = resolveRow(row, selfRow);
    checkBounds(r, col);
    const { n, empty } = cellNumber(r, col);
    if (empty) return 0;
    if (n === null) throw new FormulaFail("value");
    return n;
  };

  /** Aralıktaki sayılar; boş ve metin hücreler atlanır. */
  const rangeNumbers = (node: Extract<Node, { t: "range" }>, selfRow: number, selfCol: number): number[] => {
    const c1 = Math.min(node.a.col, node.b.col);
    const c2 = Math.max(node.a.col, node.b.col);
    if (c1 < 0 || c2 >= cols) throw new FormulaFail("ref");
    let r1: number;
    let r2: number;
    const fullColumn = node.a.row === null;
    if (fullColumn) {
      r1 = 0;
      r2 = rows.length - 1;
    } else {
      r1 = Math.min(node.a.row!, node.b.row!) - 2;
      r2 = Math.max(node.a.row!, node.b.row!) - 2;
      checkBounds(r1, c1);
      checkBounds(r2, c2);
    }
    const out: number[] = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (fullColumn && r === selfRow && c === selfCol) continue;
        const { n } = cellNumber(r, c);
        if (n !== null) out.push(n);
      }
    }
    return out;
  };

  const evalNode = (node: Node, selfRow: number, selfCol: number): number => {
    switch (node.t) {
      case "num":
        return node.v;
      case "ref":
        return scalarRef(node.col, node.row, selfRow);
      case "range":
        throw new FormulaFail("value");
      case "neg":
        return -evalNode(node.e, selfRow, selfCol);
      case "bin": {
        const l = evalNode(node.l, selfRow, selfCol);
        const r = evalNode(node.r, selfRow, selfCol);
        switch (node.op) {
          case "+":
            return l + r;
          case "-":
            return l - r;
          case "*":
            return l * r;
          case "/":
            if (r === 0) throw new FormulaFail("div0");
            return l / r;
          case "^": {
            const v = l ** r;
            if (!Number.isFinite(v)) throw new FormulaFail(l === 0 ? "div0" : "value");
            return v;
          }
        }
        throw new FormulaFail("syntax");
      }
      case "call": {
        const fn = FN_ALIASES[node.name];
        if (!fn) throw new FormulaFail("syntax");
        if (fn === "ROUND" || fn === "ABS") {
          const want = fn === "ROUND" ? [1, 2] : [1, 1];
          if (node.args.length < want[0] || node.args.length > want[1]) throw new FormulaFail("syntax");
          const x = evalNode(node.args[0], selfRow, selfCol);
          if (fn === "ABS") return Math.abs(x);
          const d = node.args[1] ? evalNode(node.args[1], selfRow, selfCol) : 0;
          return roundHalfAway(x, d);
        }
        // Toplu fonksiyonlar: aralık ve tek başvuruda metin/boş atlanır (Excel gibi).
        // Satırsız başvuru (B ya da Tutar) bütün sütundur, B:B gibi (LOM-88).
        const nums: number[] = [];
        for (const a of node.args) {
          if (a.t === "range") nums.push(...rangeNumbers(a, selfRow, selfCol));
          else if (a.t === "ref" && a.row === null) {
            const whole = { col: a.col, row: null };
            nums.push(...rangeNumbers({ t: "range", a: whole, b: whole }, selfRow, selfCol));
          } else if (a.t === "ref") {
            const r = resolveRow(a.row, selfRow);
            checkBounds(r, a.col);
            const { n } = cellNumber(r, a.col);
            if (n !== null) nums.push(n);
          } else nums.push(evalNode(a, selfRow, selfCol));
        }
        switch (fn) {
          case "SUM":
            return nums.reduce((s, n) => s + n, 0);
          case "AVERAGE":
            if (nums.length === 0) throw new FormulaFail("div0");
            return nums.reduce((s, n) => s + n, 0) / nums.length;
          case "MIN":
            return nums.length ? Math.min(...nums) : 0;
          case "MAX":
            return nums.length ? Math.max(...nums) : 0;
          case "COUNT":
            return nums.length;
        }
        throw new FormulaFail("syntax");
      }
    }
  };

  return rows.map((_, ri) => Array.from({ length: cols }, (_, ci) => evalCell(ri, ci)));
}

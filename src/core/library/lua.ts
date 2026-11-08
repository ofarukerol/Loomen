// Lua tablo sabiti ayrıştırıcı — saf, güvenli (LOM-94).
//
// KOReader çizimleri kitabın yanındaki `<kitap>.sdr/metadata.<biçim>.lua` dosyasında durur. Dosya
// bir Lua betiğidir ama yalnız `return { ... }` biçiminde tek bir tablo sabiti taşır. Burada o sabit
// KOD ÇALIŞTIRMADAN okunur: yalnız sabit değerler (dize, sayı, true/false/nil, iç içe tablo) kabul
// edilir; işlev çağrısı, değişken, işlem yoktur (tek istisna: KOReader'ın sonsuz/NaN için yazdığı
// `math.huge` ve `1/0`, `0/0` biçimleri). Bozuk ya da desteklenmeyen girdi `LuaParseError` atar.
//
// Lua dizeleri bayttır: `\ddd` ve `\xXX` kaçışları bayt üretir (ör. "\195\182" = "ö"); bu yüzden
// dize içeriği bayt olarak toplanır ve sonunda UTF-8 olarak çözülür.

export type LuaKey = string | number | boolean;
export type LuaValue = string | number | boolean | null | LuaTable;

/** Lua tablosu: anahtar → değer. Dizi kısmı 1'den başlayan sayısal anahtarlardır. */
export class LuaTable {
  readonly map = new Map<LuaKey, LuaValue>();

  get(key: LuaKey): LuaValue | undefined {
    return this.map.get(key);
  }

  /** Dize değeri; değilse undefined. */
  str(key: LuaKey): string | undefined {
    const v = this.map.get(key);
    return typeof v === "string" ? v : undefined;
  }

  /** Sonlu sayı değeri; değilse undefined. */
  num(key: LuaKey): number | undefined {
    const v = this.map.get(key);
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  }

  /** Alt tablo; değilse undefined. */
  table(key: LuaKey): LuaTable | undefined {
    const v = this.map.get(key);
    return v instanceof LuaTable ? v : undefined;
  }

  /** Sayısal anahtarlı girdiler, anahtar sırasıyla (boşluklu diziler dahil: KOReader `[12] = …`). */
  numericEntries(): [number, LuaValue][] {
    const out: [number, LuaValue][] = [];
    for (const [k, v] of this.map) if (typeof k === "number") out.push([k, v]);
    return out.sort((a, b) => a[0] - b[0]);
  }

  /** Sayısal anahtarlı değerler, anahtar sırasıyla. */
  list(): LuaValue[] {
    return this.numericEntries().map(([, v]) => v);
  }
}

export class LuaParseError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(`${message} (konum ${offset})`);
    this.name = "LuaParseError";
  }
}

/** İç içe tablo sınırı (bozuk/kötü niyetli dosya yığını taşırmasın). */
export const LUA_MAX_DEPTH = 200;

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");

const isSpace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";
const isDigit = (c: string) => c >= "0" && c <= "9";
const isHex = (c: string) => /^[0-9a-fA-F]$/.test(c);
const isNameStart = (c: string) => /^[A-Za-z_]$/.test(c);
const isName = (c: string) => /^[A-Za-z0-9_]$/.test(c);

class Parser {
  i = 0;
  constructor(readonly s: string) {}

  fail(msg: string): never {
    throw new LuaParseError(msg, this.i);
  }

  peek(n = 0): string {
    return this.s[this.i + n] ?? "";
  }

  /** `[` + n×`=` + `[` açılışının seviyesi; uzun parantez değilse -1. */
  longLevel(at: number): number {
    if (this.s[at] !== "[") return -1;
    let j = at + 1;
    while (this.s[j] === "=") j++;
    return this.s[j] === "[" ? j - at - 1 : -1;
  }

  /** Uzun parantez içeriği (`[==[ … ]==]`); açılıştan hemen sonraki satır sonu atlanır. */
  readLong(level: number): string {
    this.i += level + 2;
    if (this.peek() === "\r") {
      this.i++;
      if (this.peek() === "\n") this.i++;
    } else if (this.peek() === "\n") {
      this.i++;
      if (this.peek() === "\r") this.i++;
    }
    const close = "]" + "=".repeat(level) + "]";
    const end = this.s.indexOf(close, this.i);
    if (end < 0) this.fail("Uzun dize kapanmadı");
    const out = this.s.slice(this.i, end);
    this.i = end + close.length;
    return out;
  }

  /** Boşluk ve yorumları atla. */
  skip(): void {
    for (;;) {
      const c = this.peek();
      if (isSpace(c)) {
        this.i++;
        continue;
      }
      if (c === "-" && this.peek(1) === "-") {
        this.i += 2;
        const lvl = this.longLevel(this.i);
        if (lvl >= 0) {
          this.readLong(lvl);
          continue;
        }
        while (this.i < this.s.length && this.peek() !== "\n" && this.peek() !== "\r") this.i++;
        continue;
      }
      return;
    }
  }

  readName(): string {
    const st = this.i;
    while (isName(this.peek())) this.i++;
    return this.s.slice(st, this.i);
  }

  readString(q: string): string {
    this.i++; // açılış tırnağı
    const bytes: number[] = [];
    let run = this.i; // kaçışsız ham metin başlangıcı
    const flush = (to: number) => {
      if (to > run) for (const b of enc.encode(this.s.slice(run, to))) bytes.push(b);
    };
    for (;;) {
      if (this.i >= this.s.length) this.fail("Dize kapanmadı");
      const c = this.s[this.i];
      if (c === q) {
        flush(this.i);
        this.i++;
        break;
      }
      if (c === "\n" || c === "\r") this.fail("Dize içinde kaçışsız satır sonu");
      if (c !== "\\") {
        this.i++;
        continue;
      }
      flush(this.i);
      this.i++;
      const e = this.peek();
      const simple: Record<string, number> = { n: 10, r: 13, t: 9, a: 7, b: 8, f: 12, v: 11, "\\": 92, '"': 34, "'": 39 };
      if (e in simple) {
        bytes.push(simple[e]);
        this.i++;
      } else if (e === "\n" || e === "\r") {
        // Ters bölü + satır sonu = satır sonu (\r\n ya da \n\r tek sayılır).
        bytes.push(10);
        this.i++;
        const n = this.peek();
        if ((n === "\n" || n === "\r") && n !== e) this.i++;
      } else if (isDigit(e)) {
        let j = 0;
        let v = 0;
        while (j < 3 && isDigit(this.peek())) {
          v = v * 10 + Number(this.peek());
          this.i++;
          j++;
        }
        if (v > 255) this.fail("Geçersiz \\ddd kaçışı");
        bytes.push(v);
      } else if (e === "x") {
        const h = this.s.slice(this.i + 1, this.i + 3);
        if (h.length !== 2 || !isHex(h[0]) || !isHex(h[1])) this.fail("Geçersiz \\x kaçışı");
        bytes.push(parseInt(h, 16));
        this.i += 3;
      } else if (e === "z") {
        this.i++;
        while (isSpace(this.peek())) this.i++;
      } else if (e === "u" && this.peek(1) === "{") {
        const end = this.s.indexOf("}", this.i + 2);
        const h = end < 0 ? "" : this.s.slice(this.i + 2, end);
        if (!/^[0-9a-fA-F]{1,6}$/.test(h) || parseInt(h, 16) > 0x10ffff) this.fail("Geçersiz \\u kaçışı");
        for (const b of enc.encode(String.fromCodePoint(parseInt(h, 16)))) bytes.push(b);
        this.i = end + 1;
      } else {
        this.fail("Geçersiz kaçış");
      }
      run = this.i;
    }
    return dec.decode(new Uint8Array(bytes));
  }

  readNumber(): number {
    const st = this.i;
    let v: number;
    if (this.peek() === "0" && (this.peek(1) === "x" || this.peek(1) === "X")) {
      this.i += 2;
      const hs = this.i;
      while (isHex(this.peek())) this.i++;
      if (this.i === hs) this.fail("Geçersiz onaltılık sayı");
      v = parseInt(this.s.slice(hs, this.i), 16);
    } else {
      while (isDigit(this.peek())) this.i++;
      if (this.peek() === ".") {
        this.i++;
        while (isDigit(this.peek())) this.i++;
      }
      if (this.peek() === "e" || this.peek() === "E") {
        this.i++;
        if (this.peek() === "+" || this.peek() === "-") this.i++;
        const es = this.i;
        while (isDigit(this.peek())) this.i++;
        if (this.i === es) this.fail("Geçersiz üs");
      }
      const t = this.s.slice(st, this.i);
      if (t === "." || t === "") this.fail("Geçersiz sayı");
      v = Number(t);
    }
    if (isName(this.peek())) this.fail("Geçersiz sayı");
    if (!Number.isFinite(v)) this.fail("Geçersiz sayı");
    // KOReader sonsuz/NaN'ı `1/0`, `-1/0`, `0/0` diye yazabilir.
    const save = this.i;
    this.skip();
    if (this.peek() === "/") {
      this.i++;
      this.skip();
      if (!isDigit(this.peek()) && this.peek() !== ".") this.fail("Geçersiz bölme");
      const d = this.readNumber();
      return v / d;
    }
    this.i = save;
    return v;
  }

  value(depth: number): LuaValue {
    this.skip();
    const c = this.peek();
    if (c === '"' || c === "'") return this.readString(c);
    if (c === "{") return this.table(depth + 1);
    if (c === "[") {
      const lvl = this.longLevel(this.i);
      if (lvl < 0) this.fail("Beklenmeyen [");
      return this.readLong(lvl);
    }
    if (c === "-") {
      this.i++;
      this.skip();
      const v = this.value(depth);
      if (typeof v !== "number") this.fail("Eksi işaretinden sonra sayı beklenir");
      return -v;
    }
    if (isDigit(c) || (c === "." && isDigit(this.peek(1)))) return this.readNumber();
    if (isNameStart(c)) {
      const st = this.i;
      const name = this.readName();
      if (name === "true") return true;
      if (name === "false") return false;
      if (name === "nil") return null;
      if (name === "math" && this.peek() === "." && this.s.startsWith("huge", this.i + 1) && !isName(this.s[this.i + 5] ?? "")) {
        this.i += 5;
        return Infinity;
      }
      this.i = st;
      this.fail(`Desteklenmeyen ad: ${name}`);
    }
    this.fail(c ? `Beklenmeyen karakter: ${c}` : "Beklenmeyen dosya sonu");
  }

  key(depth: number): LuaKey {
    const k = this.value(depth);
    if (typeof k === "number") {
      if (Number.isNaN(k)) this.fail("NaN anahtar olamaz");
      return k;
    }
    if (typeof k === "string" || typeof k === "boolean") return k;
    this.fail("Desteklenmeyen anahtar");
  }

  table(depth: number): LuaTable {
    if (depth > LUA_MAX_DEPTH) this.fail("Tablo çok derin");
    this.i++; // {
    const t = new LuaTable();
    let next = 1;
    for (;;) {
      this.skip();
      if (this.peek() === "}") {
        this.i++;
        return t;
      }
      if (this.peek() === "[" && this.longLevel(this.i) < 0) {
        this.i++;
        const k = this.key(depth);
        this.skip();
        if (this.peek() !== "]") this.fail("] beklenir");
        this.i++;
        this.expectEq();
        const v = this.value(depth);
        if (v === null) t.map.delete(k);
        else t.map.set(k, v);
      } else if (isNameStart(this.peek()) && this.isNamedField()) {
        const k = this.readName();
        this.expectEq();
        const v = this.value(depth);
        if (v === null) t.map.delete(k);
        else t.map.set(k, v);
      } else {
        const v = this.value(depth);
        if (v !== null) t.map.set(next, v);
        next++;
      }
      this.skip();
      const sep = this.peek();
      if (sep === "," || sep === ";") {
        this.i++;
        continue;
      }
      if (sep === "}") continue;
      this.fail(sep ? ", ya da } beklenir" : "Tablo kapanmadı");
    }
  }

  /** Bulunulan ad `ad = …` alanı mı (true/false/nil değeri değil)? */
  isNamedField(): boolean {
    const save = this.i;
    this.readName();
    this.skip();
    const ok = this.peek() === "=" && this.peek(1) !== "=";
    this.i = save;
    return ok;
  }

  expectEq(): void {
    this.skip();
    if (this.peek() !== "=" || this.peek(1) === "=") this.fail("= beklenir");
    this.i++;
  }
}

/**
 * Lua sabitini oku: baştaki BOM, `#!` satırı, yorumlar ve isteğe bağlı `return` atlanır; tek bir
 * değer (genelde tablo) beklenir, sonrasında yalnız boşluk/yorum ve `;` olabilir.
 */
export function parseLua(text: string): LuaValue {
  let s = text.replace(/^﻿/, "");
  if (s.startsWith("#")) s = s.replace(/^#[^\n]*/, "");
  const p = new Parser(s);
  p.skip();
  if (s.startsWith("return", p.i) && !isName(s[p.i + 6] ?? "")) p.i += 6;
  const v = p.value(0);
  p.skip();
  if (p.peek() === ";") {
    p.i++;
    p.skip();
  }
  if (p.i < s.length) p.fail("Değerden sonra fazla içerik");
  return v;
}

/** Lua sabiti bir tabloysa onu döner; değilse ya da bozuksa null (hata atmaz). */
export function parseLuaTable(text: string): LuaTable | null {
  try {
    const v = parseLua(text);
    return v instanceof LuaTable ? v : null;
  } catch {
    return null;
  }
}

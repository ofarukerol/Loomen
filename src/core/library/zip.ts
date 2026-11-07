// Küçük ZIP okuyucu (LOM-83, EPUB parçası). Bağımlılık yok.
//
// EPUB bir ZIP arşividir. Yalnız okuma: merkezi dizin (central directory) ayrıştırılır, girdiler
// istendiğinde açılır (bütün arşiv bir kerede açılmaz; büyük kitapta bellek şişmesin).
// Desteklenen sıkıştırma: 0 (stored) ve 8 (deflate). Deflate için saf TypeScript inflate
// (RFC 1951) burada: `DecompressionStream('deflate-raw')` macOS 11 WebKit'te yok, ona güvenilmez.
// ZIP64 (4 GB üstü alanlar) okunur. Şifreli girdi açılmaz (hata).

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export interface ZipEntry {
  /** Arşivdeki yol ("OEBPS/text/ch1.xhtml"). Klasörler "/" ile biter. */
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  crc32: number;
  /** Yerel başlığın (local header) arşivdeki konumu. */
  offset: number;
  encrypted: boolean;
}

/** Tek girdinin açılınca ulaşabileceği en büyük boyut — bozuk/kötü niyetli arşivde bellek koruması. */
export const MAX_ENTRY_BYTES = 512 * 1024 * 1024;

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

// ─── CRC-32 ───────────────────────────────────────────────────────────────────────

let crcTable: Uint32Array | null = null;
function table(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

export function crc32(data: Uint8Array): number {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ─── Inflate (RFC 1951) ───────────────────────────────────────────────────────────

interface Huffman {
  /** counts[len] = o uzunlukta kaç kod var. */
  counts: Uint16Array;
  /** Kod sırasına göre semboller. */
  symbols: Uint16Array;
}

function buildHuffman(lengths: Uint8Array | number[], n: number): Huffman {
  const counts = new Uint16Array(16);
  const symbols = new Uint16Array(n);
  for (let i = 0; i < n; i++) counts[lengths[i]]++;
  counts[0] = 0;
  // Fazla abone (oversubscribed) kod kümesi bozuk veridir.
  let left = 1;
  for (let len = 1; len < 16; len++) {
    left <<= 1;
    left -= counts[len];
    if (left < 0) throw new ZipError("Bozuk sıkıştırma tablosu");
  }
  const offs = new Uint16Array(16);
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + counts[len];
  for (let i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  return { counts, symbols };
}

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385,
  24577,
];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

let fixedLit: Huffman | null = null;
let fixedDist: Huffman | null = null;
function fixedTables(): [Huffman, Huffman] {
  if (!fixedLit || !fixedDist) {
    const l = new Uint8Array(288);
    for (let i = 0; i < 144; i++) l[i] = 8;
    for (let i = 144; i < 256; i++) l[i] = 9;
    for (let i = 256; i < 280; i++) l[i] = 7;
    for (let i = 280; i < 288; i++) l[i] = 8;
    fixedLit = buildHuffman(l, 288);
    fixedDist = buildHuffman(new Uint8Array(30).fill(5), 30);
  }
  return [fixedLit, fixedDist];
}

/**
 * Ham deflate akışını aç. `expected` biliniyorsa çıktı tamponu baştan o boyutta ayrılır ve
 * çıktı onu aşamaz; bilinmiyorsa `limit`e kadar büyür.
 */
export function inflateRaw(src: Uint8Array, expected?: number, limit = MAX_ENTRY_BYTES): Uint8Array {
  let pos = 0;
  let bitBuf = 0;
  let bitCnt = 0;
  const max = expected !== undefined ? Math.min(expected, limit) : limit;
  let out = new Uint8Array(expected !== undefined ? Math.min(expected, limit) : Math.min(limit, Math.max(1024, src.length * 4)));
  let outLen = 0;

  const need = (n: number) => {
    if (outLen + n <= out.length) return;
    if (outLen + n > max) throw new ZipError("Açılan veri beklenen boyutu aşıyor");
    let size = out.length * 2;
    while (size < outLen + n) size *= 2;
    const next = new Uint8Array(Math.min(size, max));
    next.set(out.subarray(0, outLen));
    out = next;
  };
  const bits = (n: number): number => {
    while (bitCnt < n) {
      if (pos >= src.length) throw new ZipError("Sıkıştırılmış veri erken bitti");
      bitBuf |= src[pos++] << bitCnt;
      bitCnt += 8;
    }
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  };
  const decode = (h: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = h.counts[len];
      if (code - count < first) return h.symbols[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new ZipError("Bozuk sıkıştırma kodu");
  };

  const codes = (lit: Huffman, dist: Huffman) => {
    for (;;) {
      const sym = decode(lit);
      if (sym < 256) {
        need(1);
        out[outLen++] = sym;
      } else if (sym === 256) {
        return;
      } else {
        const li = sym - 257;
        if (li >= 29) throw new ZipError("Bozuk uzunluk kodu");
        const len = LEN_BASE[li] + bits(LEN_EXTRA[li]);
        const di = decode(dist);
        if (di >= 30) throw new ZipError("Bozuk uzaklık kodu");
        const d = DIST_BASE[di] + bits(DIST_EXTRA[di]);
        if (d > outLen) throw new ZipError("Uzaklık verinin başını aşıyor");
        need(len);
        for (let i = 0; i < len; i++, outLen++) out[outLen] = out[outLen - d];
      }
    }
  };

  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0;
      bitCnt = 0;
      if (pos + 4 > src.length) throw new ZipError("Sıkıştırılmış veri erken bitti");
      const len = src[pos] | (src[pos + 1] << 8);
      const nlen = src[pos + 2] | (src[pos + 3] << 8);
      pos += 4;
      if (len !== (~nlen & 0xffff)) throw new ZipError("Bozuk ham blok");
      if (pos + len > src.length) throw new ZipError("Sıkıştırılmış veri erken bitti");
      need(len);
      out.set(src.subarray(pos, pos + len), outLen);
      outLen += len;
      pos += len;
    } else if (type === 1) {
      const [l, d] = fixedTables();
      codes(l, d);
    } else if (type === 2) {
      const hlit = bits(5) + 257;
      const hdist = bits(5) + 1;
      const hclen = bits(4) + 4;
      if (hlit > 286 || hdist > 30) throw new ZipError("Bozuk sıkıştırma başlığı");
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
      const clh = buildHuffman(cl, 19);
      const lens = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist; ) {
        const sym = decode(clh);
        if (sym < 16) {
          lens[i++] = sym;
          continue;
        }
        let rep = 0;
        let val = 0;
        if (sym === 16) {
          if (i === 0) throw new ZipError("Bozuk tekrar kodu");
          val = lens[i - 1];
          rep = 3 + bits(2);
        } else if (sym === 17) rep = 3 + bits(3);
        else rep = 11 + bits(7);
        if (i + rep > hlit + hdist) throw new ZipError("Bozuk tekrar kodu");
        while (rep--) lens[i++] = val;
      }
      if (lens[256] === 0) throw new ZipError("Blok sonu kodu yok");
      codes(buildHuffman(lens.subarray(0, hlit), hlit), buildHuffman(lens.subarray(hlit), hdist));
    } else {
      throw new ZipError("Bozuk blok türü");
    }
  }
  return outLen === out.length ? out : out.slice(0, outLen);
}

// ─── Arşiv ────────────────────────────────────────────────────────────────────────

const utf8 = new TextDecoder("utf-8");

/** UTF-8 bayrağı olmayan adlar: geçerli UTF-8 ise öyle, değilse CP437 yerine Latin-1 (EPUB'da nadir). */
function decodeName(bytes: Uint8Array, isUtf8: boolean): string {
  if (isUtf8) return utf8.decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return s;
  }
}

export class ZipArchive {
  readonly entries: ReadonlyMap<string, ZipEntry>;
  private readonly data: Uint8Array;
  private readonly lower = new Map<string, string>();

  constructor(data: Uint8Array) {
    this.data = data;
    this.entries = readCentral(data);
    for (const k of this.entries.keys()) if (!this.lower.has(k.toLowerCase())) this.lower.set(k.toLowerCase(), k);
  }

  /** Yolu bul: önce birebir, sonra büyük/küçük harf duyarsız (bazı EPUB'larda manifest ile arşiv uyuşmaz). */
  resolve(name: string): string | null {
    if (this.entries.has(name)) return name;
    return this.lower.get(name.toLowerCase()) ?? null;
  }

  has(name: string): boolean {
    return this.resolve(name) !== null;
  }

  /** Girdinin açılmış boyutu (yoksa 0). */
  sizeOf(name: string): number {
    const k = this.resolve(name);
    return k ? this.entries.get(k)!.size : 0;
  }

  read(name: string): Uint8Array {
    const k = this.resolve(name);
    if (!k) throw new ZipError(`Arşivde yok: ${name}`);
    const e = this.entries.get(k)!;
    if (e.encrypted) throw new ZipError(`Şifreli girdi: ${name}`);
    const d = this.data;
    if (e.offset + 30 > d.length || u32(d, e.offset) !== SIG_LOCAL) throw new ZipError(`Bozuk yerel başlık: ${name}`);
    const start = e.offset + 30 + u16(d, e.offset + 26) + u16(d, e.offset + 28);
    const end = start + e.compressedSize;
    if (end > d.length) throw new ZipError(`Girdi arşivin dışına taşıyor: ${name}`);
    const raw = d.subarray(start, end);
    let out: Uint8Array;
    if (e.method === 0) out = raw.slice();
    else if (e.method === 8) {
      if (e.size > MAX_ENTRY_BYTES) throw new ZipError(`Girdi çok büyük: ${name}`);
      // Deflate en fazla ~1032 kat sıkıştırır; bundan büyük beyan yalandır (bellek ayırmadan reddet).
      if (e.size > e.compressedSize * 1040 + 1024) throw new ZipError(`Bozuk boyut bilgisi: ${name}`);
      out = inflateRaw(raw, e.size);
    } else throw new ZipError(`Desteklenmeyen sıkıştırma (${e.method}): ${name}`);
    if (out.length !== e.size) throw new ZipError(`Boyut uyuşmuyor: ${name}`);
    if (crc32(out) !== e.crc32) throw new ZipError(`Bozuk veri (CRC): ${name}`);
    return out;
  }

  readText(name: string): string {
    return decodeText(this.read(name));
  }
}

/** Metin baytlarını çöz: BOM'a göre UTF-16, yoksa UTF-8. */
export function decodeText(b: Uint8Array): string {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return utf8.decode(b.subarray(3));
  return utf8.decode(b);
}

function u16(d: Uint8Array, p: number): number {
  return d[p] | (d[p + 1] << 8);
}
function u32(d: Uint8Array, p: number): number {
  return (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0;
}
function u64(d: Uint8Array, p: number): number {
  const v = u32(d, p) + u32(d, p + 4) * 0x100000000;
  if (!Number.isSafeInteger(v)) throw new ZipError("Arşiv alanı çok büyük");
  return v;
}

function findEocd(d: Uint8Array): number {
  // Sonda en fazla 65535 baytlık yorum olabilir.
  const min = Math.max(0, d.length - 22 - 0xffff);
  for (let p = d.length - 22; p >= min; p--) {
    if (d[p] === 0x50 && d[p + 1] === 0x4b && u32(d, p) === SIG_EOCD) return p;
  }
  throw new ZipError("ZIP arşivi değil (dizin sonu yok)");
}

function readCentral(d: Uint8Array): Map<string, ZipEntry> {
  if (d.length < 22) throw new ZipError("ZIP arşivi değil");
  const eocd = findEocd(d);
  let count = u16(d, eocd + 10);
  let cdSize = u32(d, eocd + 12);
  let cdOff = u32(d, eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(d, loc) === SIG_EOCD64_LOC) {
      const p = u64(d, loc + 8);
      if (p + 56 > d.length || u32(d, p) !== SIG_EOCD64) throw new ZipError("Bozuk ZIP64 dizin sonu");
      count = u64(d, p + 32);
      cdSize = u64(d, p + 40);
      cdOff = u64(d, p + 48);
    }
  }
  if (cdOff + cdSize > d.length) throw new ZipError("Merkezi dizin arşivin dışında");
  const out = new Map<string, ZipEntry>();
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > d.length || u32(d, p) !== SIG_CENTRAL) throw new ZipError("Bozuk merkezi dizin");
    const flags = u16(d, p + 8);
    const method = u16(d, p + 10);
    const crc = u32(d, p + 16);
    let compressedSize = u32(d, p + 20);
    let size = u32(d, p + 24);
    const nameLen = u16(d, p + 28);
    const extraLen = u16(d, p + 30);
    const commentLen = u16(d, p + 32);
    let offset = u32(d, p + 42);
    const nameStart = p + 46;
    if (nameStart + nameLen + extraLen > d.length) throw new ZipError("Bozuk merkezi dizin");
    const name = decodeName(d.subarray(nameStart, nameStart + nameLen), (flags & 0x800) !== 0);
    // ZIP64 ek alanı: yalnız 0xFFFFFFFF olan alanlar sırayla burada durur.
    let x = nameStart + nameLen;
    const xEnd = x + extraLen;
    while (x + 4 <= xEnd) {
      const id = u16(d, x);
      const len = u16(d, x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        if (size === 0xffffffff && q + 8 <= x + 4 + len) (size = u64(d, q)), (q += 8);
        if (compressedSize === 0xffffffff && q + 8 <= x + 4 + len) (compressedSize = u64(d, q)), (q += 8);
        if (offset === 0xffffffff && q + 8 <= x + 4 + len) offset = u64(d, q);
      }
      x += 4 + len;
    }
    // Güvenli olmayan yollar (../, mutlak) atlanır; EPUB içinde anlamı yok.
    const safe = name.replace(/\\/g, "/");
    if (safe && !safe.startsWith("/") && !safe.split("/").includes("..")) {
      if (!out.has(safe)) out.set(safe, { name: safe, method, compressedSize, size, crc32: crc, offset, encrypted: (flags & 1) !== 0 });
    }
    p = nameStart + nameLen + extraLen + commentLen;
  }
  return out;
}

export function readZip(data: Uint8Array): ZipArchive {
  return new ZipArchive(data);
}

/** Baytlar ZIP yerel başlığıyla mı başlıyor? */
export function looksLikeZip(data: Uint8Array): boolean {
  return data.length >= 4 && u32(data, 0) === SIG_LOCAL;
}

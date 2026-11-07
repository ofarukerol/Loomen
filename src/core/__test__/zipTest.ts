// ZIP okuyucu ve saf inflate testi (LOM-83, EPUB parçası).
// Sıkıştırılmış veri node'un zlib'iyle üretilir; açma bizim kodumuzla yapılır ve karşılaştırılır.
import { constants, deflateRawSync } from "node:zlib";
import { ZipError, crc32, decodeText, inflateRaw, looksLikeZip, readZip } from "../library/zip";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
function throwsZip(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ZipError;
  }
}
const enc = new TextEncoder();
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Sabit tohumlu sözde rastgele (testler her koşuda aynı). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ─── Test arşivi kurucu ──────────────────────────────────────────────────────────

interface In {
  name: string;
  data: Uint8Array;
  method?: 0 | 8;
  zip64?: boolean;
  encrypted?: boolean;
  utf8?: boolean;
  badCrc?: boolean;
}

function makeZip(items: In[], comment = ""): Uint8Array {
  const parts: number[] = [];
  const central: number[] = [];
  const w16 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff);
  const w32 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  const w64 = (a: number[], v: number) => {
    w32(a, v >>> 0);
    w32(a, Math.floor(v / 0x100000000));
  };
  for (const it of items) {
    const method = it.method ?? 8;
    const body = method === 8 ? new Uint8Array(deflateRawSync(it.data)) : it.data;
    const name = enc.encode(it.name);
    const crc = it.badCrc ? crc32(it.data) ^ 1 : crc32(it.data);
    const flags = (it.utf8 === false ? 0 : 0x800) | (it.encrypted ? 1 : 0);
    const offset = parts.length;
    w32(parts, 0x04034b50);
    w16(parts, 20);
    w16(parts, flags);
    w16(parts, method);
    w32(parts, 0);
    w32(parts, crc);
    w32(parts, body.length);
    w32(parts, it.data.length);
    w16(parts, name.length);
    w16(parts, 0);
    parts.push(...name, ...body);

    const extra: number[] = [];
    if (it.zip64) {
      w16(extra, 1);
      w16(extra, 24);
      w64(extra, it.data.length);
      w64(extra, body.length);
      w64(extra, offset);
    }
    w32(central, 0x02014b50);
    w16(central, 45);
    w16(central, 20);
    w16(central, flags);
    w16(central, method);
    w32(central, 0);
    w32(central, crc);
    w32(central, it.zip64 ? 0xffffffff : body.length);
    w32(central, it.zip64 ? 0xffffffff : it.data.length);
    w16(central, name.length);
    w16(central, extra.length);
    w16(central, 0);
    w16(central, 0);
    w16(central, 0);
    w32(central, 0);
    w32(central, it.zip64 ? 0xffffffff : offset);
    central.push(...name, ...extra);
  }
  const cdOff = parts.length;
  const c = enc.encode(comment);
  const end: number[] = [];
  w32(end, 0x06054b50);
  w16(end, 0);
  w16(end, 0);
  w16(end, items.length);
  w16(end, items.length);
  w32(end, central.length);
  w32(end, cdOff);
  w16(end, c.length);
  return new Uint8Array([...parts, ...central, ...end, ...c]);
}

// ─── CRC ─────────────────────────────────────────────────────────────────────────

check("crc32 bilinen değer", crc32(enc.encode("123456789")) === 0xcbf43926);
check("crc32 boş", crc32(new Uint8Array(0)) === 0);

// ─── Inflate: zlib çıktısıyla karşılaştırma ──────────────────────────────────────

const r = rng(42);
const words = ["kitap", "okuma", "çizim", "Loomen", "sayfa", "bölüm", "alıntı", "not", "\n", " ", "ğüşiöç"];
const textOf = (n: number) => {
  let s = "";
  while (s.length < n) s += words[Math.floor(r() * words.length)] + " ";
  return enc.encode(s.slice(0, n));
};
const randomBytes = (n: number) => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = Math.floor(r() * 256);
  return b;
};

const cases: [string, Uint8Array][] = [
  ["boş", new Uint8Array(0)],
  ["tek bayt", new Uint8Array([65])],
  ["kısa metin", enc.encode("Merhaba dünya")],
  ["uzun metin (dinamik Huffman)", textOf(200_000)],
  ["rastgele bayt (sıkışmaz)", randomBytes(70_000)],
  ["uzun tekrar (258 uzunluk, uzak mesafe)", new Uint8Array(100_000).fill(7)],
];
const options: [string, object][] = [
  ["varsayılan", {}],
  ["seviye 0 (ham bloklar)", { level: 0 }],
  ["seviye 9", { level: 9 }],
  ["sabit Huffman", { strategy: constants.Z_FIXED }],
  ["yalnız Huffman", { strategy: constants.Z_HUFFMAN_ONLY }],
  ["RLE", { strategy: constants.Z_RLE }],
];
for (const [cn, data] of cases) {
  for (const [on, opt] of options) {
    const z = new Uint8Array(deflateRawSync(data, opt));
    let ok = false;
    let detail = "";
    try {
      ok = same(inflateRaw(z, data.length), data) && same(inflateRaw(z), data);
    } catch (e) {
      detail = String(e);
    }
    check(`inflate: ${cn} · ${on}`, ok, detail);
  }
}

// Bozuk akışlar ZipError atar, sonsuz döngüye ya da çökmeye girmez.
const good = new Uint8Array(deflateRawSync(textOf(5000)));
check("kesik akış hata", throwsZip(() => inflateRaw(good.subarray(0, good.length >> 1))));
check("bozuk blok türü hata", throwsZip(() => inflateRaw(new Uint8Array([0x07, 0x00]))));
check("ham blok uzunluk denetimi", throwsZip(() => inflateRaw(new Uint8Array([0x01, 0x05, 0x00, 0x00, 0x00, 1, 2, 3, 4, 5]))));
check("beklenen boyutu aşan veri hata", throwsZip(() => inflateRaw(new Uint8Array(deflateRawSync(new Uint8Array(5000))), 100)));
check("sınırı aşan veri hata (bomba koruması)", throwsZip(() => inflateRaw(new Uint8Array(deflateRawSync(new Uint8Array(1_000_000))), undefined, 10_000)));
let fuzzOk = true;
for (let k = 0; k < 300; k++) {
  const b = good.slice();
  for (let j = 0; j < 4; j++) b[Math.floor(r() * b.length)] = Math.floor(r() * 256);
  try {
    inflateRaw(b, undefined, 1_000_000);
  } catch (e) {
    if (!(e instanceof ZipError)) {
      fuzzOk = false;
      console.log("  beklenmeyen hata:", e);
      break;
    }
  }
}
check("bozulmuş akışlarda yalnız ZipError", fuzzOk);

// ─── Arşiv ───────────────────────────────────────────────────────────────────────

const mimetype = enc.encode("application/epub+zip");
const big = textOf(50_000);
const img = randomBytes(3000);
const zipBytes = makeZip(
  [
    { name: "mimetype", data: mimetype, method: 0 },
    { name: "META-INF/", data: new Uint8Array(0), method: 0 },
    { name: "OEBPS/Metin/Bölüm 1.xhtml", data: big },
    { name: "OEBPS/images/kapak.jpg", data: img, method: 0 },
    { name: "OEBPS/z64.txt", data: enc.encode("zip64 alanı"), zip64: true },
    { name: "../kaçak.txt", data: enc.encode("x") },
    { name: "OEBPS/şifreli.xhtml", data: enc.encode("gizli"), encrypted: true, method: 0 },
    { name: "OEBPS/bozuk.txt", data: enc.encode("bozuk crc"), badCrc: true },
  ],
  "arşiv yorumu"
);
const zip = readZip(zipBytes);
check("ZIP imzası tanınır", looksLikeZip(zipBytes) && !looksLikeZip(enc.encode("%PDF-1.7")));
check("girdiler okunur", zip.entries.size === 7, String([...zip.entries.keys()]));
check("ham (stored) girdi", decodeText(zip.read("mimetype")) === "application/epub+zip");
check("deflate girdi + UTF-8 ad", same(zip.read("OEBPS/Metin/Bölüm 1.xhtml"), big));
check("ikili girdi", same(zip.read("OEBPS/images/kapak.jpg"), img));
check("büyük/küçük harf duyarsız bulma", zip.resolve("oebps/IMAGES/kapak.JPG") === "OEBPS/images/kapak.jpg");
check("boyut", zip.sizeOf("OEBPS/Metin/Bölüm 1.xhtml") === big.length && zip.sizeOf("yok") === 0);
check("ZIP64 ek alanı", zip.readText("OEBPS/z64.txt") === "zip64 alanı");
check("kökü aşan yol atlanır", !zip.has("../kaçak.txt") && !zip.has("kaçak.txt"));
check("şifreli girdi açılmaz", throwsZip(() => zip.read("OEBPS/şifreli.xhtml")));
check("CRC uyuşmazlığı yakalanır", throwsZip(() => zip.read("OEBPS/bozuk.txt")));
check("olmayan girdi hata", throwsZip(() => zip.read("yok.txt")));
check("ZIP olmayan veri hata", throwsZip(() => readZip(enc.encode("bu bir zip değil, yalnız düz metin ve biraz daha uzun"))));
check("kısa veri hata", throwsZip(() => readZip(new Uint8Array(5))));
check("kesik arşiv hata", throwsZip(() => readZip(zipBytes.subarray(0, zipBytes.length - 40))));

// UTF-8 bayrağı olmayan ad: geçerli UTF-8 ise öyle okunur.
const noFlag = readZip(makeZip([{ name: "Çay.txt", data: enc.encode("a"), utf8: false }]));
check("bayraksız UTF-8 ad", noFlag.has("Çay.txt"));

// Metin çözme: BOM'lar.
check("UTF-8 BOM atılır", decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])) === "a");
check("UTF-16LE", decodeText(new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x1f, 0x01])) === "ağ");

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nZIP okuyucu: tüm kontroller geçti");

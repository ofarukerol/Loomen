// Açık kitaplık: küçük zip okuyucu/yazıcı. Yalnız Node yerleşikleri; ağ ve dosya erişimi yok.
// Okuma: yalnız saklı (0) ve deflate (8) yöntemleri; her girdide boyut ve CRC-32 doğrulanır.
// Yazma: belirlenimlidir (sabit 1980 tarihi, verilen sıra); aynı girdi aynı baytları verir.
import zlib from 'node:zlib';

export class ZipError extends Error {}
const bad = (message) => { throw new ZipError(message); };

// node:zlib crc32 her Node 20 sürümünde yok; kendi tablomuz var.
const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  TABLE[n] = c >>> 0;
}
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const toBuffer = (data) => Buffer.isBuffer(data) ? data
  : typeof data === 'string' ? Buffer.from(data, 'utf8')
  : Buffer.from(data.buffer, data.byteOffset, data.byteLength);

/** Zip'i okur. Dönen nesne: names, has(ad), read(ad) → Buffer (CRC doğrulanmış). */
export function readZip(input) {
  const buf = toBuffer(input);
  if (buf.length < 22) bad('Dosya zip arşivi olamayacak kadar kısa.');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) bad('Zip sonu kaydı bulunamadı (dosya kesik olabilir).');
  const count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOff = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) bad('Zip64 arşivleri desteklenmiyor.');
  if (cdOff + cdSize > eocd) bad('Zip dizini bozuk.');
  const entries = new Map();
  let pos = cdOff;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) bad('Zip dizini bozuk.');
    const flags = buf.readUInt16LE(pos + 8), method = buf.readUInt16LE(pos + 10);
    const crc = buf.readUInt32LE(pos + 16), csize = buf.readUInt32LE(pos + 20), usize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28), extraLen = buf.readUInt16LE(pos + 30), commentLen = buf.readUInt16LE(pos + 32);
    const offset = buf.readUInt32LE(pos + 42);
    if (pos + 46 + nameLen + extraLen + commentLen > buf.length) bad('Zip dizini bozuk.');
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (flags & 1) bad(`Şifreli zip girdisi: ${name}`);
    if (method !== 0 && method !== 8) bad(`Desteklenmeyen sıkıştırma yöntemi (${method}): ${name}`);
    if (csize === 0xffffffff || usize === 0xffffffff || offset === 0xffffffff) bad('Zip64 arşivleri desteklenmiyor.');
    if (entries.has(name)) bad(`Aynı ad iki kez geçiyor: ${name}`);
    entries.set(name, { name, method, crc, csize, usize, offset });
  }
  const read = (name) => {
    const e = entries.get(name);
    if (!e) bad(`Arşivde yok: ${name}`);
    const h = e.offset;
    if (h + 30 > buf.length || buf.readUInt32LE(h) !== 0x04034b50) bad(`Girdi başlığı bozuk: ${name}`);
    const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
    const end = start + e.csize;
    if (end > buf.length) bad(`Girdi kesik: ${name}`);
    const raw = buf.subarray(start, end);
    let data;
    if (e.method === 0) {
      if (e.csize !== e.usize) bad(`Girdi boyutu tutmuyor: ${name}`);
      data = raw;
    } else {
      try { data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(e.usize, 1) }); }
      catch { bad(`Girdi açılamadı (bozuk sıkıştırma): ${name}`); }
    }
    if (data.length !== e.usize) bad(`Girdi boyutu tutmuyor: ${name}`);
    if (crc32(data) !== e.crc) bad(`CRC tutmuyor (dosya bozuk): ${name}`);
    return Buffer.from(data);
  };
  return { names: [...entries.keys()], has: (name) => entries.has(name), read };
}

/** Belirlenimli zip. entries: [{ name, data }]; `mimetype` sıkıştırılmaz. */
export function writeZip(entries) {
  const locals = [], centrals = [];
  const seen = new Set();
  let offset = 0;
  for (const { name, data } of entries) {
    if (seen.has(name)) bad(`Aynı ad iki kez yazılamaz: ${name}`);
    seen.add(name);
    const nameBuf = Buffer.from(name, 'utf8'), raw = toBuffer(data);
    const method = name === 'mimetype' ? 0 : 8;
    const body = method === 0 ? raw : zlib.deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(method, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(33, 12); // 1980-01-01 00:00
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(method, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(head, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
    if (offset > 0xfffffff0) bad('Arşiv zip64 gerektirecek kadar büyük.');
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

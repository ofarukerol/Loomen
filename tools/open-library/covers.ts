import { inflateSync } from 'node:zlib';
import { crc32 } from '../../src/core/library/zip.ts';
import { escapeXml } from './arabic-epub.ts';

export interface ExistingCover {
  data: Uint8Array;
  mediaType: 'image/png' | 'image/jpeg';
  rights?: { redistribution: boolean; verifiedBy: string; evidence: string; license: string; editionId: string };
}
export interface PreparedCover {
  data: Uint8Array; mediaType: 'image/png' | 'image/jpeg' | 'image/svg+xml';
  origin: 'existing' | 'generated'; reason: string;
}

/** Boş/kesik görselleri ve aşırı boyutları ele. SVG girdisi çalıştırılabilir içerik yüzünden alınmaz. */
export function usableCover(cover: ExistingCover): boolean {
  const b = Buffer.from(cover.data);
  if (b.length > 20 * 1024 * 1024 || b.length < 24) return false;
  try {
    if (cover.mediaType === 'image/png') {
      if (!b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
      let offset = 8, width = 0, height = 0, channels = 0, depth = 0, interlace = 0, color = 0, palette = false, ended = false;
      const parts: Buffer[] = [];
      while (offset + 12 <= b.length) {
        const length = b.readUInt32BE(offset), end = offset + 12 + length;
        if (end > b.length) return false;
        const type = b.toString('ascii', offset + 4, offset + 8), payload = b.subarray(offset + 8, end - 4);
        if (crc32(b.subarray(offset + 4, end - 4)) !== b.readUInt32BE(end - 4)) return false;
        if (offset === 8 && type !== 'IHDR') return false;
        if (type === 'IHDR') {
          if (offset !== 8 || length !== 13) return false;
          width = payload.readUInt32BE(0); height = payload.readUInt32BE(4); depth = payload[8];
          color = payload[9]; interlace = payload[12];
          channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color] || 0;
          const depths = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16];
          if (!width || !height || width * height > 16_000_000 || !channels || !depths.includes(depth) || payload[10] || payload[11] || interlace > 1) return false;
        } else if (type === 'PLTE') {
          if (!length || length % 3 || length > 768) return false;
          palette = true;
        } else if (type === 'IDAT') parts.push(payload);
        else if (type === 'IEND') { if (length || end !== b.length) return false; ended = true; break; }
        offset = end;
      }
      if (!ended || !parts.length || color === 3 && !palette) return false;
      const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
      const rows: number[] = [];
      for (const [x, y, dx, dy] of passes) {
        const w = Math.max(0, Math.ceil((width - x) / dx)), h = Math.max(0, Math.ceil((height - y) / dy));
        if (w) for (let row = 0; row < h; row++) rows.push(Math.ceil(w * channels * depth / 8) + 1);
      }
      const expected = rows.reduce((sum, stride) => sum + stride, 0);
      const pixels = inflateSync(Buffer.concat(parts), { maxOutputLength: expected });
      if (pixels.length !== expected) return false;
      let rowOffset = 0;
      for (const stride of rows) { if (pixels[rowOffset] > 4) return false; rowOffset += stride; }
      return true;
    }
    if (cover.mediaType === 'image/jpeg') {
      if (b.readUInt16BE(0) !== 0xffd8 || b.readUInt16BE(b.length - 2) !== 0xffd9) return false;
      let offset = 2, dimensions = false, scan = false, quantization = false, huffman = false, entropy = 0;
      let components = 0;
      while (offset < b.length - 2) {
        if (b[offset++] !== 255) return false;
        while (b[offset] === 255) offset++;
        const marker = b[offset++];
        if (marker === 0xd9) break;
        if (marker >= 0xd0 && marker <= 0xd7) continue;
        const size = b.readUInt16BE(offset);
        if (size < 2 || offset + size > b.length) return false;
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          if (size < 8) return false;
          components = b[offset + 7];
          if (![1, 3, 4].includes(components) || size !== 8 + 3 * components || ![8, 12].includes(b[offset + 2])) return false;
          const h = b.readUInt16BE(offset + 3), w = b.readUInt16BE(offset + 5);
          dimensions = w > 0 && h > 0 && w * h <= 16_000_000;
        }
        if (marker === 0xdb) {
          let p = offset + 2;
          while (p < offset + size) {
            const precision = b[p] >> 4;
            if (precision > 1 || (b[p] & 15) > 3) return false;
            if (p + 1 + 64 * (precision + 1) > offset + size) return false;
            for (let q = 0; q < 64; q++) {
              const value = precision ? b.readUInt16BE(p + 1 + q * 2) : b[p + 1 + q];
              if (!value) return false;
            }
            p += 1 + 64 * (precision + 1);
          }
          if (p !== offset + size) return false;
          quantization = size > 2;
        }
        if (marker === 0xc4) {
          let p = offset + 2;
          while (p < offset + size) {
            if (p + 17 > offset + size || b[p] >> 4 > 1 || (b[p] & 15) > 3) return false;
            let count = 0, capacity = 1;
            for (let i = 1; i <= 16; i++) {
              count += b[p + i]; capacity = capacity * 2 - b[p + i];
              if (capacity < 0) return false;
            }
            if (!count || count > 256) return false;
            p += 17 + count;
          }
          if (p !== offset + size) return false;
          huffman = size > 2;
        }
        if (marker === 0xda && (!dimensions || !quantization || !huffman || !b[offset + 2] || b[offset + 2] > components || size !== 6 + 2 * b[offset + 2])) return false;
        offset += size;
        if (marker === 0xda) {
          scan = true;
          while (offset < b.length - 2) {
            if (b[offset] !== 255) { offset++; entropy++; continue; }
            const next = b[offset + 1];
            if (next === 0 || next >= 0xd0 && next <= 0xd7) { offset += 2; continue; }
            break;
          }
        }
      }
      return dimensions && scan && entropy > 0 && offset === b.length - 2;
    }
    return false;
  } catch { return false; }
}

function lines(text: string, width: number): string[] {
  const result: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/u)) {
    for (const chunk of word.match(new RegExp(`.{1,${width}}`, 'gu')) || []) {
      if (Array.from(line + ' ' + chunk).length > width && line) { result.push(line); line = ''; }
      line += (line ? ' ' : '') + chunk;
    }
  }
  if (line) result.push(line);
  return result;
}

/** Yerel vektör şablonu; dış görsel/font/adres yok. Başlık ve yazar tam olarak yer alır. */
export function prepareCover(book: { title: string; author: string; editionId: string }, existing?: ExistingCover): PreparedCover {
  if (!book.title.trim()) throw new Error('Kapak için kitap adı gerekli.');
  const rights = existing?.rights;
  if (existing && rights?.redistribution && rights.verifiedBy.trim() && rights.evidence.trim() && rights.license.trim() && rights.editionId === book.editionId && book.editionId && usableCover(existing)) {
    return { data: existing.data.slice(), mediaType: existing.mediaType, origin: 'existing', reason: 'Baskıya ait kullanım izni doğrulanmış kapak korundu.' };
  }
  const title = lines(book.title, 26), author = lines(book.author, 36);
  const titleSize = Math.min(52, 490 / Math.max(title.length, 1));
  const authorSize = Math.min(28, 180 / Math.max(author.length, 1));
  const rows = (items: string[], y: number, size: number) => items.map((line, i) => `<text x="400" y="${y + i * size * 1.2}" font-size="${size}" text-anchor="middle" direction="${/\p{Script=Arabic}/u.test(line) ? 'rtl' : 'ltr'}" unicode-bidi="plaintext">${escapeXml(line)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200"><title>${escapeXml(book.title)}</title><desc>${escapeXml(book.author)}</desc><rect width="800" height="1200" fill="#eee7d9"/><rect x="44" y="44" width="712" height="1112" fill="none" stroke="#5b5040" stroke-width="2"/><g fill="#302b25" font-family="serif">${rows(title, 220, titleSize)}${rows(author, 870, authorSize)}</g></svg>`;
  return { data: Buffer.from(svg), mediaType: 'image/svg+xml', origin: 'generated', reason: existing ? 'Hazır kapak izin veya dosya kontrolünü geçmedi; yerel kapak üretildi.' : 'Eksik kapak yerel şablonla üretildi.' };
}

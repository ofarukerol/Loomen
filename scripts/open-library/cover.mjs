// Açık kitaplık: kapak. Saf modül.
// extractCover: e-kitabın kendi kapak görselini verir. makeCover: sade şablon kapak (SVG; yazı tipi gömülmez).
import { createHash } from 'node:crypto';

const TYPES = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const PATH_EXT = { jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', svg: 'svg' };

/** zip: readZip sonucu, meta: health.inspect meta'sı. @returns {{ bytes: Buffer, ext: string } | null} */
export function extractCover(zip, meta) {
  const cover = meta?.cover;
  if (!cover || !zip.has(cover.path)) return null;
  const ext = TYPES[cover.mediaType] ?? PATH_EXT[cover.path.split('.').pop().toLowerCase()];
  if (!ext) return null;
  const bytes = zip.read(cover.path);
  return bytes.length ? { bytes, ext } : null;
}

const PALETTE = ['#1f3a5f', '#4a2c40', '#2f4f3e', '#5c3b1e', '#3b3b58', '#5a2a27'];
const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const MARK = /\p{M}/u;
const width = (s) => { let n = 0; for (const ch of s) if (!MARK.test(ch)) n++; return n; };
const cut = (s, max) => { let out = '', n = 0; for (const ch of s) { if (!MARK.test(ch)) { if (n === max) break; n++; } out += ch; } return out; };

/** Başlığı karakter sayısına göre en çok `maxLines` satıra böler; taşan '…' ile kesilir. */
export function wrapTitle(title, perLine = 18, maxLines = 5) {
  const words = String(title).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  const push = () => { if (line) lines.push(line); line = ''; };
  for (let word of words) {
    while (width(word) > perLine) { push(); const head = cut(word, perLine); lines.push(head); word = [...word].slice([...head].length).join(''); }
    if (!word) continue;
    if (line && width(line) + 1 + width(word) > perLine) push();
    line = line ? `${line} ${word}` : word;
  }
  push();
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${cut(kept[maxLines - 1], perLine - 1)}…`;
  return kept;
}

/** @param {{ title: string, author?: string, key: string, rtl?: boolean }} o key: kimlik (renk seçimi için) */
export function makeCover({ title, author = '', key, rtl = false }) {
  const color = PALETTE[createHash('sha256').update(String(key)).digest()[0] % PALETTE.length];
  const lines = wrapTitle(title || key);
  const size = 120, gap = 170;
  const top = 1200 - ((lines.length - 1) * gap) / 2;
  const dir = rtl ? ' direction="rtl"' : '';
  const authorLine = author ? `<text x="800" y="2000" font-size="72" fill-opacity="0.85">${esc(cut(author, 40))}</text>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2400" viewBox="0 0 1600 2400">\n<rect width="1600" height="2400" fill="${color}"/>\n<rect x="80" y="80" width="1440" height="2240" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="6"/>\n<g font-family="serif" fill="#ffffff" text-anchor="middle"${dir}>\n${lines.map((l, n) => `<text x="800" y="${top + n * gap}" font-size="${size}">${esc(l)}</text>`).join('\n')}\n${authorLine}</g>\n</svg>\n`;
}

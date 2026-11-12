// Açık kitaplık: Arapça düz metinden sağdan sola EPUB 3. Saf modül.
// Kitap metnine normalize() UYGULANMAZ: harekeler ve harf dizisi korunur; yalnız XML kaçışı yapılır.
// OpenITI işaretleri (varsayım, depoda gerçek örnek yok): ######OpenITI#, #META# satırları, #META#Header#End#,
// '### |' bölüm başlığı, '# ' paragraf başı, '~~' önceki satırın devamı, PageV01P001 ve ms123 işaretleri.
import { writeZip } from './zip.mjs';

const ARABIC = /\p{Script=Arabic}/u;
const LETTER = /\p{L}/u;
const CHUNK = 200; // başlıksız metinde bölüm başına paragraf

/** Harflerin çoğu Arap yazısıysa true (OpenITI başlığı ve sayfa işaretleri sayılmaz). */
export function isArabicText(text) {
  const body = text.replace(/^#META#.*$/gm, '').replace(/^######OpenITI#.*$/gm, '').replace(/PageV\w*P\d+/g, '').replace(/\bms\d+\b/g, '');
  let arabic = 0, letters = 0;
  for (const ch of body) {
    if (!LETTER.test(ch)) continue;
    letters++;
    if (ARABIC.test(ch)) arabic++;
  }
  return letters > 0 && arabic / letters > 0.5;
}

const clean = (s) => s.replace(/[ \t]+/g, ' ').trim();
const metaValue = (lines, pattern) => {
  for (const line of lines) {
    const m = line.match(/^#META#\s*(.*?)\s*::\s*(.*)$/);
    if (m && pattern.test(m[1]) && clean(m[2]) && !/^NODATA$/i.test(clean(m[2]))) return clean(m[2]);
  }
  return '';
};

/** @returns {{ title: string, author: string, openiti: boolean, chapters: { title: string, paragraphs: string[] }[] }} */
export function parseArabicText(text) {
  const lines = text.replace(/^﻿/, '').split(/\r\n?|\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const openiti = i < lines.length && lines[i].startsWith('######OpenITI#');
  let title = '', author = '';
  if (openiti) {
    const header = [];
    for (; i < lines.length; i++) {
      header.push(lines[i]);
      if (lines[i].startsWith('#META#Header#End#')) { i++; break; }
    }
    title = metaValue(header, /BookTITLE|^\d*\.?Title$/i);
    author = metaValue(header, /AuthorNAME/i);
  } else i = 0;

  const chapters = [];
  let chapter = null, para = null;
  const flush = () => { if (para !== null && para) (chapter ??= newChapter('')).paragraphs.push(para); para = null; };
  const newChapter = (t) => { const c = { title: t, paragraphs: [] }; chapters.push(c); return c; };
  for (; i < lines.length; i++) {
    let line = lines[i];
    if (openiti) line = line.replace(/PageV\w*P\d+/g, ' ').replace(/\bms\d+\b/g, ' ');
    if (!line.trim()) { if (!openiti) flush(); continue; }
    if (!openiti) { para = para ? `${para} ${clean(line)}` : clean(line); continue; }
    let m;
    if ((m = line.match(/^###\s*\|+\s*(.*)$/))) { flush(); chapter = newChapter(clean(m[1])); continue; }
    if ((m = line.match(/^###+\s*(.*)$/))) { flush(); para = clean(m[1]); continue; }
    if ((m = line.match(/^#(?:\s+(.*))?$/))) { flush(); para = clean(m[1] ?? ''); continue; }
    if ((m = line.match(/^~~\s*(.*)$/))) { const t = clean(m[1]); if (t) para = para ? `${para} ${t}` : t; continue; }
    const t = clean(line);
    para = para ? `${para} ${t}` : t;
  }
  flush();

  const headed = chapters.some(c => c.title);
  if (headed) return { title, author, openiti, chapters: chapters.filter(c => c.paragraphs.length || c.title).map((c, n) => ({ ...c, title: c.title || `قسم ${n + 1}` })) };
  const all = chapters.flatMap(c => c.paragraphs);
  const parts = [];
  for (let k = 0; k < all.length; k += CHUNK) parts.push({ title: `قسم ${parts.length + 1}`, paragraphs: all.slice(k, k + CHUNK) });
  return { title, author, openiti, chapters: parts };
}

const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const XML = '<?xml version="1.0" encoding="UTF-8"?>\n';
const CSS = 'html, body { direction: rtl; text-align: start; }\nbody { line-height: 1.8; margin: 1em; }\nh1 { text-align: center; font-size: 1.4em; }\np { margin: 0 0 0.8em 0; }\n';
const pad = (n) => String(n).padStart(4, '0');

/** EPUB 3 baytları. `modified` ISO tarihtir (alım kaydından); `id` kaynak dosya özetidir. */
export function buildArabicEpub({ title, author, id, modified, chapters, coverSvg }) {
  const bookTitle = title || id;
  const when = new Date(modified).toISOString().replace(/\.\d+Z$/, 'Z');
  const files = chapters.map((c, n) => ({ ...c, file: `ch${pad(n + 1)}.xhtml`, id: `ch${pad(n + 1)}` }));
  const page = (c) => `${XML}<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" dir="rtl" lang="ar" xml:lang="ar">\n<head><meta charset="utf-8"/><title>${esc(c.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>\n<h1>${esc(c.title)}</h1>\n${c.paragraphs.map(p => `<p>${esc(p)}</p>`).join('\n')}\n</body>\n</html>\n`;
  const nav = `${XML}<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" dir="rtl" lang="ar" xml:lang="ar">\n<head><meta charset="utf-8"/><title>${esc(bookTitle)}</title></head>\n<body>\n<nav epub:type="toc" id="toc"><ol>\n${files.map(c => `<li><a href="${c.file}">${esc(c.title)}</a></li>`).join('\n')}\n</ol></nav>\n</body>\n</html>\n`;
  const opf = `${XML}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ar" dir="rtl">\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n<dc:identifier id="bookid">urn:sha256:${esc(id)}</dc:identifier>\n<dc:title>${esc(bookTitle)}</dc:title>\n${author ? `<dc:creator>${esc(author)}</dc:creator>\n` : ''}<dc:language>ar</dc:language>\n<meta property="dcterms:modified">${when}</meta>\n</metadata>\n<manifest>\n<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n<item id="css" href="style.css" media-type="text/css"/>\n<item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>\n${files.map(c => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('\n')}\n</manifest>\n<spine page-progression-direction="rtl">\n${files.map(c => `<itemref idref="${c.id}"/>`).join('\n')}\n</spine>\n</package>\n`;
  const container = `${XML}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`;
  return writeZip([
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: container },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/style.css', data: CSS },
    { name: 'OEBPS/cover.svg', data: coverSvg },
    ...files.map(c => ({ name: `OEBPS/${c.file}`, data: page(c) })),
  ]);
}

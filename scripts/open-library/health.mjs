// Açık kitaplık: kitap dosyası sağlık denetimi. Saf modül; yalnız bayt dizisi ve uzantı alır.
// Sonuç: { ok: true, meta } ya da { ok: false, reason } (gerekçe sade Türkçe).
import path from 'node:path';
import { readZip, ZipError } from './zip.mjs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[e.toLowerCase()] ?? match;
  });
}
/** XHTML'den düz metin: etiketler atılır, blok etiketleri boşluk olur. */
export function htmlToText(html) {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(p|div|br|h[1-6]|li|ul|ol|tr|td|th|table|section|blockquote|body|html)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ''));
}
const attrs = (tag) => {
  const out = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3]);
  return out;
};
const firstText = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() : '';
};
const FONT_OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];

// Kapak gerçekten resim mi: JPEG, PNG, GIF, WebP ya da SVG başlığı.
const IMAGE_MAGIC = [/^\xff\xd8\xff/, /^\x89PNG\r\n\x1a\n/, /^GIF8[79]a/, /^RIFF[\s\S]{4}WEBP/, /^\s*(<\?xml[\s\S]*?\?>\s*)?<svg\b/i];

const inspectEpub = (bytes) => {
  let zip;
  try { zip = readZip(bytes); } catch (e) {
    if (e instanceof ZipError) return { ok: false, reason: `E-kitap arşivi okunamadı: ${e.message}` };
    throw e;
  }
  try {
    if (!zip.has('mimetype') || zip.read('mimetype').toString('utf8').trim() !== 'application/epub+zip')
      return { ok: false, reason: 'E-kitap işareti (mimetype) yok ya da yanlış.' };
    if (zip.has('META-INF/encryption.xml')) {
      const enc = zip.read('META-INF/encryption.xml').toString('utf8');
      const algorithms = [...enc.matchAll(/Algorithm\s*=\s*["']([^"']*)["']/gi)].map(m => m[1]);
      if (!algorithms.length || algorithms.some(a => !FONT_OBFUSCATION.includes(a))) return { ok: false, reason: 'Kilitli (DRM): içerik şifreli.' };
    }
    if (!zip.has('META-INF/container.xml')) return { ok: false, reason: 'E-kitap kapsayıcı dosyası (container.xml) yok.' };
    const full = zip.read('META-INF/container.xml').toString('utf8').match(/full-path\s*=\s*["']([^"']+)["']/i);
    if (!full) return { ok: false, reason: 'Kitap bilgi dosyasının (OPF) yeri container.xml içinde yazılmamış.' };
    const opfPath = full[1];
    if (!zip.has(opfPath)) return { ok: false, reason: `Kitap bilgi dosyası (OPF) arşivde yok: ${opfPath}` };
    const opf = zip.read(opfPath).toString('utf8');
    const base = path.posix.dirname(opfPath);
    const resolve = (href) => {
      let clean = href.split('#')[0];
      try { clean = decodeURIComponent(clean); } catch { /* olduğu gibi */ }
      const joined = path.posix.normalize(base === '.' ? clean : `${base}/${clean}`);
      return joined.startsWith('../') ? null : joined;
    };
    const manifest = new Map();
    for (const m of (opf.match(/<(?:[\w.-]+:)?manifest\b[\s\S]*?<\/(?:[\w.-]+:)?manifest>/i)?.[0] ?? '').matchAll(/<(?:[\w.-]+:)?item\b[^>]*>/gi)) {
      const a = attrs(m[0]);
      if (a.id && a.href) manifest.set(a.id, { id: a.id, href: a.href, type: a['media-type'] ?? '', properties: a.properties ?? '' });
    }
    const spineXml = opf.match(/<(?:[\w.-]+:)?spine\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?spine>/i)?.[1] ?? '';
    const spine = [...spineXml.matchAll(/<(?:[\w.-]+:)?itemref\b[^>]*>/gi)].map(m => attrs(m[0]).idref).filter(Boolean);
    if (!spine.length) return { ok: false, reason: 'Okuma sırası (spine) boş.' };
    for (const idref of spine) if (!manifest.has(idref)) return { ok: false, reason: `Okuma sırasındaki kayıt dosya listesinde yok: ${idref}` };
    const paths = new Map();
    const inSpine = new Set(spine);
    for (const item of manifest.values()) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(item.href)) continue; // uzak adres
      const p = resolve(item.href);
      if (inSpine.has(item.id)) {
        // Okuma sırasındaki dosya eksik ya da bozuksa kitap bozuktur.
        if (!p || !zip.has(p)) return { ok: false, reason: `Okuma sırasındaki dosya arşivde yok: ${item.href}` };
        zip.read(p); // CRC ve boyut denetimi
        paths.set(item.id, p);
      } else if (p && zip.has(p)) paths.set(item.id, p); // yazı tipi, kullanılmayan resim: eksikse okumayı bozmaz
    }
    const texts = [];
    for (const idref of spine) {
      const item = manifest.get(idref), p = paths.get(idref);
      if (!p) return { ok: false, reason: `Okuma sırasındaki dosya uzak adreste: ${item.href}` };
      if (/html/i.test(item.type)) texts.push(htmlToText(zip.read(p).toString('utf8')));
    }
    let cover = null;
    let coverItem = [...manifest.values()].find(i => /(^|\s)cover-image(\s|$)/.test(i.properties));
    if (!coverItem) {
      for (const m of opf.matchAll(/<(?:[\w.-]+:)?meta\b[^>]*>/gi)) {
        const a = attrs(m[0]);
        if (a.name === 'cover' && manifest.has(a.content)) { coverItem = manifest.get(a.content); break; }
      }
    }
    if (coverItem && /^image\//i.test(coverItem.type) && paths.has(coverItem.id)) {
      try {
        const head = zip.read(paths.get(coverItem.id));
        if (IMAGE_MAGIC.some(re => re.test(head.subarray(0, 64).toString('latin1')))) cover = { path: paths.get(coverItem.id), mediaType: coverItem.type.toLowerCase() };
      } catch (e) { if (!(e instanceof ZipError)) throw e; } // bozuk kapak: kitap sağlam, kapak üretilir
    }
    return { ok: true, meta: {
      title: firstText(opf, 'dc:title'), creator: firstText(opf, 'dc:creator'), language: firstText(opf, 'dc:language'),
      cover, spineText: texts.join('\n'),
    } };
  } catch (e) {
    if (e instanceof ZipError) return { ok: false, reason: `E-kitap bozuk: ${e.message}` };
    throw e;
  }
};

const inspectTxt = (bytes) => {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return { ok: false, reason: 'Metin geçerli UTF-8 değil.' }; }
  if (!text.replace(/\s+/g, '')) return { ok: false, reason: 'Metin boş.' };
  if (/^\s*(<!doctype\s+html|<html)/i.test(text)) return { ok: false, reason: 'Kitap yerine web sayfası (hata sayfası) inmiş.' };
  return { ok: true, meta: { text } };
};

const inspectPdf = (bytes) => {
  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') return { ok: false, reason: 'PDF başlığı (%PDF-) yok.' };
  if (!Buffer.from(bytes.subarray(Math.max(0, bytes.length - 2048))).toString('latin1').includes('%%EOF')) return { ok: false, reason: 'PDF sonu (%%EOF) yok; dosya kesik olabilir.' };
  return { ok: true, meta: {} };
};

/** @returns {{ ok: true, meta: object } | { ok: false, reason: string }} */
export function inspect(bytes, ext) {
  const kind = String(ext).toLowerCase().replace(/^\./, '');
  if (!bytes || !bytes.length) return { ok: false, reason: 'Dosya boş.' };
  if (kind === 'epub') return inspectEpub(bytes);
  if (kind === 'txt') return inspectTxt(bytes);
  if (kind === 'pdf') return inspectPdf(bytes);
  return { ok: false, reason: `Biçim tanınmıyor (.${kind}).` };
}

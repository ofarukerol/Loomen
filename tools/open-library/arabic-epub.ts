import { createHash } from 'node:crypto';
import { prepareCover, type ExistingCover } from './covers.ts';
import { crc32 } from '../../src/core/library/zip.ts';

export function escapeXml(text: string): string {
  if (/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(text)) throw new Error('Metinde XML için geçersiz karakter var.');
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** Sıkıştırılmamış, sabit tarihli ZIP: aynı girdiden aynı EPUB çıkar. Diskte dosya yazmaz. */
export function storedZip(files: ReadonlyArray<{ name: string; data: Uint8Array }>): Uint8Array {
  if (files.length > 65535) throw new Error('Çok fazla ZIP girdisi.');
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  const names = new Set<string>();
  for (const file of files) {
    if (!file.name || names.has(file.name) || file.name.startsWith('/') || file.name.split('/').some(p => !p || p === '..') || file.name.includes('\\')) throw new Error('Geçersiz ZIP yolu.');
    names.add(file.name);
    const name = Buffer.from(file.name), data = Buffer.from(file.data);
    if (name.length > 65535 || offset + data.length > 0xffffffff) throw new Error('ZIP boyut sınırı aşıldı.');
    const crc = crc32(data), local = Buffer.alloc(30), directory = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(33, 14); directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    locals.push(local, name, data); central.push(directory, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export interface ArabicBook { title: string; author: string; text: string; identifier?: string; editionId?: string; cover?: ExistingCover }

/** Düz metin aynen saklanır: hareke silme, Unicode normalleştirme ve HTML yorumlama yok. */
export function createArabicEpub(book: ArabicBook): Uint8Array {
  if (!book.title.trim() || !book.text.trim()) throw new Error('Kitap adı ve metni boş olamaz.');
  const cover = prepareCover({ title: book.title, author: book.author, editionId: book.editionId ?? '' }, book.cover);
  const coverName = `cover.${cover.mediaType === 'image/png' ? 'png' : cover.mediaType === 'image/jpeg' ? 'jpg' : 'svg'}`;
  const title = escapeXml(book.title), author = escapeXml(book.author);
  const identifier = escapeXml(book.identifier || `urn:sha256:${createHash('sha256').update(JSON.stringify(book)).digest('hex')}`);
  const xml = '<?xml version="1.0" encoding="UTF-8"?>';
  const html = (body: string) => `${xml}<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ar" xml:lang="ar" dir="rtl"><head><title>${title}</title></head>${body}</html>`;
  const entries: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': `${xml}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    'EPUB/package.opf': `${xml}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${identifier}</dc:identifier><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:language>ar</dc:language><meta property="dcterms:modified">2000-01-01T00:00:00Z</meta></metadata><manifest><item id="cover" href="${coverName}" properties="cover-image" media-type="${cover.mediaType}"/><item id="text" href="text.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine page-progression-direction="rtl"><itemref idref="text"/></spine></package>`,
    'EPUB/nav.xhtml': html(`<body dir="rtl"><nav epub:type="toc"><h1>${title}</h1><ol><li><a href="text.xhtml">${title}</a></li></ol></nav></body>`),
    'EPUB/text.xhtml': html(`<body dir="rtl"><h1>${title}</h1><div style="white-space: pre-wrap; direction: rtl; text-align: right; line-height: 1.8">${escapeXml(book.text)}</div></body>`),
  };
  return storedZip([...Object.entries(entries).map(([name, data]) => ({ name, data: Buffer.from(data) })), { name: `EPUB/${coverName}`, data: Buffer.from(cover.data) }]);
}

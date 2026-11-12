import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { createArabicEpub, storedZip } from './arabic-epub.ts';
import { deduplicateBooks, validateBook, type PreparationBook } from './deduplicate.ts';
import { prepareCover, usableCover, type ExistingCover } from './covers.ts';
import { readZip, crc32 } from '../../src/core/library/zip.ts';
import { parseEpub, parseXml, findFirst, xmlText } from '../../src/core/library/epub.ts';

const arabic = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\n\nنَصٌّ <مَحْفُوظٌ> & آخرُ\r\n';
const epub = () => createArabicEpub({ title: 'كِتَابٌ & مثال', author: 'مُؤَلِّفٌ', text: arabic });
const book = (id: string, extra: Partial<PreparationBook> = {}): PreparationBook => ({ id, workId: 'work', editionId: 'edition-1', translationId: 'original', language: 'ar', format: 'epub', data: epub(), ...extra });

test('Arapça EPUB Loomen okuyucusunda açılır; harekeler, satırlar ve sağdan sola sıra korunur', () => {
  const data = epub(), zip = readZip(data), structure = parseEpub(zip);
  validateBook(data, 'epub');
  assert.deepEqual(data, epub());
  assert.equal(zip.entries.get('mimetype')!.offset, 0);
  assert.equal(zip.entries.get('mimetype')!.method, 0);
  assert.equal(structure.language, 'ar');
  assert.match(zip.readText('EPUB/package.opf'), /properties="cover-image"/);
  assert.match(zip.readText('EPUB/cover.svg'), /<svg/);
  assert.match(zip.readText('EPUB/package.opf'), /page-progression-direction="rtl"/);
  const chapter = zip.readText(structure.spine[0].path);
  assert.match(chapter, /dir="rtl"/);
  assert.equal(xmlText(findFirst(parseXml(chapter), 'div')!), arabic);
  assert.ok(!chapter.includes('<مَحْفُوظٌ>'));
});

test('Aynı baskı ve içerik elenir; farklı baskı, çeviri ve eksik kimlik korunur', () => {
  const results = deduplicateBooks([book('one'), book('copy'), book('edition', { editionId: 'edition-2' }), book('translation', { translationId: 'translation-2' }), book('unknown', { editionId: undefined }), book('unknown-copy', { editionId: undefined })]);
  assert.deepEqual(results.map(r => r.status), ['prepared', 'duplicate', 'prepared', 'prepared', 'prepared', 'prepared']);
  assert.equal(results[1].duplicateOf, 'one');
  assert.equal(deduplicateBooks([book('a'), book('b', { data: createArabicEpub({ title: 'غير', author: '', text: arabic }) })])[1].status, 'prepared');
});

test('Boş, kesilmiş, bozulmuş ve metin kılığına girmiş dosyalar gerekçeyle ayrılır', () => {
  const bad = epub().slice(); bad[60] ^= 1;
  const results = deduplicateBooks([book('empty', { data: new Uint8Array() }), book('cut', { data: epub().slice(0, 100) }), book('bad-crc', { data: bad }), book('not-epub', { data: Buffer.from('not an epub') }), book('binary', { format: 'text', data: new Uint8Array([0xff]) })]);
  assert.ok(results.every(r => r.status === 'rejected' && r.reason.length > 0));
  assert.doesNotThrow(() => validateBook(Buffer.from(arabic), 'text'));
});

test('Eksik bölüm ve bozuk ZIP girdisi reddedilir', () => {
  const zip = readZip(epub());
  const entries = [...zip.entries.keys()].filter(name => name !== 'EPUB/text.xhtml').map(name => ({ name, data: zip.read(name) }));
  assert.throws(() => validateBook(storedZip(entries), 'epub'));
  assert.throws(() => storedZip([{ name: '../escape', data: Buffer.from('a') }]));
  assert.throws(() => createArabicEpub({ title: 'x', author: '', text: '\u0000' }));
  const brokenSpine = [...zip.entries.keys()].map(name => ({ name, data: name === 'EPUB/package.opf' ? Buffer.from(zip.readText(name).replace('</spine>', '<itemref idref="missing"/></spine>')) : zip.read(name) }));
  assert.throws(() => validateBook(storedZip(brokenSpine), 'epub'), /tanımsız bölüm/);
});

function png(depth = 8, interlace = 0): Uint8Array {
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name), length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
    return Buffer.concat([length, type, data, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = depth; header[9] = 2; header[12] = interlace;
  const pixels = Buffer.alloc(1 + 3 * depth / 8); pixels.fill(40, 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
const coverBook = { title: 'Örnek <Kitap> & كِتَابٌ', author: 'Örnek Yazar', editionId: 'one' };
const cover = (): ExistingCover => ({ data: png(), mediaType: 'image/png', rights: { redistribution: true, verifiedBy: 'örnek', evidence: 'yerel izin kaydı', license: 'örnek izin', editionId: 'one' } });

test('İzinli ve sağlam hazır kapak byte düzeyinde korunur', () => {
  const existing = cover(), result = prepareCover(coverBook, existing);
  assert.equal(result.origin, 'existing'); assert.deepEqual(result.data, existing.data);
  assert.notEqual(result.data, existing.data); assert.ok(usableCover(existing));
  assert.ok(usableCover({ ...existing, data: png(16) }));
  assert.ok(usableCover({ ...existing, data: png(8, 1) }));
});

test('Görüntü verisi olmayan sahte JPEG hazır kapak sayılmaz', () => {
  const data = Buffer.from([255, 216, 255, 192, 0, 17, 8, 0, 1, 0, 1, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 255, 218, 0, 2, 255, 217]);
  const existing: ExistingCover = { ...cover(), mediaType: 'image/jpeg', data };
  assert.equal(usableCover(existing), false);
  assert.equal(prepareCover(coverBook, existing).origin, 'generated');
});

test('Bozuk JPEG nicemleme ve kapasitesi aşılmış kod tabloları reddedilir', () => {
  const segment = (marker: number, payload: Buffer) => {
    const head = Buffer.from([255, marker, 0, 0]); head.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([head, payload]);
  };
  const sof = segment(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 17, 0]));
  const sos = segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0]));
  const counts = Buffer.alloc(16); counts[0] = 3;
  const badCodes = segment(0xc4, Buffer.concat([Buffer.from([0]), counts, Buffer.from([0, 1, 2])]));
  const quant = Buffer.alloc(65, 1); quant[0] = 0;
  for (const tables of [segment(0xdb, Buffer.alloc(65)), Buffer.concat([segment(0xdb, quant), badCodes])]) {
    const data = Buffer.concat([Buffer.from([255, 216]), sof, tables, sos, Buffer.from([1, 255, 217])]);
    assert.equal(usableCover({ ...cover(), data, mediaType: 'image/jpeg' }), false);
  }
});

test('Eksik, izinsiz, farklı baskıya ait ve bozuk kapak yerel şablonla tamamlanır', () => {
  const invalid = cover(); invalid.data = invalid.data.slice(0, 30);
  for (const existing of [undefined, invalid, { ...cover(), rights: undefined }, { ...cover(), rights: { ...cover().rights!, editionId: 'other' } }]) {
    const result = prepareCover(coverBook, existing), svg = Buffer.from(result.data).toString();
    assert.equal(result.origin, 'generated'); assert.equal(result.mediaType, 'image/svg+xml');
    assert.match(svg, /Örnek &lt;Kitap&gt; &amp; كِتَابٌ/); assert.match(svg, /Örnek Yazar/);
    assert.ok(!svg.includes('<script')); assert.match(svg, /direction="rtl"/);
  }
  assert.deepEqual(prepareCover(coverBook), prepareCover(coverBook));
});

test('Uzun başlık ve yazar şablonda bölünür; dış bağlantı ya da etkin içerik üretilmez', () => {
  const result = prepareCover({ ...coverBook, title: '<script>' + 'أ'.repeat(500), author: 'Yazar '.repeat(100) });
  const svg = Buffer.from(result.data).toString();
  assert.ok(!svg.includes('<script>')); assert.ok(!svg.includes('href='));
  assert.ok((svg.match(/<text /g) || []).length > 10);
});


test('UTF-16 LE ve BE Arapça bölümler okunur; bozuk kodlama ayrılır', () => {
  const zip = readZip(epub());
  for (const endian of ['le', 'be']) {
    const bytes = Buffer.from(zip.readText('EPUB/text.xhtml').replace('encoding="UTF-8"', 'encoding="UTF-16"'), 'utf16le');
    if (endian === 'be') bytes.swap16();
    const chapter = Buffer.concat([Buffer.from(endian === 'le' ? [255, 254] : [254, 255]), bytes]);
    const make = (body: Uint8Array) => storedZip([...zip.entries.keys()].map(name => ({ name, data: name === 'EPUB/text.xhtml' ? body : zip.read(name) })));
    assert.doesNotThrow(() => validateBook(make(chapter), 'epub'));
    assert.throws(() => validateBook(make(Buffer.concat([chapter, Buffer.from([255])])), 'epub'), /geçersiz metin/);
  }
});

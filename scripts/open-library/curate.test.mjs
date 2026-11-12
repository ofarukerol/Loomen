import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { intake } from './intake.mjs';
import { curate } from './curate.mjs';
import { prepare, verify } from './prepare.mjs';
import { inspect } from './health.mjs';
import { crc32, readZip, writeZip } from './zip.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(await fs.readFile(path.join(here, 'sources.example.json'), 'utf8'));
const layout = JSON.parse(await fs.readFile(path.join(here, 'layout.example.json'), 'utf8'));
const EV = 'https://example.org/lisans';
const has = (p) => fs.lstat(p).then(() => true, () => false);
const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));

// Tüm veriler kurgusaldır; ağa çıkılmaz. E-kitaplar zip.mjs ile testte üretilir.
function makeEpub({ title = 'Kurgusal Kitap', creator = 'Kurgusal Yazar', lang = 'tr', paras = ['Kurgusal metin.'], cover = null, mimetype = 'application/epub+zip', missing = false } = {}) {
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>${title}</dc:title><dc:creator>${creator}</dc:creator><dc:language>${lang}</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>${missing ? '<item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>' : ''}${cover ? '<item id="cv" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>' : ''}</manifest><spine><itemref idref="c1"/>${missing ? '<itemref idref="c2"/>' : ''}</spine></package>`;
  return writeZip([
    { name: 'mimetype', data: mimetype },
    { name: 'META-INF/container.xml', data: '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>' },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/c1.xhtml', data: `<html><body>${paras.map(p => `<p>${p}</p>`).join('')}</body></html>` },
    ...(cover ? [{ name: 'OEBPS/cover.jpg', data: cover }] : []),
  ]);
}

// books: { source, id, ext, bytes, license?, title? (null = başlıksız) }
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-curate-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const ctx = { root, lists: path.join(root, 'lists'), work: path.join(root, 'work'), out: path.join(root, 'out'), books: [] };
  await fs.mkdir(ctx.lists);
  ctx.add = async (...books) => {
    ctx.books.push(...books);
    const served = new Map(ctx.books.map(b => [`https://${b.source}.example.org/${b.id}`, b.bytes]));
    const bySource = new Map();
    for (const b of ctx.books) {
      const item = { id: b.id, url: `https://${b.source}.example.org/${b.id}`, ext: b.ext, evidenceUrl: EV, verified: true };
      if (b.title !== null) item.title = b.title ?? `Kurgusal ${b.id}`;
      const license = b.license === undefined ? 'Public Domain' : b.license;
      if (license) item.license = license;
      bySource.set(b.source, [...(bySource.get(b.source) ?? []), item]);
    }
    for (const [source, items] of bySource) await fs.writeFile(path.join(ctx.lists, `${source}.jsonl`), items.map(i => JSON.stringify(i)).join('\n') + '\n');
    await intake({ rules, lists: ctx.lists, work: ctx.work, sleep: async () => {}, fetcher: async (url) => [served.get(url)] });
  };
  ctx.run = (output = ctx.out) => curate({ rules, work: ctx.work, output });
  return ctx;
}
async function files(dir, prefix = '') {
  const result = [];
  for (const e of (await fs.readdir(path.join(dir, prefix), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) result.push(...await files(dir, rel)); else result.push(rel);
  }
  return result;
}
const MARKS = /[ً-ْٰۖ-ۭ]/g;
// Basit bütünlük denetimi: serbest & ve < yok, etiketler dengeli.
function assertWellFormed(xml) {
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([\w:-]+)[^>]*?(\/?)>|([^<]+)/g)) {
    if (m[4] !== undefined) {
      assert.ok(!/&(?!(amp|lt|gt|quot|apos);)/.test(m[4]), `serbest & var: ${m[4]}`);
      continue;
    }
    if (m[3]) continue;
    if (m[1]) assert.equal(stack.pop(), m[2]); else stack.push(m[2]);
  }
  assert.deepEqual(stack, []);
  assert.ok(!/<(?![/\w])/.test(body));
}

test('(1) Bozuk dosyalar gerekçesiyle ayrılır, çıktıya girmez', async t => {
  const c = await setup(t);
  const good = makeEpub();
  await c.add(
    { source: 'gutenberg', id: 'iyi', ext: 'epub', bytes: good },
    { source: 'gutenberg', id: 'kesik', ext: 'epub', bytes: good.subarray(0, good.length - 30) },
    { source: 'gutenberg', id: 'mime', ext: 'epub', bytes: makeEpub({ mimetype: 'application/zip' }) },
    { source: 'gutenberg', id: 'eksik', ext: 'epub', bytes: makeEpub({ missing: true }) },
    { source: 'wikisource', id: 'utf', ext: 'txt', bytes: Buffer.from([0x41, 0xC3, 0x28]) },
    { source: 'wikisource', id: 'sayfa', ext: 'txt', bytes: Buffer.from('<!DOCTYPE html><html><body>404</body></html>') },
    { source: 'hindawi', id: 'pdf', ext: 'pdf', bytes: Buffer.from('bozuk pdf içeriği') },
  );
  const s = await c.run();
  assert.equal(s.ready, 1);
  assert.equal(s.broken, 6);
  const broken = await readJson(path.join(c.out, 'reports/broken.json'));
  const reason = (key) => broken.find(b => b.key === key)?.reason ?? '';
  assert.match(reason('gutenberg:kesik'), /arşivi okunamadı/);
  assert.match(reason('gutenberg:mime'), /mimetype/);
  assert.match(reason('gutenberg:eksik'), /arşivde yok/);
  assert.match(reason('wikisource:utf'), /UTF-8/);
  assert.match(reason('wikisource:sayfa'), /web sayfası/);
  assert.match(reason('hindawi:pdf'), /PDF başlığı/);
  const inputs = await files(c.out, 'input');
  assert.ok(inputs.every(f => /gutenberg\/public\/iyi\./.test(f)), inputs.join(', '));
});

test('(2) Aynı dosya ve yalnız boşluğu farklı metin tekrar sayılır', async t => {
  const c = await setup(t);
  const epub = makeEpub();
  await c.add(
    { source: 'gutenberg', id: 'g1', ext: 'epub', bytes: epub },
    { source: 'standard-ebooks', id: 'e1', ext: 'epub', bytes: epub },
    { source: 'wikisource', id: 'w1', ext: 'txt', bytes: Buffer.from('Merhaba dünya\nikinci satır') },
    { source: 'wikisource', id: 'w2', ext: 'txt', bytes: Buffer.from('﻿Merhaba   dünya\r\nikinci satır\r\n') },
  );
  const s = await c.run();
  assert.equal(s.ready, 2);
  const dups = await readJson(path.join(c.out, 'reports/duplicates.json'));
  const pairs = Object.fromEntries(dups.map(d => [d.dropped, d.kept]));
  assert.deepEqual(pairs, { 'gutenberg:g1': 'standard-ebooks:e1', 'wikisource:w2': 'wikisource:w1' });
  assert.ok(await has(path.join(c.out, 'input/standard-ebooks/public/e1.epub')));
  assert.ok(!await has(path.join(c.out, 'input/gutenberg/public/g1.epub')));
  assert.ok(await has(path.join(c.out, 'input/wikisource/public/w1.txt')));
  assert.ok(!await has(path.join(c.out, 'input/wikisource/public/w2.txt')));
});

test('(3) Aynı adlı farklı baskı ve çeviri ayrı kitap kalır', async t => {
  const c = await setup(t);
  const title = 'Kurgusal Kitap';
  await c.add(
    { source: 'gutenberg', id: 'g1', ext: 'epub', title, bytes: makeEpub({ paras: ['Birinci baskı metni.'] }) },
    { source: 'gutenberg', id: 'g2', ext: 'epub', title, bytes: makeEpub({ paras: ['İkinci baskı metni, düzeltilmiş.'] }) },
    { source: 'hindawi', id: 'h1', ext: 'epub', title, license: 'CC BY', bytes: makeEpub({ lang: 'ar', paras: ['Kurgusal çeviri metni.'] }) },
  );
  const s = await c.run();
  assert.equal(s.ready, 3);
  assert.equal(s.duplicates, 0);
  const inputs = (await files(c.out, 'input')).filter(f => !f.includes('.cover.'));
  assert.equal(inputs.length, 3);
  const editions = await readJson(path.join(c.out, 'reports/editions.json'));
  assert.equal(editions.length, 1);
  assert.deepEqual(editions[0].books, ['gutenberg:g1', 'gutenberg:g2', 'hindawi:h1']);
});

test('(4) Açık ve kapalı aynı içerikte açık kopya kalır', async t => {
  const c = await setup(t);
  const epub = makeEpub();
  await c.add(
    { source: 'openiti', id: 'a1', ext: 'epub', license: 'cc-by-nc', bytes: epub },
    { source: 'gutenberg', id: 'b1', ext: 'epub', bytes: epub },
  );
  const s = await c.run();
  assert.equal(s.ready, 1);
  assert.ok(await has(path.join(c.out, 'input/gutenberg/public/b1.epub')));
  assert.ok(!await has(path.join(c.out, 'input/openiti/private/a1.epub')));
  const dups = await readJson(path.join(c.out, 'reports/duplicates.json'));
  assert.deepEqual(dups.map(d => [d.dropped, d.kept]), [['openiti:a1', 'gutenberg:b1']]);
});

const ARABIC = [
  '######OpenITI#', '#META# 010.AuthorNAME :: مؤلف خيالي', '#META# 020.BookTITLE :: كتاب تجريبي', '#META#Header#End#', '',
  '### | الفصل الأول',
  '# بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ PageV01P001',
  '~~ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ms12',
  '### | الفصل الثاني',
  '# وَقَالَ الشَّاعِرُ كَلَامًا جَمِيلًا',
  '',
].join('\n');
const textOf = (xhtml) => xhtml.replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

test('(5) Harekeli Arapça metinden sağdan sola e-kitap üretilir', async t => {
  const c = await setup(t);
  await c.add({ source: 'openiti', id: 'o1', ext: 'txt', title: null, bytes: Buffer.from(ARABIC) });
  const s = await c.run();
  assert.equal(s.converted, 1);
  assert.ok(!await has(path.join(c.out, 'input/openiti/public/o1.txt')));
  const bytes = await fs.readFile(path.join(c.out, 'input/openiti/public/o1.epub'));
  const zip = readZip(bytes);
  const opf = zip.read('OEBPS/content.opf').toString('utf8');
  assert.match(opf, /<spine page-progression-direction="rtl">/);
  assert.match(opf, /<dc:language>ar<\/dc:language>/);
  assert.match(opf, /<dc:title>كتاب تجريبي<\/dc:title>/);
  const chapters = zip.names.filter(n => /ch\d+\.xhtml$/.test(n));
  assert.equal(chapters.length, 2);
  let all = '';
  for (const n of chapters) {
    const x = zip.read(n).toString('utf8');
    assert.match(x, /<html [^>]*dir="rtl" lang="ar" xml:lang="ar">/);
    all += textOf(x);
  }
  const body = ARABIC.split('#META#Header#End#')[1];
  assert.deepEqual(all.match(MARKS), body.match(MARKS));
  assert.ok(all.match(MARKS).length > 10);
  for (const bad of ['OpenITI', '#META#', 'PageV', 'ms12', 'AuthorNAME']) assert.ok(!all.includes(bad), `${bad} metinde kalmış`);
  assert.ok(all.includes('الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ'));
  assert.equal(inspect(bytes, 'epub').ok, true);
  const book = await readJson(path.join(c.out, 'books/openiti/o1.json'));
  assert.equal(book.converted, true);
  assert.equal(book.language, 'ar');
  assert.equal(book.author, 'مؤلف خيالي');
});

test('(6) Kapağı olan e-kitabın kendi kapağı yanına konur', async t => {
  const c = await setup(t);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
  const epub = makeEpub({ cover: jpg });
  await c.add({ source: 'gutenberg', id: 'g1', ext: 'epub', bytes: epub });
  const s = await c.run();
  assert.equal(s.coversFound, 1);
  assert.deepEqual(await fs.readFile(path.join(c.out, 'input/gutenberg/public/g1.cover.jpg')), jpg);
  assert.deepEqual(await fs.readFile(path.join(c.out, 'input/gutenberg/public/g1.epub')), epub, 'e-kitabın içi değişmez');
  const book = await readJson(path.join(c.out, 'books/gutenberg/g1.json'));
  assert.equal(book.cover.type, 'hazır');
  assert.equal(book.cover.file, 'input/gutenberg/public/g1.cover.jpg');
});

test('(7) Kapaksız kitaba başlıklı sade kapak üretilir', async t => {
  const c = await setup(t);
  await c.add(
    { source: 'gutenberg', id: 'g1', ext: 'epub', title: 'A&B "C"<1>', bytes: makeEpub() },
    { source: 'openiti', id: 'o1', ext: 'txt', title: null, bytes: Buffer.from(ARABIC) },
  );
  const s = await c.run();
  assert.equal(s.coversGenerated, 2);
  const svg = await fs.readFile(path.join(c.out, 'input/gutenberg/public/g1.cover.svg'), 'utf8');
  assert.ok(svg.includes('A&amp;B &quot;C&quot;&lt;1&gt;'));
  assertWellFormed(svg);
  const arabic = await fs.readFile(path.join(c.out, 'input/openiti/public/o1.cover.svg'), 'utf8');
  assert.ok(arabic.includes('كتاب تجريبي'));
  assert.ok(arabic.includes('direction="rtl"'));
  assertWellFormed(arabic);
  for (const f of ['gutenberg/g1', 'openiti/o1']) assert.equal((await readJson(path.join(c.out, `books/${f}.json`))).cover.type, 'üretildi');
});

test('(8) İki çalıştırma aynı baytları üretir, devamda dosyalara dokunulmaz', async t => {
  const c = await setup(t);
  await c.add(
    { source: 'gutenberg', id: 'g1', ext: 'epub', bytes: makeEpub({ cover: Buffer.from([0xff, 0xd8, 1]) }) },
    { source: 'gutenberg', id: 'g2', ext: 'epub', bytes: makeEpub({ paras: ['Başka.'] }) },
    { source: 'openiti', id: 'o1', ext: 'txt', title: null, bytes: Buffer.from(ARABIC) },
  );
  await c.run();
  const mtimes = async (dir) => Object.fromEntries(await Promise.all((await files(dir, 'input')).concat(await files(dir, 'books')).map(async f => [f, (await fs.stat(path.join(dir, f))).mtimeMs])));
  const before = await mtimes(c.out);
  await new Promise(r => setTimeout(r, 20));
  await c.run();
  assert.deepEqual(await mtimes(c.out), before);
  const other = path.join(c.root, 'out2');
  await c.run(other);
  for (const dir of ['input', 'books']) {
    const list = await files(c.out, dir);
    assert.deepEqual(await files(other, dir), list);
    for (const f of list) assert.deepEqual(await fs.readFile(path.join(other, f)), await fs.readFile(path.join(c.out, f)), f);
  }
});

test('(9) Bozulmuş çıktı ve sonradan tekrar olan yayımlanmış kitap durdurur', async t => {
  const c = await setup(t);
  const epub = makeEpub();
  await c.add({ source: 'gutenberg', id: 'g1', ext: 'epub', bytes: epub });
  await c.run();
  // Sonradan aynı içerikli, kaynak sırasında önde bir kitap gelir: g1 artık tekrar olur.
  await c.add({ source: 'standard-ebooks', id: 'e1', ext: 'epub', bytes: epub });
  await assert.rejects(c.run(), /artık tekrar/);
  assert.ok(await has(path.join(c.out, 'input/gutenberg/public/g1.epub')), 'dosya silinmedi');
  assert.ok(!await has(path.join(c.out, 'input/standard-ebooks/public/e1.epub')));
  // Temiz çıktıda bozulma.
  const c2 = await setup(t);
  await c2.add({ source: 'gutenberg', id: 'g1', ext: 'epub', bytes: epub });
  await c2.run();
  const file = path.join(c2.out, 'input/gutenberg/public/g1.epub');
  const bytes = await fs.readFile(file); bytes[bytes.length - 1] ^= 1; await fs.writeFile(file, bytes);
  await assert.rejects(c2.run(), /bozulmuş/);
  await fs.unlink(file);
  await assert.rejects(c2.run(), /dosya eksik/);
});

test('(10) Bekleyen kitap çıktıda ve raporlarda yok', async t => {
  const c = await setup(t);
  await c.add(
    { source: 'gutenberg', id: 'g1', ext: 'epub', license: '', bytes: makeEpub({ paras: ['Bekleyen.'] }) },
    { source: 'gutenberg', id: 'g2', ext: 'epub', bytes: makeEpub({ paras: ['Açık.'] }) },
  );
  const s = await c.run();
  assert.equal(s.ready, 1);
  assert.ok(!await has(path.join(c.out, 'books/gutenberg/g1.json')));
  assert.ok(!(await files(c.out)).some(f => /g1\b/.test(f)));
  for (const r of ['broken', 'duplicates', 'editions']) assert.ok(!(await fs.readFile(path.join(c.out, `reports/${r}.json`), 'utf8')).includes('g1'));
});

test('(11) Çıktının input klasörü hazırlık aracından geçer', async t => {
  const c = await setup(t);
  await c.add(
    { source: 'gutenberg', id: 'g1', ext: 'epub', bytes: makeEpub({ cover: Buffer.from([0xff, 0xd8, 9]) }) },
    { source: 'openiti', id: 'o1', ext: 'txt', title: null, bytes: Buffer.from(ARABIC) },
    { source: 'hindawi', id: 'h1', ext: 'epub', license: 'cc-by-nc', bytes: makeEpub({ paras: ['Kapalı.'] }) },
  );
  await c.run();
  const dir = await prepare({ layout, input: path.join(c.out, 'input'), output: path.join(c.root, 'cekim'), id: '2026-11-12-01' });
  const plan = await verify(dir);
  assert.equal(plan.files.length, 6);
  assert.ok(plan.files.some(f => f.file === 'hindawi/private/h1.epub'));
});

test('(12) Zip yaz-oku turu, belirlenimlilik ve CRC hatası', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
  const entries = [{ name: 'mimetype', data: 'application/epub+zip' }, { name: 'a/b.txt', data: 'مرحبا بِالعالم '.repeat(50) }, { name: 'bos.txt', data: '' }];
  const zip = writeZip(entries);
  assert.deepEqual(writeZip(entries), zip);
  const read = readZip(zip);
  assert.deepEqual(read.names, ['mimetype', 'a/b.txt', 'bos.txt']);
  assert.equal(read.read('a/b.txt').toString('utf8'), entries[1].data);
  assert.equal(read.read('bos.txt').length, 0);
  assert.equal(zip.readUInt16LE(8), 0, 'mimetype sıkıştırılmaz');
  const damaged = Buffer.from(zip); damaged[38] ^= 1;
  assert.throws(() => readZip(damaged).read('mimetype'), /CRC/);
  assert.throws(() => readZip(zip.subarray(0, zip.length - 10)), /Zip sonu/);
  assert.throws(() => readZip(Buffer.from('zip değil, yeterince uzun bir metin dosyası olsun')), /Zip sonu/);
});

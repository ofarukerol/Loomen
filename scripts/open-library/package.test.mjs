import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { intake } from './intake.mjs';
import { curate } from './curate.mjs';
import { catalog } from './catalog.mjs';
import { verify } from './prepare.mjs';
import { pack } from './package.mjs';
import { buildReport, renderReport } from './report.mjs';
import { checkBooks, pickSample } from './reader-check.mjs';
import { writeZip } from './zip.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(await fs.readFile(path.join(here, 'sources.example.json'), 'utf8'));
const layout = JSON.parse(await fs.readFile(path.join(here, 'layout.example.json'), 'utf8'));
const tree = JSON.parse(await fs.readFile(path.join(here, 'categories.tr.json'), 'utf8')).tree;
const EV = 'https://example.org/lisans';
const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const has = (p) => fs.lstat(p).then(() => true, () => false);

// Tüm veriler kurgusaldır; ağa çıkılmaz.
function makeEpub({ n, creator = 'Kurgusal Yazar' }) {
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x${n}</dc:identifier><dc:title>Kurgusal Kitap ${n}</dc:title>${creator ? `<dc:creator>${creator}</dc:creator>` : ''}<dc:language>tr</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`;
  return writeZip([
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>' },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/c1.xhtml', data: `<html><body><p>Kurgusal metin numara ${n}.</p></body></html>` },
  ]);
}
const ARABIC = (n) => Buffer.from(`# َبَابٌ ${n}\n# هَذَا كِتَابٌ تَجْرِيبِيٌّ رَقْمُ ${n} فِي الْعِلْمِ وَالْأَدَبِ\n# وَهَذِهِ فِقْرَةٌ أُخْرَى مِنَ الْكِتَابِ ${n}\n`);

/** Kurgusal koleksiyon: 25 kitap pakete girer; 1 bozuk, 1 tekrar, 1 bekleyen elenir. */
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-package-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const c = { root, lists: path.join(root, 'lists'), work: path.join(root, 'work'), curated: path.join(root, 'curated'), cat: path.join(root, 'catalog'), out: path.join(root, 'out') };
  await fs.mkdir(c.lists);
  const items = [];
  let n = 0;
  const add = (source, id, ext, bytes, license = 'Public Domain', extra = {}) => items.push({ source, id, ext, bytes, license, ...extra });
  for (let i = 0; i < 10; i++) add('gutenberg', `g${i}`, 'epub', makeEpub({ n: ++n, creator: i % 3 === 0 ? '' : `Yazar ${i % 4}` }));
  for (let i = 0; i < 3; i++) add('gutenberg', `p${i}`, 'epub', makeEpub({ n: ++n }), 'CC BY-NC');
  for (let i = 0; i < 5; i++) add('standard-ebooks', `s${i}`, 'epub', makeEpub({ n: ++n, creator: 'Standart Yazar' }));
  for (let i = 0; i < 3; i++) add('wikisource', `w${i}`, 'epub', makeEpub({ n: ++n }));
  for (let i = 0; i < 2; i++) add('hindawi', `h${i}`, 'epub', makeEpub({ n: ++n }));
  for (let i = 0; i < 2; i++) add('openiti', `o${i}`, 'txt', ARABIC(i));
  const good = makeEpub({ n: 900 });
  add('wikisource', 'kesik', 'epub', good.subarray(0, good.length - 30));
  add('wikisource', 'bekleyen', 'epub', makeEpub({ n: 901 }), 'Bilinmeyen Lisans');
  add('gutenberg', 'tekrar', 'epub', items.find(i => i.id === 's0').bytes); // standard-ebooks s0 ile birebir aynı
  const served = new Map(items.map(i => [`https://${i.source}.example.org/${i.id}`, i.bytes]));
  const bySource = new Map();
  for (const i of items) bySource.set(i.source, [...(bySource.get(i.source) ?? []), { id: i.id, url: `https://${i.source}.example.org/${i.id}`, ext: i.ext, title: `Kurgusal ${i.id}`, license: i.license, evidenceUrl: EV, verified: true }]);
  for (const [source, list] of bySource) await fs.writeFile(path.join(c.lists, `${source}.jsonl`), list.map(x => JSON.stringify(x)).join('\n') + '\n');
  await intake({ rules, lists: c.lists, work: c.work, sleep: async () => {}, fetcher: async (url) => [served.get(url)] });
  await curate({ rules, work: c.work, output: c.curated });
  // Yarısı elle kategoriye konur; öneri alan bir kitap onaysız kalır.
  const overrides = {};
  for (let i = 0; i < 5; i++) overrides[`gutenberg:g${i}`] = 'islami-tefsir';
  overrides['standard-ebooks:s1'] = 'islami-tefsir';
  const decisions = path.join(root, 'decisions');
  await fs.mkdir(decisions);
  await fs.writeFile(path.join(decisions, 'suggestions.jsonl'), JSON.stringify({ key: 'gutenberg:g9', category: 'islami-akaid', by: 'yz' }) + '\n');
  await catalog({ config: { version: 1, overrides }, tree, curated: c.curated, output: c.cat, decisions });
  c.opts = (over = {}) => ({ layout, rules, intake: c.work, curated: c.curated, catalog: c.cat, output: c.out, id: 'cekim-1', mode: 'sample', ...over });
  return c;
}
async function snapshot(dir, prefix = '') {
  const out = {};
  for (const e of (await fs.readdir(path.join(dir, prefix), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, await snapshot(dir, rel)); else out[rel] = (await fs.readFile(path.join(dir, rel))).toString('base64');
  }
  return out;
}
const sample = (r) => r.sample ?? r.full;

test('(1) Açık ve kapalı ayrı listede; kapalı kitap açık listede ve açık depoda yok', async t => {
  const c = await setup(t);
  const r = await pack(c.opts());
  const pub = await readJson(path.join(r.package, 'books.public.json'));
  const priv = await readJson(path.join(r.package, 'books.private.json'));
  assert.equal(pub.books.length + priv.books.length, 25);
  assert.equal(priv.books.length, 3);
  const privKeys = new Set(priv.books.map(b => b.key));
  for (const b of pub.books) {
    assert.ok(!privKeys.has(b.key));
    assert.equal(b.file.bucket, layout.targets.public.bucket);
    assert.equal(b.cover.bucket, layout.targets.public.bucket);
  }
  for (const b of priv.books) {
    assert.equal(b.file.bucket, layout.targets.private.bucket);
    assert.equal(b.cover.bucket, layout.targets.private.bucket);
    assert.ok(b.file.key.startsWith('archive/'));
  }
  const uploads = await readJson(path.join(r.dir, 'uploads.json'));
  assert.ok(uploads.filter(u => u.bucket === layout.targets.public.bucket).every(u => u.visibility === 'public'));
  assert.ok(uploads.filter(u => u.visibility === 'private').every(u => u.bucket === layout.targets.private.bucket));
});

test('(2) Çekim prepare verify denetiminden geçer', async t => {
  const c = await setup(t);
  const r = await pack(c.opts());
  const plan = await verify(r.dir);
  assert.equal(plan.files.length, 50); // 25 kitap + 25 kapak
});

test('(3) Rapor sayıları kaynak başına doğru; bekleyen, bozuk, tekrar gerekçeli; kapak kitap sayılmaz', async t => {
  const c = await setup(t);
  const r = await pack(c.opts());
  const s = sample(await readJson(path.join(r.package, 'report.sample.json')));
  const by = Object.fromEntries(s.sources.map(x => [x.source, x]));
  assert.equal(by.gutenberg.incoming, 14);
  assert.equal(by.gutenberg.public, 11); assert.equal(by.gutenberg.private, 3);
  assert.equal(by.gutenberg.duplicates, 1);
  assert.equal(by.gutenberg.packaged, 13);
  assert.equal(by['standard-ebooks'].packaged, 5);
  assert.equal(by.wikisource.incoming, 5);
  assert.equal(by.wikisource.held, 1);
  assert.deepEqual(by.wikisource.heldReasons, { 'Lisans tabloda yok.': 1 });
  assert.equal(by.wikisource.broken, 1);
  assert.match(Object.keys(by.wikisource.brokenReasons)[0], /arşivi okunamadı/);
  assert.equal(by.wikisource.packaged, 3);
  assert.equal(by.openiti.packaged, 2);
  assert.equal(by.hindawi.packaged, 2);
  assert.equal(s.totals.packaged, 25); // 50 dosya değil
  assert.equal(s.totals.incoming, 28);
  const md = await fs.readFile(path.join(r.package, 'report.sample.md'), 'utf8');
  assert.match(md, /Lisans tabloda yok\./);
});

test('(4) Yazar ve kategori oranları açık/kapalı ayrı; onaysız öneri sayıma girmez', async t => {
  const c = await setup(t);
  const r = await pack(c.opts());
  const s = sample(r.report);
  const rows = (await readJson(path.join(c.cat, 'catalog.json'))).books;
  const priv = rows.filter(x => x.decision === 'private'), pub = rows.filter(x => x.decision === 'public');
  assert.equal(s.coverage.public.books, pub.length);
  assert.equal(s.coverage.private.books, 3);
  assert.equal(s.coverage.public.withAuthor, pub.filter(x => x.authorId).length);
  assert.equal(s.coverage.private.withAuthor, priv.filter(x => x.authorId).length);
  assert.equal(s.coverage.public.withCategory, 6); // g0-g4 + s1
  assert.equal(s.coverage.private.withCategory, 0);
  assert.equal(s.pendingSuggestions, 1);
  assert.equal(rows.find(x => x.key === 'gutenberg:g9').category, null); // öneri kategori sayılmadı
  assert.equal(s.uncategorized, 25 - 6);
});

test('(5) Yirmi kitap seçilir, aynı tohumla aynı seçim, hepsi okuyucu kodundan geçer', async t => {
  const c = await setup(t);
  const keys = Array.from({ length: 25 }, (_, i) => `k:${i}`);
  assert.deepEqual(pickSample(keys, 20, 'a'), pickSample(keys, 20, 'a'));
  assert.notDeepEqual(pickSample(keys, 20, 'a'), pickSample(keys, 20, 'b'));
  assert.equal(new Set(pickSample(keys, 20, 'a')).size, 20);
  const r = await pack(c.opts());
  const rc = r.readerCheck;
  assert.equal(rc.tried, 20);
  assert.equal(rc.fewerThanRequested, false);
  assert.equal(rc.seed, 'cekim-1');
  // Arapça metinden çevrilen e-kitaplar da okuyucudan geçer.
  const all = await checkBooks([...(await readJson(path.join(r.package, 'books.public.json'))).books, ...(await readJson(path.join(r.package, 'books.private.json'))).books]
    .map(b => ({ key: b.key, path: path.join(c.curated, 'input', b.file.key.split('/snapshots/cekim-1/')[1]), ext: 'epub' })));
  assert.equal(all.length, 25);
  assert.deepEqual(all.filter(x => !x.opened), []);
  assert.equal(rc.opened, 20);
  assert.deepEqual(rc.failed, []);
});

test('(6) Bozulmuş EPUB ve düz metin "açılmadı" diye nedeniyle çıkar', async t => {
  const c = await setup(t);
  const bad = path.join(c.root, 'bozuk.epub'), txt = path.join(c.root, 'duz.txt'), ok = path.join(c.root, 'iyi.epub');
  const good = makeEpub({ n: 1 });
  await fs.writeFile(bad, good.subarray(0, good.length - 30));
  await fs.writeFile(txt, 'düz metin');
  await fs.writeFile(ok, good);
  const res = await checkBooks([{ key: 'a:bozuk', path: bad, ext: 'epub' }, { key: 'a:duz', path: txt, ext: 'txt' }, { key: 'a:iyi', path: ok, ext: 'epub' }]);
  assert.equal(res[0].opened, false); assert.ok(res[0].reason.length > 0);
  assert.equal(res[1].opened, false); assert.match(res[1].reason, /açmıyor/);
  assert.equal(res[2].opened, true);
  // PDF: geçerli ilk sayfa açılır, bozuk dosya nedenle reddedilir.
  const pdf = path.join(c.root, 'a.pdf'), badPdf = path.join(c.root, 'b.pdf');
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>'];
  let body = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 4\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Size 4/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  await fs.writeFile(pdf, body);
  await fs.writeFile(badPdf, 'pdf değil');
  const p = await checkBooks([{ key: 'a:pdf', path: pdf, ext: 'pdf' }, { key: 'a:bpdf', path: badPdf, ext: 'pdf' }]);
  assert.equal(p[0].opened, true);
  assert.equal(p[1].opened, false); assert.ok(p[1].reason);
});

test('(7) Örnek kipte uyarı var, gerçek bölüm "henüz çalıştırılmadı"; kip verilmezse hata', async t => {
  const c = await setup(t);
  const r = await pack(c.opts());
  const md = await fs.readFile(path.join(r.package, 'report.sample.md'), 'utf8');
  assert.match(md, /Bu bir örnek denemedir; tam koleksiyonun sonucu değildir\./);
  assert.match(md, /## Gerçek toplu işlem\n\nhenüz çalıştırılmadı/);
  assert.equal(r.report.full, null);
  assert.ok(await has(path.join(r.package, 'report.sample.json')));
  assert.ok(!(await has(path.join(r.package, 'report.full.json'))));
  await assert.rejects(() => pack(c.opts({ mode: undefined, id: 'cekim-2' })), /Kip/);
  assert.throws(() => buildReport({ order: [], records: [], books: [], broken: [], duplicates: [], editions: [], catalog: { books: [] } }), /Kip/);
  const full = renderReport(buildReport({ mode: 'full', order: ['a'], records: [], books: [], broken: [], duplicates: [], editions: [], catalog: { books: [] } }));
  assert.ok(!full.includes('örnek denemedir'));
  assert.match(full, /## Örnek deneme\n\nhenüz çalıştırılmadı/);
});

test('(8) Katalog ile kitap kayıtları uyuşmazsa durur ve çıktı yazılmaz', async t => {
  const c = await setup(t);
  const file = path.join(c.cat, 'catalog.json');
  const cat = await readJson(file);
  cat.books.pop();
  await fs.writeFile(file, JSON.stringify(cat));
  await assert.rejects(() => pack(c.opts()), /uyuşmuyor/);
  assert.ok(!(await has(c.out)));
});

test('(8b) Aynı kitabın kararı katalogla kayıtta farklıysa durur', async t => {
  const c = await setup(t);
  const file = path.join(c.cat, 'catalog.json');
  const cat = await readJson(file);
  cat.books.find(b => b.decision === 'private').decision = 'public';
  await fs.writeFile(file, JSON.stringify(cat));
  await assert.rejects(() => pack(c.opts()), /katalogda public/);
  assert.ok(!(await has(c.out)));
});

test('(8c) Dosya baytı kayıttaki SHA-256 ile uyuşmazsa durur', async t => {
  const c = await setup(t);
  const book = await readJson(path.join(c.curated, 'books/standard-ebooks/s2.json'));
  await fs.writeFile(path.join(c.curated, book.file), 'bozuldu');
  await assert.rejects(() => pack(c.opts()), /SHA-256/);
  assert.ok(!(await has(c.out)));
});

test('(9) İkinci çalıştırma aynı baytları verir, girdi klasörleri değişmez', async t => {
  const c = await setup(t);
  const before = { work: await snapshot(c.work), curated: await snapshot(c.curated), cat: await snapshot(c.cat) };
  const r1 = await pack(c.opts());
  const first = await snapshot(r1.dir);
  const r2 = await pack(c.opts({ resume: true }));
  assert.deepEqual(await snapshot(r2.dir), first);
  assert.deepEqual({ work: await snapshot(c.work), curated: await snapshot(c.curated), cat: await snapshot(c.cat) }, before);
  // Farklı bir paket dosyası varsa sessizce üstüne yazılmaz.
  await fs.writeFile(path.join(r2.package, 'books.public.json'), '{}');
  await assert.rejects(() => pack(c.opts({ resume: true })), /üstüne yazılmadı/);
});

test('(9b) Çıktı girdilerle iç içe olamaz', async t => {
  const c = await setup(t);
  await assert.rejects(() => pack(c.opts({ output: path.join(c.curated, 'paket') })), /iç içe/);
});

test('(10) Yirmiden az kitapta sonuç yirmi kitap kontrolü gibi gösterilmez', async t => {
  const c = await setup(t);
  // Yalnız 5 kitaplık küçük bir çıktı: gutenberg dışını ayıklanmış klasörden ayır.
  const small = path.join(c.root, 'small');
  await fs.mkdir(path.join(small, 'records'), { recursive: true });
  const rules2 = { ...rules };
  const work2 = path.join(c.root, 'work2'), lists2 = path.join(c.root, 'lists2');
  await fs.mkdir(lists2);
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `k${i}`, url: `https://hindawi.example.org/k${i}`, ext: 'epub', title: `K ${i}`, license: 'CC0', evidenceUrl: EV, verified: true }));
  await fs.writeFile(path.join(lists2, 'hindawi.jsonl'), items.map(x => JSON.stringify(x)).join('\n') + '\n');
  await intake({ rules: rules2, lists: lists2, work: work2, sleep: async () => {}, fetcher: async (url) => [makeEpub({ n: 500 + Number(url.slice(-1)) })] });
  const cur2 = path.join(c.root, 'cur2'), cat2 = path.join(c.root, 'cat2');
  await curate({ rules: rules2, work: work2, output: cur2 });
  await catalog({ config: { version: 1 }, tree, curated: cur2, output: cat2 });
  const r = await pack({ layout, rules, intake: work2, curated: cur2, catalog: cat2, output: path.join(c.root, 'out2'), id: 'kucuk', mode: 'sample' });
  assert.equal(r.readerCheck.fewerThanRequested, true);
  assert.equal(r.readerCheck.tried, 5);
  const md = await fs.readFile(path.join(r.package, 'report.sample.md'), 'utf8');
  assert.match(md, /20 kitaptan az kitap var; 5 kitabın hepsi denendi\. Bu, 20 kitap kontrolü sayılmaz/);
  assert.ok(!/Rastgele seçilen 20 kitap/.test(md));
});

test('(6b) İlk bölümü yalnız kapak resmi olan EPUB açılır; hiç yazısı olmayan açılmaz', async t => {
  const c = await setup(t);
  const mk = (chapters) => {
    const items = chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('');
    const refs = chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('');
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>K</dc:title><dc:language>tr</dc:language></metadata><manifest>${items}</manifest><spine>${refs}</spine></package>`;
    return writeZip([
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>' },
      { name: 'OEBPS/content.opf', data: opf },
      ...chapters.map((h, i) => ({ name: `OEBPS/c${i}.xhtml`, data: h })),
    ]);
  };
  const cover = '<html><body><img src="kapak.jpg" alt=""/></body></html>';
  const a = path.join(c.root, 'kapakli.epub'), b = path.join(c.root, 'bos.epub');
  await fs.writeFile(a, mk([cover, '<html><body><p>Gerçek metin.</p></body></html>']));
  await fs.writeFile(b, mk([cover]));
  const res = await checkBooks([{ key: 'a:kapakli', path: a, ext: 'epub' }, { key: 'a:bos', path: b, ext: 'epub' }]);
  assert.equal(res[0].opened, true);
  assert.equal(res[1].opened, false); assert.ok(res[1].reason);
});

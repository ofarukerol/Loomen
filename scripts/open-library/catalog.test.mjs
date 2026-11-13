import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog } from './catalog.mjs';
import { authorKey } from './authors.mjs';
import { validateTree } from './classify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = JSON.parse(await fs.readFile(path.join(here, 'categories.tr.json'), 'utf8'));
const tree = treeFile.tree;
const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));

// Tüm veriler kurgusaldır; ağa çıkılmaz. Kitap kayıtları geçici klasöre elle yazılır.
async function setup(t, { config = {}, books = [], hints = null, decisions = null } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-catalog-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const ctx = { root, curated: path.join(root, 'curated'), hints: path.join(root, 'hints'), decisions: path.join(root, 'decisions'), out: path.join(root, 'out') };
  for (const b of books) {
    const source = b.source ?? 'kaynak-a';
    const dir = path.join(ctx.curated, 'books', source);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${b.id}.json`), JSON.stringify({ version: 1, key: `${source}:${b.id}`, source, id: b.id, title: b.title ?? `Kurgusal ${b.id}`, author: b.author ?? '', language: 'tr', decision: b.decision ?? 'public' }, null, 2));
  }
  if (hints) {
    await fs.mkdir(ctx.hints);
    for (const [source, rows] of Object.entries(hints)) await fs.writeFile(path.join(ctx.hints, `${source}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  }
  if (decisions) {
    await fs.mkdir(ctx.decisions);
    for (const [name, rows] of Object.entries(decisions)) await fs.writeFile(path.join(ctx.decisions, `${name}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  }
  ctx.run = (over = {}) => catalog({ config: { version: 1, ...config }, tree, curated: ctx.curated, output: ctx.out, hints: hints ? ctx.hints : undefined, decisions: decisions ? ctx.decisions : undefined, ...over });
  ctx.out_ = (rel) => readJson(path.join(ctx.out, rel));
  return ctx;
}
const sameAuthor = (cat, keys) => new Set(keys.map(k => cat.books.find(b => b.key === k).authorId)).size === 1;
const idOf = (cat, key) => cat.books.find(b => b.key === key);

test('(1) Büyük-küçük harf, aksan, noktalama ve "Soyad, Ad" farkı tek yazar kaydı olur', async t => {
  const c = await setup(t, { books: [
    { id: '1', author: 'Ahmet Çelik' }, { id: '2', author: 'AHMET CELIK.' }, { id: '3', author: 'Çelik, Ahmet' }, { id: '4', author: 'Başka Kişi' },
  ] });
  await c.run();
  const a = await c.out_('authors.json');
  const cat = await c.out_('catalog.json');
  assert.equal(a.authors.length, 2);
  assert.ok(sameAuthor(cat, ['kaynak-a:1', 'kaynak-a:2', 'kaynak-a:3']));
  assert.equal(a.authors.find(x => x.books.length === 3).variants.length, 3);
});

test('(2) Hareke ve elif farkı olan Arapça yazımlar tek kayıt olur', async t => {
  const c = await setup(t, { books: [{ id: '1', author: 'أَحْمَد' }, { id: '2', author: 'احمد' }, { id: '3', author: 'إحمد' }] });
  await c.run();
  assert.equal((await c.out_('authors.json')).authors.length, 1);
});

test('(3) Eş ad tablosu Latin ve Arapça yazımı birleştirir, kimlik sabit kalır', async t => {
  const config = { authorAliases: [{ id: 'yazar-sabit-1', name: 'Kurgusal Yazar', variants: ['كاتب خيالي'] }] };
  const c = await setup(t, { config, books: [{ id: '1', author: 'Kurgusal Yazar' }, { id: '2', author: 'كاتب خيالي' }] });
  await c.run();
  const a = await c.out_('authors.json');
  assert.equal(a.authors.length, 1);
  assert.equal(a.authors[0].id, 'yazar-sabit-1');
  assert.equal(a.authors[0].name, 'Kurgusal Yazar');
  assert.equal((await c.out_('reports/author-review.json')).length, 0);
});

test('(4) Emin olunmayan yazımlar birleşmez, gözden geçir listesine düşer', async t => {
  const pairs = [
    ['Selim Kuru', 'Selim Kuri'], // tek harf
    ['A. Hamdi Yazgan', 'Ahmet Hamdi Yazgan'], // baş harf kısaltması
    ['el-Kurgusali', 'Kurgusali'], // önek
    ['على', 'علي'], // ى / ي
  ];
  const books = pairs.flatMap((p, i) => p.map((author, j) => ({ id: `${i}-${j}`, author })));
  const c = await setup(t, { books });
  await c.run();
  const a = await c.out_('authors.json');
  assert.equal(a.authors.length, 8);
  const review = await c.out_('reports/author-review.json');
  for (const [x, y] of pairs) {
    const row = review.find(r => [r.aName, r.bName].includes(x) && [r.aName, r.bName].includes(y));
    assert.ok(row, `${x} / ${y} listede yok`);
    assert.match(row.reason, /\S/);
  }
});

test('(5) "separate" ile ayrı kişi denen çift listeye girmez', async t => {
  const books = [{ id: '1', author: 'Selim Kuru' }, { id: '2', author: 'Selim Kuri' }];
  const c = await setup(t, { books, config: { separate: [['Selim Kuru', 'Selim Kuri']] } });
  await c.run();
  assert.equal((await c.out_('reports/author-review.json')).length, 0);
  assert.equal((await c.out_('authors.json')).authors.length, 2);
});

test('(6) Yazarı boş kitap hiçbir yazara bağlanmaz', async t => {
  const c = await setup(t, { books: [{ id: '1', author: '' }, { id: '2', author: '  ' }, { id: '3', author: 'Biri Birisi' }] });
  await c.run();
  const cat = await c.out_('catalog.json');
  assert.equal(idOf(cat, 'kaynak-a:1').authorId, null);
  assert.equal(idOf(cat, 'kaynak-a:2').authorId, null);
  assert.deepEqual((await c.out_('authors.json')).unknown, ['kaynak-a:1', 'kaynak-a:2']);
});

test('(7) Şamile başlığı, konu kuralı ve elle atama doğru sırayla çalışır', async t => {
  const config = { subjectRules: { 'kaynak-a': { 'Short Stories': 'edebiyat-hikaye' } }, overrides: { 'kaynak-a:4': 'diger' } };
  const books = [1, 2, 3, 4].map(n => ({ id: String(n), author: `Yazar ${n}` }));
  const hints = { 'kaynak-a': [
    { id: '1', sourceCategory: 'الفِقه الحنفي' }, // hareke ile
    { id: '2', subjects: ['x', 'short  stories.'] },
    { id: '3', sourceCategory: 'التفسير', subjects: ['Short Stories'] }, // şamile kurala göre önde
    { id: '4', sourceCategory: 'التفسير' }, // elle hepsinin önünde
  ] };
  const c = await setup(t, { config, books, hints });
  await c.run();
  const cat = await c.out_('catalog.json');
  assert.deepEqual([1, 2, 3, 4].map(n => [idOf(cat, `kaynak-a:${n}`).category, idOf(cat, `kaynak-a:${n}`).categoryBy]), [
    ['islami-fikih-hanefi', 'şamile'], ['edebiyat-hikaye', 'kural'], ['islami-tefsir', 'şamile'], ['diger', 'elle'],
  ]);
});

test('(8) Eşleşmeyen kitap kategorisiz listesinde görünür', async t => {
  const c = await setup(t, { books: [{ id: '1', author: 'A B' }] });
  const s = await c.run();
  const cat = await c.out_('catalog.json');
  assert.equal(cat.books[0].category, null);
  assert.deepEqual((await c.out_('reports/uncategorized.json')).map(b => b.key), ['kaynak-a:1']);
  assert.equal(s.uncategorized, 1);
});

test('(9) Onaysız öneri kategoriye yazılmaz, sayıma girmez, bekleyenlerde durur', async t => {
  const c = await setup(t, { books: [{ id: '1', author: 'A B' }], decisions: { suggestions: [{ key: 'kaynak-a:1', category: 'tarih-genel', by: 'yz', note: 'deneme' }] } });
  const s = await c.run();
  assert.equal((await c.out_('catalog.json')).books[0].category, null);
  assert.equal((await c.out_('reports/pending-suggestions.json')).length, 1);
  assert.equal((await c.out_('reports/uncategorized.json')).length, 0);
  assert.deepEqual(s.byCategory, {});
  assert.equal(s.categorized, 0);
  assert.equal(s.pending, 1);
});

test('(10) Onaylanan öneri kategoriye geçer ve sayıma girer', async t => {
  const decisions = {
    suggestions: [{ key: 'kaynak-a:1', category: 'tarih-genel', by: 'yz' }],
    approvals: [{ key: 'kaynak-a:1', category: 'tarih-osmanli', approvedBy: 'Ömer' }], // öneriden farklı: onay geçerli
  };
  const c = await setup(t, { books: [{ id: '1', author: 'A B', decision: 'private' }], decisions });
  const s = await c.run();
  const row = (await c.out_('catalog.json')).books[0];
  assert.equal(row.category, 'tarih-osmanli');
  assert.equal(row.categoryBy, 'onay');
  assert.deepEqual(s.byCategory, { 'tarih-osmanli': { public: 0, private: 1 } });
  assert.equal((await c.out_('reports/pending-suggestions.json')).length, 0);
});

test('(11) Ağaçta olmayan kategori, bilinmeyen anahtar ve çift onay hata verir', async t => {
  const books = [{ id: '1', author: 'A B' }];
  const bad = async (decisions, re) => {
    const c = await setup(t, { books, decisions });
    await assert.rejects(c.run(), re);
  };
  await bad({ approvals: [{ key: 'kaynak-a:1', category: 'yok-boyle', approvedBy: 'Ö' }] }, /ağaçta olmayan/i);
  await bad({ suggestions: [{ key: 'kaynak-a:1', category: 'yok-boyle', by: 'yz' }] }, /ağaçta olmayan/i);
  await bad({ approvals: [{ key: 'kaynak-a:9', category: 'diger', approvedBy: 'Ö' }] }, /bilinmeyen kitap/);
  await bad({ approvals: [{ key: 'kaynak-a:1', category: 'diger', approvedBy: 'Ö' }, { key: 'kaynak-a:1', category: 'tarih-genel', approvedBy: 'Ö' }] }, /iki onay/);
  const c = await setup(t, { books, config: { overrides: { 'kaynak-a:1': 'yok-boyle' } } });
  await assert.rejects(c.run(), /ağaçta olmayan/i);
});

test('(12) Kategori ağacı geçerli; İslami dalın her yaprağında Şamile başlığı var', () => {
  const { nodes } = validateTree(tree);
  assert.equal(nodes.size, new Set(nodes.keys()).size);
  const leaves = (n) => (n.children?.length ? n.children.flatMap(leaves) : [n]);
  const islami = tree.find(n => n.id === 'islami');
  for (const leaf of leaves(islami)) assert.ok(leaf.shamela, `${leaf.id} Şamile başlığı yok`);
  assert.deepEqual(tree.map(n => n.ad), ['İslami Eserler', 'Edebiyat', 'Tarih', 'Felsefe ve Düşünce', 'Dil ve Sözlük', 'Bilim', 'Sanat', 'Çocuk ve Gençlik', 'Diğer']);
  assert.throws(() => validateTree([{ id: 'a', ad: 'A' }, { id: 'a', ad: 'B' }]), /tekrar/);
  assert.throws(() => validateTree([{ id: 'a', ad: ' ' }]), /boş/);
  assert.throws(() => validateTree([{ id: 'a', ad: 'A', foo: 1 }]), /bilinmeyen alan/);
  assert.equal(authorKey('İSMAİL, Ali'), 'ali ismail');
});

async function snapshot(dir, prefix = '') {
  const out = {};
  for (const e of (await fs.readdir(path.join(dir, prefix), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, await snapshot(dir, rel));
    else {
      const bytes = await fs.readFile(path.join(dir, rel));
      out[rel] = createHash('sha256').update(bytes).digest('hex') + ':' + (await fs.stat(path.join(dir, rel))).mtimeMs;
    }
  }
  return out;
}

test('(13) İkinci çalıştırma bayt bayt aynı; girdi değişmez', async t => {
  const c = await setup(t, {
    books: [{ id: '2', author: 'Çelik, Ahmet' }, { id: '1', author: 'Ahmet Celik' }, { id: '3', author: 'Ahmet Çelik' }, { id: '4', author: '' }],
    hints: { 'kaynak-a': [{ id: '1', sourceCategory: 'التفسير' }] },
    decisions: { suggestions: [{ key: 'kaynak-a:3', category: 'diger', by: 'yz' }] },
  });
  const before = { curated: await snapshot(c.curated), hints: await snapshot(c.hints), decisions: await snapshot(c.decisions) };
  await c.run();
  const first = await snapshot(c.out);
  const bytes = async () => Object.fromEntries(await Promise.all(Object.keys(first).map(async k => [k, (await fs.readFile(path.join(c.out, k))).toString('hex')])));
  const firstBytes = await bytes();
  await new Promise(r => setTimeout(r, 20));
  await c.run();
  assert.deepEqual(await bytes(), firstBytes);
  assert.deepEqual(Object.keys(await snapshot(c.out)), Object.keys(first));
  assert.deepEqual({ curated: await snapshot(c.curated), hints: await snapshot(c.hints), decisions: await snapshot(c.decisions) }, before);
  assert.ok(!Object.keys(first).some(k => k.startsWith('.tmp')));
});

test('(14) Çıktı klasörü girdiyle iç içe ise reddedilir', async t => {
  const c = await setup(t, { books: [{ id: '1', author: 'A B' }], hints: { 'kaynak-a': [] }, decisions: { suggestions: [] } });
  await assert.rejects(c.run({ output: path.join(c.curated, 'cikti') }), /iç içe/);
  await assert.rejects(c.run({ output: c.root }), /iç içe/);
  await assert.rejects(c.run({ output: path.join(c.hints, 'x') }), /iç içe/);
  await assert.rejects(c.run({ output: c.decisions }), /iç içe/);
  await assert.rejects(fs.lstat(path.join(c.curated, 'cikti')));
});

test('(15) Kapalı arşiv kitabı "private" işaretli kalır ve açık sayıma girmez', async t => {
  const config = { overrides: { 'kaynak-a:1': 'diger', 'kaynak-a:2': 'diger' } };
  const c = await setup(t, { config, books: [{ id: '1', author: 'A B', decision: 'public' }, { id: '2', author: 'C D', decision: 'private' }] });
  const s = await c.run();
  const cat = await c.out_('catalog.json');
  assert.equal(idOf(cat, 'kaynak-a:1').decision, 'public');
  assert.equal(idOf(cat, 'kaynak-a:2').decision, 'private');
  assert.deepEqual(s.byCategory, { diger: { public: 1, private: 1 } });
});

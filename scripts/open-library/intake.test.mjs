import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { intake, status } from './intake.mjs';
import { decide, validateRules, normalizeLicense } from './rights.mjs';
import { prepare, verify } from './prepare.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(await fs.readFile(path.join(here, 'sources.example.json'), 'utf8'));
const layout = JSON.parse(await fs.readFile(path.join(here, 'layout.example.json'), 'utf8'));
const EV = 'https://example.org/lisans';

// Tüm veriler kurgusaldır; ağa çıkılmaz.
function fakeFetcher({ failOn } = {}) {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (failOn?.(url, calls)) throw new Error(`kurgusal ağ hatası: ${url}`);
    return [Buffer.from('Kurgusal içerik '), Buffer.from(url)];
  };
  return { fetcher, calls };
}
const sleeps = [];
const sleep = async (ms) => { sleeps.push(ms); };
async function setup(t, lists) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-intake-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const listDir = path.join(root, 'lists'), work = path.join(root, 'work');
  await fs.mkdir(listDir);
  for (const [source, items] of Object.entries(lists)) {
    await fs.writeFile(path.join(listDir, `${source}.jsonl`), items.map(i => JSON.stringify(i)).join('\n') + '\n');
  }
  return { root, lists: listDir, work, rules: structuredClone(rules), sleep };
}
const url = (s, id) => `https://${s}.example.org/${id}`;
const open = (s, id, extra = {}) => ({ id, title: `Kurgusal ${id}`, url: url(s, id), ext: 'epub', license: 'Public Domain', evidenceUrl: EV, ...extra });
async function sixSources(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-local-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const local = path.join(root, 'kitap.txt');
  await fs.writeFile(local, 'Kurgusal Şamile metni');
  // Liste dosyaları kart sırasından farklı yazılır; sıra kurallardan gelmeli.
  return setup(t, {
    shamela: [{ id: 's1', title: 'Kurgusal', localPath: local, ext: 'txt', license: 'public-domain', evidenceUrl: EV }],
    hindawi: [open('hindawi', 'h1', { license: 'CC BY', verified: true }), open('hindawi', 'h2', { license: 'CC BY' })],
    wikisource: [open('wikisource', 'w1', { ext: 'txt' })],
    gutenberg: [open('gutenberg', 'g1'), open('gutenberg', 'g2', { license: 'cc-by-nc' })],
    'standard-ebooks': [open('standard-ebooks', 'e1', { license: 'CC0' })],
    openiti: [open('openiti', 'o1', { license: '' }), open('openiti', 'o2', { license: 'CC BY-SA', ext: 'txt' })],
  });
}
const has = (p) => fs.lstat(p).then(() => true, () => false);

test('(1)(2)(3)(4)(5) Kart sırası ve üç bölüm', async t => {
  const args = await sixSources(t), { fetcher, calls } = fakeFetcher();
  const s = await intake({ ...args, fetcher });
  assert.deepEqual(calls.map(u => new URL(u).hostname.split('.')[0]),
    ['openiti', 'openiti', 'standard-ebooks', 'gutenberg', 'gutenberg', 'wikisource', 'hindawi', 'hindawi']);
  const w = args.work;
  assert.ok(await has(path.join(w, 'input/gutenberg/public/g1.epub')));
  assert.ok(await has(path.join(w, 'input/gutenberg/private/g2.epub')));
  assert.ok(await has(path.join(w, 'input/standard-ebooks/public/e1.epub')));
  assert.ok(await has(path.join(w, 'input/openiti/public/o2.txt')));
  assert.ok(await has(path.join(w, 'held/openiti/o1.epub')));
  assert.ok(!await has(path.join(w, 'input/openiti/public/o1.epub')) && !await has(path.join(w, 'input/openiti/private/o1.epub')));
  assert.ok(await has(path.join(w, 'input/shamela/private/s1.txt')));
  assert.ok(!await has(path.join(w, 'input/shamela/public')));
  assert.ok(await has(path.join(w, 'input/hindawi/public/h1.epub')));
  assert.ok(await has(path.join(w, 'held/hindawi/h2.epub')));
  assert.ok(!await has(path.join(w, 'input/hindawi/public/h2.epub')));
  assert.deepEqual({ p: s.public, c: s.private, h: s.held, k: s.skipped }, { p: 5, c: 2, h: 2, k: 0 });
  const record = JSON.parse(await fs.readFile(path.join(w, 'records/gutenberg/g1.json'), 'utf8'));
  assert.equal(record.decision, 'public');
  assert.equal(record.evidenceUrl, EV);
  assert.equal(record.from, url('gutenberg', 'g1'));
  assert.match(record.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual((await status(w)).hindawi, { public: 1, private: 0, held: 1 });
  assert.ok(sleeps.includes(2000), 'kaynak başına bekleme uygulanır');
});

test('(3) Kanıtsız ya da tanınmayan lisans bekler', async t => {
  const args = await setup(t, { gutenberg: [
    open('gutenberg', 'a', { evidenceUrl: '' }), open('gutenberg', 'b', { license: 'Bilinmeyen Lisans' }),
    open('gutenberg', 'c', { evidenceUrl: 'http://example.org/x' }), open('gutenberg', 'd', { license: undefined }),
  ] });
  const s = await intake({ ...args, fetcher: fakeFetcher().fetcher });
  assert.equal(s.held, 4);
  assert.ok(!await has(path.join(args.work, 'input')));
});

test('(4) Ağ adresli Şamile maddesi reddedilir', async t => {
  const args = await setup(t, { shamela: [open('shamela', 's1')] });
  const { fetcher, calls } = fakeFetcher();
  await assert.rejects(intake({ ...args, fetcher }), /yalnız yerel dosya/);
  assert.equal(calls.length, 0);
});

test('Yerel dosya sembolik bağlantı olamaz', async t => {
  const args = await setup(t, {});
  const real = path.join(args.root, 'gercek.txt'), link = path.join(args.root, 'bag.txt');
  await fs.writeFile(real, 'Kurgusal'); await fs.symlink(real, link);
  await fs.writeFile(path.join(args.lists, 'shamela.jsonl'), JSON.stringify({ id: 's1', localPath: link, ext: 'txt' }) + '\n');
  await assert.rejects(intake({ ...args }), /sembolik bağlantı/);
});

test('(6) Kesintiden sonra alınmış kitaplar yeniden indirilmez', async t => {
  const args = await setup(t, { gutenberg: [open('gutenberg', 'g1'), open('gutenberg', 'g2'), open('gutenberg', 'g3')] });
  const broken = fakeFetcher({ failOn: u => u.endsWith('/g3') });
  await assert.rejects(intake({ ...args, fetcher: broken.fetcher }), /kurgusal ağ hatası/);
  assert.equal(broken.calls.length, 2 + 3, 'üçüncü kitap üç kez denenir');
  const first = path.join(args.work, 'input/gutenberg/public/g1.epub');
  const second = path.join(args.work, 'input/gutenberg/public/g2.epub');
  const m1 = (await fs.stat(first)).mtimeMs, m2 = (await fs.stat(second)).mtimeMs;
  const { fetcher, calls } = fakeFetcher();
  const s = await intake({ ...args, fetcher });
  assert.deepEqual(calls, [url('gutenberg', 'g3')]);
  assert.equal(s.skipped, 2);
  assert.equal((await fs.stat(first)).mtimeMs, m1);
  assert.equal((await fs.stat(second)).mtimeMs, m2);
  assert.deepEqual(await fs.readdir(path.join(args.work, 'partial/gutenberg')), []);
});

test('Dosya yayımlanıp kayıt yazılmadan kesilirse kayıt tamamlanır, indirilmez', async t => {
  const args = await setup(t, { gutenberg: [open('gutenberg', 'g1')] });
  await intake({ ...args, fetcher: fakeFetcher().fetcher });
  await fs.unlink(path.join(args.work, 'records/gutenberg/g1.json'));
  await fs.writeFile(path.join(args.work, 'ledger.jsonl'), '{"key":"yar');
  const { fetcher, calls } = fakeFetcher();
  const s = await intake({ ...args, fetcher });
  assert.equal(calls.length, 0);
  assert.equal(s.resumed, 1);
  const lines = (await fs.readFile(path.join(args.work, 'ledger.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(JSON.parse(lines.at(-1)).key, 'gutenberg:g1');
});

test('(7) Tamamlanmış alım tekrar çalışınca hiçbir şey indirilmez, defter yinelenmez', async t => {
  const args = await sixSources(t);
  await intake({ ...args, fetcher: fakeFetcher().fetcher });
  const before = await fs.readFile(path.join(args.work, 'ledger.jsonl'), 'utf8');
  const { fetcher, calls } = fakeFetcher();
  const s = await intake({ ...args, fetcher });
  assert.equal(calls.length, 0);
  assert.equal(s.skipped, 9);
  assert.equal(await fs.readFile(path.join(args.work, 'ledger.jsonl'), 'utf8'), before);
  assert.equal(new Set(before.trim().split('\n').map(l => JSON.parse(l).key)).size, 9);
});

test('(8) Bozulmuş dosya, eksik dosya ve değişen karar durdurur', async t => {
  const args = await setup(t, { gutenberg: [open('gutenberg', 'g1')] });
  await intake({ ...args, fetcher: fakeFetcher().fetcher });
  const file = path.join(args.work, 'input/gutenberg/public/g1.epub');
  const bytes = await fs.readFile(file); bytes[0] ^= 1; await fs.writeFile(file, bytes);
  await assert.rejects(intake({ ...args, fetcher: fakeFetcher().fetcher }), /bütünlüğü bozulmuş/);
  await fs.unlink(file);
  await assert.rejects(intake({ ...args, fetcher: fakeFetcher().fetcher }), /dosya eksik/);
  const changed = structuredClone(args.rules);
  changed.licenses.open = changed.licenses.open.filter(l => l !== 'public-domain');
  await assert.rejects(intake({ ...args, rules: changed, fetcher: fakeFetcher().fetcher }), /karar değişti/);
  assert.ok(!await has(path.join(args.work, 'held/gutenberg/g1.epub')));
});

test('(9) Geçersiz listeler hiçbir şey indirmeden reddedilir', async t => {
  const cases = [
    [{ gutenberg: [open('gutenberg', 'g1'), open('gutenberg', 'g1')] }, /iki kez/],
    [{ gutenberg: [open('gutenberg', '../kacis')] }, /geçersiz kimlik/],
    [{ gutenberg: [open('gutenberg', 'g1', { url: 'http://gutenberg.example.org/g1' })] }, /https/],
    [{ 'baska-kaynak': [open('baska-kaynak', 'x')] }, /Sırada olmayan kaynak/],
    [{ gutenberg: [{ ...open('gutenberg', 'g1'), fazla: 1 }] }, /bilinmeyen alan/],
  ];
  for (const [lists, error] of cases) {
    const args = await setup(t, { openiti: [open('openiti', 'o1')], ...lists });
    const { fetcher, calls } = fakeFetcher();
    await assert.rejects(intake({ ...args, fetcher }), error);
    assert.equal(calls.length, 0);
  }
});

test('(10) Alım çıktısı hazırlık aracından geçer, bekleyenler girmez', async t => {
  const args = await sixSources(t);
  await intake({ ...args, fetcher: fakeFetcher().fetcher });
  // Kesintiden kalmış yarım dosya da hazırlığı bozmamalı.
  await fs.writeFile(path.join(args.work, 'partial/gutenberg/g9.epub.kalinti.partial'), 'yarım');
  const dir = await prepare({ layout, input: path.join(args.work, 'input'), output: path.join(args.root, 'out'), id: '2026-11-12-01' });
  const plan = await verify(dir);
  const files = plan.files.map(f => f.file);
  assert.equal(files.length, 7);
  assert.ok(files.every(f => !/\/(o1|h2)\./.test(f)));
  assert.deepEqual([...new Set(plan.files.map(f => f.source))], ['openiti', 'standard-ebooks', 'gutenberg', 'wikisource', 'hindawi', 'shamela']);
  assert.equal(plan.files.find(f => f.source === 'shamela').visibility, 'private');
});

test('(11) Lisans karar tablosu', () => {
  validateRules(rules);
  const rows = [
    ['gutenberg', { license: 'Public Domain', evidenceUrl: EV }, 'public'],
    ['gutenberg', { license: 'CC_BY  SA', evidenceUrl: EV }, 'public'],
    ['gutenberg', { license: 'CC BY-NC-ND', evidenceUrl: EV }, 'private'],
    ['gutenberg', { license: 'cc-by-4.0', evidenceUrl: EV }, 'held'],
    ['gutenberg', { license: 'CC0' }, 'held'],
    ['gutenberg', { evidenceUrl: EV }, 'held'],
    ['hindawi', { license: 'CC BY', evidenceUrl: EV }, 'held'],
    ['hindawi', { license: 'CC BY', evidenceUrl: EV, verified: true }, 'public'],
    ['hindawi', { license: 'CC BY-NC', evidenceUrl: EV, verified: true }, 'private'],
    ['hindawi', { license: 'CC BY', verified: true }, 'held'],
    ['shamela', { license: 'public-domain', evidenceUrl: EV }, 'private'],
    ['shamela', {}, 'private'],
  ];
  for (const [source, item, expected] of rows) assert.equal(decide(item, source, rules).decision, expected, `${source} ${JSON.stringify(item)}`);
  assert.equal(normalizeLicense('  CC BY - SA '), 'cc-by-sa');
  const bad = (patch) => assert.throws(() => validateRules({ ...structuredClone(rules), ...patch }));
  bad({ version: 2 });
  bad({ fazla: true });
  bad({ order: [...rules.order, 'gutenberg'] });
  bad({ order: ['../x'] });
  bad({ sources: { ...rules.sources, gutenberg: { delayMs: 1, bilinmeyen: 1 } } });
  bad({ licenses: { open: ['CC BY'], restricted: [] } });
  bad({ licenses: { open: ['cc-by'], restricted: ['cc-by'] } });
});

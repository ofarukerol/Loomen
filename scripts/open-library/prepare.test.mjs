import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepare, verify, validateLayout } from './prepare.mjs';

const layout = { version: 1, targets: { public: { bucket: 'example-public', prefix: 'books' }, private: { bucket: 'example-private', prefix: 'archive' } }, sources: ['openiti', 'gutenberg'] };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-library-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, 'input'), output = path.join(root, 'output');
  for (const [file, content] of [['openiti/private/source.txt', 'Kurgusal arşiv'], ['gutenberg/public/book.epub', 'Kurgusal kitap']]) {
    await fs.mkdir(path.dirname(path.join(input, file)), { recursive: true });
    await fs.writeFile(path.join(input, file), content);
  }
  return { layout: structuredClone(layout), input, output, id: '2026-11-12-01' };
}
test('Ayrı hedefler, kaynak sırası ve SHA-256 içeren çevrimdışı liste', async t => {
  const args = await fixture(t), dir = await prepare(args), plan = await verify(dir);
  assert.deepEqual(plan.files.map(f => f.source), ['openiti', 'gutenberg']);
  assert.ok(plan.files.every(f => f.size > 0 && /^[a-f0-9]{64}$/.test(f.sha256)));
  const list = JSON.parse(await fs.readFile(path.join(dir, 'uploads.json')));
  assert.equal(list[0].bucket, 'example-private');
  assert.equal(list[1].bucket, 'example-public');
  assert.equal(list[0].key, 'archive/snapshots/2026-11-12-01/openiti/private/source.txt');
});
test('Eski çekim korunur; yeni ad ayrı kayıt oluşturur; tekrar devam yazmaz', async t => {
  const args = await fixture(t), dir = await prepare(args);
  const before = await fs.readFile(path.join(dir, 'manifest.json'));
  const stat = await fs.stat(path.join(dir, 'uploads.json'));
  await assert.rejects(prepare(args), { code: 'EEXIST' });
  await prepare({ ...args, resume: true });
  assert.equal((await fs.stat(path.join(dir, 'uploads.json'))).mtimeMs, stat.mtimeMs);
  await prepare({ ...args, id: '2026-11-12-02' });
  assert.deepEqual(await fs.readFile(path.join(dir, 'manifest.json')), before);
});
test('Aynı boyutlu değişiklik ve eksik çıktı reddedilir', async t => {
  const args = await fixture(t), dir = await prepare(args);
  const book = path.join(dir, 'files/gutenberg/public/book.epub');
  const bytes = await fs.readFile(book); bytes[0] ^= 1;
  await fs.writeFile(book, bytes);
  await assert.rejects(verify(dir), /bütünlüğü/);
  await assert.rejects(prepare({ ...args, resume: true }), /bütünlüğü/);
  await fs.unlink(book);
  await assert.rejects(verify(dir), { code: 'ENOENT' });
});
test('Kesintiden sonra yalnız eksik kopya tamamlanır', async t => {
  const args = await fixture(t), dir = await prepare(args);
  const saved = path.join(dir, 'files/openiti/private/source.txt');
  const stat = await fs.stat(saved);
  await fs.unlink(path.join(dir, 'files/gutenberg/public/book.epub'));
  await fs.unlink(path.join(dir, 'uploads.json'));
  await fs.writeFile(path.join(dir, 'files/openiti/private/abandoned.partial'), 'yarım');
  await prepare({ ...args, resume: true });
  await verify(dir);
  assert.equal((await fs.stat(saved)).mtimeMs, stat.mtimeMs);
});
test('Devamda değişen kaynak ve değişen hedef ayarı reddedilir', async t => {
  const args = await fixture(t); await prepare(args);
  const changed = structuredClone(layout); changed.targets.private.bucket = 'other-private';
  await assert.rejects(prepare({ ...args, layout: changed, resume: true }), /aynı çekim/);
  await fs.writeFile(path.join(args.input, 'openiti/private/source.txt'), 'değişti');
  await assert.rejects(prepare({ ...args, resume: true }), /bütünlüğü/);
});
test('Ortak depo, yol kaçışı ve bağlantılar reddedilir', async t => {
  const bad = structuredClone(layout); bad.targets.private.bucket = bad.targets.public.bucket;
  assert.throws(() => validateLayout(bad), /ayrı depolar/);
  bad.targets.private.bucket = 'private'; bad.targets.private.prefix = '../public';
  assert.throws(() => validateLayout(bad), /göreli yol/);
  const args = await fixture(t);
  await fs.symlink(path.join(args.input, 'openiti/private/source.txt'), path.join(args.input, 'gutenberg/public/link.epub'));
  await assert.rejects(prepare(args), /Sembolik bağlantı/);
  await assert.rejects(prepare({ ...args, id: '../escape' }), /Çekim adı/);
});
test('Değiştirilmiş yükleme listesi ve kayıttaki hedef uyuşmazlığı reddedilir', async t => {
  const args = await fixture(t), dir = await prepare(args);
  await fs.writeFile(path.join(dir, 'uploads.json'), '[]');
  await assert.rejects(verify(dir), /uyuşmuyor/);
  const file = path.join(dir, 'manifest.json'), plan = JSON.parse(await fs.readFile(file));
  plan.files[0].visibility = 'public';
  await fs.writeFile(file, JSON.stringify(plan));
  await assert.rejects(prepare({ ...args, resume: true }), /kaydı geçersiz/);
});
test('Eksik kaynak devamı durdurur ve eski kaydı korur', async t => {
  const args = await fixture(t), dir = await prepare(args);
  const before = await fs.readFile(path.join(dir, 'manifest.json'));
  await fs.unlink(path.join(args.input, 'openiti/private/source.txt'));
  await assert.rejects(prepare({ ...args, resume: true }), { code: 'ENOENT' });
  assert.deepEqual(await fs.readFile(path.join(dir, 'manifest.json')), before);
});
test('Çıktıdaki bağlantı üzerinden dışarı yazılmaz', async t => {
  const args = await fixture(t), dir = await prepare(args);
  const folder = path.join(dir, 'files/gutenberg');
  await fs.rename(folder, path.join(args.output, 'saved'));
  await fs.symlink(path.join(args.output, 'saved'), folder);
  await assert.rejects(prepare({ ...args, resume: true }), /bağlantı olamaz/);
});
test('Türkçe, Arapça ve birleşik harfli yollar korunur; Mac yardımcı dosyaları sayılarak atlanır', async t => {
  const args = await fixture(t);
  const names = ['gutenberg/public/Öyküler/İstanbul kitabı.epub', 'openiti/private/الكتاب.txt', 'gutenberg/public/O\u0308yku.txt'];
  for (const file of [...names, '.DS_Store', 'openiti/.DS_Store', 'openiti/private/._الكتاب.txt']) {
    await fs.mkdir(path.dirname(path.join(args.input, file)), { recursive: true });
    await fs.writeFile(path.join(args.input, file), 'Kurgusal içerik');
  }
  const messages = [];
  t.mock.method(console, 'info', message => messages.push(message));
  const dir = await prepare(args), plan = await verify(dir);
  assert.deepEqual(messages, ['Mac yardımcı dosyaları atlandı: 3']);
  assert.equal(plan.files.length, 5);
  const list = JSON.parse(await fs.readFile(path.join(dir, 'uploads.json')));
  for (const file of names) {
    assert.ok(plan.files.some(entry => entry.file === file));
    assert.ok(list.some(entry => entry.key.endsWith(`/${file}`)));
    assert.equal(await fs.readFile(path.join(dir, 'files', file), 'utf8'), 'Kurgusal içerik');
  }
  await prepare({ ...args, resume: true });
});
test('Geçersiz dosya adı hata mesajında gösterilir', async t => {
  const args = await fixture(t);
  const file = 'gutenberg/public/.hidden.epub';
  await fs.writeFile(path.join(args.input, file), 'Kurgusal içerik');
  await assert.rejects(prepare(args), error => error.message.includes(file));
});
test('Mac yardımcı dosyası adındaki bağlantı atlanmaz', async t => {
  const args = await fixture(t);
  await fs.symlink(path.join(args.input, 'openiti/private/source.txt'), path.join(args.input, '._book'));
  await assert.rejects(prepare(args), /Geçersiz göreli yol/);
});

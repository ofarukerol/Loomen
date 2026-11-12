import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { BulkPermission, IntakeBook, IntakeCheckpoint, IntakeIO, IntakeStorage, PreparedFile, ReleasePolicy, SourceId } from './contracts.ts';
import { fileIntakeStorage, intakeKey, localIntakeIO, intakeFiles, intakeReport, runIntake, downloadIntakeSources } from './pipeline.ts';
import { prepare, verify } from '../../scripts/open-library/prepare.mjs';
import { SOURCE_ORDER } from './sources.ts';

const policy: ReleasePolicy = { approvedBy: 'örnek-onaylayan', licenses: ['example-license'], territories: ['TR'] };
function book(source: SourceId, id = 'one'): IntakeBook {
  return { source, id, editionId: id, format: 'epub', url: `https://example.org/${source}/${id}.epub`, sha256: 'a'.repeat(64),
    rights: { license: 'example-license', evidenceUrl: 'https://example.org/rights', verifiedBy: 'örnek', verifiedAt: '2026-11-12', editionId: id, territories: ['TR'], redistribution: true } };
}
function permission(source: SourceId): BulkPermission {
  return { source, kind: 'official-bulk', baseUrl: `https://example.org/${source}/`, evidenceUrl: 'https://example.org/bulk-rules', approvedBy: 'örnek', minDelayMs: 100 };
}
function fixture() {
  let saved: IntakeCheckpoint | undefined;
  let time = 1000;
  const calls: string[] = [], sleeps: number[] = [], files = new Map<string, PreparedFile>();
  const storage: IntakeStorage = {
    load: async () => saved && structuredClone(saved),
    save: async state => { saved = structuredClone(state); },
  };
  const io: IntakeIO = {
    now: () => time,
    sleep: async ms => { sleeps.push(ms); time += ms; },
    acquire: async (b, visibility, key) => {
      calls.push(b.source);
      if (!files.has(key)) files.set(key, { source: b.source, visibility, file: `${b.source}/${visibility}/${key}.${b.format === 'epub' ? 'epub' : 'txt'}`, size: 32, sha256: b.sha256 });
      return structuredClone(files.get(key)!);
    },
    verify: async file => { assert.ok([...files.values()].some(f => JSON.stringify(f) === JSON.stringify(file))); },
  };
  return { storage, io, calls, sleeps, files, options: { storage, io, policy, permissions: SOURCE_ORDER.map(permission) } };
}

test('Kaynak sırası sabit, Gutenberg yalnız EPUB, raporda bütün kaynaklar var', async () => {
  const f = fixture();
  const state = await runIntake({ ...f.options, books: [...SOURCE_ORDER].reverse().map(s => book(s)) });
  assert.deepEqual(f.calls, SOURCE_ORDER);
  assert.equal(intakeReport(state).length, 6);
  assert.equal(intakeFiles(state, 'public').length, 5);
  assert.equal(intakeFiles(state, 'private').length, 1);
  assert.equal(intakeFiles(state, 'private')[0].source, 'shamela');
});

test('Belirsiz lisans, yanlış baskı, ülke ve yayın onayı eksikse dosya alınmaz', async () => {
  for (const mutate of [
    (b: IntakeBook) => { delete b.rights; },
    (b: IntakeBook) => { b.rights!.editionId = 'other'; },
    (b: IntakeBook) => { b.rights!.territories = ['US']; },
    (b: IntakeBook) => { b.rights!.redistribution = false; },
    (b: IntakeBook) => { b.rights!.license = 'unknown'; },
    (b: IntakeBook) => { b.rights!.verifiedBy = ''; },
  ]) {
    const f = fixture(), b = book('hindawi'); mutate(b);
    const state = await runIntake({ ...f.options, books: [b] });
    assert.equal(state.results[0].status, 'held'); assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  const state = await runIntake({ ...f.options, policy: undefined, books: [book('openiti')] });
  assert.equal(state.results[0].status, 'held');
});

test('Şamile yayın onayı olmadan bile yalnız kapalı hedefe gider', async () => {
  const f = fixture(), b = book('shamela'); delete b.rights;
  const state = await runIntake({ ...f.options, policy: undefined, books: [b] });
  assert.equal(intakeFiles(state, 'public').length, 0);
  assert.equal(intakeFiles(state, 'private')[0].visibility, 'private');
});

test('Gutenberg metin dosyası elenir, sayısı ve gerekçesi raporlanır', async () => {
  const f = fixture(), b = book('gutenberg'); b.format = 'text';
  const state = await runIntake({ ...f.options, books: [b] });
  const report = intakeReport(state).find(r => r.source === 'gutenberg')!;
  assert.equal(report.rejected, 1); assert.equal(report.received, 0);
  assert.equal(report.reasons['Gutenberg için yalnız EPUB alınır.'], 1);
  assert.equal(f.calls.length, 0);
});

test('İzinsiz adres, benzer alan adı ve yol kaçışı bekletilir', async () => {
  for (const url of ['https://example.org.evil.test/openiti/a.epub', 'https://example.org/openiti-other/a.epub', 'https://example.org/openiti/%2fprivate/a.epub', 'https://example.org/openiti/../other/a.epub', 'https://user:secret@example.org/openiti/a.epub']) {
    const f = fixture(), b = book('openiti'); b.url = url;
    const state = await runIntake({ ...f.options, books: [b] });
    assert.equal(state.results[0].status, 'held'); assert.equal(f.calls.length, 0);
  }
});

test('Tekrar çalıştırma tamamlanan dosyayı yeniden almaz; farklı baskılar korunur', async () => {
  const f = fixture(), b = book('openiti');
  const books = [b, structuredClone(b), { ...b, editionId: 'second-edition' }];
  books[2].rights = { ...b.rights!, editionId: 'second-edition' };
  await runIntake({ ...f.options, books });
  assert.equal(f.calls.length, 2);
  await runIntake({ ...f.options, books });
  assert.equal(f.calls.length, 2); assert.equal(f.files.size, 2);
  assert.equal(intakeReport((await f.storage.load())!)[0].duplicates, 1);
  assert.equal(intakeReport((await f.storage.load())!)[0].rejected, 1);
});

test('İndirme sırasında kesinti beklemeyi korur ve kaldığı yerden sürer', async () => {
  const f = fixture(), acquire = f.io.acquire;
  let stop = true;
  f.io.acquire = async (...args) => {
    if (args[0].source === 'standard-ebooks' && stop) { stop = false; throw new Error('örnek kesinti'); }
    return acquire(...args);
  };
  const books = [book('standard-ebooks'), book('openiti')];
  await assert.rejects(runIntake({ ...f.options, books }), /örnek kesinti/);
  assert.equal((await f.storage.load())!.results.length, 1);
  const state = await runIntake({ ...f.options, books });
  assert.equal(state.results.length, 2);
  assert.deepEqual(f.calls, ['openiti', 'standard-ebooks']);
  assert.deepEqual(f.sleeps, [100, 100]);
});

test('Dosya alındıktan sonra kayıt kesilirse aynı anahtar dosyayı çoğaltmaz', async () => {
  const f = fixture(), save = f.storage.save;
  let stop = true;
  f.storage.save = async state => {
    if (stop && state.results.length === 1) { stop = false; throw new Error('kayıt kesintisi'); }
    await save(state);
  };
  const books = [book('openiti')];
  await assert.rejects(runIntake({ ...f.options, books }), /kayıt kesintisi/);
  await runIntake({ ...f.options, books });
  assert.equal(f.files.size, 1);
  assert.equal((await f.storage.load())!.results.length, 1);
});

test('Değişen plan, izin veya aynı baskıdaki çelişen kayıt durdurulur', async () => {
  const f = fixture(), b = book('openiti');
  await runIntake({ ...f.options, books: [b] });
  await assert.rejects(runIntake({ ...f.options, books: [{ ...b, sha256: 'b'.repeat(64) }] }), /planla uyuşmuyor/);
  await assert.rejects(runIntake({ ...f.options, books: [b], policy: undefined }), /planla uyuşmuyor/);
  await assert.rejects(runIntake({ ...f.options, books: [b, { ...b, sha256: 'b'.repeat(64) }] }), /çelişen/);
});

test('Bozuk çıktı, yanlış hedef, sıfır boyut ve yanlış özet kabul edilmez', async () => {
  for (const mutate of [
    (f: PreparedFile) => { f.file = 'openiti/public/../escape.epub'; },
    (f: PreparedFile) => { f.visibility = 'private'; },
    (f: PreparedFile) => { f.size = 0; },
    (f: PreparedFile) => { f.sha256 = 'b'.repeat(64); },
  ]) {
    const f = fixture(), acquire = f.io.acquire;
    f.io.acquire = async (...args) => { const file = await acquire(...args); mutate(file); return file; };
    await assert.rejects(runIntake({ ...f.options, books: [book('openiti')] }), /uyuşmuyor/);
    assert.equal((await f.storage.load())!.results.length, 0);
  }
});

test('Devamda dosya tekrar doğrulanır ve bozuk karar kaydı reddedilir', async () => {
  const f = fixture(), books = [book('openiti')];
  await runIntake({ ...f.options, books });
  f.io.verify = async () => { throw new Error('dosya bozuldu'); };
  await assert.rejects(runIntake({ ...f.options, books }), /dosya bozuldu/);
  const state = (await f.storage.load())!;
  state.results[0].status = 'held'; await f.storage.save(state);
  await assert.rejects(runIntake({ ...f.options, books }), /izin kararı bozuk/);
});

test('Hatalı bekleme ve eksik toplu alma izni ağ işlemine ulaşmaz', async () => {
  const f = fixture();
  await assert.rejects(runIntake({ ...f.options, permissions: [{ ...permission('openiti'), minDelayMs: -1 }], books: [book('openiti')] }), /geçersiz/);
  const state = await runIntake({ ...f.options, permissions: [], books: [book('openiti')] });
  assert.equal(intakeReport(state)[0].held, 1); assert.equal(f.calls.length, 0);
});

test('Yerel dosya ve kalıcı kayıt LOM-101 hazırlığıyla birlikte çalışır', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-intake-'));
  try {
    const input = path.join(root, 'input'), output = path.join(root, 'output');
    await fs.mkdir(input);
    const text = 'Örnek kitap — كِتَابٌ';
    await fs.writeFile(path.join(input, 'book.txt'), text);
    const b = book('openiti'); b.format = 'text';
    b.sha256 = createHash('sha256').update(text).digest('hex');
    const io = await localIntakeIO(input, output, { [intakeKey(b)]: 'book.txt' });
    const storage = fileIntakeStorage(path.join(root, 'checkpoint.json'));
    const options = { books: [b], permissions: [permission('openiti')], policy, io, storage };
    const first = await runIntake(options);
    const second = await runIntake(options);
    assert.deepEqual(first, second);
    // Zorla kapanan eski bir çalışmanın yarım kitabı çıktı ağacının dışında kalır.
    await fs.writeFile(path.join(output + '.partial', 'interrupted.partial'), 'yarım kitap');
    const layout = { version: 1, sources: [...SOURCE_ORDER], targets: { public: { bucket: 'example-public', prefix: 'books' }, private: { bucket: 'example-private', prefix: 'archive' } } };
    const snapshot = await prepare({ layout, input: output, output: path.join(root, 'snapshots'), id: 'example-01' });
    const manifest = await verify(snapshot);
    assert.deepEqual(manifest.files, intakeFiles(first, 'public'));
    assert.equal(manifest.files.length, 1);
    const diskMetadata = JSON.parse(await fs.readFile(path.join(root, 'checkpoint.json'), 'utf8'));
    assert.equal(diskMetadata.results, undefined);
    assert.equal((await fs.readdir(path.join(root, 'checkpoint.json.records'))).filter(f => f.endsWith('.json')).length, 1);
    const changedIO = await localIntakeIO(input, output, { [intakeKey(b)]: 'book.txt' });
    await assert.rejects(runIntake({ ...options, io: changedIO, policy: undefined, storage: fileIntakeStorage(path.join(root, 'new-checkpoint.json')) }), /başka bir çekime ait/);
    const records = path.join(root, 'checkpoint.json.records');
    await fs.copyFile(path.join(records, '0.json'), path.join(records, '2.json'));
    await assert.rejects(storage.load(), /arasında eksik kitap/);
    await fs.unlink(path.join(records, '2.json'));
    await fs.rename(records, records + '.backup');
    await assert.rejects(storage.load(), { code: 'ENOENT' });
    await fs.rename(records + '.backup', records);
    await fs.writeFile(path.join(output, first.results[0].file!.file), 'bozuk');
    await assert.rejects(runIntake(options), /bütünlüğü bozuldu/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Yerel alma mevcut dosyayı ezmez ve klasör bağlantısını reddeder', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-intake-'));
  try {
    const input = path.join(root, 'input'), output = path.join(root, 'output');
    await fs.mkdir(input); await fs.writeFile(path.join(input, 'book.epub'), 'example');
    const b = book('openiti'); b.sha256 = createHash('sha256').update('example').digest('hex');
    const key = intakeKey(b), io = await localIntakeIO(input, output, { [key]: 'book.epub' });
    await io.bindPlan!('example-plan');
    const file = await io.acquire(b, 'public', key);
    await fs.writeFile(path.join(output, file.file), 'old');
    await assert.rejects(io.acquire(b, 'public', key), /bütünlüğü bozuldu/);
    assert.equal(await fs.readFile(path.join(output, file.file), 'utf8'), 'old');
    await fs.symlink(input, path.join(input, 'linked'));
    const linked = await localIntakeIO(input, output, { [key]: 'linked/book.epub' });
    await linked.bindPlan!('example-plan');
    await assert.rejects(linked.acquire(b, 'public', key), /bağlantı olamaz/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Gerçek HTTP: başarı, tekrar, kesinti, eksik dosya, özet, yönlendirme ve boyut sınırı', async () => {
  const { createServer } = await import('node:http');
  const { downloadSourceBook } = await import('./sources.ts');
  let requests = 0, broken = true;
  const server = createServer((req, res) => {
    requests++;
    if (req.url === '/missing') { res.writeHead(404); res.end(); }
    else if (req.url === '/redirect') { res.writeHead(302, { Location: '/ok' }); res.end(); }
    else if (req.url === '/broken' && broken) { res.writeHead(200, { 'Content-Length': '8' }); res.write('abc'); setTimeout(() => res.destroy(), 10); }
    else if (req.url === '/large') { res.writeHead(200); res.write('123456'); res.end('789012'); }
    else if (req.url === '/declared-large') { res.writeHead(200, { 'Content-Length': '100' }); res.end('abc'); }
    else res.end('abc');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-download-'));
  try {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const p: BulkPermission = { source: 'openiti', kind: 'official-bulk', baseUrl: base, evidenceUrl: base + '/rules', approvedBy: 'yerel-test', minDelayMs: 15 };
    const b = { source: 'openiti' as const, id: 'one', editionId: 'one', format: 'text' as const, url: base + '/ok' };
    const opts = { maxBytes: 10, timeoutMs: 1000, allowLocalHttp: true };
    const pending = downloadSourceBook(root, b, p, opts);
    await assert.rejects(downloadSourceBook(root, b, p, opts), /başka bir indirme/);
    const first = await pending;
    assert.equal(first.evidence.sha256, createHash('sha256').update('abc').digest('hex'));
    assert.equal(first.evidence.needs_human, true);
    assert.equal(first.evidence.visibility, 'private');
    assert.deepEqual(await downloadSourceBook(root, b, p, opts), first);
    assert.equal(requests, 1);
    for (const name of ['missing', 'broken', 'large', 'declared-large', 'redirect']) {
      await assert.rejects(downloadSourceBook(root, { ...b, url: base + '/' + name }, p, opts));
    }
    broken = false;
    const recovered = await downloadSourceBook(root, { ...b, url: base + '/broken' }, p, opts);
    const before = requests;
    assert.deepEqual(await downloadSourceBook(root, { ...b, url: base + '/broken' }, p, opts), recovered);
    assert.equal(requests, before);
    await assert.rejects(downloadSourceBook(root, { ...b, sha256: '0'.repeat(64) }, p, opts));
    await assert.rejects(downloadSourceBook(root, b, p, { ...opts, allowLocalHttp: false }));
    // HTTPS adres denetimi korunur; taşıma yalnız bu testte yerel sunucuya bağlanır.
    const originalFetch = globalThis.fetch;
    const order: string[] = [];
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
      const address = String(url); order.push(address);
      return originalFetch(address.replace('https://fixture.test', base), init);
    }) as typeof fetch;
    try {
      const cache = path.join(root, 'batch');
      const batchPermissions = ['openiti', 'standard-ebooks'].map(source => ({ ...p, source: source as SourceId,
        baseUrl: 'https://fixture.test/', evidenceUrl: 'https://fixture.test/rules' }));
      const batchBooks = [...batchPermissions].reverse().map(permission => ({ ...b, source: permission.source, url: `https://fixture.test/${permission.source}` }));
      const batch = await downloadIntakeSources(cache, batchBooks, batchPermissions, 10);
      assert.deepEqual(order, ['https://fixture.test/openiti', 'https://fixture.test/standard-ebooks']);
      assert.equal(batch.needs_human, true);
      const beforeRepeat = order.length;
      assert.deepEqual(await downloadIntakeSources(cache, batchBooks, batchPermissions, 10), batch);
      assert.equal(order.length, beforeRepeat);
      const io = await localIntakeIO(cache, path.join(root, 'prepared'), batch.localFiles);
      await io.bindPlan!('fixture');
      for (const received of batch.books) {
        const file = await io.acquire(received, 'private', intakeKey(received));
        await io.verify(file);
        assert.equal(file.sha256, first.evidence.sha256);
        assert.equal(file.visibility, 'private');
      }
    } finally { globalThis.fetch = originalFetch; }
    await fs.writeFile(first.file, 'bad');
    await assert.rejects(downloadSourceBook(root, b, p, opts), /uyuşmuyor/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

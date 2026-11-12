import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArabicEpub } from './arabic-epub.ts';
import { prepareLibraryPackage, packageDisposition, type PackageBook, type PackageLayout } from './package.ts';
import { createLibraryReport, checkReaderSample, selectReaderSample } from './report.ts';
import type { ReleasePolicy } from './contracts.ts';
import { verify } from '../../scripts/open-library/prepare.mjs';

const text = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
const data = createArabicEpub({ title: 'Örnek Kitap', author: 'Örnek Yazar', text });
const sha = createHash('sha256').update(data).digest('hex');
const policy: ReleasePolicy = { approvedBy: 'Deneme onaylayan', licenses: ['CC0'], territories: ['TR'] };
const scope = { kind: 'sample' as const, expectedRecords: 20, inventoryComplete: true };
function book(i: number): PackageBook {
  const key = `book-${i}`;
  return { intake: { key, status: 'prepared', reason: 'Doğrulandı.', book: {
    source: 'openiti', id: key, editionId: key, format: 'epub', url: `https://example.org/${key}.epub`, sha256: sha,
    rights: { license: 'CC0', editionId: key, evidenceUrl: 'https://example.org/rights', verifiedBy: 'Deneme',
      verifiedAt: '2026-11-12', territories: ['TR'], redistribution: true },
  }, file: { file: `openiti/public/${key}.epub`, source: 'openiti', visibility: 'public', size: data.length, sha256: sha } },
  preparation: { id: key, status: 'prepared', sha256: sha, reason: 'Okunabilir.' },
  file: { file: `openiti/public/${key}.epub`, source: 'openiti', visibility: 'public', size: data.length, sha256: sha },
  classification: { bookKey: key, author: { status: 'verified', wikidataId: 'Q123', name: 'Örnek Yazar' }, categoryIds: ['edebiyat'], pending: [], complete: true },
  cover: { title: 'Örnek Kitap', author: 'Örnek Yazar' },
  language: 'ar', expectedArabicText: text };
}
const books = () => Array.from({ length: 25 }, (_, i) => book(i));

test('Seçim sabittir; farklı girdi sırası aynı yirmi kitabı verir', () => {
  const rows = books();
  const a = selectReaderSample(rows, 'LOM-102-1'), b = selectReaderSample([...rows].reverse(), 'LOM-102-1');
  assert.deepEqual(a, b); assert.equal(a.books.length, 20);
  assert.notDeepEqual(a.books, selectReaderSample(rows, 'other').books);
  assert.throws(() => selectReaderSample(rows, ''), /boş/);
});

test('Her kaynak ve az sayıdaki Arapça kitap örneğe girer', () => {
  const rows = books(); rows.forEach(b => { b.language = 'en'; }); rows[24].language = 'ar';
  rows[23].intake.book.source = 'gutenberg';
  const sample = selectReaderSample(rows, 'seed').books;
  assert.ok(sample.includes(rows[24])); assert.ok(sample.includes(rows[23]));
});

test('Yirmi kurgusal kitap Loomen EPUB çekirdeğinde açılır ve harekeler korunur', async () => {
  const result = await checkReaderSample(books(), 'seed', async () => data);
  assert.equal(result.passed, true); assert.equal(result.results.length, 20);
  assert.ok(result.results.every(r => r.arabic && r.passed));
});

test('Eksik örnek, bozuk dosya ve eksik özgün Arapça metin başarı sayılmaz', async () => {
  assert.equal((await checkReaderSample([book(0)], 'seed', async () => data)).passed, false);
  const corrupt = await checkReaderSample(books(), 'seed', async () => data.slice(3));
  assert.ok(corrupt.results.every(r => !r.passed));
  const rows = books(); rows.forEach(b => { b.expectedArabicText = undefined; });
  assert.ok((await checkReaderSample(rows, 'seed', async () => data)).results.every(r => !r.passed));
  rows.forEach(b => { b.expectedArabicText = text + ' مَفْقُودٌ'; });
  assert.ok((await checkReaderSample(rows, 'seed', async () => data)).results.every(r => !r.passed));
});

test('İzinler paket sırasında yeniden kontrol edilir; Şamile açık hedefe giremez', () => {
  assert.equal(packageDisposition(book(0), policy).status, 'prepared');
  assert.equal(packageDisposition(book(0)).status, 'held');
  const unknown = book(0); unknown.intake.book.rights = undefined;
  assert.equal(packageDisposition(unknown, policy).status, 'held');
  const shamela = book(1); shamela.intake.book.source = 'shamela';
  assert.throws(() => packageDisposition(shamela, policy), /geçersiz/);
  shamela.file = { ...shamela.file!, source: 'shamela', visibility: 'private', file: 'shamela/private/book.epub' };
  assert.equal(packageDisposition(shamela, policy).status, 'private');
  const invalid = book(0); invalid.file!.file = 'openiti/public/../secret.epub';
  assert.throws(() => packageDisposition(invalid, policy), /geçersiz/);
});

test('Rapor eksik sınıflandırmayı paydada tutar; örnek tam koleksiyon kanıtı değildir', () => {
  const rows = Array.from({ length: 20 }, (_, i) => book(i));
  rows[0].classification = undefined; rows[1].classification = undefined;
  let report = createLibraryReport(rows, { policy, scope, seed: 'seed' });
  assert.equal(report.coverage.public.ratio, 0.9); assert.equal(report.coverage.public.meetsTarget, true);
  assert.equal(report.collectionEvidence, false); assert.equal(report.reader.passed, false);
  rows[2].classification = undefined;
  report = createLibraryReport(rows, { policy, scope, seed: 'seed' });
  assert.equal(report.coverage.public.total, 20); assert.equal(report.coverage.public.meetsTarget, false);
  rows[3].preparation!.status = 'duplicate'; rows[3].preparation!.reason = 'Aynı baskı.';
  rows[4].intake.status = 'held'; rows[4].intake.reason = 'İzin bekleniyor.';
  report = createLibraryReport(rows, { policy, scope, seed: 'seed' });
  assert.equal(report.sources[0].rejected, 1); assert.equal(report.sources[0].held, 1);
  assert.equal(report.sources[0].reasons['Aynı baskı.'], 1);
  const withDuplicates = createLibraryReport(rows, { policy, scope: { ...scope, intakeDuplicates: { openiti: 7 } }, seed: 'seed' });
  assert.equal(withDuplicates.sources[0].rejected, 8);
  assert.equal(withDuplicates.sources[0].records, 27);
  assert.equal(withDuplicates.readyForRelease, false);
  assert.throws(() => createLibraryReport([...rows, rows[0]], { policy, scope: { ...scope, expectedRecords: 21 }, seed: 'seed' }), /iki kez/);
});

test('Yerel paket LOM-101 doğrulamasını geçer; kapalı katalog açık katalogdan ayrıdır', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-package-test-'));
  const input = path.join(root, 'input'), output = path.join(root, 'output');
  const rows = [book(0), book(1), book(2)];
  rows[1].intake.book.source = 'shamela'; rows[1].intake.status = 'private';
  rows[1].file = { ...rows[1].file!, source: 'shamela', visibility: 'private', file: 'shamela/private/book.epub' };
  rows[2].intake.book.rights = undefined;
  for (const row of rows) { const file = path.join(input, row.file!.file); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, data); }
  const layout: PackageLayout = { version: 1, sources: ['openiti', 'shamela'], targets: {
    public: { bucket: 'example-public', prefix: 'books' }, private: { bucket: 'example-private', prefix: 'archive' } } };
  const result = await prepareLibraryPackage({ books: rows, input, output, id: 'sample-1', layout, policy, scope: { ...scope, expectedRecords: 3 }, seed: 'seed' });
  const manifest = await verify(result.directory);
  assert.equal(manifest.files.length, 4);
  const publicCatalog = JSON.parse(await fs.readFile(path.join(result.directory, 'catalog.public.json'), 'utf8'));
  const privateCatalog = JSON.parse(await fs.readFile(path.join(result.directory, 'catalog.private.json'), 'utf8'));
  assert.equal(publicCatalog.books.length, 1); assert.equal(privateCatalog.books[0].source, 'shamela');
  assert.ok(publicCatalog.books[0].cover.file.endsWith('.svg'));
  assert.equal(result.report.covers.passed, true);
  assert.equal(result.report.collectionEvidence, false); assert.equal(result.report.reader.passed, false);
  assert.equal(result.report.sources[0].held, 1);
  await assert.rejects(prepareLibraryPackage({ books: rows, input, output, id: 'sample-1', layout, policy, scope: { ...scope, expectedRecords: 3 }, seed: 'seed' }), /EEXIST/);
  await fs.rename(path.join(result.directory, 'report.json'), path.join(result.directory, 'report.saved.json'));
  // Kesintiyle yarım kalmış kapak taranan girdilerin dışında kalır.
  await fs.writeFile(result.staging + '.interrupted.cover.partial', '<svg');
  const resumed = await prepareLibraryPackage({ books: rows, input, output, id: 'sample-1', layout, policy, scope: { ...scope, expectedRecords: 3 }, seed: 'seed', resume: true });
  assert.deepEqual(resumed.report, result.report);
  assert.deepEqual((await fs.readdir(path.dirname(result.staging))).filter(name => name.endsWith('.cover.partial')), [path.basename(result.staging) + '.interrupted.cover.partial']);
  await assert.rejects(prepareLibraryPackage({ books: rows, input, output, id: 'sample-1', layout, policy, scope: { ...scope, expectedRecords: 3 }, seed: 'changed', resume: true }), /aynı paket/);
  // Test girdileri korunur; geri dönüşsüz silme yapılmaz.
});

test('Dosya bozulması veya sembolik bağlantı pakete alınmaz', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-package-invalid-'));
  const row = book(0), input = path.join(root, 'input');
  const file = path.join(input, row.file!.file);
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'broken');
  const layout: PackageLayout = { version: 1, sources: ['openiti'], targets: { public: { bucket: 'public-example', prefix: 'books' }, private: { bucket: 'private-example', prefix: 'archive' } } };
  const options = { books: [row], input, output: path.join(root, 'out'), id: 'sample', layout, policy, scope: { ...scope, expectedRecords: 1 }, seed: 'seed' };
  await assert.rejects(prepareLibraryPackage(options), /bozulmuş/);
  const linked = book(1); await fs.symlink(file, path.join(input, linked.file!.file));
  await assert.rejects(prepareLibraryPackage({ ...options, id: 'sample-links', books: [linked] }), /normal dosya/);
});

test('Yayıma hazırlık için tam envanter, yirmi okuma kontrolü ve yüzde doksan birlikte gerekir', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loomen-package-gates-'));
  const rows = Array.from({ length: 20 }, (_, i) => book(i)), input = path.join(root, 'input');
  for (const row of rows) { const file = path.join(input, row.file!.file); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, data); }
  const layout: PackageLayout = { version: 1, sources: ['openiti'], targets: { public: { bucket: 'public-example', prefix: 'books' }, private: { bucket: 'private-example', prefix: 'archive' } } };
  const options = { books: rows, input, output: path.join(root, 'out'), id: 'complete', layout, policy, scope: { ...scope, kind: 'collection' as const }, seed: 'seed' };
  const complete = await prepareLibraryPackage(options);
  assert.equal(complete.report.readyForRelease, true);
  assert.equal(complete.report.covers.passed, true);
  const missingCover = rows[0].cover;
  rows[0].cover = undefined;
  const uncovered = await prepareLibraryPackage({ ...options, id: 'uncovered' });
  assert.equal(uncovered.report.reader.passed, true);
  assert.equal(uncovered.report.readyForRelease, false);
  assert.equal(uncovered.report.covers.passed, false);
  rows[0].cover = { title: '\u0000', author: 'Örnek' };
  const invalidCover = await prepareLibraryPackage({ ...options, id: 'invalid-cover' });
  assert.equal(invalidCover.report.readyForRelease, false);
  rows[0].cover = missingCover;
  rows.slice(0, 3).forEach(b => { b.classification = undefined; });
  const incomplete = await prepareLibraryPackage({ ...options, id: 'incomplete' });
  assert.equal(incomplete.report.reader.passed, true);
  assert.equal(incomplete.report.readyForRelease, false);
});

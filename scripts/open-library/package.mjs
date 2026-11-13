// Açık kitaplık 4/4: yükleme paketi ve sonuç raporu. Yalnız Node yerleşikleri (okuyucu kontrolü hariç,
// o `npm install` ister). Ağ, yükleme ve silme yok.
//
//   package.mjs run <düzen.json> <kurallar.json> <alım> <ayıklanmış> <katalog> <çıktı> <çekim> --mode sample|full [--seed <değer>] [--resume]
//
// Sıra: tutarlılık denetimi (hiçbir şey yazılmaz) → prepare() ile çekim → verify() → paket dosyaları.
// Paket çekim klasörünün altında `package/` içindedir:
//   books.public.json, books.private.json, authors.json, categories.tr.json,
//   report.<kip>.json, report.<kip>.md, reader-check.<kip>.json
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepare, validateLayout, verify } from './prepare.mjs';
import { buildReport, MODES, renderReport } from './report.mjs';
import { checkBooks, pickSample } from './reader-check.mjs';
import { validateRules } from './rights.mjs';

const fail = (message) => { throw new Error(message); };
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const sha = (data) => createHash('sha256').update(data).digest('hex');
const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_SIZE = 20;
const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

async function lstat(p) { try { return await fs.lstat(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
async function readRegular(file) {
  const s = await lstat(file);
  if (!s) return null;
  if (s.isSymbolicLink() || !s.isFile()) fail(`Sıradan dosya bekleniyordu (bağlantı olamaz): ${file}`);
  return fs.readFile(file);
}
async function readJson(file, required = true) {
  const bytes = await readRegular(file);
  if (!bytes) { if (required) fail(`Dosya yok: ${file}`); return null; }
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail(`Dosya okunamadı: ${file}`); }
}
async function listDir(dir) {
  const s = await lstat(dir);
  if (!s) return [];
  if (s.isSymbolicLink() || !s.isDirectory()) fail(`Klasör bekleniyordu, bağlantı ya da dosya var: ${dir}`);
  return (await fs.readdir(dir)).sort();
}
async function resolveFuture(p) {
  p = path.resolve(p);
  const rest = [];
  for (;;) {
    try { return path.join(await fs.realpath(p), ...rest); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      rest.unshift(path.basename(p));
      const up = path.dirname(p);
      if (up === p) throw e;
      p = up;
    }
  }
}
const nested = (a, b) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);

async function readRecords(intake, order) {
  const records = [];
  for (const source of order) {
    for (const name of await listDir(path.join(intake, 'records', source))) {
      if (!name.endsWith('.json')) continue;
      const record = await readJson(path.join(intake, 'records', source, name));
      if (!record || record.source !== source || typeof record.key !== 'string' || !['public', 'private', 'held'].includes(record.decision)) fail(`Alım kaydı geçersiz: records/${source}/${name}`);
      records.push(record);
    }
  }
  return records;
}
async function readBooks(curated) {
  const books = [];
  for (const source of await listDir(path.join(curated, 'books'))) {
    for (const name of await listDir(path.join(curated, 'books', source))) {
      if (!name.endsWith('.json')) continue;
      const book = await readJson(path.join(curated, 'books', source, name));
      if (!book || book.key !== `${source}:${name.slice(0, -5)}` || book.source !== source || !['public', 'private'].includes(book.decision)
        || !book.file || !book.cover?.file) fail(`Kitap kaydı geçersiz: books/${source}/${name}`);
      books.push(book);
    }
  }
  return books;
}
async function inputFiles(dir, prefix = '') {
  const out = [];
  for (const name of await listDir(path.join(dir, prefix))) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (name === '.DS_Store' || name.startsWith('._')) continue;
    const s = await fs.lstat(path.join(dir, rel));
    if (s.isDirectory() && !s.isSymbolicLink()) out.push(...await inputFiles(dir, rel));
    else out.push(rel);
  }
  return out;
}

/** Katalog, kitap kayıtları, alım kayıtları ve dosyalar birbirini tutuyor mu? Tutmuyorsa durur. */
async function checkConsistency({ curated, books, rows, records }) {
  const bookKeys = new Set(books.map(b => b.key)), rowKeys = new Set(rows.map(r => r.key));
  if (bookKeys.size !== books.length || rowKeys.size !== rows.length) fail('Tutarsızlık: aynı kitap anahtarı iki kez geçiyor.');
  const missing = [...bookKeys].filter(k => !rowKeys.has(k)), extra = [...rowKeys].filter(k => !bookKeys.has(k));
  if (missing.length || extra.length)
    fail(`Katalog ile kitap kayıtları uyuşmuyor (katalogda olmayan: ${missing.length}, kayıtta olmayan: ${extra.length}). Önce katalog.mjs'i güncel ayıklama çıktısıyla yeniden çalıştır.`);
  const rowOf = new Map(rows.map(r => [r.key, r])), recordOf = new Map(records.map(r => [r.key, r]));
  for (const b of books) {
    if (rowOf.get(b.key).decision !== b.decision) fail(`Tutarsızlık: ${b.key} katalogda ${rowOf.get(b.key).decision}, kitap kaydında ${b.decision}.`);
    const rec = recordOf.get(b.key);
    if (!rec) fail(`Tutarsızlık: ${b.key} için alım kaydı yok.`);
    if (rec.decision !== b.decision) fail(`Tutarsızlık: ${b.key} alım kaydında ${rec.decision}, kitap kaydında ${b.decision}.`);
    for (const f of [b, b.cover]) {
      const m = typeof f.file === 'string' && f.file.match(/^input\/([^/]+)\/(public|private)\/([^/]+)$/);
      if (!m || m[1] !== b.source || m[2] !== b.decision) fail(`Tutarsızlık: ${b.key} dosya yolu kararıyla uyuşmuyor (${f.file}).`);
      const bytes = await readRegular(path.join(curated, f.file));
      if (!bytes) fail(`Tutarsızlık: ${b.key} dosyası yok (${f.file}).`);
      if (bytes.length !== f.size || sha(bytes) !== f.sha256) fail(`Tutarsızlık: ${b.key} dosyası kayıttaki boyut ya da SHA-256 ile uyuşmuyor (${f.file}).`);
    }
  }
  // Çekime girecek her dosya bir kitaba ya da kapağa ait olmalı.
  const expected = new Set(books.flatMap(b => [b.file, b.cover.file]));
  const actual = new Set((await inputFiles(path.join(curated, 'input'))).map(f => `input/${f}`));
  for (const f of actual) if (!expected.has(f)) fail(`Ayıklanmış girdide hiçbir kitaba ait olmayan dosya var: ${f}`);
  for (const f of expected) if (!actual.has(f)) fail(`Kitap kaydındaki dosya girdide yok: ${f}`);
}

function expectedUploads(layout, id, books) {
  const rows = [];
  for (const b of books) for (const [kind, f] of [['book', b], ['cover', b.cover]]) {
    const rel = f.file.slice('input/'.length), target = layout.targets[b.decision];
    rows.push({ owner: b.key, kind, visibility: b.decision, file: rel, bucket: target.bucket, key: `${target.prefix}/snapshots/${id}/${rel}`, size: f.size, sha256: f.sha256 });
  }
  return rows;
}
// Açık ve kapalı ayrımının çapraz denetimi.
function crossCheck(layout, rows) {
  const pub = layout.targets.public.bucket, priv = layout.targets.private.bucket;
  for (const r of rows) {
    if (r.visibility === 'public' && r.bucket !== pub) fail(`Çapraz denetim: açık satır kapalı depoya gidiyor (${r.owner}).`);
    if (r.visibility === 'private' && r.bucket !== priv) fail(`Çapraz denetim: kapalı satır açık depoya gidiyor (${r.owner}).`);
    if (r.visibility === 'private' && r.bucket === pub) fail(`Çapraz denetim: kapalı kitap açık depoda (${r.owner}).`);
  }
  const seen = new Set();
  for (const r of rows) { if (seen.has(`${r.bucket}/${r.key}`)) fail(`Çapraz denetim: aynı nesne yolu iki satırda (${r.key}).`); seen.add(`${r.bucket}/${r.key}`); }
}

async function writePackageFiles(dir, files) {
  const pkg = path.join(dir, 'package');
  try { await fs.mkdir(pkg); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const s = await fs.lstat(pkg);
  if (!s.isDirectory() || s.isSymbolicLink()) fail('Paket klasörü bağlantı olamaz.');
  // Önce hepsi denetlenir: farklı bir dosya varsa hiçbiri yazılmaz.
  const todo = [];
  for (const [name, data] of Object.entries(files)) {
    const existing = await readRegular(path.join(pkg, name));
    if (existing) { if (!existing.equals(Buffer.from(data))) fail(`Pakette farklı bir dosya var, üstüne yazılmadı: package/${name}`); continue; }
    todo.push([name, data]);
  }
  for (const [name, data] of todo) {
    const file = path.join(pkg, name), tmp = `${file}.${randomUUID()}.partial`;
    await fs.writeFile(tmp, data, { flag: 'wx' });
    try { await fs.link(tmp, file); } finally { await fs.unlink(tmp); }
  }
  return pkg;
}

/**
 * @param {{ layout: object, rules: object, intake: string, curated: string, catalog: string, output: string,
 *   id: string, mode: 'sample'|'full', seed?: string, resume?: boolean }} options
 */
export async function pack({ layout, rules, intake, curated, catalog, output, id, mode, seed, resume = false }) {
  if (!MODES.includes(mode)) fail("Kip 'sample' ya da 'full' olmalı; varsayılanı yok.");
  validateRules(rules);
  validateLayout(layout);
  seed = String(seed ?? id);
  intake = await fs.realpath(intake);
  curated = await fs.realpath(curated);
  catalog = await fs.realpath(catalog);
  output = await resolveFuture(output);
  for (const dir of [intake, curated, catalog]) if (nested(output, dir)) fail('Çıktı klasörü girdi klasörleriyle iç içe olamaz.');

  const records = await readRecords(intake, rules.order);
  const books = (await readBooks(curated)).sort((a, b) => (rules.order.indexOf(a.source) - rules.order.indexOf(b.source)) || byKey(a, b));
  if (!books.length) fail('Pakete girecek kitap yok.');
  const catalogJson = await readJson(path.join(catalog, 'catalog.json'));
  const authorsBytes = await readRegular(path.join(catalog, 'authors.json'));
  if (!authorsBytes) fail('Katalogda authors.json yok.');
  const authors = JSON.parse(authorsBytes.toString('utf8'));
  const rows = catalogJson?.books;
  if (!Array.isArray(rows)) fail('catalog.json geçersiz.');
  const pending = (await readJson(path.join(catalog, 'reports/pending-suggestions.json'), false)) ?? [];
  const broken = (await readJson(path.join(curated, 'reports/broken.json'), false)) ?? [];
  const duplicates = (await readJson(path.join(curated, 'reports/duplicates.json'), false)) ?? [];
  const editions = (await readJson(path.join(curated, 'reports/editions.json'), false)) ?? [];

  // 1. Tutarlılık ve çapraz denetim — bu noktaya kadar hiçbir şey yazılmadı.
  await checkConsistency({ curated, books, rows, records });
  const uploadRows = expectedUploads(layout, id, books);
  crossCheck(layout, uploadRows);

  // 2. Çekim.
  const dir = await prepare({ layout, input: path.join(curated, 'input'), output, id, resume });
  await verify(dir);
  const actualUploads = await readJson(path.join(dir, 'uploads.json'));
  const norm = (list) => list.map(u => `${u.bucket}|${u.key}|${u.size}|${u.sha256}`).sort().join('\n');
  if (norm(actualUploads) !== norm(uploadRows)) fail('Yükleme listesi kitap kayıtlarıyla uyuşmuyor; hiçbir paket dosyası yazılmadı.');

  // 3. Okuyucu kontrolü ve rapor.
  const keys = books.map(b => b.key);
  const picked = pickSample(keys, SAMPLE_SIZE, seed);
  const bookOf = new Map(books.map(b => [b.key, b]));
  const results = await checkBooks(picked.map(k => ({ key: k, path: path.join(curated, bookOf.get(k).file), ext: path.extname(bookOf.get(k).file).slice(1) })));
  const readerCheck = {
    seed, requested: SAMPLE_SIZE, tried: picked.length, fewerThanRequested: keys.length < SAMPLE_SIZE,
    opened: results.filter(r => r.opened).length,
    failed: results.filter(r => !r.opened).map(r => ({ key: r.key, reason: r.reason })),
    picked,
    unsupportedInPackage: books.filter(b => !['epub', 'pdf'].includes(path.extname(b.file).slice(1).toLowerCase())).length,
  };
  const report = buildReport({ mode, order: rules.order, records, books, broken, duplicates, editions, catalog: catalogJson, authors, pending, readerCheck });

  // 4. Paket dosyaları.
  const rowOf = new Map(rows.map(r => [r.key, r]));
  const objectOf = (b, f) => {
    const u = uploadRows.find(x => x.owner === b.key && x.file === f.file.slice('input/'.length));
    return { bucket: u.bucket, key: u.key, size: f.size, sha256: f.sha256 };
  };
  const list = (decision) => ({
    version: 1, snapshot: id, visibility: decision,
    books: books.filter(b => b.decision === decision).map(b => ({
      key: b.key, title: b.title, authorId: rowOf.get(b.key).authorId ?? null, category: rowOf.get(b.key).category ?? null,
      language: b.language ?? '', file: objectOf(b, b), cover: objectOf(b, b.cover),
    })),
  });
  const tree = await fs.readFile(path.join(here, 'categories.tr.json'));
  const pkg = await writePackageFiles(dir, {
    'books.public.json': json(list('public')),
    'books.private.json': json(list('private')),
    'authors.json': authorsBytes,
    'categories.tr.json': tree,
    [`report.${mode}.json`]: json(report),
    [`report.${mode}.md`]: renderReport(report),
    [`reader-check.${mode}.json`]: json(readerCheck),
  });
  return { dir, package: pkg, report, readerCheck, public: books.filter(b => b.decision === 'public').length, private: books.filter(b => b.decision === 'private').length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, ...rest] = process.argv.slice(2);
    const pos = [], opt = {};
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--mode' || rest[i] === '--seed') { if (!rest[i + 1]) fail(`${rest[i]} için değer yazılmamış.`); opt[rest[i].slice(2)] = rest[++i]; }
      else if (rest[i] === '--resume') opt.resume = true;
      else pos.push(rest[i]);
    }
    if (command !== 'run' || pos.length !== 7) fail('Kullanım: package.mjs run <düzen.json> <kurallar.json> <alım> <ayıklanmış> <katalog> <çıktı> <çekim> --mode sample|full [--seed <değer>] [--resume]');
    if (!MODES.includes(opt.mode)) fail("--mode zorunlu: 'sample' (örnek deneme) ya da 'full' (gerçek toplu işlem).");
    const r = await pack({
      layout: JSON.parse(await fs.readFile(pos[0], 'utf8')), rules: JSON.parse(await fs.readFile(pos[1], 'utf8')),
      intake: pos[2], curated: pos[3], catalog: pos[4], output: pos[5], id: pos[6], mode: opt.mode, seed: opt.seed, resume: opt.resume === true,
    });
    const rc = r.readerCheck;
    console.log(`Kip: ${opt.mode === 'sample' ? 'ÖRNEK DENEME (tam koleksiyonun sonucu değildir)' : 'gerçek toplu işlem'}`);
    console.log(`Açık kitap: ${r.public} · Kapalı kitap: ${r.private}`);
    console.log(rc.fewerThanRequested
      ? `Okuyucu kontrolü: pakette ${rc.requested} kitaptan az var; ${rc.tried} kitabın ${rc.opened} tanesi açıldı. Bu ${rc.requested} kitap kontrolü sayılmaz.`
      : `Okuyucu kontrolü: rastgele ${rc.tried} kitabın ${rc.opened} tanesi açıldı.`);
    for (const f of rc.failed) console.log(`  Açılmadı: ${f.key} — ${f.reason}`);
    console.log(`Paket klasörü: ${r.package}`);
    console.log('Hiçbir yere yükleme yapılmadı.');
  } catch (error) { console.error(`Paket hazırlanamadı: ${error.message}`); process.exitCode = 1; }
}

// Açık kitaplık 3/4: yazarları birleştirir, kitapları Türkçe kategorilere yerleştirir.
// Çevrimdışı; ağ ve yükleme yok. Yalnız Node yerleşikleri. Girdiye hiçbir şey yazılmaz.
//
// Girdi: curate.mjs çıktı klasörü (yalnız books/<kaynak>/<id>.json okunur).
//   --hints <klasör>      <kaynak>.jsonl  satır: { id, subjects?, sourceCategory? }
//   --decisions <klasör>  suggestions.jsonl { key, category, by, note? }, approvals.jsonl { key, category, approvedBy }
// Çıktı: authors.json, catalog.json, reports/{author-review,pending-suggestions,uncategorized,summary}.json
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mergeAuthors } from './authors.mjs';
import { applyDecisions, classify, validateConfig, validateTree } from './classify.mjs';
import { segment } from './rights.mjs';

const fail = (message) => { throw new Error(message); };
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

async function stat(p) {
  try { return await fs.lstat(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function listDir(dir) {
  const s = await stat(dir);
  if (!s) return [];
  if (s.isSymbolicLink() || !s.isDirectory()) fail(`Klasör bekleniyordu, bağlantı ya da dosya var: ${dir}`);
  return (await fs.readdir(dir)).sort(byId);
}
async function readRegular(file) {
  const s = await stat(file);
  if (!s) return null;
  if (s.isSymbolicLink() || !s.isFile()) fail(`Sıradan dosya bekleniyordu (bağlantı olamaz): ${file}`);
  return fs.readFile(file, 'utf8');
}
async function readJsonl(file) {
  const text = await readRegular(file);
  if (text === null) return [];
  const rows = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('nesne değil');
      rows.push(row);
    } catch { fail(`${path.basename(file)} ${i + 1}. satır okunamadı.`); }
  });
  return rows;
}
// Henüz olmayan çıktı klasörünün gerçek yolu (var olan en yakın üst klasör + kalan).
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

async function readBooks(curated) {
  const books = [];
  const booksDir = path.join(curated, 'books');
  for (const source of await listDir(booksDir)) {
    if (!segment(source)) fail(`books/ altında geçersiz kaynak adı: ${source}`);
    for (const name of await listDir(path.join(booksDir, source))) {
      if (!name.endsWith('.json')) continue;
      const where = `books/${source}/${name}`;
      const text = await readRegular(path.join(booksDir, source, name));
      let book;
      try { book = JSON.parse(text); } catch { fail(`Kitap kaydı okunamadı: ${where}`); }
      const id = name.slice(0, -5);
      if (!book || typeof book !== 'object' || book.source !== source || book.id !== id || book.key !== `${source}:${id}`
        || typeof book.title !== 'string' || (book.decision !== 'public' && book.decision !== 'private')
        || (book.author != null && typeof book.author !== 'string')) fail(`Kitap kaydı geçersiz: ${where}`);
      books.push({ key: book.key, source, id, title: book.title, author: book.author ?? '', decision: book.decision });
    }
  }
  return books;
}

async function writeOut(output, rel, value) {
  const file = path.join(output, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const dirStat = await fs.lstat(path.dirname(file));
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) fail('Çıktı klasöründe bağlantı olamaz.');
  const tmp = path.join(output, '.tmp', `${randomUUID()}.partial`);
  await fs.mkdir(path.dirname(tmp), { recursive: true });
  await fs.writeFile(tmp, json(value), { flag: 'wx' });
  await fs.rename(tmp, file);
}

/**
 * @param {{ config: object, tree: object[]|{tree: object[]}, curated: string, output: string,
 *           hints?: string, decisions?: string, log?: Function }} options
 */
export async function catalog({ config, tree, curated, output, hints, decisions, log = () => {} }) {
  tree = Array.isArray(tree) ? tree : tree?.tree;
  const { order } = validateTree(tree);
  validateConfig(config, tree);
  curated = await fs.realpath(curated);
  const inputs = [curated];
  if (hints) inputs.push(hints = await fs.realpath(hints));
  if (decisions) inputs.push(decisions = await fs.realpath(decisions));
  output = await resolveFuture(output);
  for (const dir of inputs) if (nested(output, dir)) fail('Çıktı klasörü girdi klasörleriyle iç içe olamaz.');

  const books = await readBooks(curated);
  const keys = new Set(books.map(b => b.key));
  for (const key of Object.keys(config.overrides ?? {})) if (!keys.has(key)) log(`Uyarı: elle atamada kitap yok, yok sayıldı: ${key}`);

  const hintOf = new Map();
  if (hints) {
    for (const source of [...new Set(books.map(b => b.source))]) {
      for (const row of await readJsonl(path.join(hints, `${source}.jsonl`))) {
        if (typeof row.id !== 'string' || !keys.has(`${source}:${row.id}`)) { log(`Uyarı: ${source}.jsonl içinde kitabı olmayan ipucu var: ${row.id}`); continue; }
        if (row.subjects !== undefined && (!Array.isArray(row.subjects) || row.subjects.some(s => typeof s !== 'string'))) fail(`${source}.jsonl: "${row.id}" konuları metin dizisi olmalı.`);
        if (row.sourceCategory !== undefined && typeof row.sourceCategory !== 'string') fail(`${source}.jsonl: "${row.id}" kaynak kategorisi metin olmalı.`);
        hintOf.set(`${source}:${row.id}`, row);
      }
    }
  }

  const authors = mergeAuthors(books, config.authorAliases ?? [], config.separate ?? []);

  const placed = new Map();
  const unmatched = [];
  for (const book of books) {
    const r = classify(book, hintOf.get(book.key), config, tree);
    if (r.category) placed.set(book.key, r); else unmatched.push(book);
  }
  const suggestions = decisions ? await readJsonl(path.join(decisions, 'suggestions.jsonl')) : [];
  const approvals = decisions ? await readJsonl(path.join(decisions, 'approvals.jsonl')) : [];
  const applied = applyDecisions(unmatched, suggestions, approvals, tree, keys);
  for (const w of applied.warnings) log(`Uyarı: ${w}`);
  for (const [key, r] of applied.placed) placed.set(key, r);
  const pendingKeys = new Set(applied.pending.map(p => p.key));
  const titleOf = new Map(books.map(b => [b.key, b.title]));

  const rows = books.map(b => ({
    key: b.key, source: b.source, id: b.id, title: b.title, decision: b.decision,
    authorId: authors.bookAuthor[b.key], category: placed.get(b.key)?.category ?? null, categoryBy: placed.get(b.key)?.by ?? null,
  }));
  const uncategorized = unmatched.filter(b => !placed.has(b.key) && !pendingKeys.has(b.key)).map(b => ({
    key: b.key, source: b.source, id: b.id, title: b.title, author: b.author, decision: b.decision,
    subjects: hintOf.get(b.key)?.subjects ?? [], sourceCategory: hintOf.get(b.key)?.sourceCategory ?? null,
  }));

  // Sayıma yalnız elle, şamile, kural ve onay ile yerleşenler girer; öneriler girmez.
  const counts = new Map();
  for (const r of rows) {
    if (!r.category) continue;
    const c = counts.get(r.category) ?? { public: 0, private: 0 };
    c[r.decision]++;
    counts.set(r.category, c);
  }
  const byCategory = {};
  for (const id of order) if (counts.has(id)) byCategory[id] = counts.get(id);
  const mergedSpellings = authors.authors.reduce((n, a) => n + a.variants.length - 1, 0);
  const summary = {
    version: 1, books: books.length, authors: authors.authors.length, mergedSpellings,
    unknownAuthor: authors.unknown.length, authorReview: authors.review.length,
    categorized: placed.size, pending: applied.pending.length, uncategorized: uncategorized.length, byCategory,
  };

  await fs.mkdir(output, { recursive: true });
  await fs.rm(path.join(output, '.tmp'), { recursive: true, force: true });
  await writeOut(output, 'authors.json', { version: 1, authors: authors.authors, unknown: authors.unknown });
  await writeOut(output, 'catalog.json', { version: 1, books: rows });
  await writeOut(output, 'reports/author-review.json', authors.review);
  await writeOut(output, 'reports/pending-suggestions.json', applied.pending.map(p => ({ key: p.key, title: titleOf.get(p.key), category: p.category, by: p.by, note: p.note })));
  await writeOut(output, 'reports/uncategorized.json', uncategorized);
  await writeOut(output, 'reports/summary.json', summary);
  await fs.rm(path.join(output, '.tmp'), { recursive: true, force: true });
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, ...rest] = process.argv.slice(2);
    const pos = [], opt = {};
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--hints' || rest[i] === '--decisions') { if (!rest[i + 1]) fail(`${rest[i]} için klasör yazılmamış.`); opt[rest[i].slice(2)] = rest[++i]; }
      else pos.push(rest[i]);
    }
    if (command !== 'run' || pos.length !== 3) fail('Kullanım: catalog.mjs run <ayar.json> <ayıklanmış-klasör> <katalog-klasörü> [--hints <klasör>] [--decisions <klasör>]');
    const config = JSON.parse(await fs.readFile(pos[0], 'utf8'));
    const treeFile = JSON.parse(await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'categories.tr.json'), 'utf8'));
    if (treeFile.version !== 1) fail('categories.tr.json sürümü desteklenmiyor.');
    const s = await catalog({ config, tree: treeFile.tree, curated: pos[1], output: pos[2], hints: opt.hints, decisions: opt.decisions, log: (m) => console.log(m) });
    console.log(`\nKitap: ${s.books} · Yazar: ${s.authors} · Birleşen yazım: ${s.mergedSpellings} · Gözden geçirmeye kalan eşleşme: ${s.authorReview}`);
    console.log(`Kategorili kitap: ${s.categorized} · Onay bekleyen öneri: ${s.pending} · Kategorisiz kitap: ${s.uncategorized}`);
    console.log('Onaysız öneriler sayıma girmedi.');
    console.log('Hiçbir yere yükleme yapılmadı.');
  } catch (error) { console.error(`Katalog tamamlanamadı: ${error.message}`); process.exitCode = 1; }
}

// Açık kitaplık 2/4: alınan kitapları ayıklar. Çevrimdışı; yükleme, ağ ve silme yok. Yalnız Node yerleşikleri.
//
// Girdi: intake.mjs çalışma klasörü (records/ ve input/). Bekleyenler (held) işlenmez.
// Çıktı klasörü (alım klasörüyle iç içe olamaz):
//   input/<kaynak>/<public|private>/<id>.<uzantı>        prepare.mjs'in doğrudan girdisi
//   input/<kaynak>/<public|private>/<id>.cover.<uzantı>  kapak (hazır ya da üretilen)
//   books/<kaynak>/<id>.json                              kitap kaydı (3/4 bunu kullanır)
//   reports/broken.json | duplicates.json | editions.json
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildArabicEpub, isArabicText, parseArabicText } from './arabic-epub.mjs';
import { extractCover, makeCover } from './cover.mjs';
import { contentKey, editionGroups, groupDuplicates } from './dedupe.mjs';
import { inspect } from './health.mjs';
import { fileName, segment, validateRules } from './rights.mjs';
import { readZip } from './zip.mjs';

const fail = (message) => { throw new Error(message); };
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const sha = (data) => createHash('sha256').update(data).digest('hex');
const exists = (file) => fs.lstat(file).then(() => true, (e) => { if (e.code === 'ENOENT') return false; throw e; });
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

async function directories(root, rel) {
  let current = root;
  for (const part of rel.split('/')) {
    current = path.join(current, part);
    try { await fs.mkdir(current); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Çıktı klasöründe bağlantı olamaz.');
  }
  return current;
}
// Geçici dosyalar input/ dışında, çıktı kökündeki .tmp/ klasöründe durur; hazırlık aracı oraya bakmaz.
async function tempFile(root) {
  const dir = await directories(root, '.tmp');
  return path.join(dir, `${randomUUID()}.partial`);
}
/** Üstüne yazmaz: geçici dosya + link. Hedef varsa baytlar aynıysa geçer (kesinti sonrası), değilse durur. */
async function publish(root, rel, data) {
  const dir = await directories(root, path.posix.dirname(rel));
  const file = path.join(dir, path.posix.basename(rel));
  const tmp = await tempFile(root);
  await fs.writeFile(tmp, data, { flag: 'wx' });
  try { await fs.link(tmp, file); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    if (!(await fs.readFile(file)).equals(Buffer.from(data))) fail(`Çıktıda farklı bir dosya var, üstüne yazılmadı: ${rel}`);
  } finally { await fs.unlink(tmp); }
}
async function replaceText(root, rel, text) {
  const dir = await directories(root, path.posix.dirname(rel));
  const file = path.join(dir, path.posix.basename(rel));
  const tmp = await tempFile(root);
  await fs.writeFile(tmp, text, { flag: 'wx' });
  await fs.rename(tmp, file);
}
async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return null;
    if (e instanceof SyntaxError) fail(`Kayıt dosyası okunamadı: ${file}`);
    throw e;
  }
}
const listDir = async (dir) => { try { return await fs.readdir(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } };

// Çıktıda yayımlanmış bir kitabın kaydı ve dosyaları sağlam mı? Değilse durur.
async function verifyPublished(output, book) {
  for (const f of [book, book.cover]) {
    const file = path.join(output, f.file);
    let bytes;
    try { bytes = await fs.readFile(file); }
    catch (e) { if (e.code === 'ENOENT') fail(`${book.key}: kayıt var ama dosya eksik (${f.file}). Üstüne yazılmadı.`); throw e; }
    if (bytes.length !== f.size || sha(bytes) !== f.sha256) fail(`${book.key}: çıktı dosyası bozulmuş (${f.file}). Üstüne yazılmadı.`);
  }
}

/**
 * @param {{ rules: object, work: string, output: string, log?: Function }} options
 */
export async function curate({ rules, work, output, log = () => {} }) {
  validateRules(rules);
  work = await fs.realpath(work);
  await fs.mkdir(output, { recursive: true });
  output = await fs.realpath(output);
  await fs.rm(path.join(output, '.tmp'), { recursive: true, force: true }); // önceki kesintiden kalan yarım geçici dosyalar
  if (output === work || output.startsWith(work + path.sep) || work.startsWith(output + path.sep)) fail('Alım ve çıktı klasörleri iç içe olamaz.');

  // 1. Kayıtlar: yalnız public/private, kaynak sırası ve kimlik sırasıyla.
  const items = [], broken = [];
  for (const source of rules.order) {
    const names = (await listDir(path.join(work, 'records', source))).filter(n => n.endsWith('.json')).sort(byId);
    for (const name of names) {
      const record = await readJson(path.join(work, 'records', source, name));
      if (!record || (record.decision !== 'public' && record.decision !== 'private')) continue;
      const m = typeof record.file === 'string' && record.file.match(/^input\/([^/]+)\/(public|private)\/([^/]+)$/);
      if (!m || m[1] !== source || m[2] !== record.decision || record.key !== `${source}:${record.id}` || !segment(record.id))
        fail(`${record.key ?? name}: kayıt geçersiz (records/${source}/${name}).`);
      let bytes;
      try { bytes = await fs.readFile(path.join(work, record.file)); }
      catch (e) { if (e.code === 'ENOENT') fail(`${record.key}: dosya eksik (${record.file}).`); throw e; }
      if (bytes.length !== record.size || sha(bytes) !== record.sha256) fail(`${record.key}: dosya bütünlüğü bozulmuş (${record.file}).`);
      const ext = path.extname(m[3]).slice(1).toLowerCase();
      const health = inspect(bytes, ext);
      if (!health.ok) { broken.push({ key: record.key, reason: health.reason }); log(`Bozuk: ${record.key} — ${health.reason}`); continue; }
      const meta = health.meta;
      const arabic = ext === 'txt' && isArabicText(meta.text);
      items.push({
        key: record.key, source, id: record.id, decision: record.decision, sha256: record.sha256, ext, record, arabic,
        contentKey: contentKey(bytes),
        meta: { title: meta.title ?? '', creator: meta.creator ?? '', language: meta.language ?? '', cover: meta.cover ?? null },
      });
    }
  }

  // 2. Tekrarlar.
  const { kept, dropped } = groupDuplicates(items, rules.order);
  for (const { item, keptBy } of dropped) {
    const leftovers = (await listDir(path.join(output, `input/${item.source}/${item.decision}`))).filter(n => n.startsWith(`${item.id}.`));
    if (leftovers.length) fail(`${item.key}: çıktıda bu kimlikle dosya kalmış (${leftovers[0]}) ama kitap artık tekrar çıkıyor (${keptBy.key} kalıyor). Hiçbir dosya silinmedi; yeni bir çıktı klasörü kullan.`);
    if (await exists(path.join(output, `books/${item.source}/${item.id}.json`)))
      fail(`${item.key}: çıktıda yayımlanmış kitap artık tekrar çıkıyor (${keptBy.key} kalıyor). Hiçbir dosya taşınmadı ya da silinmedi; yeni bir çıktı klasörü kullan.`);
  }

  // 3. Kazananlar.
  const summary = { ready: 0, broken: broken.length, duplicates: dropped.length, converted: 0, coversFound: 0, coversGenerated: 0, editions: 0 };
  const books = [];
  for (const item of kept) {
    const { record } = item;
    const bookRel = `books/${item.source}/${item.id}.json`;
    const existing = await readJson(path.join(output, bookRel));
    if (existing) {
      if (existing.key !== item.key || existing.sourceSha256 !== item.sha256) fail(`${item.key}: çıktıdaki kayıt bu kitapla uyuşmuyor (${bookRel}).`);
      await verifyPublished(output, existing);
      books.push(existing);
    } else {
      const bytes = await fs.readFile(path.join(work, record.file));
      let data = bytes, ext = item.ext, title = record.title || item.meta.title, author = item.meta.creator, language = item.meta.language;
      let converted = false, cover = null, coverSvg = null;
      if (item.arabic) {
        const parsed = parseArabicText(new TextDecoder('utf-8').decode(bytes));
        if (!parsed.chapters.length) { broken.push({ key: item.key, reason: 'Arapça metinden okunabilir bölüm çıkmadı.' }); summary.broken++; continue; }
        title = title || parsed.title || item.id;
        author = author || parsed.author;
        language = 'ar';
        coverSvg = makeCover({ title, author, key: item.key, rtl: true });
        data = buildArabicEpub({ title, author, id: item.sha256, modified: record.at, chapters: parsed.chapters, coverSvg });
        ext = 'epub'; converted = true;
      } else if (item.ext === 'epub') {
        cover = extractCover(readZip(bytes), item.meta);
      }
      title = title || item.id;
      let coverType = 'hazır';
      if (!cover) {
        coverType = 'üretildi';
        const svg = coverSvg ?? makeCover({ title, author, key: item.key, rtl: /\p{Script=Arabic}/u.test(title) });
        cover = { bytes: Buffer.from(svg, 'utf8'), ext: 'svg' };
      }
      const dir = `input/${item.source}/${item.decision}`;
      const fileRel = `${dir}/${item.id}.${ext}`, coverRel = `${dir}/${item.id}.cover.${cover.ext}`;
      if (!fileName(path.posix.basename(fileRel)) || !fileName(path.posix.basename(coverRel))) fail(`${item.key}: dosya adı hazırlık kuralına uymuyor.`);
      const book = {
        version: 1, key: item.key, source: item.source, id: item.id, title, author, language, decision: item.decision,
        file: fileRel, size: data.length, sha256: sha(data), sourceSha256: item.sha256, converted,
        cover: { file: coverRel, size: cover.bytes.length, sha256: sha(cover.bytes), type: coverType },
      };
      await publish(output, fileRel, data);
      await publish(output, coverRel, cover.bytes);
      await publish(output, bookRel, json(book)); // kayıt en sonda: yayımlandığının işareti
      books.push(book);
      log(`Hazır: ${item.key}${converted ? ' (Arapça e-kitaba çevrildi)' : ''}`);
    }
  }
  for (const b of books) {
    summary.ready++;
    if (b.converted) summary.converted++;
    if (b.cover.type === 'hazır') summary.coversFound++; else summary.coversGenerated++;
  }

  // 4. Raporlar her çalışmada baştan.
  const editions = editionGroups(books);
  summary.editions = editions.length;
  broken.sort((a, b) => byId(a.key, b.key));
  await replaceText(output, 'reports/broken.json', json(broken));
  await replaceText(output, 'reports/duplicates.json', json(dropped.map(d => ({ dropped: d.item.key, kept: d.keptBy.key, reason: d.reason }))));
  await replaceText(output, 'reports/editions.json', json(editions));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command !== 'run' || args.length !== 3) fail('Kullanım: curate.mjs run <kurallar.json> <alım-klasörü> <çıktı-klasörü>');
    const rules = JSON.parse(await fs.readFile(args[0], 'utf8'));
    const s = await curate({ rules, work: args[1], output: args[2], log: (m) => console.log(m) });
    console.log(`\nHazır kitap: ${s.ready} · Bozuk ayrıldı: ${s.broken} · Tekrar elendi: ${s.duplicates} · Aynı adlı farklı baskı grubu: ${s.editions}`);
    console.log(`Arapça e-kitaba çevrilen: ${s.converted} · Hazır kapak bulunan: ${s.coversFound} · Kapak üretilen: ${s.coversGenerated}`);
    console.log('Hiçbir yere yükleme yapılmadı.');
  } catch (error) { console.error(`Ayıklama tamamlanamadı: ${error.message}`); process.exitCode = 1; }
}

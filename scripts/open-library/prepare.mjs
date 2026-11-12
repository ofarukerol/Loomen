import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const fail = (message) => { throw new Error(message); };
const segment = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(s) && s !== '..';
function relative(s) {
  if (typeof s !== 'string' || !s || s.includes('\\') || s.split('/').some(p => !/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]*$/u.test(p))) fail(`Geçersiz göreli yol: ${JSON.stringify(s)}`);
  return s;
}
export function validateLayout(layout) {
  if (layout.version !== 1 || !Array.isArray(layout.sources) || !layout.sources.length ||
      layout.sources.some(s => !segment(s)) || new Set(layout.sources).size !== layout.sources.length) fail('Kaynak düzeni geçersiz.');
  for (const name of ['public', 'private']) {
    const target = layout.targets?.[name];
    if (!target || !segment(target.bucket)) fail('Depo adı geçersiz.');
    relative(target.prefix);
  }
  if (layout.targets.public.bucket === layout.targets.private.bucket) fail('Açık ve kapalı hedef ayrı depolar olmalı.');
  return layout;
}
async function digest(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('Yalnız normal dosyalar kabul edilir.');
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); size += chunk.length; }
  return { size, sha256: hash.digest('hex') };
}
async function safeFile(root, rel) {
  relative(rel);
  let current = root;
  for (const part of rel.split('/')) {
    current = path.join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) fail('Sembolik bağlantı kabul edilmez.');
  }
  return current;
}
async function check(file, entry) {
  const actual = await digest(file);
  if (actual.size !== entry.size || actual.sha256 !== entry.sha256) fail(`Dosya bütünlüğü bozulmuş: ${entry.file}`);
}
// Tamamlanmış dosyalar asla değiştirilmez; link yalnız hedef yoksa başarılıdır.
async function publish(file, data) {
  const tmp = `${file}.${randomUUID()}.partial`;
  await fs.writeFile(tmp, data, { flag: 'wx' });
  try { await fs.link(tmp, file); }
  catch (error) {
    if (error.code !== 'EEXIST' || !(await fs.readFile(file)).equals(Buffer.from(data))) throw error;
  } finally { await fs.unlink(tmp); }
}
const json = (value) => JSON.stringify(value, null, 2) + '\n';
async function read(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
function validatePlan(plan) {
  validateLayout(plan.layout);
  if (plan.version !== 1 || !segment(plan.id) || !Array.isArray(plan.files) || !plan.files.length) fail('Çekim kaydı geçersiz.');
  const seen = new Set();
  for (const entry of plan.files) {
    const [source, visibility, ...rest] = relative(entry.file).split('/');
    if (!rest.length || source !== entry.source || visibility !== entry.visibility || !plan.layout.sources.includes(source) || !['public','private'].includes(visibility) || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256) || seen.has(entry.file)) fail('Dosya kaydı geçersiz.');
    seen.add(entry.file);
  }
}
async function directories(root, rel) {
  let current = root;
  for (const part of relative(rel).split('/')) {
    current = path.join(current, part);
    try { await fs.mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Çıktı klasörü bağlantı olamaz.');
  }
}
async function walk(root, prefix = '', skipped = []) {
  const result = [];
  for (const item of (await fs.readdir(path.join(root, prefix), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isFile() && (item.name === '.DS_Store' || item.name.startsWith('._'))) {
      skipped.push(rel);
      continue;
    }
    relative(rel);
    if (item.isDirectory()) result.push(...await walk(root, rel, skipped));
    else if (item.isFile()) result.push(rel);
    else fail('Sembolik bağlantı veya özel dosya kabul edilmez.');
  }
  return result;
}
function uploads(plan) {
  return plan.files.map(entry => ({ ...entry, local: `files/${entry.file}`,
    bucket: plan.layout.targets[entry.visibility].bucket,
    key: `${plan.layout.targets[entry.visibility].prefix}/snapshots/${plan.id}/${entry.file}` }));
}
export async function prepare({ layout, input, output, id, resume = false }) {
  validateLayout(layout);
  if (!segment(id)) fail('Çekim adı geçersiz.');
  input = await fs.realpath(input);
  output = path.resolve(output);
  await fs.mkdir(output, { recursive: true });
  output = await fs.realpath(output);
  if (output === input || output.startsWith(input + path.sep) || input.startsWith(output + path.sep)) fail('Girdi ve çıktı klasörleri iç içe olamaz.');
  const dir = path.join(output, id);
  let plan;
  if (resume) {
    if ((await fs.lstat(dir)).isSymbolicLink()) fail('Çekim klasörü bağlantı olamaz.');
    plan = await read(await safeFile(dir, 'manifest.json'));
    validatePlan(plan);
    if (plan.id !== id || json(plan.layout) !== json(layout)) fail('Devam için aynı çekim ve düzen gerekli.');
  } else {
    // Girdileri okumadan çakışmayı bildir; alttaki mkdir yarış durumunu da korur.
    try {
      await fs.lstat(dir);
      throw Object.assign(new Error(`Çekim adı zaten kullanılıyor: ${id}`), { code: 'EEXIST' });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const files = [], skipped = [];
    const inputs = await walk(input, '', skipped);
    if (skipped.length) console.info(`Mac yardımcı dosyaları atlandı: ${skipped.length}`);
    for (const file of inputs) {
      const [source, visibility, ...rest] = file.split('/');
      if (!layout.sources.includes(source) || !['public', 'private'].includes(visibility) || !rest.length) fail(`Beklenmeyen girdi yolu: ${file}`);
      files.push({ file, source, visibility, ...await digest(await safeFile(input, file)) });
    }
    if (!files.length) fail('Hazırlanacak kitap bulunamadı.');
    files.sort((a,b) => layout.sources.indexOf(a.source) - layout.sources.indexOf(b.source) || a.file.localeCompare(b.file, 'en'));
    plan = { version: 1, id, layout, files };
    await fs.mkdir(dir); // Aynı adla yeni çekim eski kayda dokunamaz.
    await publish(path.join(dir, 'manifest.json'), json(plan));
  }
  // Kaynak sırası sabittir; her dosya tamamlanmadan sonraki başlamaz.
  for (const entry of plan.files) {
    const source = await safeFile(input, entry.file);
    await check(source, entry);
    const dest = path.join(dir, 'files', entry.file);
    await directories(dir, path.posix.dirname(`files/${entry.file}`));
    try { await check(await safeFile(dir, `files/${entry.file}`), entry); continue; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const tmp = path.join(path.dirname(dest), `${randomUUID()}.partial`);
    try {
      await fs.copyFile(source, tmp, 1);
      await check(tmp, entry);
      try { await fs.link(tmp, dest); }
      catch (error) { if (error.code !== 'EEXIST') throw error; await check(dest, entry); }
    } finally { await fs.unlink(tmp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  }
  await publish(path.join(dir, 'uploads.json'), json(uploads(plan)));
  await verify(dir);
  return dir;
}
export async function verify(dir) {
  const plan = await read(await safeFile(dir, 'manifest.json'));
  validatePlan(plan);
  for (const entry of plan.files) {
    const [source, visibility, ...rest] = relative(entry.file).split('/');
    if (!rest.length || source !== entry.source || visibility !== entry.visibility || !plan.layout.sources.includes(source) || !['public','private'].includes(visibility)) fail('Dosya hedefi geçersiz.');
    await check(await safeFile(dir, `files/${entry.file}`), entry);
  }
  if (json(await read(await safeFile(dir, 'uploads.json'))) !== json(uploads(plan))) fail('Yükleme listesi kayıtla uyuşmuyor.');
  return plan;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'verify' && args.length === 1) await verify(path.resolve(args[0]));
    else if (command === 'prepare' && (args.length === 4 || (args.length === 5 && args[4] === '--resume'))) {
      await prepare({ layout: await read(args[0]), input: args[1], output: args[2], id: args[3], resume: args[4] === '--resume' });
    } else fail('Kullanım: prepare.mjs prepare <düzen.json> <girdi> <çıktı> <çekim> [--resume] veya verify <çekim-klasörü>');
    console.log('Doğrulama geçti. Uzak depoya işlem yapılmadı.');
  } catch (error) { console.error(`Hazırlık tamamlanamadı: ${error.message}`); process.exitCode = 1; }
}

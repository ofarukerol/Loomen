import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { BulkPermission, IntakeBook, IntakeCheckpoint, IntakeIO, IntakeResult, IntakeStorage, PreparedFile, ReleasePolicy } from './contracts.ts';
import { classifyRights } from './rights.ts';
import { permitsBook, SOURCE_ORDER, validatePermission } from './sources.ts';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const intakeKey = (book: IntakeBook): string => hash([book.source, book.id, book.editionId, book.format]);

function validateBook(book: IntakeBook): void {
  if (!SOURCE_ORDER.includes(book.source) || !book.id.trim() || !book.editionId.trim() ||
      !['epub', 'text'].includes(book.format) || !/^[a-f0-9]{64}$/.test(book.sha256)) {
    throw new Error('Kitap kimliği, biçimi veya dosya özeti geçersiz.');
  }
}

/** LOM-101 ile aynı güvenli göreli yol ve bütünlük alanları. */
export function validatePreparedFile(file: PreparedFile, book: IntakeBook, visibility: 'public' | 'private'): void {
  const parts = file.file.split('/');
  if (file.source !== book.source || file.visibility !== visibility ||
      parts[0] !== book.source || parts[1] !== visibility || parts.length < 3 ||
      parts.some(p => !/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]*$/u.test(p)) ||
      !Number.isSafeInteger(file.size) || file.size <= 0 || file.sha256 !== book.sha256 ||
      (book.format === 'epub' && !file.file.endsWith('.epub'))) {
    throw new Error('Hazırlanan dosya kaynak, hedef veya bütünlük kaydıyla uyuşmuyor.');
  }
}

export interface IntakeOptions {
  books: IntakeBook[];
  permissions: BulkPermission[];
  policy?: ReleasePolicy;
  storage: IntakeStorage;
  io: IntakeIO;
}

/**
 * Çevrimdışı da kullanılabilen sıralı alma çekirdeği. Ağ ve kalıcı depolama
 * uyarlayıcıları açıkça verilir; bu modül sunucuya bağlanmaz, yayın yapmaz.
 * Aynı planın devamında izinler değiştirilemez; yeni karar yeni çekim ister.
 */
export async function runIntake({ books, permissions, policy, storage, io }: IntakeOptions): Promise<IntakeCheckpoint> {
  permissions.forEach(validatePermission);
  if (new Set(permissions.map(p => p.source)).size !== permissions.length) throw new Error('Aynı kaynağın birden fazla alma izni var.');
  books.forEach(validateBook);
  const ordered = [...books].sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) || intakeKey(a).localeCompare(intakeKey(b), 'en'));
  const unique = new Map<string, IntakeBook>();
  const duplicates: IntakeCheckpoint['duplicates'] = {};
  for (const book of ordered) {
    const key = intakeKey(book), previous = unique.get(key);
    if (previous && hash(previous) !== hash(book)) throw new Error('Aynı baskı için çelişen kayıt var.');
    if (previous) duplicates[book.source] = (duplicates[book.source] ?? 0) + 1;
    unique.set(key, book);
  }
  const jobs = [...unique.values()];
  const planHash = hash({ jobs, duplicates, permissions, policy });
  const loaded = await storage.load();
  const state: IntakeCheckpoint = loaded ?? { version: 1, planHash, nextRequestAt: 0, duplicates, results: [] };
  if (state.version !== 1 || state.planHash !== planHash || hash(state.duplicates) !== hash(duplicates) || !Number.isSafeInteger(state.nextRequestAt) || state.nextRequestAt < 0 || !Array.isArray(state.results) || state.results.length > jobs.length) {
    throw new Error('Devam kaydı bu planla uyuşmuyor.');
  }
  await io.bindPlan?.(planHash);
  // Kayıt bir önek olmalı; eksik/çift/sırası değişmiş sonuç kabul edilmez.
  for (const [index, result] of state.results.entries()) {
    const book = jobs[index];
    if (result.key !== intakeKey(book) || hash(result.book) !== hash(book)) throw new Error('Devam kaydındaki kitap sırası bozuk.');
    const decision = decide(book, permissions, policy);
    if (result.status !== decision.status || result.reason !== decision.reason) throw new Error('Devam kaydındaki izin kararı bozuk.');
    if (result.status === 'prepared' || result.status === 'private') {
      if (!result.file) throw new Error('Tamamlanan kitabın dosya kaydı yok.');
      validatePreparedFile(result.file, book, result.status === 'private' ? 'private' : 'public');
      await io.verify(result.file);
    } else if (result.file) throw new Error('Bekletilen kitabın yükleme dosyası olamaz.');
  }
  await storage.save(state);
  for (const book of jobs.slice(state.results.length)) {
    const decision = decide(book, permissions, policy);
    const result: IntakeResult = { key: intakeKey(book), book: structuredClone(book), ...decision };
    if (decision.status === 'prepared' || decision.status === 'private') {
      const permission = permissions.find(p => p.source === book.source)!;
      const remaining = state.nextRequestAt - io.now();
      if (remaining > 0) await io.sleep(remaining);
      if (io.now() < state.nextRequestAt) throw new Error('Kaynağın bekleme süresi dolmadı.');
      // Başarısız istek/kesintide de bekleme süresi korunur.
      state.nextRequestAt = io.now() + permission.minDelayMs;
      await storage.save(state);
      result.file = await io.acquire(book, decision.status === 'private' ? 'private' : 'public', result.key);
      validatePreparedFile(result.file, book, decision.status === 'private' ? 'private' : 'public');
      await io.verify(result.file);
    }
    state.results.push(result);
    await storage.save(state);
  }
  return state;
}

function decide(book: IntakeBook, permissions: BulkPermission[], policy?: ReleasePolicy) {
  if (book.source === 'gutenberg' && book.format !== 'epub') return { status: 'rejected' as const, reason: 'Gutenberg için yalnız EPUB alınır.' };
  const permission = permissions.find(p => p.source === book.source);
  if (!permission || !permitsBook(book, permission)) return { status: 'held' as const, reason: 'Resmî toplu dosya veya izinli yansı doğrulanmadı.' };
  return classifyRights(book, policy);
}

export function intakeReport(state: IntakeCheckpoint) {
  return SOURCE_ORDER.map(source => {
    const rows = state.results.filter(r => r.book.source === source);
    const reasons: Record<string, number> = {};
    for (const row of rows) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
    const duplicates = state.duplicates[source] ?? 0;
    if (duplicates) reasons['Aynı kaynak ve baskı kaydı tekrar geldi.'] = duplicates;
    return { source, received: rows.filter(r => r.file).length,
      rejected: rows.filter(r => r.status === 'rejected').length + duplicates, duplicates,
      held: rows.filter(r => r.status === 'held').length,
      prepared: rows.filter(r => r.status === 'prepared').length,
      private: rows.filter(r => r.status === 'private').length, reasons };
  });
}

/** LOM-101'e bekleyen kayıt ve kapalı arşiv sızdırmayan dosya listesi. */
export function intakeFiles(state: IntakeCheckpoint, visibility: 'public' | 'private'): PreparedFile[] {
  return state.results.filter(r => r.file && r.status === (visibility === 'public' ? 'prepared' : 'private'))
    .map(r => structuredClone(r.file!));
}

/** Tek çalışma için yerel, atomik devam kaydı; üretim erişimi içermez. */
export function fileIntakeStorage(checkpointPath: string): IntakeStorage {
  const records = checkpointPath + '.records';
  let persisted = 0;
  async function atomicWrite(file: string, value: unknown) {
    const tmp = `${file}.${randomUUID()}.partial`;
    const handle = await fs.open(tmp, 'wx');
    try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(tmp, file);
  }
  return {
    async load() {
      let checkpointFound = false;
      try {
        if (!(await fs.lstat(checkpointPath)).isFile()) throw new Error('Devam kaydı normal dosya olmalı.');
        checkpointFound = true;
        const state = JSON.parse(await fs.readFile(checkpointPath, 'utf8')) as IntakeCheckpoint;
        state.results = [];
        const directory = await fs.lstat(records);
        if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Sonuç klasörü bağlantı olamaz.');
        const names = (await fs.readdir(records)).filter(name => name.endsWith('.json'));
        if (names.some(name => !/^(0|[1-9]\d*)\.json$/.test(name))) throw new Error('Sonuç kayıt adı geçersiz.');
        names.sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]));
        for (const [index, name] of names.entries()) {
          if (name !== `${index}.json`) throw new Error('Devam kayıtlarının arasında eksik kitap var.');
          const file = path.join(records, name);
          if (!(await fs.lstat(file)).isFile()) throw new Error('Sonuç kaydı normal dosya olmalı.');
          state.results.push(JSON.parse(await fs.readFile(file, 'utf8')));
        }
        persisted = state.results.length;
        return state;
      } catch (error) {
        if (!checkpointFound && (error as { code?: string }).code === 'ENOENT') return undefined;
        throw error;
      }
    },
    async save(state) {
      await fs.mkdir(records, { recursive: true });
      if (!(await fs.lstat(records)).isDirectory() || (await fs.lstat(records)).isSymbolicLink()) throw new Error('Sonuç klasörü bağlantı olamaz.');
      // Her kitap ayrı yazılır; yüz bin kitapta önceki sonuçlar yeniden yazılmaz.
      const { results, ...metadata } = state;
      await atomicWrite(checkpointPath, metadata);
      for (; persisted < results.length; persisted++) await atomicWrite(path.join(records, `${persisted}.json`), results[persisted]);
    },
  };
}

async function fileDigest(file: string) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Kitap normal dosya olmalı.');
  const digest = createHash('sha256'); let size = 0;
  for await (const chunk of createReadStream(file)) { digest.update(chunk); size += chunk.length; }
  return { size, sha256: digest.digest('hex') };
}

async function safeLocalPath(root: string, relative: string, createParents = false): Promise<string> {
  const parts = relative.split('/');
  if (parts.some(p => !/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]*$/u.test(p))) throw new Error('Yerel dosya yolu geçersiz.');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    if (createParents) await fs.mkdir(current, { recursive: true });
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Kitap klasörü bağlantı olamaz.');
  }
  return path.join(current, parts.at(-1)!);
}

/**
 * Resmî toplu dosyadan/yansıdan önceden alınmış yerel kitapları hazırlar.
 * localFiles anahtarı intakeKey(book), değeri inputRoot'a göre dosya yoludur.
 * Çıktı doğrudan LOM-101 prepare aracının girdisidir; indirme/yükleme yapmaz.
 * Güvenilir, başka süreççe değiştirilmeyen ayrı girdi/çıktı klasörleri gerekir.
 */
export async function localIntakeIO(inputRoot: string, outputRoot: string, localFiles: Record<string, string>): Promise<IntakeIO> {
  const input = await fs.realpath(inputRoot);
  await fs.mkdir(outputRoot, { recursive: true });
  const output = await fs.realpath(outputRoot);
  if (input === output || output.startsWith(input + path.sep) || input.startsWith(output + path.sep)) throw new Error('Girdi ve çıktı klasörleri ayrı olmalı.');
  // Kesintide kalan geçici kitaplar LOM-101'in taradığı ağaca giremez.
  const staging = output + '.partial';
  if (staging === input || staging.startsWith(input + path.sep)) throw new Error('Geçici klasör girdinin dışında olmalı.');
  await fs.mkdir(staging, { recursive: true });
  if (!(await fs.lstat(staging)).isDirectory() || (await fs.lstat(staging)).isSymbolicLink()) throw new Error('Geçici klasör bağlantı olamaz.');
  const verify = async (file: PreparedFile) => {
    const actual = await fileDigest(await safeLocalPath(output, file.file));
    if (actual.size !== file.size || actual.sha256 !== file.sha256) throw new Error('Kitap dosyasının bütünlüğü bozuldu.');
  };
  let bound = false;
  return {
    async bindPlan(planHash) {
      const marker = path.join(staging, 'plan.json');
      try {
        if ((await fs.lstat(marker)).isSymbolicLink()) throw new Error('Çekim kaydı bağlantı olamaz.');
        if (JSON.parse(await fs.readFile(marker, 'utf8')).planHash !== planHash) throw new Error('Bu çıktı klasörü başka bir çekime ait; yeni boş klasör gerekli.');
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
        if ((await fs.readdir(output)).length) throw new Error('Yeni çekim için boş çıktı klasörü gerekli.');
        await fs.writeFile(marker, JSON.stringify({ planHash }), { flag: 'wx' });
      }
      bound = true;
    },
    now: Date.now,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    verify,
    async acquire(book, visibility, key) {
      if (!bound) throw new Error('Önce çıktı klasörü çekim planına bağlanmalı.');
      const relative = localFiles[key];
      if (!relative) throw new Error('Toplu kaynaktaki yerel kitap dosyası belirtilmedi.');
      const source = await safeLocalPath(input, relative);
      const actual = await fileDigest(source);
      if (!actual.size || actual.sha256 !== book.sha256) throw new Error('Kaynak dosyanın bütünlüğü bozuldu.');
      const file: PreparedFile = { source: book.source, visibility, file: `${book.source}/${visibility}/${key}.${book.format === 'epub' ? 'epub' : 'txt'}`, ...actual };
      const destination = await safeLocalPath(output, file.file, true);
      try { await verify(file); return file; }
      catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
      const temporary = path.join(staging, `${randomUUID()}.partial`);
      try {
        await fs.copyFile(source, temporary, 1);
        const copied = await fileDigest(temporary);
        if (copied.sha256 !== actual.sha256 || copied.size !== actual.size) throw new Error('Kitap kopyası doğrulanamadı.');
        try { await fs.link(temporary, destination); }
        catch (error) { if ((error as { code?: string }).code !== 'EEXIST') throw error; }
        await verify(file);
      } finally {
        await fs.unlink(temporary).catch((error: unknown) => { if ((error as { code?: string }).code !== 'ENOENT') throw error; });
      }
      return file;
    },
  };
}

/** İzinli kaynakları sırasıyla indirir; yayın kararı vermeden kapalı girdide tutar.
 * Dönen books/localFiles, localIntakeIO ve runIntake ile mevcut sözleşmeye bağlanır.
 */
export async function downloadIntakeSources(root: string, books: Array<Omit<IntakeBook, 'sha256'> & { sha256?: string }>, permissions: BulkPermission[], maxBytes: number) {
  const { downloadSourceBook } = await import('./sources.ts');
  permissions.forEach(validatePermission);
  if (new Set(permissions.map(p => p.source)).size !== permissions.length) throw new Error('Aynı kaynağın birden fazla alma izni var.');
  const completed: IntakeBook[] = [], localFiles: Record<string, string> = {};
  for (const book of [...books].sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source))) {
    const permission = permissions.find(p => p.source === book.source);
    if (!permission) throw new Error('Kaynağın alma izni eksik.');
    const result = await downloadSourceBook(root, book, permission, { maxBytes });
    const received: IntakeBook = { ...book, sha256: result.evidence.sha256 };
    completed.push(received);
    localFiles[intakeKey(received)] = path.relative(await fs.realpath(root), result.file);
  }
  return { books: completed, localFiles, needs_human: true as const };
}

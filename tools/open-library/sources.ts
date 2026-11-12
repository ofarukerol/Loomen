import type { BulkPermission, IntakeBook, SourceId } from './contracts.ts';
import { secureUrl } from './rights.ts';

export const SOURCE_ORDER: readonly SourceId[] = [
  'openiti', 'standard-ebooks', 'gutenberg', 'wikisource', 'hindawi', 'shamela',
];

/** Kaynak adresleri tahmin edilmez; resmî toplu dosya/yansı kanıtı zorunludur. */
export function validatePermission(permission: BulkPermission): void {
  if (!SOURCE_ORDER.includes(permission.source) ||
      !['official-bulk', 'permitted-mirror'].includes(permission.kind) ||
      !secureUrl(permission.baseUrl) || !secureUrl(permission.evidenceUrl) ||
      !permission.approvedBy.trim() || !Number.isSafeInteger(permission.minDelayMs) ||
      permission.minDelayMs < 0 || new URL(permission.baseUrl).search) {
    throw new Error('Toplu alma izni veya bekleme kuralı geçersiz.');
  }
}

export function permitsBook(book: IntakeBook, permission: BulkPermission): boolean {
  if (book.source !== permission.source || !secureUrl(book.url)) return false;
  const base = new URL(permission.baseUrl), url = new URL(book.url);
  const prefix = base.pathname.endsWith('/') ? base.pathname : base.pathname + '/';
  // Encoded separators can change a mirror's interpretation of the path.
  if (/%(?:2f|5c|2e)/i.test(url.pathname)) return false;
  return url.origin === base.origin && (url.pathname === base.pathname || url.pathname.startsWith(prefix));
}


/** Yerel kapalı hazırlık: alınan dosya hiçbir zaman yayın onayı sayılmaz.
 * Tek süreç kullanır; her yeniden deneme kaynak bekleme süresini korur.
 * HTTP yalnız gerçek yerel sunucu testleri için kabul edilir.
 */
async function downloadSourceBookUnlocked(root: string, book: Omit<IntakeBook, 'sha256'> & { sha256?: string }, permission: BulkPermission,
  options: { maxBytes: number; timeoutMs?: number; allowLocalHttp?: boolean }) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { createHash, randomUUID } = await import('node:crypto');
  const local = options.allowLocalHttp && [book.url, permission.baseUrl, permission.evidenceUrl].every(value => {
    const u = new URL(value); return u.protocol === 'http:' && u.hostname === '127.0.0.1' && !u.username && !u.password && !u.hash;
  });
  const validationPermission = local ? { ...permission, baseUrl: permission.baseUrl.replace('http:', 'https:'), evidenceUrl: permission.evidenceUrl.replace('http:', 'https:') } : permission;
  validatePermission(validationPermission);
  if (!permitsBook({ ...book, sha256: '', url: local ? book.url.replace('http:', 'https:') : book.url }, validationPermission) ||
      !book.id.trim() || !book.editionId.trim() || !['epub', 'text'].includes(book.format) ||
      (book.source === 'gutenberg' && book.format !== 'epub') ||
      (book.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(book.sha256)) ||
      !Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0 ||
      !Number.isSafeInteger(options.timeoutMs ?? 30000) || (options.timeoutMs ?? 30000) <= 0) throw new Error('İndirme adresi, biçimi veya sınırı geçersiz.');
  await fs.mkdir(root, { recursive: true });
  if (!(await fs.lstat(root)).isDirectory() || (await fs.lstat(root)).isSymbolicLink()) throw new Error('Hazırlık klasörü bağlantı olamaz.');
  root = await fs.realpath(root);
  const key = createHash('sha256').update(JSON.stringify([book, permission])).digest('hex');
  const directory = path.join(root, key);
  await fs.mkdir(directory, { recursive: true });
  if (!(await fs.lstat(directory)).isDirectory() || (await fs.lstat(directory)).isSymbolicLink()) throw new Error('Hazırlık klasörü geçersiz.');
  const file = path.join(directory, book.format === 'epub' ? 'book.epub' : 'book.txt');
  const record = path.join(directory, 'evidence.json');
  const digestFile = async () => {
    if (!(await fs.lstat(file)).isFile()) throw new Error('Kaynak normal dosya olmalı.');
    const { createReadStream } = await import('node:fs');
    const hash = createHash('sha256'); let size = 0;
    for await (const chunk of createReadStream(file)) { size += chunk.length; if (size > options.maxBytes) throw new Error('Boyut sınırı aşıldı.'); hash.update(chunk); }
    return { size, sha256: hash.digest('hex') };
  };
  try {
    if (!(await fs.lstat(record)).isFile()) throw new Error('Kanıt normal dosya olmalı.');
    const evidence = JSON.parse(await fs.readFile(record, 'utf8'));
    const actual = await digestFile();
    if (!actual.size || actual.sha256 !== evidence.sha256 || actual.size !== evidence.size || evidence.url !== book.url ||
        evidence.permission !== JSON.stringify(permission) || (book.sha256 && book.sha256 !== actual.sha256)) throw new Error('İndirme kanıtı dosyayla uyuşmuyor.');
    return { file, evidence };
  } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
  const clockFile = path.join(root, `wait-${book.source}.json`);
  let next = 0;
  try {
    if (!(await fs.lstat(clockFile)).isFile()) throw new Error('Bekleme kaydı geçersiz.');
    next = JSON.parse(await fs.readFile(clockFile, 'utf8')).next;
    if (!Number.isSafeInteger(next) || next < 0) throw new Error('Bekleme kaydı geçersiz.');
  } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
  if (next > Date.now()) await new Promise(resolve => setTimeout(resolve, next - Date.now()));
  const clockTemp = path.join(root, randomUUID() + '.partial');
  await fs.writeFile(clockTemp, JSON.stringify({ next: Date.now() + permission.minDelayMs }), { flag: 'wx' });
  await fs.rename(clockTemp, clockFile);
  const temporary = path.join(directory, randomUUID() + '.partial');
  try {
    const response = await fetch(book.url, { redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 30000) });
    if (response.status !== 200 || !response.body) { await response.body?.cancel(); throw new Error(`Kaynak alınamadı: ${response.status}`); }
    if (Number(response.headers.get('content-length')) > options.maxBytes) { await response.body.cancel(); throw new Error('Boyut sınırı aşıldı.'); }
    const handle = await fs.open(temporary, 'wx');
    let size = 0; const hash = createHash('sha256');
    try {
      for await (const chunk of response.body) {
        size += chunk.length; if (size > options.maxBytes) throw new Error('Boyut sınırı aşıldı.');
        hash.update(chunk); await handle.writeFile(chunk);
      }
      await handle.sync();
    } finally { await handle.close(); }
    const sha256 = hash.digest('hex');
    if (!size || (book.sha256 && book.sha256 !== sha256)) throw new Error('İndirilen dosyanın bütünlüğü doğrulanamadı.');
    const evidence = { source: book.source, url: book.url, acquiredAt: new Date().toISOString(), sha256, size,
      evidenceUrl: permission.evidenceUrl, permission: JSON.stringify(permission), visibility: 'private', needs_human: true };
    try { await fs.link(temporary, file); }
    catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      const existing = await digestFile();
      if (existing.sha256 !== sha256 || existing.size !== size) throw new Error('Önceki kitap değişmiş; üzerine yazılmadı.');
    }
    const evidenceTemp = path.join(directory, randomUUID() + '.partial');
    await fs.writeFile(evidenceTemp, JSON.stringify(evidence, null, 2), { flag: 'wx' });
    await fs.rename(evidenceTemp, record);
    return { file, evidence };
  } finally { await fs.unlink(temporary).catch((error: unknown) => { if ((error as { code?: string }).code !== 'ENOENT') throw error; }); }
}


const activeSources = new Set<SourceId>();
/** Aynı süreçte kaynak bekleme kaydını iki çağrı birlikte kullanamaz. */
export async function downloadSourceBook(...args: Parameters<typeof downloadSourceBookUnlocked>) {
  const source = args[1].source;
  if (activeSources.has(source)) throw new Error('Bu kaynak için başka bir indirme sürüyor.');
  activeSources.add(source);
  try { return await downloadSourceBookUnlocked(...args); }
  finally { activeSources.delete(source); }
}

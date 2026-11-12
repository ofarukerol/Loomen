// Açık kitaplık: kaynaklardan kitap alma ve lisans ayrımı. Yalnız Node yerleşikleri.
// Yükleme, uzak silme ve kimlik bilgisi yok. Çıktının `input` klasörü prepare.mjs'in girdisidir.
//
// Çalışma klasörü:
//   input/<kaynak>/<public|private>/<id>.<ext>  açık aday ve kapalı arşiv (prepare girdisi)
//   held/<kaynak>/<id>.<ext>                     lisansı belirsiz, bekleyen (prepare girdisinin dışında)
//   records/<kaynak>/<id>.json                   madde kaydı (lisans, kanıt, karar, boyut, SHA-256)
//   partial/<kaynak>/…partial                    yarım indirmeler; çıktıya girmez, kendiliğinden silinmez
//   ledger.jsonl                                 yalnız ekleme yapılan alım defteri
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decide, fileName, segment, validateRules } from './rights.mjs';

const fail = (message, extra) => { throw Object.assign(new Error(message), extra); };
const ITEM_KEYS = new Set(['id', 'title', 'url', 'localPath', 'ext', 'license', 'evidenceUrl', 'verified']);
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const isHttps = (url) => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };

async function digest(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('Yalnız normal dosyalar kabul edilir.');
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); size += chunk.length; }
  return { size, sha256: hash.digest('hex') };
}
async function exists(file) {
  try { await fs.lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
// Çalışma klasörünün altında klasör açar; yol üzerinde bağlantı kabul etmez.
async function directories(root, rel) {
  let current = root;
  for (const part of rel.split('/')) {
    current = path.join(current, part);
    try { await fs.mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Çalışma klasöründe bağlantı olamaz.');
  }
  return current;
}
// Tamamlanmış dosya üstüne yazılmaz: geçici dosya + link, hedef varsa hata.
async function publishText(root, rel, text) {
  const dir = await directories(root, path.posix.dirname(rel));
  const file = path.join(dir, path.posix.basename(rel));
  const tmp = `${file}.${randomUUID()}.partial`;
  await fs.writeFile(tmp, text, { flag: 'wx' });
  try { await fs.link(tmp, file); } finally { await fs.unlink(tmp); }
}

/** Kaynak listesi: satır başına bir JSON madde. Hatada satır numarası verilir. */
export function parseList(text, source, rules, listDir = '.') {
  const cfg = rules.sources[source];
  const items = [], seen = new Set();
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const where = `${source} listesi, satır ${index + 1}`;
    let item;
    try { item = JSON.parse(line); } catch { fail(`${where}: JSON okunamadı.`); }
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`${where}: madde nesne olmalı.`);
    for (const key of Object.keys(item)) if (!ITEM_KEYS.has(key)) fail(`${where}: bilinmeyen alan ${key}.`);
    if (!segment(item.id)) fail(`${where}: geçersiz kimlik ${JSON.stringify(item.id)}.`);
    const key = `${source}:${item.id}`;
    if (seen.has(key)) fail(`${where}: aynı kimlik iki kez geçiyor (${key}).`);
    seen.add(key);
    if (typeof item.ext !== 'string' || !/^[a-z0-9]{1,10}$/i.test(item.ext)) fail(`${where}: geçersiz dosya uzantısı.`);
    const name = `${item.id}.${item.ext}`;
    if (!fileName(name)) fail(`${where}: dosya adı hazırlık kuralına uymuyor (${name}).`);
    if ('title' in item && typeof item.title !== 'string') fail(`${where}: başlık metin olmalı.`);
    if ('license' in item && typeof item.license !== 'string') fail(`${where}: lisans metin olmalı.`);
    if ('evidenceUrl' in item && typeof item.evidenceUrl !== 'string') fail(`${where}: kanıt adresi metin olmalı.`);
    if ('verified' in item && typeof item.verified !== 'boolean') fail(`${where}: doğrulama işareti evet/hayır olmalı.`);
    const hasUrl = 'url' in item, hasLocal = 'localPath' in item;
    if (hasUrl === hasLocal) fail(`${where}: adres ya da yerel dosyadan tam biri verilmeli.`);
    if (hasUrl) {
      if (cfg.localOnly) fail(`${where}: bu kaynaktan ağ üzerinden alım yapılmaz; yalnız yerel dosya kabul edilir.`);
      if (!isHttps(item.url)) fail(`${where}: yalnız https adresi kabul edilir.`);
    } else if (typeof item.localPath !== 'string' || !item.localPath) fail(`${where}: yerel dosya yolu geçersiz.`);
    items.push({ ...item, key, name, localPath: hasLocal ? path.resolve(listDir, item.localPath) : undefined });
  });
  return items;
}

/** Varsayılan indirici: yalnız https, yönlendirme sonrası da https, zaman aşımı. */
export async function httpsFetcher(url, { signal, timeoutMs = 10 * 60_000 } = {}) {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) signals.push(signal);
  const combined = AbortSignal.any(signals);
  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    if (!isHttps(current)) fail(`Yalnız https adresi kabul edilir: ${current}`, { retry: false });
    const res = await fetch(current, { redirect: 'manual', signal: combined });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location) fail(`Yönlendirme adresi yok: ${current}`, { retry: false });
      current = new URL(location, current).href;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      fail(`Sunucu ${res.status} döndü: ${current}`, { retry: res.status === 429 || res.status >= 500 });
    }
    if (!res.body) fail(`Boş yanıt: ${current}`);
    return res.body;
  }
  fail(`Çok fazla yönlendirme: ${url}`, { retry: false });
}
const defaultSleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

// İçeriği geçici dosyaya akışla yazar; boyut ve SHA-256 döner.
async function writeBody(body, tmp) {
  const handle = await fs.open(tmp, 'wx');
  const hash = createHash('sha256');
  let size = 0;
  try {
    const chunks = typeof body === 'string' || body instanceof Uint8Array ? [body] : body;
    for await (const raw of chunks) {
      const chunk = typeof raw === 'string' ? Buffer.from(raw) : raw;
      hash.update(chunk); size += chunk.length;
      await handle.write(chunk);
    }
    await handle.sync();
  } finally { await handle.close(); }
  return { size, sha256: hash.digest('hex') };
}

async function readLedger(file) {
  let text = '';
  try { text = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const keys = new Set();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { const entry = JSON.parse(line); if (typeof entry.key === 'string') keys.add(entry.key); } catch { /* kesintiden kalan yarım satır */ }
  }
  return { keys, needsNewline: text.length > 0 && !text.endsWith('\n') };
}
async function readRecord(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) fail(`Kayıt dosyası okunamadı: ${file}`);
    throw error;
  }
}
const locations = (source, name) => ({
  public: `input/${source}/public/${name}`,
  private: `input/${source}/private/${name}`,
  held: `held/${source}/${name}`,
});

/**
 * Kaynakları kural sırasıyla, maddeleri tek tek alır.
 * @param {{ rules: object, lists: string, work: string, fetcher?: Function, sleep?: Function,
 *   signal?: AbortSignal, attempts?: number, log?: Function }} options
 */
export async function intake({ rules, lists, work, fetcher = httpsFetcher, sleep = defaultSleep, signal, attempts = 3, log = () => {} }) {
  validateRules(rules);
  if (!Number.isSafeInteger(attempts) || attempts < 1) fail('Deneme sayısı geçersiz.');
  lists = await fs.realpath(lists);
  await fs.mkdir(work, { recursive: true });
  work = await fs.realpath(work);
  if (work === lists || work.startsWith(lists + path.sep) || lists.startsWith(work + path.sep)) fail('Liste ve çalışma klasörleri iç içe olamaz.');

  // Önce bütün listeler okunur ve doğrulanır; hatalı listede hiçbir şey indirilmez.
  const plan = new Map();
  for (const entry of await fs.readdir(lists, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) fail(`Beklenmeyen liste dosyası: ${entry.name}`);
    const source = entry.name.slice(0, -'.jsonl'.length);
    if (!rules.order.includes(source)) fail(`Sırada olmayan kaynak: ${source}`);
    plan.set(source, parseList(await fs.readFile(path.join(lists, entry.name), 'utf8'), source, rules, lists));
  }

  const ledgerFile = path.join(work, 'ledger.jsonl');
  const ledger = await readLedger(ledgerFile);
  const appendLedger = async (entry) => {
    if (ledger.keys.has(entry.key)) return;
    await fs.appendFile(ledgerFile, (ledger.needsNewline ? '\n' : '') + JSON.stringify(entry) + '\n');
    ledger.needsNewline = false;
    ledger.keys.add(entry.key);
  };
  const summary = { public: 0, private: 0, held: 0, skipped: 0, resumed: 0, bySource: {} };

  for (const source of rules.order) {
    const items = plan.get(source);
    if (!items) continue;
    const cfg = rules.sources[source];
    const counts = summary.bySource[source] = { public: 0, private: 0, held: 0, skipped: 0 };
    let networkUsed = false;
    for (const item of items) {
      if (signal?.aborted) fail('Alım durduruldu.', { code: 'ABORT_ERR' });
      const verdict = decide(item, source, rules);
      const where = locations(source, item.name);
      const rel = where[verdict.decision];
      const dest = path.join(work, rel);
      const recordRel = `records/${source}/${item.id}.json`;
      const record = await readRecord(path.join(work, recordRel));

      // Daha önce başka bölüme konmuş dosya varsa taşınmaz; durulur.
      for (const [decision, other] of Object.entries(where)) {
        if (decision === verdict.decision) continue;
        if ((record && record.decision === decision) || await exists(path.join(work, other)))
          fail(`${item.key}: karar değişti (önce ${decision}, şimdi ${verdict.decision}: ${verdict.reason}). Dosya taşınmadı; kuralı ya da listeyi kontrol et.`);
      }

      if (record) {
        if (record.key !== item.key || record.file !== rel) fail(`${item.key}: kayıt bu maddeyle uyuşmuyor (${recordRel}).`);
        let actual;
        try { actual = await digest(dest); }
        catch (error) { if (error.code === 'ENOENT') fail(`${item.key}: kayıt var ama dosya eksik (${rel}). Üstüne yazılmadı.`); throw error; }
        if (actual.size !== record.size || actual.sha256 !== record.sha256) fail(`${item.key}: dosya bütünlüğü bozulmuş (${rel}). Üstüne yazılmadı.`);
        await appendLedger(ledgerEntry(record));
        summary.skipped++; counts.skipped++;
        log(`Atlandı (zaten alınmış): ${item.key}`);
        continue;
      }

      let result;
      if (await exists(dest)) {
        // Kesinti: dosya yayımlanmış, kayıt yazılmamış. Dosya yeniden indirilmez.
        result = await digest(dest);
        if (!result.size) fail(`${item.key}: boş dosya kabul edilmez (${rel}).`);
        summary.resumed++;
      } else {
        const tmpDir = await directories(work, `partial/${source}`);
        await directories(work, path.posix.dirname(rel));
        for (let attempt = 1; ; attempt++) {
          const tmp = path.join(tmpDir, `${item.name}.${randomUUID()}.partial`);
          try {
            if (item.url) {
              if (networkUsed && cfg.delayMs) await sleep(cfg.delayMs, signal);
              networkUsed = true;
              result = await writeBody(await fetcher(item.url, { signal }), tmp);
            } else {
              const stat = await fs.lstat(item.localPath);
              if (stat.isSymbolicLink() || !stat.isFile()) fail(`${item.key}: yerel dosya sembolik bağlantı ya da özel dosya olamaz.`, { retry: false });
              await fs.copyFile(item.localPath, tmp, fs.constants.COPYFILE_EXCL);
              result = await digest(tmp);
            }
            if (!result.size) fail(`${item.key}: boş içerik kabul edilmez.`, { retry: false });
            await fs.link(tmp, dest);
            break;
          } catch (error) {
            const retry = item.url && error.retry !== false && error.code !== 'EEXIST' && !signal?.aborted && attempt < attempts;
            if (!retry) throw error;
            log(`Yeniden deneniyor (${attempt + 1}/${attempts}): ${item.key}`);
          } finally {
            await fs.unlink(tmp).catch((e) => { if (e.code !== 'ENOENT') throw e; });
          }
        }
      }

      const newRecord = {
        version: 1, key: item.key, source, id: item.id, title: item.title ?? '',
        license: item.license ?? '', licenseNormalized: verdict.license, evidenceUrl: item.evidenceUrl ?? '',
        verified: item.verified === true, decision: verdict.decision, reason: verdict.reason,
        rulesVersion: rules.version, file: rel, size: result.size, sha256: result.sha256,
        from: item.url ?? 'yerel dosya', at: new Date().toISOString(),
      };
      await publishText(work, recordRel, json(newRecord));
      await appendLedger(ledgerEntry(newRecord));
      summary[verdict.decision]++; counts[verdict.decision]++;
      log(`${{ public: 'Açık aday', private: 'Kapalı arşiv', held: 'Bekliyor' }[verdict.decision]}: ${item.key}`);
    }
  }
  return summary;
}
const ledgerEntry = (r) => ({ key: r.key, source: r.source, id: r.id, decision: r.decision, file: r.file, size: r.size, sha256: r.sha256, rulesVersion: r.rulesVersion, at: r.at });

/** Çalışma klasöründeki kayıtları kaynak ve karar başına sayar. */
export async function status(work) {
  const result = {};
  const root = path.join(work, 'records');
  let sources = [];
  try { sources = await fs.readdir(root, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const dir of sources) {
    if (!dir.isDirectory() || !segment(dir.name)) continue;
    const counts = result[dir.name] = { public: 0, private: 0, held: 0 };
    for (const file of await fs.readdir(path.join(root, dir.name))) {
      if (!file.endsWith('.json')) continue;
      const record = await readRecord(path.join(root, dir.name, file));
      if (record && record.decision in counts) counts[record.decision]++;
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'run' && args.length === 3) {
      const rules = JSON.parse(await fs.readFile(args[0], 'utf8'));
      const controller = new AbortController();
      process.once('SIGINT', () => { console.log('Durduruluyor; yarım kalan kitap sonraki çalışmada tamamlanır.'); controller.abort(); });
      const s = await intake({ rules, lists: args[1], work: args[2], signal: controller.signal, log: (m) => console.log(m) });
      console.log(`\nAçık aday: ${s.public} · Kapalı arşiv: ${s.private} · Bekleyen: ${s.held} · Zaten alınmış (atlandı): ${s.skipped}`);
      if (s.resumed) console.log(`Kesintiden kalan ${s.resumed} kitabın kaydı tamamlandı.`);
      console.log('Hiçbir yere yükleme yapılmadı. Lisans tablosu yayın kararı değildir.');
    } else if (command === 'status' && args.length === 1) {
      const counts = await status(path.resolve(args[0]));
      const names = Object.keys(counts);
      if (!names.length) console.log('Henüz alınmış kitap yok.');
      for (const name of names) console.log(`${name}: açık aday ${counts[name].public} · kapalı ${counts[name].private} · bekleyen ${counts[name].held}`);
      console.log('Hiçbir yere yükleme yapılmadı.');
    } else fail('Kullanım: intake.mjs run <kurallar.json> <liste-klasörü> <çalışma-klasörü> veya status <çalışma-klasörü>');
  } catch (error) { console.error(`Alım tamamlanamadı: ${error.message}`); process.exitCode = 1; }
}

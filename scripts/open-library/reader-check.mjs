// Açık kitaplık 4/4: okuyucu kontrolü. Kitapları Loomen okuyucusunun KENDİ açma koduyla dener
// (src/core/library/zip.ts ve epub.ts; PDF için pdfjs-dist). Ağ yok; hiçbir dosya değişmez.
// Okuyucu kodu TypeScript olduğundan esbuild'in JS API'siyle derlenir (run-tests.mjs'teki gibi);
// bu yüzden depoda `npm install` yapılmış olmalıdır.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cacheDir = path.join(root, 'node_modules', '.cache', 'loomen-reader-check');

/** Tohumlu, tekrarlanabilir seçim: anahtarlar sıralanır, sonra tohumdan türeyen karıştırma uygulanır. */
export function pickSample(keys, count, seed) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Örnek sayısı geçersiz.');
  if (typeof seed !== 'string' && typeof seed !== 'number') throw new Error('Tohum gerekli.');
  const pool = [...new Set(keys)].sort();
  let state = createHash('sha256').update(String(seed)).digest().readUInt32LE(0) || 1;
  const next = () => { // mulberry32
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(next() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort();
}

let readerPromise;
/** Okuyucunun zip ve epub kodunu derleyip içe aktarır. */
export function loadReader() {
  readerPromise ??= (async () => {
    let esbuild;
    try { esbuild = await import('esbuild'); }
    catch { throw new Error('Okuyucu kontrolü için depoda `npm install` yapılmış olmalı (esbuild bulunamadı).'); }
    await fs.mkdir(cacheDir, { recursive: true });
    const outfile = path.join(cacheDir, 'reader.mjs');
    await esbuild.build({
      stdin: {
        contents: 'export { readZip } from "./src/core/library/zip.ts"; export { parseEpub } from "./src/core/library/epub.ts";',
        resolveDir: root, sourcefile: 'reader-entry.ts', loader: 'ts',
      },
      bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
    });
    return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  })();
  return readerPromise;
}

const plain = (html) => html.replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();

async function openEpub(reader, bytes) {
  const zip = reader.readZip(bytes);
  const s = reader.parseEpub(zip);
  if (!s.spine.length) throw new Error('Okuma sırasında bölüm yok.');
  const first = s.spine.find(x => x.linear) ?? s.spine[0];
  const text = plain(zip.readText(first.path));
  if (!text) throw new Error(`İlk bölümde okunacak metin yok (${first.path}).`);
}
async function openPdf(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    if (!doc.numPages) throw new Error('PDF sayfası yok.');
    await doc.getPage(1);
  } finally { await task.destroy(); }
}

/**
 * @param {{ key: string, path: string, ext: string }[]} files
 * @returns {Promise<{ key: string, opened: boolean, reason?: string }[]>}
 */
export async function checkBooks(files) {
  const results = [];
  let reader = null;
  for (const f of files) {
    const ext = String(f.ext).toLowerCase();
    try {
      if (ext !== 'epub' && ext !== 'pdf') { results.push({ key: f.key, opened: false, reason: `Okuyucu bu biçimi açmıyor (.${ext}).` }); continue; }
      const bytes = await fs.readFile(f.path);
      if (ext === 'epub') { reader ??= await loadReader(); await openEpub(reader, bytes); }
      else await openPdf(bytes);
      results.push({ key: f.key, opened: true });
    } catch (e) {
      if (/npm install/.test(e.message)) throw e;
      results.push({ key: f.key, opened: false, reason: String(e.message ?? e).split('\n')[0] });
    }
  }
  return results;
}

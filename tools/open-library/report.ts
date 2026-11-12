import { createHash } from 'node:crypto';
import type { PackageBook } from './package.ts';
import { packageDisposition } from './package.ts';
import type { ReleasePolicy, SourceId } from './contracts.ts';
import { SOURCE_ORDER } from './sources.ts';
import { readZip } from '../../src/core/library/zip.ts';
import { parseEpub, parseXml, findFirst, xmlText } from '../../src/core/library/epub.ts';
import { validateBook } from './deduplicate.ts';

export interface ReportScope {
  kind: 'sample' | 'collection';
  /** Beklenen benzersiz kitap sayısı; küçük örneği koleksiyon diye sayma. */
  expectedRecords: number;
  inventoryComplete: boolean;
  intakeDuplicates?: Partial<Record<SourceId, number>>;
}
const complete = (row: PackageBook) => row.classification?.author.status === 'verified'
  && !!row.classification.author.name.trim() && /^Q[1-9]\d*$/.test(row.classification.author.wikidataId)
  && row.classification.categoryIds.length > 0;
function coverage(rows: readonly PackageBook[]) {
  const count = rows.filter(complete).length;
  return { total: rows.length, complete: count, ratio: rows.length ? count / rows.length : 0,
    meetsTarget: rows.length > 0 && count * 10 >= rows.length * 9 };
}
export function createLibraryReport(books: readonly PackageBook[], options: { policy?: ReleasePolicy; scope: ReportScope; seed: string }) {
  if (new Set(books.map(b => b.intake.key)).size !== books.length) throw new Error('Raporda aynı kitap iki kez sayılamaz.');
  if (!Number.isSafeInteger(options.scope.expectedRecords) || options.scope.expectedRecords < books.length) throw new Error('Beklenen kitap sayısı raporla uyuşmuyor.');
  const decisions = new Map(books.map(b => [b, packageDisposition(b, options.policy)]));
  const candidates = books.filter(b => decisions.get(b)!.status === 'prepared');
  return {
    version: 1, scope: options.scope,
    inventoryEvidence: options.scope.kind === 'collection' && options.scope.inventoryComplete && books.length === options.scope.expectedRecords,
    collectionEvidence: false,
    readyForRelease: false,
    notice: options.scope.kind === 'sample' ? 'Örnek denemedir; tam koleksiyonun işlendiğini göstermez.' : 'Bu rapor yalnız verilen envanteri kapsar; yayın izni değildir.',
    sources: SOURCE_ORDER.map(source => {
      const rows = books.filter(b => b.intake.book.source === source), reasons: Record<string, number> = Object.create(null);
      const duplicates = options.scope.intakeDuplicates?.[source] ?? 0;
      if (!Number.isSafeInteger(duplicates) || duplicates < 0) throw new Error('Tekrar sayısı geçersiz.');
      for (const row of rows) { const reason = decisions.get(row)!.reason; reasons[reason] = (reasons[reason] ?? 0) + 1; }
      if (duplicates) reasons['İlk alımda aynı kaynak ve baskı tekrar geldi.'] = duplicates;
      const count = (status: string) => rows.filter(b => decisions.get(b)!.status === status).length;
      return { source, records: rows.length + duplicates, received: rows.filter(b => b.intake.file).length,
        rejected: count('rejected') + duplicates, intakeDuplicates: duplicates, held: count('held'), prepared: count('prepared'), private: count('private'),
        reasons, coverage: coverage(rows), publicCoverage: coverage(rows.filter(b => decisions.get(b)!.status === 'prepared')) };
    }),
    coverage: { all: coverage(books), public: coverage(candidates) },
    reader: { seed: options.seed, required: 20, populationHash: '', sample: [] as string[], results: [] as ReaderResult[], passed: false },
  };
}

export interface ReaderResult { key: string; passed: boolean; arabic: boolean; reason: string }
/** Hash sıralaması girdi sırasından bağımsızdır. Her kaynaktan ve Arapçadan örnek ayırır. */
export function selectReaderSample(books: readonly PackageBook[], seed: string) {
  if (!seed.trim()) throw new Error('Rastgele seçim kaydı boş olamaz.');
  if (new Set(books.map(b => b.intake.key)).size !== books.length) throw new Error('Örneklemde çift kitap kimliği var.');
  const rank = (b: PackageBook) => createHash('sha256').update(JSON.stringify([seed, b.intake.key])).digest('hex');
  const ordered = [...books].sort((a, b) => rank(a).localeCompare(rank(b), 'en') || a.intake.key.localeCompare(b.intake.key, 'en'));
  const sample = new Map<string, PackageBook>();
  const add = (b?: PackageBook) => { if (b && sample.size < 20) sample.set(b.intake.key, b); };
  add(ordered.find(b => /^ar(?:-|$)/i.test(b.language ?? '')));
  for (const source of SOURCE_ORDER) add(ordered.find(b => b.intake.book.source === source));
  for (const row of ordered) add(row);
  return { seed, required: 20, populationHash: createHash('sha256').update(JSON.stringify(books.map(b => [b.intake.key, b.file?.sha256]).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en')))).digest('hex'), books: [...sample.values()] };
}

/** Uygulamanın ZIP/EPUB çekirdeği kullanılır; pencerenin görsel kontrolü değildir. */
export async function checkReaderSample(books: readonly PackageBook[], seed: string, load: (book: PackageBook) => Promise<Uint8Array>) {
  const selection = selectReaderSample(books, seed), results: ReaderResult[] = [];
  for (const row of selection.books) {
    let arabic = /^ar(?:-|$)/i.test(row.language ?? '');
    try {
      const data = await load(row);
      if (createHash('sha256').update(data).digest('hex') !== row.file?.sha256 || data.length !== row.file.size) throw new Error('Okuyucu örneğinin dosyası değişmiş.');
      validateBook(data, 'epub');
      const zip = readZip(data), structure = parseEpub(zip);
      arabic ||= /^ar(?:-|$)/i.test(structure.language ?? '');
      if (!structure.spine.length) throw new Error('Kitabın okunabilir bölümü yok.');
      const texts: string[] = [];
      for (const chapter of structure.spine) {
        const root = parseXml(zip.readText(chapter.path)), body = findFirst(root, 'body');
        if (!body) throw new Error('Kitabın bölüm gövdesi yok.');
        texts.push(xmlText(body));
        if (arabic && root.attrs.dir !== 'rtl' && body.attrs.dir !== 'rtl') throw new Error('Arapça bölümün sağdan sola yönü eksik.');
      }
      if (arabic) {
        if (structure.direction !== 'rtl') throw new Error('Arapça kitabın sayfa yönü eksik.');
        if (!row.expectedArabicText || !/[\u064b-\u065f\u0670]/u.test(row.expectedArabicText)) throw new Error('Hareke karşılaştırması için özgün Arapça metin eksik.');
        if (!texts.join('\n').includes(row.expectedArabicText)) throw new Error('Arapça özgün metin ve harekeler korunmamış.');
      }
      results.push({ key: row.intake.key, passed: true, arabic, reason: 'Loomen EPUB okuma kontrolü geçti.' });
    } catch (error) {
      results.push({ key: row.intake.key, passed: false, arabic, reason: error instanceof Error ? error.message : 'Kitap okunamadı.' });
    }
  }
  return { seed, required: 20, populationHash: selection.populationHash, sample: selection.books.map(b => b.intake.key), results,
    passed: results.length === 20 && results.every(r => r.passed) };
}

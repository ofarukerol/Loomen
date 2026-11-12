import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { IntakeResult, PreparedFile, ReleasePolicy } from './contracts.ts';
import type { BookClassification } from './classification.ts';
import type { PreparationDecision } from './deduplicate.ts';
import { prepareCover, type ExistingCover } from './covers.ts';
import { classifyRights } from './rights.ts';
import { SOURCE_ORDER } from './sources.ts';
import { createLibraryReport, checkReaderSample, type ReportScope } from './report.ts';
// LOM-101'in tek dosya/hedef sözleşmesi; ikinci bir yükleme biçimi üretmeyiz.
import { prepare, verify, validateLayout } from '../../scripts/open-library/prepare.mjs';

export interface PackageBook {
  intake: IntakeResult;
  preparation?: PreparationDecision;
  /** Dönüştürülmüş son dosya; özeti özgün indirme dosyasından farklı olabilir. */
  file?: PreparedFile;
  classification?: BookClassification;
  language?: string;
  /** Kapak hazırlığı için özgün kitap adı ve yazarı. Eksikse yayın hazır sayılmaz. */
  cover?: { title: string; author: string; existing?: ExistingCover };
  /** Arapça özgün gövde: yön ve harekelerin korunma karşılaştırması için. */
  expectedArabicText?: string;
}
export interface PackageLayout {
  version: 1;
  sources: string[];
  targets: Record<'public' | 'private', { bucket: string; prefix: string }>;
}

export function packageDisposition(row: PackageBook, policy?: ReleasePolicy) {
  const { intake, preparation, file } = row;
  if (intake.status === 'rejected') return { status: 'rejected' as const, reason: intake.reason };
  if (intake.status === 'held') return { status: 'held' as const, reason: intake.reason };
  if (preparation?.status === 'rejected' || preparation?.status === 'duplicate') {
    return { status: 'rejected' as const, reason: preparation.reason };
  }
  const rights = classifyRights(intake.book, policy);
  if (rights.status === 'held') return rights;
  if (!file || preparation?.status !== 'prepared') return { status: 'held' as const, reason: 'Son dosyanın okunabilirlik kontrolü eksik.' };
  if (preparation.sha256 !== file.sha256) throw new Error('Son dosya ile okunabilirlik kaydı uyuşmuyor.');
  const visibility = rights.status === 'private' ? 'private' : 'public';
  const parts = file.file.split('/');
  if (!SOURCE_ORDER.includes(intake.book.source) || file.source !== intake.book.source || file.visibility !== visibility ||
      parts[0] !== file.source || parts[1] !== visibility || parts.length < 3 ||
      parts.some(p => !/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]*$/u.test(p)) ||
      !Number.isSafeInteger(file.size) || file.size <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256) ||
      visibility === 'public' && !file.file.endsWith('.epub')) {
    throw new Error('Paket dosyasının yolu, biçimi veya hedefi geçersiz.');
  }
  if (preparation.id !== intake.key || row.classification && row.classification.bookKey !== intake.key) {
    throw new Error('Kitap ile hazırlık veya sınıflandırma kimliği uyuşmuyor.');
  }
  return { status: rights.status, reason: rights.reason };
}

/** Güvenilir yerel kök altında bağlantı izlemeyen okuma. */
export async function packageFilePath(root: string, relative: string): Promise<string> {
  const parts = relative.split('/');
  if (parts.some(p => !/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]*$/u.test(p))) throw new Error('Kitap yolu geçersiz.');
  let current = await fs.realpath(root);
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) throw new Error('Kitap yolu normal dosya ve klasörlerden oluşmalı.');
  }
  return current;
}

/** Yalnız yerel paket. Ağ, yayın ve eski dosya silme içermez. */
export async function prepareLibraryPackage(options: {
  books: readonly PackageBook[]; input: string; output: string; id: string;
  layout: PackageLayout; policy?: ReleasePolicy; scope: ReportScope; seed: string;
  resume?: boolean;
}) {
  const { books, input, output, id, layout, policy, scope, seed } = options;
  validateLayout(layout);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id) || id === '..') throw new Error('Çekim adı geçersiz.');
  if (new Set(books.map(b => b.intake.key)).size !== books.length) throw new Error('Paket aynı kitap kimliğini iki kez içeremez.');
  const selected = books.filter(b => ['prepared', 'private'].includes(packageDisposition(b, policy).status));
  if (!selected.length) throw new Error('Paketlenecek doğrulanmış kitap yok.');
  if (selected.some(b => !layout.sources.includes(b.intake.book.source))) throw new Error('Paket kaynağı depo düzeninde yok.');
  if (new Set(selected.map(b => b.file!.file)).size !== selected.length) throw new Error('İki kitap aynı dosya yolunu kullanamaz.');
  // Payda eksik sınıflandırmaları da içerir; paket üretimi yayın onayı değildir.
  const publicRows = selected.filter(b => b.file!.visibility === 'public');
  const report = createLibraryReport(books, { policy, scope, seed });
  const outputPath = path.resolve(output), inputPath = await fs.realpath(input);
  if (outputPath === inputPath || outputPath.startsWith(inputPath + path.sep) || inputPath.startsWith(outputPath + path.sep)) throw new Error('Girdi ve çıktı ayrı klasörler olmalı.');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  // Ayrı kalıcı hazırlık girdisi: kesinti olursa LOM-101 --resume ile sürdürülebilir.
  const staging = outputPath + '.inputs-' + id;
  const binding = createHash('sha256').update(JSON.stringify({ books, layout, policy, scope, seed })).digest('hex');
  if (options.resume) {
    const stat = await fs.lstat(staging);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.readFile(staging + '.json', 'utf8') !== binding) throw new Error('Devam için aynı paket girdisi ve kararlar gerekli.');
  } else {
    await fs.mkdir(staging);
    await fs.writeFile(staging + '.json', binding, { flag: 'wx' });
  }
  for (const row of selected) {
    const file = row.file!, source = await packageFilePath(input, file.file);
    const digest = createHash('sha256'); let size = 0;
    for await (const chunk of createReadStream(source)) { digest.update(chunk); size += chunk.length; }
    if (size !== file.size || digest.digest('hex') !== file.sha256) throw new Error('Paketlenecek dosya değişmiş veya bozulmuş.');
    const dest = path.join(staging, file.file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    if (options.resume) {
      try {
        const existing = await packageFilePath(staging, file.file);
        const h = createHash('sha256'); let bytes = 0;
        for await (const chunk of createReadStream(existing)) { h.update(chunk); bytes += chunk.length; }
        if (bytes !== file.size || h.digest('hex') !== file.sha256) throw new Error('Devam girdisi değişmiş.');
        continue;
      } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
    }
    try { await fs.link(source, dest); }
    catch (error) {
      if ((error as { code?: string }).code !== 'EXDEV') throw error;
      // Başka diskten kopya yarıda kalırsa taranan girdi ağacına giremez.
      const temporary = staging + '.' + randomUUID() + '.partial';
      await fs.copyFile(source, temporary, 1);
      const copied = createHash('sha256'); let bytes = 0;
      for await (const chunk of createReadStream(temporary)) { copied.update(chunk); bytes += chunk.length; }
      if (bytes !== file.size || copied.digest('hex') !== file.sha256) throw new Error('Diskler arası kopya doğrulanamadı.');
      await fs.link(temporary, dest);
    }
  }
  const covers = new Map<string, { file: string; mediaType: string; origin: string; sha256: string }>();
  const coverResults: { key: string; passed: boolean; reason: string }[] = [];
  for (const row of selected) {
    let cover;
    try {
      if (!row.cover) throw new Error('Kapak hazırlığı için kitap adı ve yazarı eksik.');
      cover = prepareCover({ ...row.cover, editionId: row.intake.book.editionId }, row.cover.existing);
    } catch (error) {
      coverResults.push({ key: row.intake.key, passed: false, reason: error instanceof Error ? error.message : 'Kapak hazırlanamadı.' });
      continue;
    }
    const extension = cover.mediaType === 'image/png' ? 'png' : cover.mediaType === 'image/jpeg' ? 'jpg' : 'svg';
    const relative = row.file!.file + '.cover.' + extension;
    const dest = path.join(staging, relative);
    // Yarım kapak taranan ağaca girmez; kesinti sonrasında yeniden üretilebilir.
    const temporary = staging + '.' + randomUUID() + '.cover.partial';
    const handle = await fs.open(temporary, 'wx');
    try {
      try { await handle.writeFile(cover.data); await handle.sync(); }
      finally { await handle.close(); }
      try { await fs.link(temporary, dest); }
      catch (error) {
        if (!options.resume || (error as { code?: string }).code !== 'EEXIST') throw error;
        if (!Buffer.from(await fs.readFile(await packageFilePath(staging, relative))).equals(Buffer.from(cover.data))) throw new Error('Devam kapağı değişmiş.');
      }
    } finally { await fs.unlink(temporary); }
    covers.set(row.intake.key, { file: relative, mediaType: cover.mediaType, origin: cover.origin,
      sha256: createHash('sha256').update(cover.data).digest('hex') });
    coverResults.push({ key: row.intake.key, passed: true, reason: cover.reason });
  }
  const sourceOrder = [...layout.sources].sort((a, b) => SOURCE_ORDER.indexOf(a as typeof SOURCE_ORDER[number]) - SOURCE_ORDER.indexOf(b as typeof SOURCE_ORDER[number]));
  let resumeSnapshot = false;
  if (options.resume) {
    try { await fs.lstat(path.join(outputPath, id, 'manifest.json')); resumeSnapshot = true; }
    catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
  }
  const directory = await prepare({ layout: { ...layout, sources: sourceOrder }, input: staging, output, id, resume: resumeSnapshot });
  await verify(directory);
  report.reader = await checkReaderSample(publicRows, seed, async row => new Uint8Array(await fs.readFile(await packageFilePath(path.join(directory, 'files'), row.file!.file))));
  report.collectionEvidence = report.inventoryEvidence && report.reader.passed && report.coverage.public.meetsTarget;
  const coversPassed = publicRows.every(row => covers.has(row.intake.key));
  report.readyForRelease = report.collectionEvidence && coversPassed;
  // Kapalı kayıtlar ayrı dosyada kalır; açık kataloğa hakları belirsiz kayıt girmez.
  const catalog = selected.map(row => ({ key: row.intake.key, source: row.intake.book.source,
    sourceUrl: row.intake.book.url, editionId: row.intake.book.editionId, rights: row.intake.book.rights,
    file: row.file, classification: row.classification, language: row.language, cover: covers.get(row.intake.key) }));
  async function publish(name: string, value: unknown) {
    const target = path.join(directory, name), content = JSON.stringify(value, null, 2) + '\n';
    // Yarım yazılmış rapor nihai adla görünmez; kesintide geçici dosya korunur.
    const temporary = target + '.' + randomUUID() + '.partial';
    const handle = await fs.open(temporary, 'wx');
    try { await handle.writeFile(content); await handle.sync(); }
    finally { await handle.close(); }
    try { await fs.link(temporary, target); }
    catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      if (!options.resume || !(await fs.lstat(target)).isFile() || (await fs.lstat(target)).isSymbolicLink() || await fs.readFile(target, 'utf8') !== content) throw new Error('Önceki paket raporu veya kataloğu farklı; üstüne yazılmadı.');
    }
  }
  for (const visibility of ['public', 'private'] as const) await publish(`catalog.${visibility}.json`, { version: 1, books: catalog.filter(b => b.file!.visibility === visibility) });
  const finalReport = { ...report, covers: { passed: coversPassed, results: coverResults } };
  await publish('report.json', finalReport);
  return { directory, staging, report: finalReport };
}

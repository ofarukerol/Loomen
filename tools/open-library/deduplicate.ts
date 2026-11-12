import { createHash } from 'node:crypto';
import { readZip } from '../../src/core/library/zip.ts';
import { parseEpub, parseXml, findFirst, findAll, findOpfPath, xmlText } from '../../src/core/library/epub.ts';

export interface PreparationBook {
  id: string;
  /** Kaynaklar arası birleştirme ancak doğrulanmış eser/baskı kimlikleriyle yapılır. */
  workId?: string;
  editionId?: string;
  translationId?: string;
  language?: string;
  format: 'epub' | 'text';
  data: Uint8Array;
}
export interface PreparationDecision {
  id: string; status: 'prepared' | 'rejected' | 'duplicate'; reason: string; sha256: string; duplicateOf?: string;
}

export function validateBook(data: Uint8Array, format: PreparationBook['format']): void {
  if (!data.length) throw new Error('Dosya boş.');
  if (format === 'text') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    if (!text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('Düz metin boş veya geçersiz karakter içeriyor.');
    return;
  }
  if (format !== 'epub') throw new Error('Kitap biçimi desteklenmiyor.');
  const zip = readZip(data);
  let total = 0;
  for (const entry of zip.entries.values()) {
    total += entry.size;
    if (entry.size > 64 * 1024 * 1024 || total > 256 * 1024 * 1024) throw new Error('EPUB açılmış boyut sınırını aşıyor.');
    if (entry.name.startsWith('/') || entry.name.includes('\\') || entry.name.split('/').includes('..')) throw new Error('EPUB içinde güvensiz yol var.');
    zip.read(entry.name); // Tüm girdilerde boyut ve CRC kontrolü; yalnız ilk bölümle yetinme.
  }
  if (zip.readText('mimetype') !== 'application/epub+zip') throw new Error('EPUB tür bilgisi geçersiz.');
  const structure = parseEpub(zip);
  const opf = parseXml(zip.readText(findOpfPath(zip)));
  const items = new Set(structure.manifest.map(item => item.id));
  for (const ref of findAll(opf, 'itemref')) {
    if (!items.has(ref.attrs.idref)) throw new Error('EPUB okuma sırasında tanımsız bölüm var.');
  }
  for (const item of structure.manifest) if (!zip.has(item.path)) throw new Error(`EPUB dosyası eksik: ${item.path}`);
  for (const chapter of structure.spine) {
    const text = zip.readText(chapter.path);
    if (text.includes('\ufffd') || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('EPUB bölümünde geçersiz metin var.');
    const body = findFirst(parseXml(text), 'body');
    if (!body || !xmlText(body).trim() && !/<(?:img|svg)\b/i.test(text)) throw new Error(`EPUB bölümü boş veya okunamıyor: ${chapter.path}`);
  }
}

/** Hiçbir dosyayı silmez/taşımaz. Her kayıt için gerekçeli ayırma kararı döndürür. */
export function deduplicateBooks(books: Iterable<PreparationBook>): PreparationDecision[] {
  const seen = new Map<string, string>(), decisions: PreparationDecision[] = [];
  for (const book of books) {
    const sha256 = createHash('sha256').update(book.data).digest('hex');
    try { validateBook(book.data, book.format); }
    catch (error) {
      decisions.push({ id: book.id, sha256, status: 'rejected', reason: error instanceof Error ? error.message : 'Dosya okunamadı.' });
      continue;
    }
    // Eksik kimliklerde başlık/yazar benzerliğinden tahmin yapma. Metin farklarını da koru.
    const identity = book.workId && book.editionId && book.language && book.translationId
      ? JSON.stringify([book.workId, book.editionId, book.language, book.translationId, book.format, sha256]) : undefined;
    const duplicateOf = identity ? seen.get(identity) : undefined;
    if (duplicateOf !== undefined) decisions.push({ id: book.id, sha256, status: 'duplicate', duplicateOf, reason: 'Aynı içerik, baskı ve çeviri zaten var.' });
    else {
      if (identity) seen.set(identity, book.id);
      decisions.push({ id: book.id, sha256, status: 'prepared', reason: identity ? 'Dosya doğrulandı.' : 'Dosya doğrulandı; eksik baskı/çeviri kimliği nedeniyle tekrar birleştirilmedi.' });
    }
  }
  return decisions;
}

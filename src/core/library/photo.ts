// Fotoğraftan alıntı — saf (LOM-87).
//
// Basılı kitap sayfasının fotoğrafı yapay zekâ sağlayıcısına gönderilir (`core/ai/ocr.ts`), dönen
// metin burada temizlenir (`cleanOcrText`), kullanıcının seçtiği kısım kitabın kaydına `photo`
// çıpalı çizim olarak işlenir (`applyPhotoQuote`).
//
// Kimlikler deterministiktir (tekrar koruması):
//  - Çizim: 'p' + SHA-256(alıntı anahtarı) ilk 10 hane. Anahtar paylaşım alıntısıyla aynıdır
//    (`quoteKey`: işaretsiz, küçük harf, yalnız harf/rakam, tek boşluk); çift kayıt denetimi kitabın
//    BÜTÜN çizimlerinde yapılır — aynı cümle okuyucudan, Kindle'dan ya da paylaşımdan gelmişse
//    fotoğraftan ikinci kez eklenmez.
//  - Raftaki kitapla eşleşmeyen basılı kitap için açılan dosyasız `paper` kayıt: özeti
//    SHA-256("paper|" + normalleştirilmiş "başlık|yazar"), kimlik ilk 16 hane.

import { kindleBookKey } from "./kindle";
import { addHighlight, cleanQuote, newBook, newHighlightId, sha256Hex } from "./model";
import { findSharedDuplicate, quoteKey } from "./share";
import { DEFAULT_HIGHLIGHT_COLOR, type Book, type Highlight, type PhotoAnchor } from "./types";

/** Sağlayıcıdan dönen metnin üst sınırı (bir sayfa birkaç bin karakterdir; fazlası kırpılır). */
export const OCR_TEXT_MAX = 20000;
const META_MAX = 200;
/** Kullanıcının yazabileceği en büyük sayfa numarası (yanlış girişe karşı). */
const PAGE_MAX = 100000;

const enc = (s: string) => new TextEncoder().encode(s);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
/** En çok `max` UTF-16 birimine kırp; ortadan bölünen vekil çifti (emoji vb.) atılır. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = s.slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(out)) out = out.slice(0, -1);
  return out;
}

/**
 * Sağlayıcının okuduğu metni düzle:
 *  - görünmez işaret (BOM), yumuşak tire ve Windows satır sonları atılır;
 *  - model metni kod bloğuna (```) sardıysa çit satırları atılır;
 *  - satır sonunda bölünmüş sözcük birleşir ("bil-\ngi" → "bilgi"; tireden önce ve sonra harf varsa);
 *  - paragraf içindeki tek satır sonları boşluk olur, boş satırla ayrılan paragraflar korunur;
 *  - fazla boşluk tek boşluk olur, baş ve son boşluk atılır.
 */
export function cleanOcrText(raw: string): string {
  let s = (raw ?? "").replace(/^﻿/, "").replace(/­/g, "").replace(/\r\n?/g, "\n");
  s = s
    .split("\n")
    .filter((l) => !/^\s*```[\w-]*\s*$/.test(l))
    .join("\n");
  // Satır sonundaki tire + küçük harfle başlayan sonraki satır: bölünmüş sözcük.
  s = s.replace(/(\p{L})-[ \t]*\n[ \t]*(\p{Ll})/gu, "$1$2");
  const paragraphs = s
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/[ \t]*\n[ \t]*/g, " ").replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
  const out = paragraphs.join("\n\n");
  return clip(out, OCR_TEXT_MAX).trimEnd();
}

/** Deterministik çizim kimliği: 'p' + SHA-256(alıntı anahtarı) ilk 10 hane. */
export async function photoHighlightId(text: string): Promise<string> {
  return "p" + (await sha256Hex(enc(quoteKey(text)))).slice(0, 10);
}

/** Dosyasız basılı kitap kaydının özeti (64 hane): "paper|" + normalleştirilmiş "başlık|yazar". */
export function paperBookHash(title: string, author?: string): Promise<string> {
  return sha256Hex(enc("paper|" + kindleBookKey(oneLine(title), oneLine(author ?? ""))));
}

/** Fotoğraf çıpası; sayfa 1..100000 arası tam sayıysa yazılır, değilse atlanır. */
export function photoAnchor(page?: number): PhotoAnchor {
  const a: PhotoAnchor = { kind: "photo" };
  if (page !== undefined && Number.isInteger(page) && page >= 1 && page <= PAGE_MAX) a.page = page;
  return a;
}

export interface PhotoQuoteInput {
  quote: string;
  page?: number;
  /** Yeni basılı kitap kaydı için zorunlu. */
  title?: string;
  author?: string;
  /** Kullanıcının çizime eklediği not (isteğe bağlı). */
  note?: string;
}

export interface PhotoNewBookInput {
  notePath: string;
  /** `paperBookHash` sonucu; verilmezse başlık/yazardan hesaplanır. */
  hash?: string;
}

export interface PhotoApplyResult {
  /** Çift kayıtta verilen kitabın KENDİSİ (yazım gerekmez). */
  book: Book;
  created: boolean;
  /** Eklenen çizim; çift kayıtta null. */
  added: Highlight | null;
  duplicate: boolean;
}

/**
 * Fotoğraftan alınan alıntıyı kayda işle. `existing` herhangi bir biçimdeki raf kitabıdır; yoksa
 * başlıktan dosyasız `paper` kayıt açılır (`init` ve başlık zorunlu). Aynı alıntı kitapta varsa
 * hiçbir şey değişmez (`duplicate`). Boş alıntı hata atar. Renk varsayılan (sarı).
 */
export async function applyPhotoQuote(
  existing: Book | null,
  input: PhotoQuoteInput,
  now: number,
  init?: PhotoNewBookInput,
): Promise<PhotoApplyResult> {
  const quote = clip(cleanQuote(input.quote ?? ""), OCR_TEXT_MAX);
  if (!quote) throw new Error("Boş alıntı eklenmez");
  let book: Book;
  let created = false;
  if (existing) {
    if (findSharedDuplicate(existing, quote)) return { book: existing, created: false, added: null, duplicate: true };
    book = existing;
  } else {
    const title = oneLine(input.title ?? "").slice(0, META_MAX);
    if (!init?.notePath || !title) throw new Error("Yeni basılı kitap kaydı için başlık ve not yolu gerekir");
    const author = oneLine(input.author ?? "").slice(0, META_MAX);
    const hash = init.hash ?? (await paperBookHash(title, author));
    book = newBook({ hash, size: 0, fileName: "", format: "paper", notePath: init.notePath, title }, now);
    if (author) book.author = author;
    created = true;
  }
  let id = await photoHighlightId(quote);
  if (book.highlights.some((h) => h.id === id)) id = newHighlightId(book.highlights.map((h) => h.id));
  const r = addHighlight(
    book,
    { text: quote, anchor: photoAnchor(input.page), color: DEFAULT_HIGHLIGHT_COLOR, note: input.note },
    now,
    id,
  );
  return { book: r.book, created, added: r.highlight, duplicate: false };
}

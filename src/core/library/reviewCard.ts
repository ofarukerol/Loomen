// Çizimden Tekrar kartı (LOM-91): altı çizilen cümle kitabın kendi Tekrar listesine satır olur.
//
// Liste: `Tekrar/Listeler/kitap-<kitapId>.txt` — kimlik kitaptan türer, her cihazda aynı listeye
// düşer. Ön yüz cümle; arka yüz kitabın adı (+ yazar) ve yeri; çizim notu satırın notu olur.
// Aynı cümle (boşluk / büyük-küçük harf farkı sayılmadan) ikinci kez eklenmez.
//
// NOTE_SAFETY: bu modül dosyaya dokunmaz; yazma `saveList` ile yalnız liste dosyasına yapılır.
// Saf modül: React, i18n ve dosya erişimi yok.

import { DEFAULT_LIST_COLOR, normalizeRow, type ListRow, type ReviewList } from "../srs/lists";
import { normalizeKey } from "../srs/parser";
import { cleanQuote } from "./model";
import { DEFAULT_NOTE_LABELS, locationLabel, type NoteLabels } from "./noteSync";
import type { Book, Highlight } from "./types";

export const BOOK_LIST_EMOJI = "📖";

/** Kitabın Tekrar listesinin kimliği (dosya adı). Kitap kimliği 16 küçük hex olduğundan LIST_ID_RE'ye uyar. */
export const bookListId = (bookId: string) => `kitap-${bookId}`;

/** Kitap için boş Tekrar listesi: adı kitabın başlığı, tek yönlü (cümle → kitap). */
export function newBookReviewList(book: Pick<Book, "id" | "title">, now: number): ReviewList {
  return {
    id: bookListId(book.id),
    name: book.title.trim() || book.id,
    emoji: BOOK_LIST_EMOJI,
    color: DEFAULT_LIST_COLOR,
    direction: "front",
    newPerDay: null,
    createdAt: now,
    rows: [],
  };
}

/** Çizimden liste satırı (dosyaya yazılabilir biçimde). */
export function highlightRow(
  book: Pick<Book, "title" | "author">,
  h: Highlight,
  labels: NoteLabels = DEFAULT_NOTE_LABELS,
): ListRow {
  const author = book.author?.trim();
  const back = `${book.title.trim()}${author ? " — " + author : ""} · ${locationLabel(h, labels)}`;
  return normalizeRow({ front: cleanQuote(h.text), back, note: h.note });
}

const quoteKey = (text: string) => normalizeKey(normalizeRow({ front: cleanQuote(text), back: "x" }).front);

/** Cümle listede zaten var mı? Dosyaya yazılırken yapılan dönüşüm ("::" → ": :") de hesaba katılır. */
export function quoteInList(list: Pick<ReviewList, "rows"> | null | undefined, text: string): boolean {
  if (!list) return false;
  const k = quoteKey(text);
  if (!k) return false;
  return list.rows.some((r) => normalizeKey(normalizeRow(r).front) === k);
}

/** Çizimi listeye ekle. Cümle zaten varsa aynı liste nesnesi döner (`added` false). */
export function addHighlightRow(
  list: ReviewList,
  book: Pick<Book, "title" | "author">,
  h: Highlight,
  labels: NoteLabels = DEFAULT_NOTE_LABELS,
): { list: ReviewList; added: boolean } {
  const row = highlightRow(book, h, labels);
  if (!row.front || quoteInList(list, h.text)) return { list, added: false };
  return { list: { ...list, rows: [...list.rows, row] }, added: true };
}

// Asistanın kütüphane bilgisi (LOM-87) — saf metin işlemleri.
//
// Asistan notları parça parça arar; kitap kayıtlarındaki çizimler ise kasada JSON olarak durur
// ve kitap notu kullanıcı tarafından değiştirilmiş olabilir. Bu modül iki şey üretir:
//
//  1. Raf özeti (digest): kitap adı, yazarı, durumu, sayfası ve çizim sayısı. Her soruda token
//     harcamasın diye yalnız soru kitapla ilgiliyse sistem metnine girer; değilse tek satırlık
//     "rafta N kitap var" ipucu yeter. Uzunluğu sınırlıdır (~40 kitap / ~1500 karakter).
//  2. Çizim bağlamı: soruda adı ya da yazarı geçen kitabın çizimleri, getirilen not parçalarıyla
//     AYNI biçimde (Retrieved) üretilir. Böylece alıntı numarası ve "kaynağı aç" bağlantısı
//     değişmeden çalışır; kaynak kitabın notudur.
//
// Ad eşleştirme Paylaş menüsündeki (LOM-96) normalleştirmeyle aynıdır: Türkçe "ı/İ", aksanlar ve
// noktalama yok sayılır. Türkçe ekler için yalnız sözcük BAŞI aranır ("Sapiens'ten", "Harari'nin").

import type { Retrieved } from "./retrieve";
import { normalizeTitle } from "../library/share";
import { DEFAULT_NOTE_LABELS, locationLabel, type NoteLabels } from "../library/noteSync";
import type { Book, BookStatus } from "../library/types";

/** Özetin ve bağlamın ihtiyaç duyduğu kitap alanları. */
export type LibraryBook = Pick<
  Book,
  "id" | "title" | "author" | "format" | "status" | "notePath" | "pages" | "progress" | "updatedAt" | "highlights"
>;

export interface DigestOptions {
  /** En çok kaç kitap listelensin. */
  maxBooks?: number;
  /** Özetin karakter sınırı. */
  maxChars?: number;
}

const DIGEST_MAX_BOOKS = 40;
const DIGEST_MAX_CHARS = 1500;
/** Bir kitabın çizim bağlamı için varsayılan karakter bütçesi. */
const HIGHLIGHTS_MAX_CHARS = 3000;
/** Tek sahte parçanın hedef uzunluğu (not parçalarıyla aynı mertebe). */
const PIECE_CHARS = 800;
/** Ad/yazar eşleşmesi için en kısa normalleştirilmiş uzunluk ("Su" gibi adlar her soruya uymasın). */
const MIN_MATCH = 4;
/** Tek alıntının bağlamdaki en çok uzunluğu (çok uzun seçim bütçeyi tek başına yemesin). */
const QUOTE_MAX = 600;

const STATUS_TEXT: Record<BookStatus, string> = {
  reading: "okunuyor",
  toread: "okunacak",
  done: "bitti",
};
const STATUS_RANK: Record<BookStatus, number> = { reading: 0, done: 1, toread: 2 };

/** Sistem metnine girecek tek satır — kullanıcı metni tırnak/satır kırmasın. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
/** Özette başlık/yazar en çok bu kadar karakter (tek kitap bütçeyi yemesin). */
const NAME_MAX = 100;
const clip = (s: string) => {
  const t = oneLine(s);
  return t.length > NAME_MAX ? t.slice(0, NAME_MAX - 1).trimEnd() + "…" : t;
};

function digestLine(b: LibraryBook): string {
  const parts = [`"${clip(b.title)}"`];
  if (b.author?.trim()) parts[0] += ` — ${clip(b.author)}`;
  const meta = [STATUS_TEXT[b.status] ?? b.status];
  if (b.status === "reading" && typeof b.progress === "number" && b.progress > 0) {
    meta.push(`%${Math.round(Math.min(1, b.progress) * 100)}`);
  }
  if (b.pages && (b.format === "pdf" || b.format === "epub")) {
    meta.push(b.format === "pdf" ? `${b.pages} sayfa` : `${b.pages} bölüm`);
  }
  meta.push(`${b.highlights.length} çizim`);
  return `- ${parts[0]} · ${meta.join(" · ")}`;
}

/**
 * Raf özeti: okunanlar önce, sonra bitenler, sonra okunacaklar; her grupta son değişen önce.
 * Sınır aşılırsa kalan kitap sayısı son satırda söylenir. Raf boşsa boş metin.
 */
export function libraryDigest(books: readonly LibraryBook[], opts: DigestOptions = {}): string {
  if (books.length === 0) return "";
  const maxBooks = opts.maxBooks ?? DIGEST_MAX_BOOKS;
  const maxChars = opts.maxChars ?? DIGEST_MAX_CHARS;
  const sorted = [...books].sort(
    (a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) || b.updatedAt - a.updatedAt,
  );
  const total = sorted.reduce((n, b) => n + b.highlights.length, 0);
  const head = `Rafta ${books.length} kitap, toplam ${total} çizim var.`;
  const lines = [head];
  let used = head.length;
  let shown = 0;
  // Son satıra ("… ve N kitap daha.") yer bırak.
  const reserve = 32;
  for (const b of sorted) {
    if (shown >= maxBooks) break;
    const line = digestLine(b);
    const last = shown === sorted.length - 1;
    if (used + line.length + 1 + (last ? 0 : reserve) > maxChars && shown > 0) break;
    lines.push(line);
    used += line.length + 1;
    shown++;
  }
  if (shown < sorted.length) lines.push(`… ve ${sorted.length - shown} kitap daha.`);
  return lines.join("\n");
}

/** Raf boş değilse soru kitapla ilgili olmadığında verilecek tek satırlık ipucu. */
export function libraryHint(books: readonly LibraryBook[]): string {
  return books.length ? `Kullanıcının Kütüphane'sinde ${books.length} kitap var.` : "";
}

/** Normalleştirilmiş metinde `needle` bir sözcüğün BAŞINDA geçiyor mu? (Türkçe ekler serbest.) */
function startsWord(hay: string, needle: string): boolean {
  return needle.length >= MIN_MATCH && ` ${hay}`.includes(` ${needle}`);
}

/** Ana başlık: alt başlık ayracından (":", "(", tire) önceki kısım. */
const mainTitle = (s: string) => normalizeTitle(s.split(/[:(—–]|\s-\s/)[0]);

/**
 * Soruda adı ya da yazarı geçen kitaplar. Önce başlığı (ya da ana başlığı) geçenler, sonra yalnız
 * yazarı geçenler. Yazar için tam ad ya da soyadı (son sözcük) yeter. 4 karakterden kısa adlar
 * eşleşmez. Sıra raftaki sırayı korur.
 */
export function matchBooksInQuestion<B extends LibraryBook>(books: readonly B[], question: string): B[] {
  const q = normalizeTitle(question);
  if (!q) return [];
  const byTitle: B[] = [];
  const byAuthor: B[] = [];
  for (const b of books) {
    const t = normalizeTitle(b.title);
    const m = mainTitle(b.title);
    if (startsWord(q, t) || (m !== t && startsWord(q, m))) {
      byTitle.push(b);
      continue;
    }
    const a = normalizeTitle(b.author);
    if (!a) continue;
    // Soyadı: "Soyad, Ad" yazımında (Kindle sık kullanır) ilk sözcük, değilse son sözcük.
    const words = a.split(" ");
    const surname = (b.author ?? "").includes(",") ? words[0] : words[words.length - 1];
    if (startsWord(q, a) || startsWord(q, surname ?? "")) byAuthor.push(b);
  }
  return [...byTitle, ...byAuthor];
}

// Sözcük başında aranan kitap anahtar kelimeleri (normalleştirilmiş: ı→i, ç→c, aksansız).
// "çiz" tek başına "çizelge"yi de yakalardı; bu yüzden çekimli biçimler sayılır. "kitap" ünlüyle
// başlayan ekte yumuşar ("kitabın"), "yazar" fiil de olabilir ("yazarak"): ikisi daraltılır.
const BOOK_WORD_RE = new RegExp(
  "(?:^| )(?:" +
    [
      "kita[pb]",
      "kutuphane",
      "ciz(?:d|di|dig|dik|dim|il|im|ip|mis|tig|ti|er)",
      "alinti",
      "altini ciz",
      "okud",
      "okum",
      "okuy",
      "okun",
      "yazar(?:lar|lari|larin|larini|in|i|ini|im|imin)?(?: |$)",
      "roman(?:lar|lari|larda|i|in|da|dan|im|imi|imda)?(?: |$)",
      "book(?:s)?(?: |$)",
      "highlight",
      "quote",
      "underlin",
      "read(?:ing)?(?: |$)",
      "author",
      "library",
    ].join("|") +
    ")",
);

/** Soru kitaplarla ya da çizimlerle mi ilgili? (Raf özeti yalnız o zaman sistem metnine girer.) */
export function isBookQuestion(question: string): boolean {
  return BOOK_WORD_RE.test(normalizeTitle(question));
}

export interface HighlightsContextOptions {
  /** Bu kitabın çizimleri için karakter bütçesi. */
  maxChars?: number;
  /** Yer etiketleri (uygulama dili). Varsayılan Türkçe. */
  labels?: NoteLabels;
  /** Parça başlığı (alıntıda "Kitap › Çizimler" olarak görünür). */
  heading?: string;
}

/** Tek çizimin bağlam satırları: alıntı, yer etiketi ve varsa kullanıcının notu. */
function highlightText(h: Book["highlights"][number], labels: NoteLabels): string {
  const flat = oneLine(h.text);
  const quote = flat.length > QUOTE_MAX ? flat.slice(0, QUOTE_MAX).replace(/\s+\S*$/, "") + " …" : flat;
  const where = locationLabel(h, labels);
  const lines = [`> ${quote} (${where})`];
  const note = h.note?.trim();
  if (note) lines.push(`Not: ${oneLine(note)}`);
  return lines.join("\n");
}

/**
 * Kitabın çizimlerini getirilen not parçası biçiminde verir (kaynak = kitabın notu). Çizimler
 * kitap sırasıyla ~800 karakterlik parçalara toplanır; bütçe dolunca kalanların sayısı son
 * parçaya yazılır. Çizim yoksa "henüz çizim yok" diyen tek parça döner — asistan uydurmasın.
 */
export function highlightsContext(book: LibraryBook, opts: HighlightsContextOptions = {}): Retrieved[] {
  const maxChars = opts.maxChars ?? HIGHLIGHTS_MAX_CHARS;
  const labels = opts.labels ?? DEFAULT_NOTE_LABELS;
  const heading = opts.heading ?? "Çizimler";
  const author = book.author?.trim() ? ` — ${oneLine(book.author)}` : "";
  const head = `Kitap: "${oneLine(book.title)}"${author} (${book.highlights.length} çizim)`;

  const pieces: string[] = [];
  let cur = head;
  let used = head.length;
  let taken = 0;
  for (const h of book.highlights) {
    const t = highlightText(h, labels);
    if (used + t.length + 2 > maxChars && taken > 0) break;
    if (cur.length + t.length + 2 > PIECE_CHARS && cur !== head) {
      pieces.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${t}` : t;
    used += t.length + 2;
    taken++;
  }
  const rest = book.highlights.length - taken;
  if (book.highlights.length === 0) cur += "\nBu kitapta henüz çizim yok.";
  else if (rest > 0) cur += `\n\n(… ve ${rest} çizim daha; yer yetmediği için gösterilmedi.)`;
  pieces.push(cur);

  return pieces.map((text, index) => ({
    chunk: { path: book.notePath, title: oneLine(book.title), heading, text, index },
    // Getirilen not parçalarının önüne konur; skor yalnız sıra içindir.
    score: 1 - index / 1000,
  }));
}

export interface LibraryPromptOptions {
  /** Bütün eşleşen kitapların çizimleri için toplam bütçe. */
  maxChars?: number;
  /** En çok kaç kitabın çizimleri eklensin. */
  maxBooks?: number;
  labels?: NoteLabels;
  heading?: string;
  digest?: DigestOptions;
}

export interface LibraryPromptContext {
  /** Getirilen not parçalarının ÖNÜNE konacak çizim parçaları. */
  hits: Retrieved[];
  /** `PromptOptions.library`: kitap sorusunda raf özeti, değilse tek satırlık ipucu; raf boşsa boş. */
  library: string;
  /** Soruda geçen kitaplar. */
  matched: LibraryBook[];
}

/**
 * Asistanın bir soru için kütüphane payı: soruda geçen kitapların (en çok 3) çizimleri ve raf
 * özeti. Kitap geçiyorsa ya da soru kitapla ilgiliyse özetin tamamı, değilse yalnız ipucu verilir.
 */
export function libraryPromptContext(
  books: readonly LibraryBook[],
  question: string,
  opts: LibraryPromptOptions = {},
): LibraryPromptContext {
  if (books.length === 0) return { hits: [], library: "", matched: [] };
  const matched = matchBooksInQuestion(books, question).slice(0, opts.maxBooks ?? 3);
  const budget = opts.maxChars ?? HIGHLIGHTS_MAX_CHARS;
  const per = matched.length ? Math.max(600, Math.floor(budget / matched.length)) : 0;
  const hits = matched.flatMap((b) =>
    highlightsContext(b, { maxChars: per, labels: opts.labels, heading: opts.heading }),
  );
  const about = matched.length > 0 || isBookQuestion(question);
  return { hits, library: about ? libraryDigest(books, opts.digest) : libraryHint(books), matched };
}

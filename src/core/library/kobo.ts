// Kobo çizimlerini içe aktarma — saf (LOM-95).
//
// Kaynak: Kobo'nun kökteki gizli `.kobo/KoboReader.sqlite` veritabanı (`sqlite.ts` salt okunur
// çözer; SQL çalıştırılmaz). Kullanılan tablolar:
//  - `content`: ContentType 6 satırı kitaptır (ContentID → Title, Attribution). ContentType 9 ve 899
//    (ya da BookID dolu) satırlar bölümdür (ContentID → Title, VolumeIndex = bölüm sırası, BookID).
//  - `Bookmark`: her satır bir çizim/not/yer imi. VolumeID kitabı, ContentID bölümü gösterir; Text
//    alıntı, Annotation kullanıcının notu, DateCreated an (ISO, UTC), ChapterProgress bölüm içi
//    ilerleme (0..1), Hidden 'true' ise silinmiş/gizli, Type 'dogear' yer imi, 'markup' kalem
//    çizimi (ikisi de alınmaz), Color renk sırası (yeni sürümlerde).
//
// Kimlikler deterministiktir (tekrar koruması):
//  - Kitap: özeti SHA-256("kobo|" + normalleştirilmiş "başlık|yazar"), kimlik ilk 16 hane.
//    "kobo|" öneki aynı başlıklı Kindle ve KOReader kayıtlarıyla çakışmayı önler.
//  - Çizim: 'b' + SHA-256(sadeleştirilmiş alıntı) ilk 10 hane (KOReader'daki gibi; konum girmez).
//    Bilinen sınır: aynı kitapta birebir aynı iki alıntı tek çizim sayılır.

import { kindleBookKey } from "./kindle";
import { addHighlight, baseName, cleanQuote, newBook, sha256Hex, updateHighlight } from "./model";
import { openSqlite, sqlCol, type SqlRow, type SqlValue } from "./sqlite";
import { DEFAULT_HIGHLIGHT_COLOR, type Book, type Highlight, type HighlightColor, type KoboAnchor } from "./types";

/** Kobo cihazında veritabanının kökten yolu. */
export const KOBO_DB_PATH = ".kobo/KoboReader.sqlite";

export interface KoboHighlightInput {
  text: string;
  /** Bölüm içi ilerleme 0..1. */
  progress: number;
  /** Kobo bölüm sırası (0'dan); bilinmiyorsa yok. */
  chapterIndex?: number;
  /** Bölüm adı. */
  chapter?: string;
  note?: string;
  /** Kobo'da çizilme anı (ms); çözülemezse yok. */
  addedAt?: number;
  color: HighlightColor;
}

export interface KoboBook {
  /** Normalleştirilmiş "başlık|yazar" — kitabın özeti bundan türer. */
  key: string;
  title: string;
  author?: string;
  /** Kitap sırasıyla (bölüm, ilerleme, an), tekrarsız. */
  highlights: KoboHighlightInput[];
}

export interface KoboGroups {
  /** Veritabanındaki ilk görünüş sırasıyla. */
  books: KoboBook[];
  /** Atlanan girdiler: gizli, yer imi, kalem çizimi ya da metinsiz. */
  skipped: number;
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────────

const str = (v: SqlValue | undefined): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const oneLine = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const num = (v: SqlValue | undefined): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

/** Kobo renk sırasını Loomen rengine eşle: 0 sarı, 1 pembe, 2 yeşil, 3 mavi; diğerleri sarı. */
export function koboColor(c: SqlValue | undefined): HighlightColor {
  const n = num(c ?? null);
  if (n === 1) return "pink";
  if (n === 2) return "green";
  if (n === 3) return "blue";
  return DEFAULT_HIGHLIGHT_COLOR;
}

/** Kobo tarihi ("YYYY-MM-DDTHH:MM:SS[.sss][Z]", saat dilimi yoksa UTC) → ms; olmazsa undefined. */
export function parseKoboDate(v: SqlValue | undefined): number | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*(Z|[+-]\d{2}:?\d{2})?\s*$/i.exec(v);
  if (!m) return undefined;
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return undefined;
  const ms = m[7] ? Math.floor(Number(m[7].padEnd(3, "0").slice(0, 3))) : 0;
  let t = Date.UTC(y, mo - 1, d, h, mi, se, ms);
  const tz = m[8];
  if (tz && tz.toUpperCase() !== "Z") {
    const sign = tz[0] === "-" ? -1 : 1;
    const digits = tz.slice(1).replace(":", "");
    t -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * 60000;
  }
  return Number.isFinite(t) ? t : undefined;
}

const isTrue = (v: SqlValue | undefined) => v === 1 || (typeof v === "string" && /^(true|1)$/i.test(v.trim()));

/** VolumeID yolundan başlık: son parça, URL çözülmüş, kitap uzantısı atılmış. */
export function koboTitleFromPath(path: string): string {
  if (!path) return "";
  let name = baseName(path.replace(/^file:\/\//i, ""));
  name = name.replace(/\.kepub\.epub$/i, "").replace(/\.(epub|pdf|kepub|mobi|cbz|txt)$/i, "");
  return name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

/** Kitap anahtarı: Kindle ile aynı normalleştirme (NFC, küçük harf, tek boşluk). */
export function koboBookKey(title: string, author?: string): string {
  return kindleBookKey(title, author);
}

interface Chapter {
  id: string;
  title?: string;
  index?: number;
  bookId: string;
}

function chapterFor(contentId: string, volumeId: string, byId: Map<string, Chapter>, byBook: Map<string, Chapter[]>): Chapter | undefined {
  if (!contentId) return undefined;
  const exact = byId.get(contentId);
  if (exact) return exact;
  const noFrag = contentId.split("#")[0];
  const frag = byId.get(noFrag);
  if (frag) return frag;
  // Aynı kitabın bölümleri içinde en uzun önek eşleşmesi (kepub bölüm kimlikleri "-1" gibi ek alır).
  let best: Chapter | undefined;
  let bestLen = 0;
  for (const c of byBook.get(volumeId) ?? []) {
    const len = c.id.startsWith(noFrag) ? noFrag.length : noFrag.startsWith(c.id) ? c.id.length : 0;
    if (len > bestLen) {
      best = c;
      bestLen = len;
    }
  }
  return best;
}

/**
 * Kobo veritabanının baytlarını oku. SQLite değilse, bozuksa ya da Kobo tabloları yoksa hata atar.
 * Çizimi olmayan kitaplar listeye girmez.
 */
export function parseKoboDatabase(bytes: Uint8Array): KoboGroups {
  const db = openSqlite(bytes);
  const tables = db.tables().map((t) => t.toLowerCase());
  if (!tables.includes("bookmark")) throw new Error("Kobo veritabanı değil: Bookmark tablosu yok");
  const content: SqlRow[] = tables.includes("content") ? db.rows("content") : [];

  const books = new Map<string, { title: string; author?: string }>();
  const chapById = new Map<string, Chapter>();
  const chapByBook = new Map<string, Chapter[]>();
  for (const r of content) {
    const id = str(sqlCol(r, "ContentID"));
    if (!id) continue;
    const type = str(sqlCol(r, "ContentType")).trim();
    const bookId = str(sqlCol(r, "BookID"));
    if (type === "6") {
      books.set(id, { title: oneLine(str(sqlCol(r, "Title"))), author: oneLine(str(sqlCol(r, "Attribution"))) || undefined });
    } else if (type === "9" || type === "899" || bookId) {
      const idx = num(sqlCol(r, "VolumeIndex"));
      const c: Chapter = { id, bookId };
      const title = oneLine(str(sqlCol(r, "Title")));
      if (title) c.title = title;
      if (idx !== undefined && Number.isInteger(idx) && idx >= 0) c.index = idx;
      chapById.set(id, c);
      if (bookId) {
        const list = chapByBook.get(bookId) ?? [];
        list.push(c);
        chapByBook.set(bookId, list);
      }
    }
  }

  let skipped = 0;
  const groups = new Map<string, { book: KoboBook; seen: Map<string, KoboHighlightInput>; order: number }>();
  let seq = 0;
  for (const r of db.rows("Bookmark")) {
    const type = str(sqlCol(r, "Type")).trim().toLowerCase();
    const text = str(sqlCol(r, "Text"));
    const quote = cleanQuote(text);
    if (isTrue(sqlCol(r, "Hidden")) || type === "dogear" || type === "markup" || !quote) {
      skipped++;
      continue;
    }
    const volumeId = str(sqlCol(r, "VolumeID"));
    const meta = books.get(volumeId);
    const title = meta?.title || koboTitleFromPath(volumeId) || "Kobo";
    const author = meta?.author;
    const key = koboBookKey(title, author);
    let g = groups.get(key);
    if (!g) {
      const book: KoboBook = { key, title, highlights: [] };
      if (author) book.author = author;
      g = { book, seen: new Map(), order: seq++ };
      groups.set(key, g);
    }
    const prog = num(sqlCol(r, "ChapterProgress"));
    const h: KoboHighlightInput = {
      text,
      progress: prog === undefined ? 0 : Math.min(1, Math.max(0, prog)),
      color: koboColor(sqlCol(r, "Color")),
    };
    const ch = chapterFor(str(sqlCol(r, "ContentID")), volumeId, chapById, chapByBook);
    if (ch?.index !== undefined) h.chapterIndex = ch.index;
    if (ch?.title) h.chapter = ch.title;
    const note = str(sqlCol(r, "Annotation")).trim();
    if (note) h.note = note;
    const at = parseKoboDate(sqlCol(r, "DateCreated"));
    if (at !== undefined) h.addedAt = at;

    const dup = g.seen.get(quote);
    if (dup) {
      if (!dup.note && h.note) dup.note = h.note;
      if (h.addedAt !== undefined && (dup.addedAt === undefined || h.addedAt < dup.addedAt)) dup.addedAt = h.addedAt;
      continue;
    }
    g.seen.set(quote, h);
    g.book.highlights.push(h);
  }

  const list = [...groups.values()].sort((a, b) => a.order - b.order).map((g) => g.book);
  const big = Number.MAX_SAFE_INTEGER;
  for (const b of list) {
    const idx = new Map(b.highlights.map((h, i) => [h, i]));
    b.highlights.sort(
      (x, y) =>
        (x.chapterIndex ?? big) - (y.chapterIndex ?? big) ||
        x.progress - y.progress ||
        (x.addedAt ?? 0) - (y.addedAt ?? 0) ||
        idx.get(x)! - idx.get(y)!,
    );
  }
  return { books: list.filter((b) => b.highlights.length > 0), skipped };
}

// ─── Kimlikler ────────────────────────────────────────────────────────────────────

const enc = (s: string) => new TextEncoder().encode(s);

/** Kobo kitabının özeti (64 hane): "kobo|" + normalleştirilmiş "başlık|yazar". */
export function koboBookHash(title: string, author?: string): Promise<string> {
  return sha256Hex(enc("kobo|" + koboBookKey(title, author)));
}

/** Deterministik çizim kimliği: 'b' + SHA-256(sadeleştirilmiş alıntı) ilk 10 hane. */
export async function koboHighlightId(h: Pick<KoboHighlightInput, "text">): Promise<string> {
  return "b" + (await sha256Hex(enc(cleanQuote(h.text)))).slice(0, 10);
}

export function koboAnchor(h: Pick<KoboHighlightInput, "progress" | "chapterIndex">): KoboAnchor {
  const a: KoboAnchor = { kind: "kobo", progress: Math.min(1, Math.max(0, Number.isFinite(h.progress) ? h.progress : 0)) };
  if (h.chapterIndex !== undefined) a.chapter = h.chapterIndex;
  return a;
}

// ─── Kayda işleme ─────────────────────────────────────────────────────────────────

export interface KoboApplyResult {
  /** Değişiklik yoksa verilen kitabın KENDİSİ (yazım gerekmez). */
  book: Book;
  created: boolean;
  added: Highlight[];
  /** Notu değişen çizimler: blok `prev`'den üretilmişse yeniden yazılır. */
  updated: { prev: Highlight; next: Highlight }[];
  same: number;
  skipped: number;
}

export interface KoboNewBookInput {
  /** `koboBookHash` sonucu. */
  hash: string;
  notePath: string;
}

/**
 * Bir kitabın Kobo çizimlerini kayda işle (`applyKoreaderBook` ile aynı sözleşme). `existing` yoksa
 * yeni Kobo kaydı oluşturulur (`init` zorunlu). Kayıtta olmayan çizim eklenir (renk Kobo'dan,
 * oluşma anı Kobo'daki an); olanın Kobo notu değiştiyse not güncellenir. Kobo'da notu olmayan
 * çizimin Loomen'daki notu silinmez.
 */
export async function applyKoboBook(existing: Book | null, group: KoboBook, now: number, init?: KoboNewBookInput): Promise<KoboApplyResult> {
  let created = false;
  let book: Book;
  if (existing) {
    if (existing.format !== "kobo") throw new Error("Kobo çizimi Kobo olmayan kitaba işlenmez");
    book = existing;
  } else {
    if (!init) throw new Error("Yeni Kobo kitabı için özet ve not yolu gerekir");
    book = newBook({ hash: init.hash, size: 0, fileName: "", format: "kobo", notePath: init.notePath, title: group.title || "Kobo" }, now);
    if (group.author) book.author = group.author;
    created = true;
  }
  const added: Highlight[] = [];
  const updated: { prev: Highlight; next: Highlight }[] = [];
  let same = 0;
  let skipped = 0;
  for (const h of group.highlights) {
    const id = await koboHighlightId(h);
    const cur = book.highlights.find((x) => x.id === id);
    if (cur) {
      const note = h.note?.trim();
      if (note && note !== (cur.note ?? "")) {
        book = updateHighlight(book, id, { note }, now);
        updated.push({ prev: cur, next: book.highlights.find((x) => x.id === id)! });
      } else same++;
      continue;
    }
    if (!cleanQuote(h.text)) {
      skipped++;
      continue;
    }
    const r = addHighlight(book, { text: h.text, anchor: koboAnchor(h), color: h.color, note: h.note, chapter: h.chapter }, h.addedAt ?? now, id);
    // Oluşma anı Kobo'daki an; güncelleme anı alım anı (eşitleme geçmiş tarihe aldanmasın).
    const hl: Highlight = { ...r.highlight, updatedAt: now };
    book = { ...r.book, highlights: r.book.highlights.map((x) => (x.id === id ? hl : x)) };
    added.push(hl);
  }
  if (book !== existing && book.updatedAt !== now) book = { ...book, updatedAt: now };
  return { book, created, added, updated, same, skipped };
}

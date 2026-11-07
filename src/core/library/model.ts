// Kütüphane hesapları — saf fonksiyonlar (React/i18n/dosya yok) (LOM-83).
//
// Kayıtlar değişmez (immutable) tutulur: her değişiklik yeni nesne döner; değişiklik yoksa
// aynı nesne döner (store bununla gereksiz yazımı atlar).

import { BOOK_ID_RE, HIGHLIGHT_ID_RE } from "./codec";
import {
  BOOK_STATUSES,
  DEFAULT_READER_PREFS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  HIGHLIGHT_COLORS,
  LIBRARY_DIR,
  READER_THEMES,
  type Anchor,
  type Book,
  type BookFormat,
  type BookPosition,
  type BookStatus,
  type FileBookFormat,
  type Highlight,
  type HighlightColor,
  type ReaderPrefs,
  type ReaderTheme,
} from "./types";

// ─── Dosya ve kimlik ───────────────────────────────────────────────────────────────

/** Baytların SHA-256 özeti (64 hane küçük harf). WebView ve node'da Web Crypto vardır. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Kitap kimliği: özetin ilk 16 hanesi — aynı dosya her cihazda aynı kimliği alır. */
export function bookIdFromHash(hash: string): string {
  return hash.slice(0, 16);
}

/** Uygulama klasöründeki dosya adı. Kindle kitabının dosyası yoktur: önce `hasBookFile` sorulur. */
export function bookFileName(b: Pick<Book, "hash" | "format">): string {
  return `${b.hash}.${b.format}`;
}

/** Kitabın uygulama klasöründe dosyası var mı (okuyucuda açılır mı)? Kindle kitabında yok (LOM-84). */
export function hasBookFile(b: Pick<Book, "format">): boolean {
  return b.format !== "kindle";
}

/**
 * Biçimi baytlardan tanı: PDF "%PDF-" ile, EPUB "PK\x03\x04" + mimetype "application/epub+zip" ile
 * başlar (EPUB standardı mimetype'ı ilk ve sıkıştırmasız ister). Tanınmazsa uzantıya bakılır
 * (yine de içerik ZIP ya da PDF olmalı); hiçbiri değilse null.
 */
export function detectFormat(fileName: string, data: Uint8Array): FileBookFormat | null {
  const head = String.fromCharCode(...data.subarray(0, Math.min(data.length, 1024)));
  if (head.startsWith("%PDF-")) return "pdf";
  const zip = data.length > 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
  if (zip && head.includes("application/epub+zip")) return "epub";
  const ext = fileName.toLowerCase().split(".").pop();
  if (zip && ext === "epub") return "epub";
  // Bazı PDF'lerin başında birkaç bayt çöp olur; standart ilk 1024 bayt içinde arar.
  if (ext === "pdf" && head.includes("%PDF-")) return "pdf";
  return null;
}

/** Yol içindeki dosya adı (Windows ve POSIX ayırıcıları, content:// URI'leri). */
export function baseName(path: string): string {
  const clean = decodeURIComponentSafe(path.split(/[?#]/)[0]);
  const seg = clean.split(/[\\/]/).filter(Boolean).pop() ?? clean;
  // Android belge sağlayıcısı "primary:Download/kitap.pdf" biçimi verebilir.
  return seg.includes(":") ? seg.slice(seg.lastIndexOf(":") + 1) : seg;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Dosya adından okunur başlık: uzantı, alt çizgi ve fazla boşluk temizlenir. */
export function titleFromFileName(name: string): string {
  const base = baseName(name).replace(/\.(pdf|epub)$/i, "");
  const t = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return t || "Kitap";
}

/**
 * Not adı olarak güvenli metin: dosya sisteminde yasak karakterler, baştaki nokta ve
 * köşeli parantez (wiki bağlantısını bozar) atılır; uzunluk sınırlanır.
 */
export function safeNoteName(title: string): string {
  const s = title
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 100)
    .trim();
  return s || "Kitap";
}

/** Kitabın notu için boş bir yol: `Kütüphane/<ad>.md`, doluysa `<ad> 2.md`… */
export function freeNotePath(title: string, taken: (path: string) => boolean, dir = LIBRARY_DIR): string {
  const base = safeNoteName(title);
  let p = `${dir}/${base}.md`;
  for (let n = 2; taken(p); n++) p = `${dir}/${base} ${n}.md`;
  return p;
}

export interface NewBookInput {
  hash: string;
  size: number;
  fileName: string;
  format: BookFormat;
  notePath: string;
  title?: string;
}

export function newBook(input: NewBookInput, now: number): Book {
  const id = bookIdFromHash(input.hash);
  if (!BOOK_ID_RE.test(id) || !/^[0-9a-f]{64}$/.test(input.hash)) throw new Error("Geçersiz kitap özeti");
  return {
    id,
    title: (input.title ?? "").trim() || titleFromFileName(input.fileName),
    format: input.format,
    hash: input.hash,
    size: input.size,
    fileName: baseName(input.fileName),
    status: "toread",
    notePath: input.notePath,
    addedAt: now,
    updatedAt: now,
    highlights: [],
  };
}

// ─── Durum ve konum ───────────────────────────────────────────────────────────────

export function isBookStatus(v: unknown): v is BookStatus {
  return typeof v === "string" && (BOOK_STATUSES as readonly string[]).includes(v);
}

/** Durumu değiştir. "Bitti"ye geçince bitiş anı yazılır, çıkınca silinir. */
export function setStatus(b: Book, status: BookStatus, now: number): Book {
  if (b.status === status) return b;
  const next: Book = { ...b, status, updatedAt: now };
  if (status === "done") next.finishedAt = now;
  else delete next.finishedAt;
  return next;
}

/** Okuyucu açılınca: "okunacak" kitap "okunuyor"a geçer; diğerleri değişmez. */
export function markOpened(b: Book, now: number): Book {
  return b.status === "toread" ? setStatus(b, "reading", now) : b;
}

const samePosition = (a: BookPosition | undefined, b: BookPosition): boolean => {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === "pdf") return b.kind === "pdf" && a.page === b.page && Math.abs(a.offset - b.offset) < 1e-4;
  if (a.kind === "kindle") return b.kind === "kindle" && a.location === b.location;
  return b.kind === "epub" && a.spine === b.spine && a.href === b.href && a.offset === b.offset;
};

/** Kalınan yeri yaz. Aynı yer ve ilerlemeyse aynı nesne döner (yazım olmaz). */
export function setPosition(b: Book, pos: BookPosition, progress: number, now: number): Book {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  if (samePosition(b.position, pos) && Math.abs((b.progress ?? -1) - p) < 1e-4) return b;
  return { ...b, position: pos, progress: p, updatedAt: now };
}

export interface MetaPatch {
  title?: string;
  author?: string;
  pages?: number;
}

/**
 * Okuyucunun bildirdiği bilgiyi kayda işle. Başlık yalnız dosya adından türetilmişse
 * değişir (kullanıcının ya da önceki okumanın verdiği başlık ezilmez); yazar yalnız boşsa.
 */
export function applyMeta(b: Book, meta: MetaPatch, now: number): Book {
  const next: Book = { ...b };
  let changed = false;
  const title = meta.title?.replace(/\s+/g, " ").trim();
  if (title && b.title === titleFromFileName(b.fileName) && title !== b.title) {
    next.title = title.slice(0, 200);
    changed = true;
  }
  const author = meta.author?.replace(/\s+/g, " ").trim();
  if (author && !b.author) {
    next.author = author.slice(0, 200);
    changed = true;
  }
  if (meta.pages !== undefined && Number.isInteger(meta.pages) && meta.pages > 0 && meta.pages !== b.pages) {
    next.pages = meta.pages;
    changed = true;
  }
  if (!changed) return b;
  next.updatedAt = now;
  return next;
}

// ─── Çizimler ─────────────────────────────────────────────────────────────────────

const KIND_RANK: Record<Anchor["kind"], number> = { pdf: 0, epub: 1, kindle: 2 };

/**
 * Kitap içindeki sıra: PDF'te sayfa → üst kenar → sol kenar; EPUB'da bölüm → başlangıç;
 * Kindle'da konum başı → sayfa → konum sonu (konumu olmayan, yalnız sayfalı çizim sona).
 * Farklı türler sabit sırada: pdf < epub < kindle.
 */
export function compareAnchor(a: Anchor, b: Anchor): number {
  if (a.kind === "pdf" && b.kind === "pdf") {
    if (a.page !== b.page) return a.page - b.page;
    const ay = a.rects.length ? Math.min(...a.rects.map((r) => r.y)) : 0;
    const by = b.rects.length ? Math.min(...b.rects.map((r) => r.y)) : 0;
    if (Math.abs(ay - by) > 1e-6) return ay - by;
    const ax = a.rects.length ? Math.min(...a.rects.map((r) => r.x)) : 0;
    const bx = b.rects.length ? Math.min(...b.rects.map((r) => r.x)) : 0;
    return ax - bx;
  }
  if (a.kind === "epub" && b.kind === "epub") {
    if (a.spine !== b.spine) return a.spine - b.spine;
    return a.start - b.start || a.end - b.end;
  }
  if (a.kind === "kindle" && b.kind === "kindle") {
    const big = Number.MAX_SAFE_INTEGER;
    const as = a.location?.start ?? big;
    const bs = b.location?.start ?? big;
    if (as !== bs) return as < bs ? -1 : 1;
    const ap = a.page ?? big;
    const bp = b.page ?? big;
    if (ap !== bp) return ap < bp ? -1 : 1;
    const ae = a.location?.end ?? big;
    const be = b.location?.end ?? big;
    return ae === be ? 0 : ae < be ? -1 : 1;
  }
  return KIND_RANK[a.kind] - KIND_RANK[b.kind];
}

export function sortHighlights(list: Highlight[]): Highlight[] {
  return [...list].sort((x, y) => compareAnchor(x.anchor, y.anchor) || x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1));
}

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Kitap içinde tekil, kısa çizim kimliği. `rand` testte sabitlenir. */
export function newHighlightId(existing: Iterable<string>, rand: () => number = Math.random): string {
  const taken = new Set(existing);
  for (let len = 6; ; len++) {
    for (let tries = 0; tries < 50; tries++) {
      let id = "";
      for (let i = 0; i < len; i++) id += ID_CHARS[Math.floor(rand() * ID_CHARS.length) % ID_CHARS.length];
      if (!taken.has(id) && HIGHLIGHT_ID_RE.test(id)) return id;
    }
  }
}

/** Alıntı metnini sadeleştir: satır sonları ve fazla boşluk tek boşluk olur. */
export function cleanQuote(text: string): string {
  return text.replace(/­/g, "").replace(/\s+/g, " ").trim();
}

export interface NewHighlightInput {
  text: string;
  anchor: Anchor;
  color: HighlightColor;
  note?: string;
  chapter?: string;
}

/** Çizim ekle; kitap sırası korunur. Boş metin ya da biçime uymayan çıpa hata atar. */
export function addHighlight(b: Book, input: NewHighlightInput, now: number, id: string): { book: Book; highlight: Highlight } {
  const text = cleanQuote(input.text);
  if (!text) throw new Error("Boş seçim çizilmez");
  if (input.anchor.kind !== b.format) throw new Error("Çizim yeri kitabın biçimine uymuyor");
  if (!HIGHLIGHT_ID_RE.test(id) || b.highlights.some((h) => h.id === id)) throw new Error("Geçersiz çizim kimliği");
  const h: Highlight = {
    id,
    color: HIGHLIGHT_COLORS.includes(input.color) ? input.color : DEFAULT_READER_PREFS.color,
    text,
    anchor: input.anchor,
    createdAt: now,
    updatedAt: now,
  };
  const note = input.note?.trim();
  if (note) h.note = note;
  const chapter = input.chapter?.replace(/\s+/g, " ").trim();
  if (chapter) h.chapter = chapter;
  return { book: { ...b, highlights: sortHighlights([...b.highlights, h]), updatedAt: now }, highlight: h };
}

export interface HighlightPatch {
  color?: HighlightColor;
  /** Boş metin notu siler. */
  note?: string;
}

/** Renk ya da notu güncelle. Değişiklik yoksa ya da çizim yoksa aynı kitap döner. */
export function updateHighlight(b: Book, id: string, patch: HighlightPatch, now: number): Book {
  const cur = b.highlights.find((h) => h.id === id);
  if (!cur) return b;
  const next: Highlight = { ...cur };
  let changed = false;
  if (patch.color && HIGHLIGHT_COLORS.includes(patch.color) && patch.color !== cur.color) {
    next.color = patch.color;
    changed = true;
  }
  if (patch.note !== undefined) {
    const note = patch.note.trim();
    if (note !== (cur.note ?? "")) {
      if (note) next.note = note;
      else delete next.note;
      changed = true;
    }
  }
  if (!changed) return b;
  next.updatedAt = now;
  return { ...b, highlights: b.highlights.map((h) => (h.id === id ? next : h)), updatedAt: now };
}

export function removeHighlight(b: Book, id: string, now: number): Book {
  if (!b.highlights.some((h) => h.id === id)) return b;
  return { ...b, highlights: b.highlights.filter((h) => h.id !== id), updatedAt: now };
}

/** Çizimin gidilecek yeri (bağlantı ve listeden atlama için). */
export function positionOfAnchor(a: Anchor): BookPosition {
  if (a.kind === "pdf") return { kind: "pdf", page: a.page, offset: a.rects.length ? Math.min(...a.rects.map((r) => r.y)) : 0 };
  if (a.kind === "kindle") return { kind: "kindle", location: a.location?.start ?? a.page ?? 0 };
  return { kind: "epub", spine: a.spine, href: a.href, offset: a.start };
}

// ─── Raf ──────────────────────────────────────────────────────────────────────────

export type ShelfFilter = "all" | BookStatus;
export const SHELF_FILTERS: readonly ShelfFilter[] = ["all", "reading", "toread", "done"];

export function isShelfFilter(v: unknown): v is ShelfFilter {
  return typeof v === "string" && (SHELF_FILTERS as readonly string[]).includes(v);
}

const STATUS_RANK: Record<BookStatus, number> = { reading: 0, toread: 1, done: 2 };

/**
 * Raf sırası: önce okunanlar (son okunan önce), sonra okunacaklar (son eklenen önce), sonra
 * bitenler (son biten önce). Süzgeç verilirse yalnız o durum.
 */
export function shelfBooks(books: Book[], filter: ShelfFilter = "all"): Book[] {
  const list = filter === "all" ? books : books.filter((b) => b.status === filter);
  const key = (b: Book) => (b.status === "toread" ? b.addedAt : b.status === "done" ? (b.finishedAt ?? b.updatedAt) : b.updatedAt);
  return [...list].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || key(b) - key(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function shelfCounts(books: Book[]): Record<ShelfFilter, number> {
  const out: Record<ShelfFilter, number> = { all: books.length, reading: 0, toread: 0, done: 0 };
  for (const b of books) out[b.status]++;
  return out;
}

// ─── Okuyucu tercihleri ───────────────────────────────────────────────────────────

export function clampFontScale(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_READER_PREFS.fontScale;
  return Math.round(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, v)) * 100) / 100;
}

/** Kayıtlı tercihleri temizle: bozuk alan varsayılana döner. Her zaman yeni nesne. */
export function normalizeReaderPrefs(v: unknown): ReaderPrefs {
  const src = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return {
    fontScale: clampFontScale(src.fontScale),
    theme: (READER_THEMES as readonly string[]).includes(src.theme as string) ? (src.theme as ReaderTheme) : DEFAULT_READER_PREFS.theme,
    color: (HIGHLIGHT_COLORS as readonly string[]).includes(src.color as string) ? (src.color as HighlightColor) : DEFAULT_READER_PREFS.color,
  };
}

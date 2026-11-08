// KOReader çizimlerini içe aktarma — saf (LOM-94).
//
// İki kaynak desteklenir:
//  1. Kitap-yanı dosyası: `<kitap>.sdr/metadata.<biçim>.lua` (`return { … }` Lua tablosu, `lua.ts`
//     kod çalıştırmadan okur). İki düzen vardır:
//      - Yeni (2024 ve sonrası): `annotations` dizisi; her girdide text, note, pageno/page, pos0/pos1,
//        chapter, datetime, color. `pos0` ve metni olan girdi çizimdir; olmayan yer imidir (atlanır).
//      - Eski: `highlight[sayfa][i]` (text, pos0/pos1, datetime, chapter) + `bookmarks` dizisi. Çizime ait
//        yer iminde `highlighted = true`, aynı datetime (ve pos0) bulunur; yer iminin `text` alanı
//        kullanıcının notudur, yalnız KOReader'ın kendi yazdığı "Sayfa 12 … @ tarih" kalıbı not sayılmaz.
//  2. JSON dışa aktarma: tek kitap nesnesi `{title, author, entries: [...]}` ya da bunların dizisi.
//     Girdi: text, note, page, time (saniye), chapter, color.
//
// Kimlikler deterministiktir (tekrar koruması):
//  - Kitap: özeti SHA-256("koreader|" + normalleştirilmiş "başlık|yazar"), kimlik ilk 16 hane.
//    "koreader|" öneki aynı başlıklı Kindle kaydıyla çakışmayı önler.
//  - Çizim: 'o' + SHA-256(sadeleştirilmiş alıntı) ilk 10 hane. Sayfa kimliğe GİRMEZ: KOReader'da EPUB
//    sayfası yazı boyutuna göre değişir, sayfa girseydi aynı çizim her alımda yeniden eklenirdi.
//    Bilinen sınır: aynı kitapta birebir aynı iki alıntı tek çizim sayılır.

import { kindleBookKey } from "./kindle";
import { LuaTable, parseLuaTable, type LuaValue } from "./lua";
import { addHighlight, baseName, cleanQuote, newBook, sha256Hex, updateHighlight } from "./model";
import { DEFAULT_HIGHLIGHT_COLOR, type Book, type Highlight, type HighlightColor, type KoreaderAnchor } from "./types";

export interface KoreaderHighlightInput {
  text: string;
  /** 1'den başlayan sayfa (yalnız sıra ve gösterim için). */
  page: number;
  /** KOReader iç konumu (EPUB'da XPointer); PDF'te tablo olduğu için yazılmaz. */
  pos0?: string;
  pos1?: string;
  chapter?: string;
  note?: string;
  /** KOReader'da çizilme anı (ms); çözülemezse yok. */
  addedAt?: number;
  color: HighlightColor;
}

export interface KoreaderBook {
  /** Normalleştirilmiş "başlık|yazar" — kitabın özeti bundan türer. */
  key: string;
  title: string;
  author?: string;
  /** Kitap sırasıyla (sayfa, sonra çizilme anı), tekrarsız. */
  highlights: KoreaderHighlightInput[];
}

export interface KoreaderGroups {
  /** Dosyadaki ilk görünüş sırasıyla. */
  books: KoreaderBook[];
  /** Atlanan girdiler: metinsiz, sayfasız ya da yalnız yer imi olanlar. */
  skipped: number;
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────────

/** KOReader rengini Loomen rengine eşle; bilinmeyen renk varsayılan (sarı). */
export function koreaderColor(c: unknown): HighlightColor {
  const s = typeof c === "string" ? c.trim().toLowerCase() : "";
  if (s === "green" || s === "olive") return "green";
  if (s === "blue" || s === "cyan") return "blue";
  if (s === "red" || s === "purple" || s === "pink") return "pink";
  return DEFAULT_HIGHLIGHT_COLOR;
}

/** KOReader tarihi "YYYY-MM-DD HH:MM:SS" (yerel saat) → ms; olmazsa undefined. */
export function parseKoreaderDate(s: unknown): number | undefined {
  if (typeof s !== "string") return undefined;
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*$/.exec(s);
  if (!m) return undefined;
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return undefined;
  const t = new Date(y, mo - 1, d, h, mi, se).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/** Yazarlar KOReader'da satır sonuyla ayrılabilir: virgülle birleştir. */
function joinAuthors(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const parts = s.split(/\r?\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

const oneLine = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Yol adından başlık: `.sdr` klasörü ya da kitap dosyası adı, uzantısız. */
function titleFromPath(path: string | undefined): string {
  if (!path) return "";
  const parts = path.split(/[?#]/)[0].split(/[\\/]/).filter(Boolean);
  let name = parts.pop() ?? "";
  if (/^metadata\.[^.]+\.lua$/i.test(name) || /\.json$/i.test(name)) {
    const dir = parts.pop() ?? "";
    name = /\.sdr$/i.test(dir) ? dir.replace(/\.sdr$/i, "") : /\.json$/i.test(name) ? "" : dir;
  }
  name = baseName(name).replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

const posStr = (v: LuaValue | undefined) => (typeof v === "string" && v ? v : undefined);
const pageNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.floor(v) : undefined);

/** Kitap anahtarı: Kindle ile aynı normalleştirme (NFC, küçük harf, tek boşluk). */
export function koreaderBookKey(title: string, author?: string): string {
  return kindleBookKey(title, author);
}

/** Kitap toplayıcı: aynı kitap birden çok kez gelirse birleşir, çizimler alıntıya göre tekil. */
class Collector {
  books = new Map<string, { book: KoreaderBook; seen: Map<string, KoreaderHighlightInput>; order: number }>();
  skipped = 0;
  private seq = 0;

  add(title: string, author: string | undefined, list: KoreaderHighlightInput[]): void {
    const t = oneLine(title) || "KOReader";
    const a = oneLine(author) || undefined;
    const key = koreaderBookKey(t, a);
    let g = this.books.get(key);
    if (!g) {
      const book: KoreaderBook = { key, title: t, highlights: [] };
      if (a) book.author = a;
      g = { book, seen: new Map(), order: this.seq++ };
      this.books.set(key, g);
    }
    for (const h of list) {
      const q = cleanQuote(h.text);
      if (!q) {
        this.skipped++;
        continue;
      }
      const dup = g.seen.get(q);
      if (dup) {
        if (!dup.note && h.note) dup.note = h.note;
        if (h.addedAt !== undefined && (dup.addedAt === undefined || h.addedAt < dup.addedAt)) dup.addedAt = h.addedAt;
        continue;
      }
      const x = { ...h };
      g.seen.set(q, x);
      g.book.highlights.push(x);
    }
  }

  result(): KoreaderGroups {
    const books = [...this.books.values()].sort((a, b) => a.order - b.order).map((g) => g.book);
    for (const b of books) {
      // Kararlı sıralama: sayfa, sonra çizilme anı (yoksa dosya sırası).
      const idx = new Map(b.highlights.map((h, i) => [h, i]));
      b.highlights.sort((x, y) => x.page - y.page || (x.addedAt ?? 0) - (y.addedAt ?? 0) || idx.get(x)! - idx.get(y)!);
    }
    return { books: books.filter((b) => b.highlights.length > 0), skipped: this.skipped };
  }
}

function makeInput(
  text: string,
  page: number,
  extra: { pos0?: string; pos1?: string; chapter?: string; note?: string; addedAt?: number; color?: unknown },
): KoreaderHighlightInput {
  const h: KoreaderHighlightInput = { text, page, color: koreaderColor(extra.color) };
  if (extra.pos0) h.pos0 = extra.pos0;
  if (extra.pos1) h.pos1 = extra.pos1;
  const ch = oneLine(extra.chapter);
  if (ch) h.chapter = ch;
  const note = extra.note?.trim();
  if (note) h.note = note;
  if (extra.addedAt !== undefined) h.addedAt = extra.addedAt;
  return h;
}

// ─── Lua kitap-yanı dosyası ───────────────────────────────────────────────────────

/** KOReader'ın eski düzende yer imine kendi yazdığı metin ("Page 12 alıntı @ 2020-01-01 10:00:00"). */
function isAutoBookmarkText(text: string, quote: string | undefined): boolean {
  const t = cleanQuote(text);
  if (!t) return true;
  const q = cleanQuote(quote ?? "");
  if (q && t === q) return true;
  if (!/@ \d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(t)) return false;
  return !q || t.includes(q.slice(0, 40));
}

function luaHighlightsNew(ann: LuaTable, col: { skipped: number }): KoreaderHighlightInput[] {
  const out: KoreaderHighlightInput[] = [];
  for (const v of ann.list()) {
    if (!(v instanceof LuaTable)) continue;
    const text = v.str("text") ?? "";
    // pos0 yoksa yer imidir (çizim değil).
    if (v.get("pos0") === undefined || !cleanQuote(text)) {
      col.skipped++;
      continue;
    }
    const page = pageNum(v.num("pageno")) ?? pageNum(v.num("page"));
    if (page === undefined) {
      col.skipped++;
      continue;
    }
    out.push(
      makeInput(text, page, {
        pos0: posStr(v.get("pos0")),
        pos1: posStr(v.get("pos1")),
        chapter: v.str("chapter"),
        note: v.str("note"),
        addedAt: parseKoreaderDate(v.str("datetime")),
        color: v.str("color"),
      }),
    );
  }
  return out;
}

function luaHighlightsOld(hl: LuaTable, bookmarks: LuaTable | undefined, col: { skipped: number }): KoreaderHighlightInput[] {
  const marks = (bookmarks?.list() ?? []).filter((b): b is LuaTable => b instanceof LuaTable);
  const used = new Set<LuaTable>();
  const out: KoreaderHighlightInput[] = [];
  for (const [pageKey, items] of hl.numericEntries()) {
    if (!(items instanceof LuaTable)) continue;
    for (const v of items.list()) {
      if (!(v instanceof LuaTable)) continue;
      const text = v.str("text") ?? "";
      const page = pageNum(pageKey);
      if (!cleanQuote(text) || page === undefined) {
        col.skipped++;
        continue;
      }
      const dt = v.str("datetime");
      const p0 = posStr(v.get("pos0"));
      const mark = marks.find(
        (b) => !used.has(b) && b.get("highlighted") === true && dt !== undefined && b.str("datetime") === dt && (!p0 || !posStr(b.get("pos0")) || posStr(b.get("pos0")) === p0),
      );
      let note: string | undefined;
      if (mark) {
        used.add(mark);
        const t = mark.str("text");
        if (t && cleanQuote(t) !== cleanQuote(text) && !isAutoBookmarkText(t, mark.str("notes") ?? text)) note = t;
      }
      out.push(
        makeInput(text, page, {
          pos0: p0,
          pos1: posStr(v.get("pos1")),
          chapter: v.str("chapter") ?? mark?.str("chapter"),
          note,
          addedAt: parseKoreaderDate(dt),
          color: v.str("color"),
        }),
      );
    }
  }
  // Çizime bağlanmayan yer imleri atlanır.
  col.skipped += marks.filter((b) => !used.has(b)).length;
  return out;
}

/**
 * KOReader `metadata.*.lua` metnini oku. Başlık `doc_props.title` (yoksa `stats.title`, `doc_path`
 * ya da dosyanın `.sdr` klasör adı). Okunamayan ya da çizimsiz dosya boş liste döner.
 */
export function parseKoreaderLua(text: string, sourcePath?: string): KoreaderGroups {
  const root = parseLuaTable(text);
  if (!root) return { books: [], skipped: 0 };
  const props = root.table("doc_props");
  const stats = root.table("stats");
  const title = oneLine(props?.str("title")) || oneLine(stats?.str("title")) || titleFromPath(root.str("doc_path")) || titleFromPath(sourcePath);
  const author = joinAuthors(props?.str("authors")) ?? joinAuthors(stats?.str("authors"));
  const col = new Collector();
  const ann = root.table("annotations");
  const hl = root.table("highlight");
  const list = ann ? luaHighlightsNew(ann, col) : hl ? luaHighlightsOld(hl, root.table("bookmarks"), col) : [];
  col.add(title, author, list);
  return col.result();
}

// ─── JSON dışa aktarma ────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function jsonBooks(v: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 3) return [];
  if (Array.isArray(v)) return v.flatMap((x) => jsonBooks(x, depth + 1));
  if (!isObj(v)) return [];
  if (Array.isArray(v.entries)) return [v];
  // Bazı sürümler kitapları bir alanın altında dizi olarak verir.
  return Object.values(v).flatMap((x) => (Array.isArray(x) ? jsonBooks(x, depth + 1) : []));
}

/** KOReader JSON dışa aktarma metnini oku (tek kitap ya da kitap dizisi). Bozuksa boş liste. */
export function parseKoreaderJson(text: string, sourcePath?: string): KoreaderGroups {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { books: [], skipped: 0 };
  }
  const col = new Collector();
  for (const b of jsonBooks(data)) {
    const list: KoreaderHighlightInput[] = [];
    for (const e of b.entries as unknown[]) {
      if (!isObj(e)) {
        col.skipped++;
        continue;
      }
      const text = typeof e.text === "string" ? e.text : "";
      const page = pageNum(e.page);
      if (!cleanQuote(text) || page === undefined || e.sort === "bookmark") {
        col.skipped++;
        continue;
      }
      const time = typeof e.time === "number" && Number.isFinite(e.time) && e.time > 0 ? Math.round(e.time * 1000) : undefined;
      list.push(
        makeInput(text, page, {
          chapter: typeof e.chapter === "string" ? e.chapter : undefined,
          note: typeof e.note === "string" ? e.note : undefined,
          addedAt: time,
          color: e.color,
        }),
      );
    }
    const title = (typeof b.title === "string" ? b.title : "") || titleFromPath(typeof b.file === "string" ? b.file : undefined) || titleFromPath(sourcePath);
    col.add(title, joinAuthors(typeof b.author === "string" ? b.author : undefined), list);
  }
  return col.result();
}

/** Dosya içeriğine göre (JSON `{`/`[` ile başlar, yoksa Lua) uygun ayrıştırıcıyı seç. */
export function parseKoreaderFile(text: string, path?: string): KoreaderGroups {
  const head = text.replace(/^﻿/, "").trimStart();
  if (head.startsWith("{") || head.startsWith("[")) {
    const j = parseKoreaderJson(text, path);
    if (j.books.length || j.skipped || !/\.lua$/i.test(path ?? "")) return j;
  }
  return parseKoreaderLua(text, path);
}

// ─── Kimlikler ────────────────────────────────────────────────────────────────────

const enc = (s: string) => new TextEncoder().encode(s);

/** KOReader kitabının özeti (64 hane): "koreader|" + normalleştirilmiş "başlık|yazar". */
export function koreaderBookHash(title: string, author?: string): Promise<string> {
  return sha256Hex(enc("koreader|" + koreaderBookKey(title, author)));
}

/** Deterministik çizim kimliği: 'o' + SHA-256(sadeleştirilmiş alıntı) ilk 10 hane. */
export async function koreaderHighlightId(h: Pick<KoreaderHighlightInput, "text">): Promise<string> {
  return "o" + (await sha256Hex(enc(cleanQuote(h.text)))).slice(0, 10);
}

export function koreaderAnchor(h: Pick<KoreaderHighlightInput, "page" | "pos0" | "pos1">): KoreaderAnchor {
  const a: KoreaderAnchor = { kind: "koreader", page: h.page };
  if (h.pos0) a.pos0 = h.pos0;
  if (h.pos1) a.pos1 = h.pos1;
  return a;
}

// ─── Kayda işleme ─────────────────────────────────────────────────────────────────

export interface KoreaderApplyResult {
  /** Değişiklik yoksa verilen kitabın KENDİSİ (yazım gerekmez). */
  book: Book;
  created: boolean;
  added: Highlight[];
  /** Notu değişen çizimler: blok `prev`'den üretilmişse yeniden yazılır. */
  updated: { prev: Highlight; next: Highlight }[];
  same: number;
  skipped: number;
}

export interface KoreaderNewBookInput {
  /** `koreaderBookHash` sonucu. */
  hash: string;
  notePath: string;
}

/**
 * Bir kitabın KOReader çizimlerini kayda işle (`applyKindleBook` ile aynı sözleşme). `existing` yoksa
 * yeni KOReader kaydı oluşturulur (`init` zorunlu). Kayıtta olmayan çizim eklenir (renk KOReader'dan,
 * oluşma anı KOReader'daki an); olanın KOReader notu değiştiyse not güncellenir. KOReader'da notu
 * olmayan çizimin Loomen'daki notu silinmez.
 */
export async function applyKoreaderBook(
  existing: Book | null,
  group: KoreaderBook,
  now: number,
  init?: KoreaderNewBookInput,
): Promise<KoreaderApplyResult> {
  let created = false;
  let book: Book;
  if (existing) {
    if (existing.format !== "koreader") throw new Error("KOReader çizimi KOReader olmayan kitaba işlenmez");
    book = existing;
  } else {
    if (!init) throw new Error("Yeni KOReader kitabı için özet ve not yolu gerekir");
    book = newBook({ hash: init.hash, size: 0, fileName: "", format: "koreader", notePath: init.notePath, title: group.title || "KOReader" }, now);
    if (group.author) book.author = group.author;
    created = true;
  }
  const added: Highlight[] = [];
  const updated: { prev: Highlight; next: Highlight }[] = [];
  let same = 0;
  let skipped = 0;
  for (const h of group.highlights) {
    const id = await koreaderHighlightId(h);
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
    const r = addHighlight(book, { text: h.text, anchor: koreaderAnchor(h), color: h.color, note: h.note, chapter: h.chapter }, h.addedAt ?? now, id);
    // Oluşma anı KOReader'daki an; güncelleme anı alım anı (eşitleme geçmiş tarihe aldanmasın).
    const hl: Highlight = { ...r.highlight, updatedAt: now };
    book = { ...r.book, highlights: r.book.highlights.map((x) => (x.id === id ? hl : x)) };
    added.push(hl);
  }
  if (book !== existing && book.updatedAt !== now) book = { ...book, updatedAt: now };
  return { book, created, added, updated, same, skipped };
}

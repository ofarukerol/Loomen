// Kindle çizimlerini içe aktarma — saf (LOM-84).
//
// Kaynak: Kindle'ın `documents/My Clippings.txt` dosyası. Her girdi `==========` satırıyla biter:
//
//   Dune (Frank Herbert)
//   - Your Highlight on page 12 | Location 180-182 | Added on Monday, 3 April 2023 10:15:22
//
//   Korku zihni öldürendir.
//   ==========
//
// Meta satırı cihaz diline göre değişir; İngilizce ve Türkçe anahtar kelimeler tanınır, başka
// dillerde konum aralığı ve metin varsa girdi çizim sayılır. Dosya yalnız sonuna eklenerek büyür
// (Kindle silinen çizimi dosyadan silmez); bu yüzden alım artımlıdır ve kimlikler deterministiktir:
//  - Kitap: özeti normalleştirilmiş "başlık|yazar" metninin SHA-256'sı (kimlik = ilk 16 hane).
//  - Çizim: 'k' + SHA-256(konum|sayfa|alıntı) ilk 10 hane. Aynı çizim ikinci alımda aynı kimliği
//    alır ve yeniden eklenmez; not kimliğe girmez, sonradan yazılan not mevcut çizime işlenir.

import { addHighlight, cleanQuote, newBook, sha256Hex, updateHighlight } from "./model";
import { DEFAULT_HIGHLIGHT_COLOR, type Book, type Highlight, type KindleAnchor } from "./types";

export type KindleClippingType = "highlight" | "note" | "bookmark";

export interface KindleLocation {
  start: number;
  end: number;
}

export interface KindleClipping {
  title: string;
  author?: string;
  type: KindleClippingType;
  page?: number;
  location?: KindleLocation;
  /** Kindle'a eklenme anı (yerel saat, ms); çözülemezse yok. */
  addedAt?: number;
  /** Vurguda alıntı, notta notun metni; yer iminde boş. */
  text: string;
}

export interface KindleHighlightInput {
  text: string;
  page?: number;
  location?: KindleLocation;
  addedAt?: number;
  note?: string;
}

export interface KindleBookGroup {
  /** Normalleştirilmiş "başlık|yazar" — kitabın özeti bundan türer. */
  key: string;
  title: string;
  author?: string;
  /** Dosya sırasıyla, tekrarsız. */
  highlights: KindleHighlightInput[];
}

export interface KindleGroups {
  /** Dosyadaki ilk görünüş sırasıyla. */
  books: KindleBookGroup[];
  /** Atlanan girdiler: yer imleri ve bağlanacak çizimi bulunamayan notlar. */
  skipped: number;
}

export const CLIPPINGS_FILE_NAME = "My Clippings.txt";

// ─── Ayrıştırma ───────────────────────────────────────────────────────────────────

const SEPARATOR_RE = /^\s*={5,}\s*$/;

/** Anahtar kelime karşılaştırması için küçük harf (Türkçe büyük İ sorun çıkarmasın). */
const lower = (s: string) => s.normalize("NFC").replace(/İ/g, "i").replace(/I/g, "i").toLowerCase();

const BOOKMARK_RE = /bookmark|yer\s*im|signet|lesezeichen|marcador|segnalibro/;
const HIGHLIGHT_RE = /highlight|vurgu|surlignement|markierung|subrayado|evidenziazione|destaque/;
const NOTE_RE = /\bnote\b|\bnot(?:unuz|u)?\b|\bnotiz\b|\bnota\b/;

const PAGE_RES = [/(?:page|sayfa|seite|página|pagina|pág\.)\s*(\d+)/, /(\d+)\.?\s*sayfa/];
const LOCATION_RES = [
  /(?:location|loc\.|konum|position|posición|posizione|emplacement|pos\.)\s*(\d+)(?:\s*[-–]\s*(\d+))?/,
  /(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:'?[a-zçğıöşü]*\s+)?konum/,
];
const RANGE_RE = /(\d+)\s*[-–]\s*(\d+)/;

/**
 * Eski Kindle'lar aralık sonunu kısaltır: "1234-56" = 1234-1256. Sonu baştan küçükse eksik
 * baştaki haneler tamamlanır.
 */
function expandRange(start: number, endRaw: string | undefined): KindleLocation {
  if (endRaw === undefined) return { start, end: start };
  let end = Number(endRaw);
  if (end < start) {
    const p = 10 ** endRaw.length;
    end = Math.floor(start / p) * p + end;
    if (end < start) end += p;
  }
  return { start, end };
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  oca: 0, şub: 1, nis: 3, haz: 5, tem: 6, ağu: 7, eyl: 8, eki: 9, kas: 10, ara: 11,
};

/** Tarihi çöz (İngilizce/Türkçe ay adlarıyla); olmazsa undefined. Yerel saat kabul edilir. */
export function parseKindleDate(segment: string): number | undefined {
  const s = lower(segment);
  const y = /\b(\d{4})\b/.exec(s);
  if (!y) return undefined;
  const year = Number(y[1]);
  let rest = s.replace(y[0], " ");
  let hour = 0;
  let minute = 0;
  let second = 0;
  const tm = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|öö|ös)?/.exec(rest);
  if (tm) {
    hour = Number(tm[1]);
    minute = Number(tm[2]);
    second = tm[3] ? Number(tm[3]) : 0;
    const ap = tm[4];
    if ((ap === "pm" || ap === "ös") && hour < 12) hour += 12;
    if ((ap === "am" || ap === "öö") && hour === 12) hour = 0;
    rest = rest.replace(tm[0], " ");
  }
  let month = -1;
  for (const w of rest.match(/[a-zçğıöşü]{3,}/g) ?? []) {
    const m = MONTHS[w.slice(0, 3)];
    if (m !== undefined) {
      month = m;
      break;
    }
  }
  const dayM = /\b(\d{1,2})\b/.exec(rest);
  const day = dayM ? Number(dayM[1]) : NaN;
  if (month < 0 || !(day >= 1 && day <= 31) || hour > 23 || minute > 59 || second > 59) return undefined;
  const t = new Date(year, month, day, hour, minute, second).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/** "Başlık (Yazar)" satırını ayır: sondaki parantez yazardır. */
function splitTitle(line: string): { title: string; author?: string } {
  const t = line.replace(/\s+/g, " ").trim();
  const m = /^(.*\S)\s*\(([^()]+)\)$/.exec(t);
  if (m && m[1].trim()) return { title: m[1].trim(), author: m[2].trim() || undefined };
  return { title: t };
}

interface Meta {
  type: KindleClippingType | null;
  page?: number;
  location?: KindleLocation;
  addedAt?: number;
}

function parseMeta(line: string): Meta {
  const raw = line.replace(/^\s*-\s*/, "");
  const segs = raw.split("|").map((x) => x.trim());
  const low = lower(raw);
  const type: KindleClippingType | null = BOOKMARK_RE.test(low)
    ? "bookmark"
    : HIGHLIGHT_RE.test(low)
      ? "highlight"
      : NOTE_RE.test(low)
        ? "note"
        : null;
  const out: Meta = { type };
  // Tarih genelde son bölümdedir; yıl taşıyan bölüm konum/sayfa aramasından çıkarılır.
  const dateIdx = segs.length > 1 ? segs.findIndex((x, i) => i > 0 && /\b\d{4}\b/.test(x) && /\d:\d\d/.test(x)) : -1;
  if (dateIdx >= 0) out.addedAt = parseKindleDate(segs[dateIdx]);
  const head = lower(segs.filter((_, i) => i !== dateIdx).join(" | "));
  for (const re of PAGE_RES) {
    const m = re.exec(head);
    if (m && Number(m[1]) >= 1) {
      out.page = Number(m[1]);
      break;
    }
  }
  for (const re of LOCATION_RES) {
    const m = re.exec(head);
    if (m && Number(m[1]) >= 1) {
      out.location = expandRange(Number(m[1]), m[2]);
      break;
    }
  }
  if (!out.location && !type) {
    // Bilinmeyen dil: bir aralık varsa konum sayılır.
    const m = RANGE_RE.exec(head);
    if (m && Number(m[1]) >= 1) out.location = expandRange(Number(m[1]), m[2]);
  }
  return out;
}

/** Kindle'ın kırpma sınırı uyarısı (alıntı metninin yerine yazılır). */
const CLIP_LIMIT_RE = /^<[^<>\n]*(clipping limit|limite|sınır)[^<>\n]*>$/i;

/**
 * Kindle "My Clippings.txt" metnini girdilere ayır. Baştaki (ve girdi başlarındaki) görünmez
 * BOM işareti ile Windows satır sonları temizlenir. Bilinmeyen dilde konum ve metni olan girdi
 * vurgu sayılır; meta satırı olmayan ya da tanınamayan girdiler atılır.
 */
export function parseClippings(text: string): KindleClipping[] {
  const clean = text.replace(/\uFEFF/g, "").replace(/\r\n?/g, "\n");
  const out: KindleClipping[] = [];
  let cur: string[] = [];
  const flush = () => {
    const lines = cur;
    cur = [];
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length < 2) return;
    const { title, author } = splitTitle(lines[0]);
    if (!title) return;
    const meta = parseMeta(lines[1]);
    const body = lines.slice(2).join("\n").trim();
    let type = meta.type;
    if (!type) {
      if (!meta.location || !body) return;
      type = "highlight";
    }
    if (type !== "bookmark" && !body) return;
    // Kindle sınır dolunca alıntı yerine "<You have reached the clipping limit…>" yazar: alıntı değil.
    if (type === "highlight" && CLIP_LIMIT_RE.test(body)) return;
    const c: KindleClipping = { title, type, text: type === "bookmark" ? "" : body };
    if (author) c.author = author;
    if (meta.page !== undefined) c.page = meta.page;
    if (meta.location) c.location = meta.location;
    if (meta.addedAt !== undefined) c.addedAt = meta.addedAt;
    out.push(c);
  };
  for (const line of clean.split("\n")) {
    if (SEPARATOR_RE.test(line)) flush();
    else cur.push(line);
  }
  flush();
  return out;
}

// ─── Gruplama ─────────────────────────────────────────────────────────────────────

/** Kitap anahtarı: NFC, küçük harf, tek boşluk. */
export function kindleBookKey(title: string, author?: string): string {
  const n = (s: string) => lower(s).replace(/\s+/g, " ").trim();
  return `${n(title)}|${n(author ?? "")}`;
}

const locKey = (h: { page?: number; location?: KindleLocation; text: string }) =>
  `${h.location ? `${h.location.start}-${h.location.end}` : ""}|${h.page ?? ""}|${cleanQuote(h.text)}`;

/** Kapsamayan not, önceki vurgunun en çok bu kadar konum yakınındaysa ona bağlanır. */
const NOTE_NEAR = 3;

function near(h: KindleHighlightInput, note: KindleClipping): boolean {
  if (note.location && h.location) return note.location.start >= h.location.start - NOTE_NEAR && note.location.start <= h.location.end + NOTE_NEAR;
  if (note.page !== undefined && h.page !== undefined) return note.page === h.page;
  return !note.location && note.page === undefined;
}

function contains(h: KindleHighlightInput, note: KindleClipping): boolean {
  if (note.location && h.location) return note.location.start >= h.location.start && note.location.start <= h.location.end;
  if (!note.location && !h.location && note.page !== undefined) return note.page === h.page;
  return false;
}

/**
 * Girdileri kitaplara topla. Not, aynı kitapta konumunu kapsayan vurguya (birden çoksa dosyada
 * en son geleni) bağlanır; yoksa dosyada hemen önceki girdi aynı kitabın YAKINDAKİ vurgusuysa ona. Aynı
 * vurgunun birden çok notu varsa sonuncusu geçerlidir (Kindle düzenlenen notu yeniden ekler).
 * Yer imleri ve bağlanamayan notlar atlanır ve sayılır. Aynı vurgu iki kez geçerse bir kez alınır.
 */
export function groupClippings(list: KindleClipping[]): KindleGroups {
  const books = new Map<string, KindleBookGroup>();
  const seen = new Map<string, Map<string, KindleHighlightInput>>();
  let skipped = 0;
  let prev: { key: string; h: KindleHighlightInput } | null = null;
  for (const c of list) {
    const key = kindleBookKey(c.title, c.author);
    let g = books.get(key);
    if (c.type === "bookmark") {
      skipped++;
      prev = null;
      continue;
    }
    if (c.type === "note") {
      let target: KindleHighlightInput | null = null;
      if (g) {
        for (let i = g.highlights.length - 1; i >= 0; i--) {
          if (contains(g.highlights[i], c)) {
            target = g.highlights[i];
            break;
          }
        }
      }
      if (!target && prev && prev.key === key && near(prev.h, c)) target = prev.h;
      const note = c.text.trim();
      if (target && note) target.note = note;
      else skipped++;
      prev = null;
      continue;
    }
    if (!c.location && c.page === undefined) {
      skipped++;
      prev = null;
      continue;
    }
    if (!g) {
      g = { key, title: c.title, highlights: [] };
      if (c.author) g.author = c.author;
      books.set(key, g);
      seen.set(key, new Map());
    }
    const lk = locKey(c);
    const dup = seen.get(key)!.get(lk);
    if (dup) {
      if (c.addedAt !== undefined && (dup.addedAt === undefined || c.addedAt < dup.addedAt)) dup.addedAt = c.addedAt;
      prev = { key, h: dup };
      continue;
    }
    const h: KindleHighlightInput = { text: c.text };
    if (c.page !== undefined) h.page = c.page;
    if (c.location) h.location = { ...c.location };
    if (c.addedAt !== undefined) h.addedAt = c.addedAt;
    g.highlights.push(h);
    seen.get(key)!.set(lk, h);
    prev = { key, h };
  }
  return { books: [...books.values()], skipped };
}

// ─── Kimlikler ────────────────────────────────────────────────────────────────────

const enc = (s: string) => new TextEncoder().encode(s);

/** Kindle kitabının özeti (64 hane): normalleştirilmiş "başlık|yazar". Kimlik ilk 16 hane. */
export function kindleBookHash(title: string, author?: string): Promise<string> {
  return sha256Hex(enc(kindleBookKey(title, author)));
}

/** Deterministik çizim kimliği: 'k' + SHA-256(konum|sayfa|alıntı) ilk 10 hane. Not girmez. */
export async function kindleHighlightId(h: Pick<KindleHighlightInput, "text" | "page" | "location">): Promise<string> {
  return "k" + (await sha256Hex(enc(locKey(h)))).slice(0, 10);
}

export function kindleAnchor(h: Pick<KindleHighlightInput, "page" | "location">): KindleAnchor {
  const a: KindleAnchor = { kind: "kindle" };
  if (h.location) a.location = { start: h.location.start, end: h.location.end };
  if (h.page !== undefined) a.page = h.page;
  return a;
}

// ─── Kayda işleme ─────────────────────────────────────────────────────────────────

export interface KindleApplyResult {
  /** Değişiklik yoksa verilen kitabın KENDİSİ (yazım gerekmez). */
  book: Book;
  /** Yeni kayıt mı oluşturuldu. */
  created: boolean;
  added: Highlight[];
  /** Notu değişen çizimler: blok `prev`'den üretilmişse yeniden yazılır. */
  updated: { prev: Highlight; next: Highlight }[];
  /** Zaten olan ve değişmeyen çizimler. */
  same: number;
  /** Eklenemeyen (boş metin vb.) çizimler. */
  skipped: number;
}

export interface KindleNewBookInput {
  /** `kindleBookHash` sonucu. */
  hash: string;
  notePath: string;
}

/**
 * Bir kitabın Kindle çizimlerini kayda işle. `existing` yoksa yeni Kindle kaydı oluşturulur
 * (`init` zorunlu). Kayıtta olmayan çizim eklenir (sarı, eklenme anı Kindle'daki an); olan çizimin
 * Kindle notu değiştiyse not güncellenir. Kindle'da notu olmayan çizimin Loomen'daki notu silinmez.
 */
export async function applyKindleBook(
  existing: Book | null,
  group: KindleBookGroup,
  now: number,
  init?: KindleNewBookInput,
): Promise<KindleApplyResult> {
  let created = false;
  let book: Book;
  if (existing) {
    if (existing.format !== "kindle") throw new Error("Kindle çizimi Kindle olmayan kitaba işlenmez");
    book = existing;
  } else {
    if (!init) throw new Error("Yeni Kindle kitabı için özet ve not yolu gerekir");
    book = newBook({ hash: init.hash, size: 0, fileName: "", format: "kindle", notePath: init.notePath, title: group.title || "Kindle" }, now);
    if (group.author) book.author = group.author;
    created = true;
  }
  const added: Highlight[] = [];
  const updated: { prev: Highlight; next: Highlight }[] = [];
  let same = 0;
  let skipped = 0;
  for (const h of group.highlights) {
    const id = await kindleHighlightId(h);
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
    const r = addHighlight(book, { text: h.text, anchor: kindleAnchor(h), color: DEFAULT_HIGHLIGHT_COLOR, note: h.note }, h.addedAt ?? now, id);
    // Oluşma anı Kindle'daki an; güncelleme anı alım anı (eşitleme geçmiş tarihe aldanmasın).
    const hl: Highlight = { ...r.highlight, updatedAt: now };
    book = { ...r.book, highlights: r.book.highlights.map((x) => (x.id === id ? hl : x)) };
    added.push(hl);
  }
  if (book !== existing && book.updatedAt !== now) book = { ...book, updatedAt: now };
  return { book, created, added, updated, same, skipped };
}

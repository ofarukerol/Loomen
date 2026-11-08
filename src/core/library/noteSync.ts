// Kitap notunun çizim blokları — saf metin işlemleri (LOM-83, K3).
//
// Her kitabın kasada düz bir notu vardır. Çizimler bu nota blok olarak düşer:
//
//   <!-- loomen:hl <hlId> -->
//   > alıntı
//
//   kullanıcının notu (varsa)
//
//   🟨 [s. 12](loomen://book/<id>?hl=<hlId>)
//   <!-- /loomen:hl <hlId> -->
//
// Kindle kitabında (LOM-84) bloklar birebir aynı biçimdedir; yer etiketi sayfa ya da
// "Konum 180-182" olur. Kindle kitabının dosyası olmadığı için notta "Kitabı aç" bağlantısı
// yerine düz bir kaynak satırı (*Kindle*) yazılır. KOReader kitabı (LOM-94) da aynı: yer etiketi
// sayfa, kaynak satırı *KOReader*. Kobo kitabı (LOM-95) da aynı: yer etiketi bölüm adı (yoksa
// "Bölüm n", o da yoksa bölüm içi yüzde), kaynak satırı *Kobo*.
//
// Paylaşılan alıntı (LOM-96) da aynı blok biçimindedir; yer etiketi "Paylaşıldı" (sayfa geçiyorsa
// "Paylaşıldı · s. 12"). Herhangi bir kitabın notuna düşebilir. Raftaki kitapla eşleşmediği için
// açılan dosyasız `shared` kaydın notunda kaynak satırı *Paylaşıldı* olur.
//
// Fotoğraftan alıntı (LOM-87) da aynı blok biçimindedir; yer etiketi "Fotoğraf" (sayfa yazıldıysa
// "Fotoğraf · s. 12"). Herhangi bir kitabın notuna düşebilir. Raftaki kitapla eşleşmeyen basılı
// kitap için açılan dosyasız `paper` kaydın notunda kaynak satırı *Basılı kitap* olur.
//
// İşaretler (HTML yorumu) başka Markdown uygulamalarında görünmez; Loomen okuma modunda da
// gizler. Kural: yalnız işaretler ARASINA dokunulur. Kullanıcının nota yazdığı başka her şey
// olduğu gibi kalır. Bitiş işareti kaybolmuş (elle bozulmuş) bloğa hiç dokunulmaz.
//
// Kalem notları (LOM-97, yalnız PDF): kalemle yazılan her sayfa "Kalem notları" bölümünde
// bir blok olur. Blok sayfanın resmini (kasada `Kütüphane/Kalem/<id>-s<N>.png`) ve o sayfayı
// açan bağlantıyı taşır:
//
//   <!-- loomen:ink p12 -->
//   ![[Kütüphane/Kalem/<id>-s12.png]]
//
//   ✏️ [s. 12](loomen://book/<id>?page=12)
//   <!-- /loomen:ink p12 -->
//
// Aynı kural geçerli: yalnız işaretler arasına dokunulur, elle değiştirilmiş ya da bitişi
// kaybolmuş bloğa yazılmaz. Bölüm başlığını Loomen ekler ama hiç silmez.

import { BOOK_ID_RE } from "./codec";
import { bookLink } from "./links";
import { hasBookFile } from "./model";
import { inkPages } from "./model";
import type { Book, Highlight, HighlightColor } from "./types";

/** Notta görünen yazılar (uygulama dili). Varsayılan Türkçe. */
export interface NoteLabels {
  quotes: string;
  openBook: string;
  /** `{n}` sayfa numarasıyla değişir. */
  page: string;
  /** `{n}` bölüm sırasıyla (1'den) değişir. */
  section: string;
  /** Kindle konumu: `{n}` konum ya da aralık ("180-182") ile değişir. Yoksa varsayılan. */
  location?: string;
  /** Kindle kitabının notundaki kaynak satırı. Yoksa varsayılan. */
  kindle?: string;
  /** KOReader kitabının notundaki kaynak satırı (LOM-94). Yoksa varsayılan. */
  koreader?: string;
  /** Kobo kitabının notundaki kaynak satırı (LOM-95). Yoksa varsayılan. */
  kobo?: string;
  /** Kobo yer etiketi bölüm bilinmediğinde: `{n}` bölüm içi yüzdeyle değişir. Yoksa varsayılan. */
  progress?: string;
  /** Kalem notları bölümünün başlığı (LOM-97). Yoksa varsayılan. */
  ink?: string;
  /** Paylaşılan alıntının yer etiketi ve `shared` kaydın kaynak satırı (LOM-96). Yoksa varsayılan. */
  shared?: string;
  /** Fotoğraftan alıntının yer etiketi (LOM-87). Yoksa varsayılan. */
  photo?: string;
  /** Basılı kitap (`paper`) kaydının kaynak satırı (LOM-87). Yoksa varsayılan. */
  paper?: string;
}

export const DEFAULT_NOTE_LABELS: Readonly<Required<NoteLabels>> = Object.freeze({
  quotes: "Alıntılar",
  openBook: "Kitabı aç",
  page: "s. {n}",
  section: "Bölüm {n}",
  location: "Konum {n}",
  kindle: "Kindle",
  koreader: "KOReader",
  kobo: "Kobo",
  progress: "%{n}",
  ink: "Kalem notları",
  shared: "Paylaşıldı",
  photo: "Fotoğraf",
  paper: "Basılı kitap",
});

export const COLOR_MARK: Record<HighlightColor, string> = {
  yellow: "🟨",
  green: "🟩",
  blue: "🟦",
  pink: "🩷",
};

/** Ön maddedeki kitap kimliği anahtarı — not taşınsa da kitabın notu bununla bulunur. */
export const NOTE_BOOK_KEY = "loomen-book";

const START_RE = /^<!--\s*loomen:hl\s+([A-Za-z0-9_-]+)\s*-->$/;
const END_RE = /^<!--\s*\/loomen:hl\s+([A-Za-z0-9_-]+)\s*-->$/;
const INK_START_RE = /^<!--\s*loomen:ink\s+p([1-9][0-9]{0,5})\s*-->$/;
const INK_END_RE = /^<!--\s*\/loomen:ink\s+p([1-9][0-9]{0,5})\s*-->$/;
/** Herhangi bir blok başlangıcı (çizim ya da kalem): bitişi olmayan bloğun sınırı. */
const ANY_START_RE = /^<!--\s*loomen:(?:hl|ink)\s+[A-Za-z0-9_-]+\s*-->$/;

interface Markers {
  start: RegExp;
  end: RegExp;
}
const HL_MARKERS: Markers = { start: START_RE, end: END_RE };
const INK_MARKERS: Markers = { start: INK_START_RE, end: INK_END_RE };

/** Kullanıcı metninin işaret gibi görünmesini ve yorumu kapatmasını engelle. */
function neutralize(s: string): string {
  return s.replace(/<!--/g, "<!​--").replace(/-->/g, "-​->");
}

/** Bağlantı etiketinde köşeli parantez ve ters bölü bağlantıyı bozar (okuyucu `\x` kaçışını çözer). */
function labelSafe(s: string): string {
  return s.replace(/[[\]\\]/g, (c) => "\\" + c).replace(/\s+/g, " ").trim();
}

/**
 * Çizimin yer etiketi: PDF'te sayfa, EPUB'da bölüm adı (yoksa sırası), Kindle'da sayfa ya da konum,
 * KOReader'da sayfa, Kobo'da bölüm adı (yoksa sırası, o da yoksa bölüm içi yüzde), paylaşılan
 * alıntıda "Paylaşıldı" (sayfa varsa "Paylaşıldı · s. 12"), fotoğraftan alıntıda "Fotoğraf"
 * (sayfa varsa "Fotoğraf · s. 12").
 */
export function locationLabel(h: Highlight, labels: NoteLabels = DEFAULT_NOTE_LABELS): string {
  const a = h.anchor;
  if (a.kind === "shared") {
    const tag = labels.shared || DEFAULT_NOTE_LABELS.shared;
    return a.page !== undefined ? `${tag} · ${labels.page.replace("{n}", String(a.page))}` : tag;
  }
  if (a.kind === "photo") {
    const tag = labels.photo || DEFAULT_NOTE_LABELS.photo;
    return a.page !== undefined ? `${tag} · ${labels.page.replace("{n}", String(a.page))}` : tag;
  }
  if (a.kind === "pdf" || a.kind === "koreader") return labels.page.replace("{n}", String(a.page));
  if (a.kind === "kindle") {
    if (a.page !== undefined) return labels.page.replace("{n}", String(a.page));
    const l = a.location;
    const n = !l ? "?" : l.start === l.end ? String(l.start) : `${l.start}-${l.end}`;
    return (labels.location || DEFAULT_NOTE_LABELS.location).replace("{n}", n);
  }
  if (a.kind === "kobo") {
    if (h.chapter) return h.chapter;
    if (a.chapter !== undefined) return labels.section.replace("{n}", String(a.chapter + 1));
    return (labels.progress || DEFAULT_NOTE_LABELS.progress).replace("{n}", String(Math.round(a.progress * 100)));
  }
  if (h.chapter) return h.chapter;
  return labels.section.replace("{n}", String(a.spine + 1));
}

/** Bir çizimin blok satırları (işaretler dahil). */
export function highlightBlockLines(book: Pick<Book, "id">, h: Highlight, labels: NoteLabels = DEFAULT_NOTE_LABELS): string[] {
  const lines = [`<!-- loomen:hl ${h.id} -->`];
  const quote = neutralize(h.text).split(/\r?\n/);
  for (const q of quote) lines.push(q.trim() ? `> ${q}` : ">");
  const note = h.note?.trim();
  if (note) {
    lines.push("");
    for (const n of neutralize(note).split(/\r?\n/)) lines.push(n.replace(/\s+$/, ""));
  }
  lines.push("");
  const href = bookLink({ bookId: book.id, highlightId: h.id });
  lines.push(`${COLOR_MARK[h.color] ?? COLOR_MARK.yellow} [${labelSafe(locationLabel(h, labels))}](${href})`);
  lines.push(`<!-- /loomen:hl ${h.id} -->`);
  return lines;
}

/** Yeni kitap notunun tam metni (var olan çizimler kitap sırasıyla eklenir). */
export function bookNoteTemplate(book: Book, labels: NoteLabels = DEFAULT_NOTE_LABELS): string {
  const lines = ["---", `${NOTE_BOOK_KEY}: ${book.id}`, "---", "", `# ${neutralize(book.title)}`, ""];
  if (book.author) lines.push(`*${neutralize(book.author)}*`, "");
  if (!hasBookFile(book)) {
    // Dosyasız kitap (Kindle, KOReader, Kobo, paylaşılan, basılı): "Kitabı aç" yerine düz kaynak satırı.
    const f = book.format as "kindle" | "koreader" | "kobo" | "shared" | "paper";
    lines.push(`*${neutralize(labels[f] || DEFAULT_NOTE_LABELS[f])}*`);
  } else lines.push(`[${labelSafe(labels.openBook)}](${bookLink({ bookId: book.id })})`);
  lines.push("", `## ${labels.quotes}`, "");
  for (const h of book.highlights) lines.push(...highlightBlockLines(book, h, labels), "");
  const ink = inkSectionLines(book, labels);
  if (ink.length) {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push("", ...ink);
  }
  return lines.join("\n").replace(/\n+$/, "") + "\n";
}

/** Notun ön maddesindeki kitap kimliği; yoksa null. */
export function noteBookId(text: string): string | null {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  for (let i = 1; i < lines.length && i < 50; i++) {
    const l = lines[i].trim();
    if (l === "---") return null;
    const m = /^loomen-book:\s*["']?([A-Za-z0-9_-]{1,64})["']?\s*$/.exec(l);
    if (m) return m[1];
  }
  return null;
}

interface Block {
  start: number;
  /** Bitiş işaretinin satırı; -1 = bitiş yok (bozuk blok). */
  end: number;
}

/**
 * Notun bütün blokları (id → konum). Aynı kimlik iki kez varsa ilki geçerli. Varsayılan çizim
 * blokları; kalem blokları için `INK_MARKERS` (kimlik sayfa numarasıdır).
 */
function scanBlocks(lines: string[], mk: Markers = HL_MARKERS): Map<string, Block> {
  const out = new Map<string, Block>();
  for (let i = 0; i < lines.length; i++) {
    const m = mk.start.exec(lines[i].trim());
    if (!m || out.has(m[1])) continue;
    const id = m[1];
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      const e = mk.end.exec(t);
      if (e && e[1] === id) {
        end = j;
        break;
      }
      if (ANY_START_RE.test(t)) break; // başka blok başladı: bu bloğun bitişi yok
    }
    out.set(id, { start: i, end });
    if (end > i) i = end;
  }
  return out;
}

/** Notta bu çizimin bloğu var mı: "ok", "broken" (bitişi yok) ya da "missing". */
export function blockState(text: string, hlId: string): "ok" | "broken" | "missing" {
  const b = scanBlocks(split(text).lines).get(hlId);
  return !b ? "missing" : b.end < 0 ? "broken" : "ok";
}

/** Notta bloğu olan çizim kimlikleri (sırayla). */
export function blockIds(text: string): string[] {
  return [...scanBlocks(split(text).lines).entries()].filter(([, b]) => b.end >= 0).sort((a, b) => a[1].start - b[1].start).map(([id]) => id);
}

function split(text: string): { lines: string[]; eol: string } {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { lines: text.replace(/\r\n/g, "\n").split("\n"), eol };
}

function join(lines: string[], eol: string): string {
  // Sonda tek satır sonu.
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join(eol) + eol;
}

const isBlank = (l: string | undefined) => l !== undefined && l.trim() === "";

/**
 * Çizim bloğunu ekle. `order` kitap sırasındaki çizim kimlikleridir: blok, sırada kendinden
 * sonra gelen ilk mevcut bloğun önüne; yoksa önceki bloğun arkasına; o da yoksa notun sonuna
 * girer. Blok zaten varsa güncellenir.
 */
export function insertHighlightBlock(
  text: string,
  book: Pick<Book, "id">,
  h: Highlight,
  order: string[],
  labels: NoteLabels = DEFAULT_NOTE_LABELS,
  prev?: Highlight,
): string {
  const { lines, eol } = split(text);
  const blocks = scanBlocks(lines);
  const have = blocks.get(h.id);
  if (have) {
    if (have.end < 0) return text;
    // Kullanıcı bloğun içine yazdıysa üstüne yazma: blok son yazdığımız hâlde değilse dokunulmaz.
    if (prev && !blockMatches(lines, have, highlightBlockLines(book, prev, labels))) return text;
    return replaceAt(lines, eol, have, highlightBlockLines(book, h, labels));
  }
  const block = highlightBlockLines(book, h, labels);
  const idx = order.indexOf(h.id);
  const valid = (id: string) => {
    const b = blocks.get(id);
    return b && b.end >= 0 ? b : null;
  };
  if (idx >= 0) {
    for (let k = idx + 1; k < order.length; k++) {
      const next = valid(order[k]);
      if (next) {
        lines.splice(next.start, 0, ...block, "");
        return join(lines, eol);
      }
    }
    for (let k = idx - 1; k >= 0; k--) {
      const prev = valid(order[k]);
      if (prev) {
        lines.splice(prev.end + 1, 0, "", ...block);
        return join(lines, eol);
      }
    }
  }
  // Kalem notları bölümü varsa çizim onun önüne girer (alıntılar kalem bölümüne karışmasın).
  const inkAt = inkSectionStart(lines, labels);
  if (inkAt >= 0) {
    let at = inkAt;
    while (at > 0 && isBlank(lines[at - 1])) at--;
    lines.splice(at, inkAt - at, ...(at > 0 ? [""] : []), ...block, "");
    return join(lines, eol);
  }
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length) lines.push("");
  lines.push(...block);
  return join(lines, eol);
}

/**
 * Karşılaştırma için satırı düzle: sondaki boşluk gider; kitap bağlantısının etiketi
 * ("s. 12" / "p. 12") maskelenir — arayüz dili değişince blok "elle değişmiş" sayılmasın.
 */
function normLine(l: string): string {
  return l.trimEnd().replace(/^(\S+) \[(?:\\.|[^\]\\])*\]\((loomen:\/\/book\/[^)\s]*)\)$/, "$1 []($2)");
}

/** Blok, verilen satırlarla aynı mı (sondaki boşluk ve bağlantı etiketi sayılmaz). */
function blockMatches(lines: string[], b: Block, expected: string[]): boolean {
  const cur = lines.slice(b.start, b.end + 1);
  return cur.length === expected.length && cur.every((l, i) => normLine(l) === normLine(expected[i]));
}

function replaceAt(lines: string[], eol: string, b: Block, block: string[]): string {
  lines.splice(b.start, b.end - b.start + 1, ...block);
  return join(lines, eol);
}

/**
 * Çizim bloğunu yeniden yaz (renk, not değişti). Blok yoksa eklenir; bozuksa dokunulmaz.
 * `prev` verilirse blok yalnız hâlâ `prev`'den üretilmiş hâldeyse yazılır; kullanıcı bloğu
 * elle değiştirdiyse metin aynı kalır (yazdığı silinmez).
 */
export function updateHighlightBlock(
  text: string,
  book: Pick<Book, "id">,
  h: Highlight,
  order: string[],
  labels: NoteLabels = DEFAULT_NOTE_LABELS,
  prev?: Highlight,
): string {
  return insertHighlightBlock(text, book, h, order, labels, prev);
}

/**
 * Çizim bloğunu kaldır: yalnız işaretler arası ve bir boş satır gider. Bozuk ya da yoksa metin aynı kalır.
 * `expected` verilirse blok yalnız hâlâ o çizimden üretilmiş hâldeyse silinir; kullanıcı bloğa
 * yazdıysa metin aynı kalır.
 */
export function removeHighlightBlock(
  text: string,
  hlId: string,
  expected?: { book: Pick<Book, "id">; h: Highlight; labels?: NoteLabels },
): string {
  const { lines, eol } = split(text);
  const b = scanBlocks(lines).get(hlId);
  if (!b || b.end < 0) return text;
  if (expected && !blockMatches(lines, b, highlightBlockLines(expected.book, expected.h, expected.labels ?? DEFAULT_NOTE_LABELS))) {
    return text;
  }
  let from = b.start;
  let count = b.end - b.start + 1;
  if (isBlank(lines[b.end + 1])) count++;
  else if (from > 0 && isBlank(lines[from - 1])) {
    from--;
    count++;
  }
  lines.splice(from, count);
  return join(lines, eol);
}

// ---------------------------------------------------------------------------
// Kalem notları (LOM-97)

/** Kalem resimlerinin kasadaki klasörü. */
export const INK_IMAGE_DIR = "Kütüphane/Kalem";
/** Kalem bloğunun bağlantı satırındaki simge. */
export const INK_MARK = "✏️";

const validPage = (page: number) => Number.isInteger(page) && page > 0 && page < 1_000_000;

/** Kalemli sayfanın kasadaki resim yolu: `Kütüphane/Kalem/<kitapId>-s<sayfa>.png`. */
export function inkImagePath(bookId: string, page: number): string {
  if (!validPage(page)) throw new Error(`Geçersiz sayfa: ${page}`);
  // Yol kaçırmayı önlemek için kimlik sıkı kalıptan geçer.
  if (!BOOK_ID_RE.test(bookId)) throw new Error(`Geçersiz kitap kimliği: ${bookId}`);
  return `${INK_IMAGE_DIR}/${bookId}-s${page}.png`;
}

/** Kalem notları bölümünün başlığı (etiketsiz eski nesnede varsayılan). */
function inkHeading(labels: NoteLabels): string {
  return `## ${labels.ink || DEFAULT_NOTE_LABELS.ink}`;
}

/** Bir kalemli sayfanın blok satırları (işaretler dahil). */
export function inkBlockLines(book: Pick<Book, "id">, page: number, labels: NoteLabels = DEFAULT_NOTE_LABELS): string[] {
  const href = bookLink({ bookId: book.id, page });
  return [
    `<!-- loomen:ink p${page} -->`,
    `![[${inkImagePath(book.id, page)}]]`,
    "",
    `${INK_MARK} [${labelSafe(labels.page.replace("{n}", String(page)))}](${href})`,
    `<!-- /loomen:ink p${page} -->`,
  ];
}

/** Bölümün tam satırları (başlık + bloklar); kalemli sayfa yoksa boş. */
function inkSectionLines(book: Pick<Book, "id" | "ink">, labels: NoteLabels): string[] {
  const pages = inkPages(book);
  if (!pages.length) return [];
  const out = [inkHeading(labels), ""];
  for (const p of pages) out.push(...inkBlockLines(book, p, labels), "");
  return out;
}

/** Notta bu sayfanın kalem bloğu var mı: "ok", "broken" (bitişi yok) ya da "missing". */
export function inkBlockState(text: string, page: number): "ok" | "broken" | "missing" {
  const b = scanBlocks(split(text).lines, INK_MARKERS).get(String(page));
  return !b ? "missing" : b.end < 0 ? "broken" : "ok";
}

/** Notta (sağlam) kalem bloğu olan sayfalar, notta göründüğü sırayla. */
export function inkBlockPages(text: string): number[] {
  return [...scanBlocks(split(text).lines, INK_MARKERS).entries()]
    .filter(([, b]) => b.end >= 0)
    .sort((a, b) => a[1].start - b[1].start)
    .map(([p]) => Number(p));
}

/** Bölüm başlığının satırı: uygulama dilindeki ya da varsayılan Türkçe başlık; yoksa -1. */
function findInkHeading(lines: string[], labels: NoteLabels): number {
  const want = new Set([inkHeading(labels), inkHeading(DEFAULT_NOTE_LABELS)].map((h) => h.toLocaleLowerCase("tr")));
  return lines.findIndex((l) => want.has(l.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr")));
}

/** Kalem bölümünün başladığı satır: başlık, başlık silinmişse ilk kalem bloğu; yoksa -1. */
function inkSectionStart(lines: string[], labels: NoteLabels): number {
  const h = findInkHeading(lines, labels);
  if (h >= 0) return h;
  const starts = [...scanBlocks(lines, INK_MARKERS).values()].map((b) => b.start);
  return starts.length ? Math.min(...starts) : -1;
}

/**
 * Kalemli sayfanın bloğunu ekle ya da yenile. Bloklar sayfa sırasıyla durur: blok, kendinden
 * büyük sayfanın bloğunun önüne; yoksa küçük sayfanın arkasına; hiç blok yoksa "Kalem notları"
 * başlığının altına girer. Başlık da yoksa notun sonuna başlıkla birlikte eklenir.
 * Blok zaten varsa yalnız Loomen'ın yazdığı hâldeyse yeniden yazılır (dil değişmişse etiket
 * güncellenir); kullanıcı bloğa yazdıysa ya da bitişi kaybolduysa metin aynı kalır.
 */
export function insertInkBlock(text: string, book: Pick<Book, "id">, page: number, labels: NoteLabels = DEFAULT_NOTE_LABELS): string {
  if (!validPage(page) || !BOOK_ID_RE.test(book.id)) return text;
  const { lines, eol } = split(text);
  const blocks = scanBlocks(lines, INK_MARKERS);
  const block = inkBlockLines(book, page, labels);
  const have = blocks.get(String(page));
  if (have) {
    if (have.end < 0) return text;
    if (!blockMatches(lines, have, block)) return text;
    return replaceAt(lines, eol, have, block);
  }
  const others = [...blocks.entries()].filter(([, b]) => b.end >= 0).map(([p, b]) => ({ page: Number(p), b }));
  const next = others.filter((o) => o.page > page).sort((x, y) => x.page - y.page)[0];
  if (next) {
    lines.splice(next.b.start, 0, ...block, "");
    return join(lines, eol);
  }
  const prev = others.filter((o) => o.page < page).sort((x, y) => y.page - x.page)[0];
  if (prev) {
    lines.splice(prev.b.end + 1, 0, "", ...block);
    return join(lines, eol);
  }
  const h = findInkHeading(lines, labels);
  if (h >= 0) {
    // Başlığın hemen altına (aradaki boş satırlar korunur, bir boş satırla ayrılır).
    let at = h + 1;
    while (at < lines.length && isBlank(lines[at])) at++;
    const tail = at < lines.length ? [""] : [];
    lines.splice(h + 1, at - (h + 1), "", ...block, ...tail);
    return join(lines, eol);
  }
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length) lines.push("");
  lines.push(inkHeading(labels), "", ...block);
  return join(lines, eol);
}

/** Kalem bloğunu yeniden yaz; yoksa ekler (bkz. insertInkBlock). */
export function updateInkBlock(text: string, book: Pick<Book, "id">, page: number, labels: NoteLabels = DEFAULT_NOTE_LABELS): string {
  return insertInkBlock(text, book, page, labels);
}

/**
 * Kalem bloğunu kaldır (sayfa temizlendi): yalnız işaretler arası ve bir boş satır gider.
 * Bozuk ya da yoksa metin aynı kalır. `expected` verilirse blok yalnız hâlâ Loomen'ın yazdığı
 * hâldeyse silinir. Bölüm başlığı yerinde kalır.
 */
export function removeInkBlock(
  text: string,
  page: number,
  expected?: { book: Pick<Book, "id">; labels?: NoteLabels },
): string {
  const { lines, eol } = split(text);
  const b = scanBlocks(lines, INK_MARKERS).get(String(page));
  if (!b || b.end < 0) return text;
  if (expected && !BOOK_ID_RE.test(expected.book.id)) return text;
  if (expected && !blockMatches(lines, b, inkBlockLines(expected.book, page, expected.labels ?? DEFAULT_NOTE_LABELS))) {
    return text;
  }
  let from = b.start;
  let count = b.end - b.start + 1;
  if (isBlank(lines[b.end + 1])) count++;
  else if (from > 0 && isBlank(lines[from - 1])) {
    from--;
    count++;
  }
  lines.splice(from, count);
  return join(lines, eol);
}

/**
 * Notun kalem bloklarını kitabın kalem kaydıyla eşitle: kalemli her sayfanın bloğu olur,
 * kaydı boşalan sayfanın (Loomen'ın yazdığı hâldeki) bloğu kalkar. Elle değiştirilmiş ya da
 * bozuk bloklara dokunulmaz.
 */
export function syncInkBlocks(text: string, book: Pick<Book, "id" | "ink">, labels: NoteLabels = DEFAULT_NOTE_LABELS): string {
  const want = new Set(inkPages(book));
  let out = text;
  for (const p of inkBlockPages(out)) if (!want.has(p)) out = removeInkBlock(out, p, { book, labels });
  for (const p of want) out = insertInkBlock(out, book, p, labels);
  return out;
}

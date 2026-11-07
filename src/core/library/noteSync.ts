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
// yerine düz bir kaynak satırı (*Kindle*) yazılır.
//
// İşaretler (HTML yorumu) başka Markdown uygulamalarında görünmez; Loomen okuma modunda da
// gizler. Kural: yalnız işaretler ARASINA dokunulur. Kullanıcının nota yazdığı başka her şey
// olduğu gibi kalır. Bitiş işareti kaybolmuş (elle bozulmuş) bloğa hiç dokunulmaz.

import { bookLink } from "./links";
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
}

export const DEFAULT_NOTE_LABELS: Readonly<Required<NoteLabels>> = Object.freeze({
  quotes: "Alıntılar",
  openBook: "Kitabı aç",
  page: "s. {n}",
  section: "Bölüm {n}",
  location: "Konum {n}",
  kindle: "Kindle",
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

/** Kullanıcı metninin işaret gibi görünmesini ve yorumu kapatmasını engelle. */
function neutralize(s: string): string {
  return s.replace(/<!--/g, "<!​--").replace(/-->/g, "-​->");
}

/** Bağlantı etiketinde köşeli parantez ve ters bölü bağlantıyı bozar (okuyucu `\x` kaçışını çözer). */
function labelSafe(s: string): string {
  return s.replace(/[[\]\\]/g, (c) => "\\" + c).replace(/\s+/g, " ").trim();
}

/** Çizimin yer etiketi: PDF'te sayfa, EPUB'da bölüm adı (yoksa sırası), Kindle'da sayfa ya da konum. */
export function locationLabel(h: Highlight, labels: NoteLabels = DEFAULT_NOTE_LABELS): string {
  const a = h.anchor;
  if (a.kind === "pdf") return labels.page.replace("{n}", String(a.page));
  if (a.kind === "kindle") {
    if (a.page !== undefined) return labels.page.replace("{n}", String(a.page));
    const l = a.location;
    const n = !l ? "?" : l.start === l.end ? String(l.start) : `${l.start}-${l.end}`;
    return (labels.location || DEFAULT_NOTE_LABELS.location).replace("{n}", n);
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
  if (book.format === "kindle") lines.push(`*${neutralize(labels.kindle || DEFAULT_NOTE_LABELS.kindle)}*`);
  else lines.push(`[${labelSafe(labels.openBook)}](${bookLink({ bookId: book.id })})`);
  lines.push("", `## ${labels.quotes}`, "");
  for (const h of book.highlights) lines.push(...highlightBlockLines(book, h, labels), "");
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

/** Notun bütün blokları (id → konum). Aynı kimlik iki kez varsa ilki geçerli. */
function scanBlocks(lines: string[]): Map<string, Block> {
  const out = new Map<string, Block>();
  for (let i = 0; i < lines.length; i++) {
    const m = START_RE.exec(lines[i].trim());
    if (!m || out.has(m[1])) continue;
    const id = m[1];
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      const e = END_RE.exec(t);
      if (e && e[1] === id) {
        end = j;
        break;
      }
      const s = START_RE.exec(t);
      if (s) break; // başka blok başladı: bu bloğun bitişi yok
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

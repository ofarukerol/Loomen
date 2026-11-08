// Kitap kaydının (Kütüphane/<id>.json) okunması/yazılması — saf (LOM-83).
//
// Yazma deterministiktir: alanlar sabit sırayla, girintili, sonda tek satır sonu. Aynı kayıt
// her zaman aynı metni üretir; store değişmeyen dosyayı yeniden yazmaz, git farkı okunur kalır.
// Okuma şüphecidir: bozuk JSON, bilinmeyen sürüm ya da zorunlu alanı eksik/yanlış dosya null
// döner (store onu "bozuk" sayar ve ASLA üstüne yazmaz). Tek tek bozuk çizimler atılmaz:
// okunamayan çizim varsa bütün dosya bozuk sayılır — yoksa ilk kayıtta sessizce silinirdi.

import {
  BOOK_FILE_VERSION,
  BOOK_FORMATS,
  BOOK_STATUSES,
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  type Anchor,
  type Book,
  type BookFormat,
  type BookPosition,
  type BookStatus,
  type Highlight,
  type HighlightColor,
  type InkPage,
  type InkPoint,
  type InkStroke,
  type KindleAnchor,
  type KoboAnchor,
  type KoreaderAnchor,
  type PdfRect,
} from "./types";

/** Dosya adı olarak güvenli kimlik (yol ayırıcısı, nokta, boşluk yok). */
export const BOOK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Çizim kimliği (bağlantıda geçer). */
export const HIGHLIGHT_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
/** Kalem çizgisi kimliği. */
export const INK_STROKE_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown, min = 0): v is number => isNum(v) && Number.isInteger(v) && v >= min;
const unit = (v: number) => Math.min(1, Math.max(0, v));
/** Yuvarlama: dosya kısa kalsın, aynı değer aynı metni üretsin (0..1 aralığında 5 hane ≈ 0,01 px). */
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

function encodeRect(r: PdfRect): PdfRect {
  return { x: r5(unit(r.x)), y: r5(unit(r.y)), w: r5(unit(r.w)), h: r5(unit(r.h)) };
}

export function encodeAnchor(a: Anchor): Anchor {
  if (a.kind === "pdf") return { kind: "pdf", page: a.page, rects: a.rects.map(encodeRect) };
  if (a.kind === "kindle") {
    const out: KindleAnchor = { kind: "kindle" };
    if (a.location) out.location = { start: a.location.start, end: a.location.end };
    if (a.page !== undefined) out.page = a.page;
    return out;
  }
  if (a.kind === "koreader") {
    const out: KoreaderAnchor = { kind: "koreader", page: a.page };
    if (a.pos0) out.pos0 = a.pos0;
    if (a.pos1) out.pos1 = a.pos1;
    return out;
  }
  if (a.kind === "kobo") {
    const out: KoboAnchor = { kind: "kobo", progress: r5(unit(isNum(a.progress) ? a.progress : 0)) };
    if (a.chapter !== undefined && isInt(a.chapter)) out.chapter = a.chapter;
    return out;
  }
  return { kind: "epub", spine: a.spine, href: a.href, start: a.start, end: a.end };
}

export function decodeAnchor(v: unknown): Anchor | null {
  if (!isObj(v)) return null;
  if (v.kind === "pdf") {
    if (!isInt(v.page, 1) || !Array.isArray(v.rects)) return null;
    const rects: PdfRect[] = [];
    for (const r of v.rects) {
      if (!isObj(r) || !isNum(r.x) || !isNum(r.y) || !isNum(r.w) || !isNum(r.h)) return null;
      rects.push({ x: unit(r.x), y: unit(r.y), w: unit(r.w), h: unit(r.h) });
    }
    return { kind: "pdf", page: v.page, rects };
  }
  if (v.kind === "epub") {
    if (!isInt(v.spine) || typeof v.href !== "string" || !isInt(v.start) || !isInt(v.end) || v.end < v.start) return null;
    return { kind: "epub", spine: v.spine, href: v.href, start: v.start, end: v.end };
  }
  if (v.kind === "kindle") {
    const out: KindleAnchor = { kind: "kindle" };
    if (v.location !== undefined) {
      const l = v.location;
      if (!isObj(l) || !isInt(l.start, 1) || !isInt(l.end, 1) || l.end < l.start) return null;
      out.location = { start: l.start, end: l.end };
    }
    if (v.page !== undefined) {
      if (!isInt(v.page, 1)) return null;
      out.page = v.page;
    }
    return out.location || out.page !== undefined ? out : null;
  }
  if (v.kind === "koreader") {
    if (!isInt(v.page, 1)) return null;
    const out: KoreaderAnchor = { kind: "koreader", page: v.page };
    for (const k of ["pos0", "pos1"] as const) {
      if (v[k] === undefined) continue;
      if (typeof v[k] !== "string") return null;
      if (v[k]) out[k] = v[k] as string;
    }
    return out;
  }
  if (v.kind === "kobo") {
    if (!isNum(v.progress)) return null;
    const out: KoboAnchor = { kind: "kobo", progress: unit(v.progress) };
    if (v.chapter !== undefined && v.chapter !== null) {
      if (!isInt(v.chapter)) return null;
      out.chapter = v.chapter;
    }
    return out;
  }
  return null;
}

export function encodePosition(p: BookPosition): BookPosition {
  if (p.kind === "pdf") return { kind: "pdf", page: p.page, offset: r5(unit(p.offset)) };
  if (p.kind === "kindle") return { kind: "kindle", location: Math.max(0, Math.round(p.location)) };
  if (p.kind === "koreader") return { kind: "koreader", location: Math.max(1, Math.round(p.location)) };
  if (p.kind === "kobo") return { kind: "kobo", location: Math.max(0, Math.round(p.location)) };
  return { kind: "epub", spine: p.spine, href: p.href, offset: Math.max(0, Math.round(p.offset)) };
}

export function decodePosition(v: unknown): BookPosition | undefined {
  if (!isObj(v)) return undefined;
  if (v.kind === "pdf" && isInt(v.page, 1) && isNum(v.offset)) return { kind: "pdf", page: v.page, offset: unit(v.offset) };
  if (v.kind === "epub" && isInt(v.spine) && typeof v.href === "string" && isNum(v.offset)) {
    return { kind: "epub", spine: v.spine, href: v.href, offset: Math.max(0, Math.round(v.offset)) };
  }
  if (v.kind === "kindle" && isInt(v.location)) return { kind: "kindle", location: v.location };
  if (v.kind === "koreader" && isInt(v.location, 1)) return { kind: "koreader", location: v.location };
  if (v.kind === "kobo" && isInt(v.location)) return { kind: "kobo", location: v.location };
  return undefined;
}

function encodeHighlight(h: Highlight): Record<string, unknown> {
  const out: Record<string, unknown> = { id: h.id, color: h.color, text: h.text };
  if (h.note) out.note = h.note;
  if (h.chapter) out.chapter = h.chapter;
  out.anchor = encodeAnchor(h.anchor);
  out.createdAt = h.createdAt;
  out.updatedAt = h.updatedAt;
  return out;
}

function decodeHighlight(v: unknown): Highlight | null {
  if (!isObj(v)) return null;
  if (typeof v.id !== "string" || !HIGHLIGHT_ID_RE.test(v.id)) return null;
  if (typeof v.text !== "string") return null;
  const anchor = decodeAnchor(v.anchor);
  if (!anchor) return null;
  const color: HighlightColor = HIGHLIGHT_COLORS.includes(v.color as HighlightColor)
    ? (v.color as HighlightColor)
    : DEFAULT_HIGHLIGHT_COLOR;
  const createdAt = isNum(v.createdAt) ? v.createdAt : 0;
  const h: Highlight = {
    id: v.id,
    color,
    text: v.text,
    anchor,
    createdAt,
    updatedAt: isNum(v.updatedAt) ? v.updatedAt : createdAt,
  };
  if (typeof v.note === "string" && v.note) h.note = v.note;
  if (typeof v.chapter === "string" && v.chapter) h.chapter = v.chapter;
  return h;
}

// ─── Kalem (LOM-97) ───────────────────────────────────────────────────────────────
//
// Noktalar dosyada tek metin olarak durur: "x,y x,y …" (5 haneye yuvarlı oranlar). Dizi olarak
// yazılsaydı girintili JSON her sayıyı ayrı satıra koyar, dosya ve git farkı şişerdi.

const NUM_RE = /^\d+(?:\.\d+)?(?:e-?\d+)?$/;

/** Noktaları dosyadaki metne çevir (0..1'e kırpılır, 5 haneye yuvarlanır). */
export function encodeInkPoints(points: InkPoint[]): string {
  return points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => `${r5(unit(p.x))},${r5(unit(p.y))}`)
    .join(" ");
}

/** Dosyadaki nokta metnini oku; boş ya da bozuksa null. Aralık dışı değer 0..1'e kırpılır. */
export function decodeInkPoints(v: unknown): InkPoint[] | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const out: InkPoint[] = [];
  for (const pair of v.trim().split(/\s+/)) {
    const xy = pair.split(",");
    if (xy.length !== 2 || !NUM_RE.test(xy[0]) || !NUM_RE.test(xy[1])) return null;
    const x = Number(xy[0]);
    const y = Number(xy[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push({ x: unit(x), y: unit(y) });
  }
  return out;
}

function encodeInkPage(p: InkPage): Record<string, unknown> {
  return {
    page: p.page,
    updatedAt: p.updatedAt,
    // Geçerli noktası kalmayan çizgi yazılmaz (yazılsaydı dosya okunurken bozuk sayılırdı).
    strokes: p.strokes
      .map((s) => ({ id: s.id, createdAt: s.createdAt, points: encodeInkPoints(s.points) }))
      .filter((s) => s.points),
  };
}

function decodeInkStroke(v: unknown): InkStroke | null {
  if (!isObj(v) || typeof v.id !== "string" || !INK_STROKE_ID_RE.test(v.id)) return null;
  const points = decodeInkPoints(v.points);
  if (!points) return null;
  return { id: v.id, points, createdAt: isNum(v.createdAt) ? v.createdAt : 0 };
}

/**
 * Kalem verisini oku. Alan yoksa [] (eski kayıt). Herhangi bir sayfa ya da çizgi bozuksa,
 * aynı sayfa iki kez geçiyorsa ya da bir sayfada kimlik tekrarlanıyorsa null: dosya bozuk sayılır,
 * üstüne yazılmaz (çizimlerle aynı katılık). Boş sayfa atlanır; sayfalar sıraya dizilir.
 */
export function decodeInk(v: unknown): InkPage[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return null;
  const pages: InkPage[] = [];
  const seen = new Set<number>();
  for (const x of v) {
    if (!isObj(x) || !isInt(x.page, 1) || !Array.isArray(x.strokes)) return null;
    if (seen.has(x.page)) return null;
    seen.add(x.page);
    const strokes: InkStroke[] = [];
    const ids = new Set<string>();
    for (const sv of x.strokes) {
      const st = decodeInkStroke(sv);
      if (!st || ids.has(st.id)) return null;
      ids.add(st.id);
      strokes.push(st);
    }
    if (!strokes.length) continue;
    const last = strokes.reduce((m, s) => Math.max(m, s.createdAt), 0);
    pages.push({ page: x.page, strokes, updatedAt: isNum(x.updatedAt) ? x.updatedAt : last });
  }
  return pages.sort((a, b) => a.page - b.page);
}

/** Kaydı dosya metnine çevir. */
export function encodeBook(b: Book): string {
  const book: Record<string, unknown> = { id: b.id, title: b.title };
  if (b.author) book.author = b.author;
  book.format = b.format;
  book.hash = b.hash;
  book.size = b.size;
  book.fileName = b.fileName;
  book.status = b.status;
  book.notePath = b.notePath;
  book.addedAt = b.addedAt;
  book.updatedAt = b.updatedAt;
  if (b.finishedAt !== undefined) book.finishedAt = b.finishedAt;
  if (b.pages !== undefined) book.pages = b.pages;
  if (b.progress !== undefined) book.progress = r5(unit(b.progress));
  if (b.position) book.position = encodePosition(b.position);
  if (b.positionSavedAt !== undefined) book.positionSavedAt = b.positionSavedAt;
  book.highlights = b.highlights.map(encodeHighlight);
  const ink = [...(b.ink ?? [])]
    .sort((x, y) => x.page - y.page)
    .map(encodeInkPage)
    .filter((p) => (p.strokes as unknown[]).length);
  if (ink.length) book.ink = ink;
  return JSON.stringify({ v: BOOK_FILE_VERSION, book }, null, 2) + "\n";
}

/** Dosya metnini kayda çevir; okunamıyorsa null. */
export function decodeBook(raw: string): Book | null {
  let file: unknown;
  try {
    file = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(file) || file.v !== BOOK_FILE_VERSION || !isObj(file.book)) return null;
  const b = file.book;

  if (typeof b.id !== "string" || !BOOK_ID_RE.test(b.id)) return null;
  if (typeof b.title !== "string" || !b.title.trim()) return null;
  if (!BOOK_FORMATS.includes(b.format as BookFormat)) return null;
  if (typeof b.hash !== "string" || !HASH_RE.test(b.hash)) return null;
  if (typeof b.notePath !== "string" || !b.notePath.endsWith(".md")) return null;

  const highlights: Highlight[] = [];
  if (b.highlights !== undefined) {
    if (!Array.isArray(b.highlights)) return null;
    for (const x of b.highlights) {
      const h = decodeHighlight(x);
      if (!h) return null; // tek bozuk çizim → dosya bozuk (sessizce silinmesin)
      highlights.push(h);
    }
  }
  const ink = decodeInk(b.ink);
  if (!ink) return null; // bozuk kalem verisi → dosya bozuk (sessizce silinmesin)
  const addedAt = isNum(b.addedAt) ? b.addedAt : 0;
  const book: Book = {
    id: b.id,
    title: b.title,
    format: b.format as BookFormat,
    hash: b.hash,
    size: isInt(b.size) ? b.size : 0,
    fileName: typeof b.fileName === "string" ? b.fileName : "",
    status: BOOK_STATUSES.includes(b.status as BookStatus) ? (b.status as BookStatus) : "toread",
    notePath: b.notePath,
    addedAt,
    updatedAt: isNum(b.updatedAt) ? b.updatedAt : addedAt,
    highlights,
  };
  if (typeof b.author === "string" && b.author.trim()) book.author = b.author;
  if (isNum(b.finishedAt)) book.finishedAt = b.finishedAt;
  if (isInt(b.pages, 1)) book.pages = b.pages;
  if (isNum(b.progress)) book.progress = unit(b.progress);
  const pos = decodePosition(b.position);
  if (pos) book.position = pos;
  if (isNum(b.positionSavedAt)) book.positionSavedAt = b.positionSavedAt;
  if (ink.length) book.ink = ink;
  return book;
}

// PDF çizim yeri ve kalınan yer için saf dönüşümler (LOM-83, K5).
//
// Çizim yeri sayfaya göre 0..1 oranında dikdörtgendir (sol üst köşe başlangıç). Sayfa ekranda
// hangi ölçekte çizilirse çizilsin oran aynı kalır; yazı boyutu (yakınlaştırma) değişince çizim
// yerinden kaymaz. DOM'a ve pdf.js'e bağlı değildir; node'da test edilir.

import type { BookPosition, PdfAnchor, PdfRect } from "./types";

/** Ekran koordinatında dikdörtgen (getBoundingClientRect / getClientRects ile aynı düzen). */
export interface ClientBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Ekrandaki bir sayfa: 1'den başlayan numara + ekrandaki kutusu. */
export interface PageBox {
  page: number;
  box: ClientBox;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
/** Kayıtta gereksiz uzun ondalık olmasın (dosya küçük, fark okunur kalsın). */
const round = (n: number) => Math.round(n * 1e5) / 1e5;

/** Ekrandaki dikdörtgeni sayfa kutusuna göre orana çevirir; sayfa dışına taşan kısım kırpılır. */
export function toPageRect(r: ClientBox, page: ClientBox): PdfRect | null {
  if (page.width <= 0 || page.height <= 0) return null;
  const x0 = clamp01((r.left - page.left) / page.width);
  const y0 = clamp01((r.top - page.top) / page.height);
  const x1 = clamp01((r.left + r.width - page.left) / page.width);
  const y1 = clamp01((r.top + r.height - page.top) / page.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) };
}

/** Orandaki dikdörtgeni verilen genişlik/yükseklikteki sayfada piksele çevirir. */
export function fromPageRect(r: PdfRect, width: number, height: number): { left: number; top: number; width: number; height: number } {
  return { left: r.x * width, top: r.y * height, width: r.w * width, height: r.h * height };
}

/**
 * Aynı satırdaki parçaları birleştirir: tarayıcı seçimi her metin parçası için ayrı dikdörtgen
 * verir (kelime kelime, üst üste binen). Dikeyde yarıdan çok örtüşen ve yatayda aralarında
 * satır yüksekliğinden az boşluk olanlar tek kutu olur. İçerilen kutular atılır.
 */
export function mergeRects(rects: PdfRect[]): PdfRect[] {
  const list = rects
    .filter((r) => r.w > 0 && r.h > 0 && Number.isFinite(r.x + r.y + r.w + r.h))
    .map((r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }))
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const r of list) {
    let merged = false;
    for (const o of out) {
      const overlap = Math.min(o.y1, r.y1) - Math.max(o.y0, r.y0);
      const minH = Math.min(o.y1 - o.y0, r.y1 - r.y0);
      if (overlap <= minH * 0.5) continue;
      const gap = Math.max(o.x0, r.x0) - Math.min(o.x1, r.x1);
      if (gap > minH) continue;
      o.x0 = Math.min(o.x0, r.x0);
      o.x1 = Math.max(o.x1, r.x1);
      o.y0 = Math.min(o.y0, r.y0);
      o.y1 = Math.max(o.y1, r.y1);
      merged = true;
      break;
    }
    if (!merged) out.push({ ...r });
  }
  return out
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    .map((r) => ({ x: round(r.x0), y: round(r.y0), w: round(r.x1 - r.x0), h: round(r.y1 - r.y0) }));
}

/**
 * Seçimin ekran dikdörtgenlerinden çizim yeri. Seçim birden çok sayfaya taşarsa en çok alanın
 * düştüğü sayfa seçilir (çizim tek sayfaya bağlıdır). Çok küçük kutular (satır sonu, boş
 * öğeler) ve satırın üç katından yüksek kutular (metin katmanının tamamını kaplayan seçim
 * artıkları) atılır. Hiç kutu kalmazsa null.
 */
export function anchorFromClientRects(rects: ClientBox[], pages: PageBox[]): PdfAnchor | null {
  const usable = rects.filter((r) => r.width >= 1 && r.height >= 1);
  if (!usable.length || !pages.length) return null;
  const heights = usable.map((r) => r.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  const lines = usable.filter((r) => r.height <= median * 3);
  const byPage = new Map<number, { rects: PdfRect[]; area: number }>();
  for (const r of lines) {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const p = pages.find(
      (pg) => cx >= pg.box.left && cx <= pg.box.left + pg.box.width && cy >= pg.box.top && cy <= pg.box.top + pg.box.height
    );
    if (!p) continue;
    const pr = toPageRect(r, p.box);
    if (!pr) continue;
    const e = byPage.get(p.page) ?? { rects: [], area: 0 };
    e.rects.push(pr);
    e.area += pr.w * pr.h;
    byPage.set(p.page, e);
  }
  let best: { page: number; rects: PdfRect[]; area: number } | null = null;
  for (const [page, e] of byPage) if (!best || e.area > best.area) best = { page, ...e };
  if (!best) return null;
  const merged = mergeRects(best.rects);
  return merged.length ? { kind: "pdf", page: best.page, rects: merged } : null;
}

/** Sayfadaki bir nokta (0..1) bu çizimin içinde mi? Küçük pay: parmakla dokunmada kaçmasın. */
export function anchorHit(a: PdfAnchor, page: number, x: number, y: number, slop = 0.004): boolean {
  if (a.page !== page) return false;
  return a.rects.some((r) => x >= r.x - slop && x <= r.x + r.w + slop && y >= r.y - slop && y <= r.y + r.h + slop);
}

/** Çizimin kapsayan kutusu (0..1). Boşsa null. */
export function anchorBounds(a: PdfAnchor): PdfRect | null {
  if (!a.rects.length) return null;
  const x0 = Math.min(...a.rects.map((r) => r.x));
  const y0 = Math.min(...a.rects.map((r) => r.y));
  const x1 = Math.max(...a.rects.map((r) => r.x + r.w));
  const y1 = Math.max(...a.rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ─── Sayfa listesi düzeni ve kalınan yer ──────────────────────────────────────────

/** Sayfaların alt alta dizildiği listede her sayfanın üst kenarı (piksel). */
export function pageOffsets(heights: number[], gap: number, padTop = 0): number[] {
  const out: number[] = [];
  let y = padTop;
  for (const h of heights) {
    out.push(y);
    y += h + gap;
  }
  return out;
}

/** Verilen dikey konumda (piksel) hangi sayfa var: 0'dan başlayan sıra. İkili arama. */
export function pageIndexAt(offsets: number[], y: number): number {
  if (!offsets.length) return 0;
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Görünen sayfa aralığı [ilk, son] (0'dan). */
export function visibleRange(offsets: number[], heights: number[], top: number, bottom: number): [number, number] {
  if (!offsets.length) return [0, -1];
  const first = pageIndexAt(offsets, top);
  let last = first;
  while (last + 1 < offsets.length && offsets[last + 1] < bottom) last++;
  // İlk sayfanın tamamı geçildiyse (aradaki boşlukta) bir sonrakinden başla.
  if (first < last && offsets[first] + heights[first] < top) return [first + 1, last];
  return [first, last];
}

/**
 * Kaydırma konumundan kalınan yer: ekranın üst kenarındaki sayfa ve o sayfanın ne kadarının
 * geçildiği (0..1). İlerleme = (sayfa-1 + oran) / sayfa sayısı.
 */
export function positionAt(offsets: number[], heights: number[], scrollTop: number): { pos: BookPosition; progress: number } {
  const n = offsets.length;
  if (!n) return { pos: { kind: "pdf", page: 1, offset: 0 }, progress: 0 };
  const i = pageIndexAt(offsets, scrollTop);
  const h = heights[i] || 1;
  const offset = round(clamp01((scrollTop - offsets[i]) / h));
  return { pos: { kind: "pdf", page: i + 1, offset }, progress: round(clamp01((i + offset) / n)) };
}

/** Kalınan yerin kaydırma karşılığı (piksel). Sayfa aralık dışındaysa sınıra çekilir. */
export function scrollTopFor(offsets: number[], heights: number[], page: number, offset: number): number {
  if (!offsets.length) return 0;
  const i = Math.max(0, Math.min(offsets.length - 1, Math.floor(page) - 1));
  return offsets[i] + clamp01(Number.isFinite(offset) ? offset : 0) * heights[i];
}

/** Seçilen metni alıntıya uygun hale getirir: satır sonu tirelerini ve fazla boşluğu toplar. */
export function cleanQuote(text: string): string {
  return text
    .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

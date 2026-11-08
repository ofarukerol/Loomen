// Kalem çizgisi hesapları — saf (DOM yok) (LOM-97).
//
// Kayıtta noktalar sayfaya göre 0..1 oranıdır; ekranda sayfanın o anki piksel boyuyla çarpılır.
// Böylece yakınlaştırma, ekran yoğunluğu ve cihaz değişse de çizgi sayfada aynı yere düşer.
// Kalınlık da sayfa genişliğine oranlıdır: küçük önizlemede ve not resminde aynı görünür.

import type { InkPoint, InkStroke } from "./types";

/** Tek sabit kalem rengi (koyu mavi). Karanlık temada ters çevrilmeyen katmanda çizilir. */
export const INK_COLOR = "#1d3f8f";
/** Çizgi kalınlığı, sayfa genişliğine oran (≈ 1,5 px / 600 px). */
export const INK_WIDTH_RATIO = 0.0025;
/** Çizgi en az bu kadar piksel kalın olur (çok küçük önizlemede kaybolmasın). */
export const INK_MIN_WIDTH_PX = 1;
/** Toplarken ardışık iki nokta arasındaki en küçük uzaklık (CSS pikseli). */
export const INK_MIN_STEP_PX = 1.5;
/** Kaydetmeden önce sadeleştirme toleransı (CSS pikseli). */
export const INK_SIMPLIFY_PX = 0.6;

export interface PixelPoint {
  x: number;
  y: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Sayfa içindeki piksel konumunu orana çevir (0..1'e kırpılır). Boyut 0 ise 0. */
export function pixelToInk(px: number, py: number, width: number, height: number): InkPoint {
  return {
    x: width > 0 && Number.isFinite(px) ? clamp01(px / width) : 0,
    y: height > 0 && Number.isFinite(py) ? clamp01(py / height) : 0,
  };
}

/** Oranı sayfanın piksel boyuna çevir. */
export function inkToPixel(p: InkPoint, width: number, height: number): PixelPoint {
  return { x: p.x * width, y: p.y * height };
}

export function inkPointsToPixels(points: readonly InkPoint[], width: number, height: number): PixelPoint[] {
  return points.map((p) => inkToPixel(p, width, height));
}

/** Sayfa genişliğine göre çizgi kalınlığı (piksel). */
export function inkLineWidth(pageWidthPx: number): number {
  return Math.max(INK_MIN_WIDTH_PX, pageWidthPx * INK_WIDTH_RATIO);
}

/**
 * Toplarken seyreltme: son kabul edilen noktaya `minStep` pikselden yakın nokta atılır.
 * Yeni nokta eklenecekse true. `last` yoksa (ilk nokta) her zaman true.
 */
export function shouldAddPoint(last: PixelPoint | undefined, next: PixelPoint, minStep = INK_MIN_STEP_PX): boolean {
  if (!last) return true;
  const dx = next.x - last.x;
  const dy = next.y - last.y;
  return dx * dx + dy * dy >= minStep * minStep;
}

/** Ardışık yakın noktaları at (ilk ve son nokta korunur). */
export function thinPoints<T extends PixelPoint>(points: readonly T[], minStep = INK_MIN_STEP_PX): T[] {
  if (points.length <= 2) return [...points];
  const out: T[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (shouldAddPoint(out[out.length - 1], points[i], minStep)) out.push(points[i]);
  }
  // Son nokta her zaman kalır; önceki kabul edilen ona çok yakınsa onun yerine geçer.
  const last = points[points.length - 1];
  if (out.length > 1 && !shouldAddPoint(out[out.length - 1], last, minStep)) out[out.length - 1] = last;
  else out.push(last);
  return out;
}

function segDist2(p: PixelPoint, a: PixelPoint, b: PixelPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx - p.x;
  const qy = a.y + t * dy - p.y;
  return qx * qx + qy * qy;
}

/**
 * Ramer–Douglas–Peucker sadeleştirmesi: çizgiden `tolerance` pikselden az sapan ara noktalar
 * atılır, uçlar korunur. Özyinelemesiz (uzun çizgide yığın taşmaz).
 */
export function simplifyPoints<T extends PixelPoint>(points: readonly T[], tolerance = INK_SIMPLIFY_PX): T[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const tol2 = tolerance * tolerance;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let best = -1;
    let bestD = tol2;
    for (let i = s + 1; i < e; i++) {
      const d = segDist2(points[i], points[s], points[e]);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Toplanan piksel noktalarını kayda hazırla: seyrelt, sadeleştir, sayfa boyuna göre orana çevir.
 * Sayfa boyu geçersizse boş dizi döner (çizgi kaydedilmez).
 */
export function strokeFromPixels(points: readonly PixelPoint[], width: number, height: number): InkPoint[] {
  if (!(width > 0) || !(height > 0)) return [];
  const finite = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  return simplifyPoints(thinPoints(finite)).map((p) => pixelToInk(p.x, p.y, width, height));
}

/** Canvas 2D bağlamının kalem için gereken parçası (testte sahtesi verilir). */
export interface InkCanvas {
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  strokeStyle: unknown;
  fillStyle: unknown;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  stroke(): void;
  fill(): void;
}

/**
 * Çizgileri sayfa boyunda çiz. Tek noktalı çizgi nokta (daire) olur. Bağlam ayarları
 * (renk, kalınlık, uç) burada verilir; çağıran temizleme ve ölçeklemeyi kendisi yapar.
 */
export function drawInkStrokes(
  ctx: InkCanvas,
  strokes: readonly InkStroke[],
  width: number,
  height: number,
  color = INK_COLOR,
): void {
  const lw = inkLineWidth(width);
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const s of strokes) drawInkPolyline(ctx, inkPointsToPixels(s.points, width, height), lw);
}

/** Tek bir piksel çizgisini çiz (canlı çizim sırasında da kullanılır). */
export function drawInkPolyline(ctx: InkCanvas, pts: readonly PixelPoint[], lineWidth: number): void {
  if (!pts.length) return;
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.arc(pts[0].x, pts[0].y, lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/** SVG `path` verisi (örn. not resmi ya da test için). Tek nokta kısa bir çizgi olur. */
export function inkSvgPath(points: readonly InkPoint[], width: number, height: number): string {
  if (!points.length) return "";
  const f = (v: number) => String(Math.round(v * 100) / 100);
  const px = inkPointsToPixels(points, width, height);
  if (px.length === 1) return `M${f(px[0].x)} ${f(px[0].y)}l0 0`;
  return px.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join("");
}

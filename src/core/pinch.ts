// İki parmakla yakınlaştırma (pinch) hesabı — saf fonksiyonlar, DOM'a dokunmaz (LOM-37).
// Graf ekranı bunları kullanır; birim testi: src/core/__test__/pinchTest.ts

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;

export interface Pt {
  x: number;
  y: number;
}
export interface Transform {
  x: number;
  y: number;
  k: number;
}

export const clampZoom = (k: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));

export const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const distance = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Pinch başlangıç görüntüsü: o anki dönüşüm + parmak aralığı + orta nokta (canvas koordinatı). */
export interface PinchStart {
  tf: Transform;
  dist: number;
  mid: Pt;
}

export function startPinch(tf: Transform, a: Pt, b: Pt): PinchStart {
  return { tf: { ...tf }, dist: distance(a, b), mid: midpoint(a, b) };
}

/**
 * Parmakların şimdiki yerine göre yeni dönüşüm. Ölçek parmak aralığıyla orantılı (min/maks
 * sınırlı); başlangıçta orta noktanın altındaki dünya noktası, orta nokta nereye kaydıysa
 * orada kalır — yani hem odaklı yakınlaştırma hem iki parmakla kaydırma.
 */
export function pinchTransform(start: PinchStart, a: Pt, b: Pt): Transform {
  const ratio = start.dist > 0 ? distance(a, b) / start.dist : 1;
  const k = clampZoom(start.tf.k * ratio);
  const wx = (start.mid.x - start.tf.x) / start.tf.k;
  const wy = (start.mid.y - start.tf.y) / start.tf.k;
  const mid = midpoint(a, b);
  return { x: mid.x - wx * k, y: mid.y - wy * k, k };
}

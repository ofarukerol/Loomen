// İki parmakla yakınlaştırma hesabının node testi (LOM-37).
import { clampZoom, distance, midpoint, pinchTransform, startPinch, ZOOM_MAX, ZOOM_MIN } from "../pinch";

let fails = 0;
let ran = 0;
function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

check("distance 3-4-5", distance({ x: 0, y: 0 }, { x: 3, y: 4 }) === 5);
check("midpoint", midpoint({ x: 0, y: 2 }, { x: 4, y: 6 }).x === 2 && midpoint({ x: 0, y: 2 }, { x: 4, y: 6 }).y === 4);
check("clampZoom sınırları", clampZoom(100) === ZOOM_MAX && clampZoom(0.001) === ZOOM_MIN && clampZoom(1) === 1);

const tf = { x: 10, y: 20, k: 1 };
const a = { x: 100, y: 100 };
const b = { x: 200, y: 100 };
const s = startPinch(tf, a, b);

// Parmaklar kıpırdamadı → dönüşüm aynı
const same = pinchTransform(s, a, b);
check("Hareketsiz pinch dönüşümü değiştirmez", near(same.x, 10) && near(same.y, 20) && near(same.k, 1));

// Aralık 2 katına çıkar, orta nokta sabit → ölçek 2, orta noktanın dünya noktası yerinde
const a2 = { x: 50, y: 100 };
const b2 = { x: 250, y: 100 };
const z = pinchTransform(s, a2, b2);
check("Aralık 2x → ölçek 2x", near(z.k, 2));
const worldBefore = { x: (150 - tf.x) / tf.k, y: (100 - tf.y) / tf.k };
check(
  "Odak (orta nokta) yerinde kalır",
  near(z.x + worldBefore.x * z.k, 150) && near(z.y + worldBefore.y * z.k, 100),
);

// Aralık yarıya iner → ölçek yarı
check("Aralık 0.5x → ölçek 0.5x", near(pinchTransform(s, { x: 125, y: 100 }, { x: 175, y: 100 }).k, 0.5));

// Sınırlar
check("Maks zoom korunur", pinchTransform(s, { x: -5000, y: 100 }, { x: 5000, y: 100 }).k === ZOOM_MAX);
check("Min zoom korunur", pinchTransform(s, { x: 149.9, y: 100 }, { x: 150.1, y: 100 }).k === ZOOM_MIN);

// Saf kaydırma: aralık aynı, orta nokta (+30,+40) → x,y aynı kadar kayar
const p = pinchTransform(s, { x: 130, y: 140 }, { x: 230, y: 140 });
check("İki parmakla kaydırma", near(p.k, 1) && near(p.x, 40) && near(p.y, 60));

// Sınırda kaydırma+zoom hâlâ orta noktayı izler (k sınırlandığında bile)
const m = pinchTransform(s, { x: -5000, y: 100 }, { x: 5000, y: 100 });
check("Sınırda da orta nokta tutarlı", near(m.x + worldBefore.x * m.k, 0) && near(m.y + worldBefore.y * m.k, 100));

// Sıfır başlangıç aralığı (aynı nokta) NaN üretmez
const z0 = pinchTransform(startPinch(tf, a, a), a, b);
check("Sıfır başlangıç aralığı güvenli", Number.isFinite(z0.x) && Number.isFinite(z0.k) && z0.k === 1);

console.log(`\n${ran - fails}/${ran} geçti`);
process.exit(fails === 0 ? 0 : 1);

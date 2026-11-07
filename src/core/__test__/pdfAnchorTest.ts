// PDF çizim yeri dönüşümlerinin testi (LOM-83, K5).
import {
  anchorBounds,
  anchorFromClientRects,
  anchorHit,
  cleanQuote,
  fromPageRect,
  mergeRects,
  pageIndexAt,
  pageOffsets,
  positionAt,
  scrollTopFor,
  toPageRect,
  visibleRange,
} from "../library/pdfAnchor";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) < eps;

// ─── Orana çevirme ────────────────────────────────────────────────────────────────
const page = { left: 100, top: 50, width: 400, height: 800 };
const r = toPageRect({ left: 140, top: 130, width: 200, height: 16 }, page)!;
check("oran", near(r.x, 0.1) && near(r.y, 0.1) && near(r.w, 0.5) && near(r.h, 0.02), JSON.stringify(r));
check("taşan kırpılır", near(toPageRect({ left: 50, top: 40, width: 100, height: 20 }, page)!.x, 0));
check("tamamen dışarıda null", toPageRect({ left: 0, top: 0, width: 50, height: 20 }, page) === null);
check("boş sayfa null", toPageRect({ left: 0, top: 0, width: 5, height: 5 }, { left: 0, top: 0, width: 0, height: 0 }) === null);

// K5: ölçek değişince aynı yer — iki farklı ölçekte aynı metin kutusu aynı oranı verir.
const big = { left: 0, top: 0, width: 800, height: 1600 };
const r2 = toPageRect({ left: 80, top: 160, width: 400, height: 32 }, big)!;
check("ölçekten bağımsız (K5)", JSON.stringify(r2) === JSON.stringify(r), JSON.stringify(r2));
const px = fromPageRect(r, 800, 1600);
check("geri çevirme", near(px.left, 80) && near(px.top, 160) && near(px.width, 400) && near(px.height, 32));

// ─── Birleştirme ──────────────────────────────────────────────────────────────────
const words = [
  { x: 0.1, y: 0.1, w: 0.1, h: 0.02 },
  { x: 0.205, y: 0.1005, w: 0.1, h: 0.019 },
  { x: 0.15, y: 0.1, w: 0.05, h: 0.02 }, // içerilen
  { x: 0.1, y: 0.13, w: 0.3, h: 0.02 }, // alt satır
];
const m = mergeRects(words);
check("aynı satır tek kutu, alt satır ayrı", m.length === 2, JSON.stringify(m));
check("birleşen kutu uçları", near(m[0].x, 0.1) && near(m[0].x + m[0].w, 0.305) && near(m[0].y, 0.1));
check("uzak kutular birleşmez", mergeRects([{ x: 0.05, y: 0.1, w: 0.05, h: 0.02 }, { x: 0.6, y: 0.1, w: 0.05, h: 0.02 }]).length === 2);
check("bozuk kutu atılır", mergeRects([{ x: NaN, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 0, h: 1 }]).length === 0);

// ─── Seçimden çizim yeri ──────────────────────────────────────────────────────────
const pages = [
  { page: 1, box: { left: 0, top: 0, width: 400, height: 800 } },
  { page: 2, box: { left: 0, top: 816, width: 400, height: 800 } },
];
const a = anchorFromClientRects(
  [
    { left: 40, top: 80, width: 100, height: 16 },
    { left: 142, top: 80, width: 80, height: 16 },
    { left: 0, top: 0, width: 0, height: 16 }, // satır sonu
    { left: 0, top: 0, width: 400, height: 790 }, // katman artığı
  ],
  pages
);
check("tek sayfa çizimi", a?.page === 1 && a.rects.length === 1, JSON.stringify(a));
const cross = anchorFromClientRects(
  [
    { left: 40, top: 780, width: 50, height: 16 },
    { left: 40, top: 830, width: 300, height: 16 },
    { left: 40, top: 850, width: 300, height: 16 },
  ],
  pages
);
check("iki sayfaya taşan: çok alanlı sayfa", cross?.page === 2 && cross.rects.length === 2, JSON.stringify(cross));
check("sayfa dışı seçim null", anchorFromClientRects([{ left: 500, top: 10, width: 50, height: 16 }], pages) === null);
check("boş null", anchorFromClientRects([], pages) === null);

check("dokunma isabeti", !!a && anchorHit(a, 1, 0.2, 0.11));
check("başka sayfa isabet değil", !!a && !anchorHit(a, 2, 0.2, 0.11));
check("dışı isabet değil", !!a && !anchorHit(a, 1, 0.9, 0.5));
const b = anchorBounds({ kind: "pdf", page: 1, rects: words })!;
check("kapsayan kutu", near(b.x, 0.1) && near(b.y, 0.1) && near(b.x + b.w, 0.4) && near(b.y + b.h, 0.15));
check("boş kapsayan null", anchorBounds({ kind: "pdf", page: 1, rects: [] }) === null);

// ─── Düzen ve kalınan yer ─────────────────────────────────────────────────────────
const heights = [800, 800, 600, 800];
const offs = pageOffsets(heights, 16, 8);
check("sayfa üst kenarları", JSON.stringify(offs) === JSON.stringify([8, 824, 1640, 2256]));
check("konumdaki sayfa", pageIndexAt(offs, 0) === 0 && pageIndexAt(offs, 900) === 1 && pageIndexAt(offs, 99999) === 3);
check("görünen aralık", JSON.stringify(visibleRange(offs, heights, 700, 1700)) === JSON.stringify([0, 2]));
check("aradaki boşlukta başlayan aralık", JSON.stringify(visibleRange(offs, heights, 810, 900)) === JSON.stringify([1, 1]));
check("boş liste aralığı", JSON.stringify(visibleRange([], [], 0, 10)) === JSON.stringify([0, -1]));

const at = positionAt(offs, heights, 824 + 400);
check("kalınan yer", at.pos.kind === "pdf" && at.pos.page === 2 && near(at.pos.offset, 0.5), JSON.stringify(at));
check("ilerleme", near(at.progress, 1.5 / 4));
check("baştaki boşluk sayfa 1", positionAt(offs, heights, 0).pos.kind === "pdf" && (positionAt(offs, heights, 0).pos as { page: number }).page === 1);
check("kalınan yere dönüş", near(scrollTopFor(offs, heights, 2, 0.5), 1224));
check("yaz-çöz turu", near(scrollTopFor(offs, heights, at.pos.page as number, (at.pos as { offset: number }).offset), 1224));
check("taşan sayfa sınıra çekilir", scrollTopFor(offs, heights, 99, 0) === 2256 && scrollTopFor(offs, heights, 0, 0) === 8);
check("bozuk oran 0", scrollTopFor(offs, heights, 1, NaN) === 8);

// K5: farklı ölçekteki düzende aynı kalınan yer aynı orana denk gelir.
const offs2 = pageOffsets(heights.map((h) => h * 1.5), 16, 8);
const t2 = scrollTopFor(offs2, heights.map((h) => h * 1.5), 2, 0.5);
const back = positionAt(offs2, heights.map((h) => h * 1.5), t2);
check("ölçek değişince kalınan yer aynı", back.pos.kind === "pdf" && back.pos.page === 2 && near(back.pos.offset, 0.5));

// ─── Alıntı metni ─────────────────────────────────────────────────────────────────
check("tire birleşir", cleanQuote("öğren-\n  mek ve\n\tyaşamak ") === "öğrenmek ve yaşamak");
check("büyük harf öncesi tire kalır", cleanQuote("Kuzey-\nAnadolu") === "Kuzey- Anadolu");

if (fails) {
  console.log(`\n${fails} test başarısız`);
  process.exit(1);
}
console.log("\npdfAnchor testleri geçti");

// Kalem notu çekirdeği testi (LOM-97): oran/piksel dönüşümü, seyreltme, model işlemleri, çizim.
import {
  INK_COLOR,
  INK_MAX_POINTS,
  addInkStroke,
  clearInkPage,
  decodeBook,
  decodeInk,
  decodeInkPoints,
  drawInkStrokes,
  encodeBook,
  encodeInkPoints,
  inkForPage,
  inkLineWidth,
  inkPages,
  inkSvgPath,
  inkToPixel,
  newBook,
  newInkStrokeId,
  pixelToInk,
  restoreInkPage,
  shouldAddPoint,
  simplifyPoints,
  strokeFromPixels,
  thinPoints,
  undoInkStroke,
  type Book,
  type InkCanvas,
} from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const NOW = Date.UTC(2026, 10, 8, 9);
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// ─── Oran ↔ piksel ───
{
  const p = pixelToInk(150, 300, 600, 800);
  check("piksel → oran", p.x === 0.25 && p.y === 0.375);
  const q = inkToPixel(p, 1200, 1600);
  check("oran → piksel (yakınlaştırmadan bağımsız)", q.x === 300 && q.y === 600);
  const out = pixelToInk(-10, 900, 600, 800);
  check("sayfa dışı nokta kırpılır", out.x === 0 && out.y === 1);
  const zero = pixelToInk(10, 10, 0, 0);
  check("boyut 0 → 0", zero.x === 0 && zero.y === 0);
  check("kalınlık sayfa genişliğine oranlı", near(inkLineWidth(800), 2) && inkLineWidth(100) === 1);
}

// ─── Seyreltme ve sadeleştirme ───
{
  check("ilk nokta her zaman eklenir", shouldAddPoint(undefined, { x: 0, y: 0 }));
  check("çok yakın nokta eklenmez", !shouldAddPoint({ x: 0, y: 0 }, { x: 1, y: 0 }, 1.5));
  check("uzak nokta eklenir", shouldAddPoint({ x: 0, y: 0 }, { x: 2, y: 0 }, 1.5));
  const dense = Array.from({ length: 11 }, (_, i) => ({ x: i * 0.5, y: 0 }));
  const thin = thinPoints(dense, 1.5);
  check("seyreltmede uçlar korunur", thin[0].x === 0 && thin[thin.length - 1].x === 5);
  check("seyreltme nokta azaltır", thin.length < dense.length && thin.length >= 2);
  check("seyreltmede ardışık uzaklık", thin.slice(1, -1).every((p, i) => Math.hypot(p.x - thin[i].x, p.y - thin[i].y) >= 1.5));
  check("iki nokta aynen kalır", thinPoints([{ x: 0, y: 0 }, { x: 0.1, y: 0 }]).length === 2);

  const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i * 0.5 + (i % 2 ? 0.1 : 0) }));
  const s = simplifyPoints(line, 0.6);
  check("düz çizgi iki noktaya iner", s.length === 2 && s[0] === line[0] && s[1] === line[49]);
  const corner = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 }];
  const c = simplifyPoints(corner, 0.6);
  check("köşe korunur", c.length === 3 && c[1].x === 10 && c[1].y === 0);
  const long = Array.from({ length: 50000 }, (_, i) => ({ x: i, y: Math.sin(i / 10) * 50 }));
  check("uzun çizgide yığın taşmaz", simplifyPoints(long).length > 2);

  const st = strokeFromPixels([{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 300, y: 400 }, { x: NaN, y: 1 }], 600, 800);
  check("kayda hazır çizgi orandır", st.length === 2 && st[1].x === 0.5 && st[1].y === 0.5);
  check("geçersiz sayfa boyunda boş çizgi", strokeFromPixels([{ x: 1, y: 1 }], 0, 800).length === 0);
}

// ─── Nokta metni ───
{
  const pts = [{ x: 0.123456789, y: 1 }, { x: 0, y: 0.5 }];
  const t = encodeInkPoints(pts);
  check("nokta metni", t === "0.12346,1 0,0.5");
  const back = decodeInkPoints(t);
  check("nokta metni geri okunur", !!back && back[0].x === 0.12346 && back[1].y === 0.5);
  check("çok küçük değer üslü yazılırsa okunur", decodeInkPoints("1e-5,0")?.[0].x === 1e-5);
  check("boş metin null", decodeInkPoints("") === null && decodeInkPoints("  ") === null);
  check("sayı olmayan null", decodeInkPoints("a,b") === null && decodeInkPoints("1,") === null && decodeInkPoints("1,2,3") === null);
  check("metin olmayan null", decodeInkPoints([0.1, 0.2]) === null);
  check("ink alanı yoksa boş", decodeInk(undefined)?.length === 0);
  check("boş sayfa atlanır", decodeInk([{ page: 3, strokes: [] }])?.length === 0);
  check("sayfada tekrar eden kimlik null", decodeInk([{ page: 1, strokes: [{ id: "a", points: "0,0" }, { id: "a", points: "1,1" }] }]) === null);
}

// ─── Model ───
const book = newBook({ hash: "a".repeat(64), size: 10, fileName: "Kitap.pdf", format: "pdf", notePath: "Kütüphane/Kitap.md" }, NOW);
{
  check("çizgisiz sayfa boş", inkForPage(book, 1).length === 0 && inkPages(book).length === 0);
  const a = addInkStroke(book, 3, [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }], NOW + 1, "s1");
  check("çizgi eklenir", inkForPage(a.book, 3).length === 1 && a.stroke.id === "s1" && a.book.updatedAt === NOW + 1);
  check("asıl kitap değişmez", book.ink === undefined);
  const b = addInkStroke(a.book, 3, [{ x: 0.5, y: 0.5 }], NOW + 2, "s2");
  const c = addInkStroke(b.book, 1, [{ x: 2, y: -1 }, { x: NaN, y: 0 }], NOW + 3, "s3");
  check("sayfalar sıralı", inkPages(c.book).join(",") === "1,3");
  check("çizim sırası korunur", inkForPage(c.book, 3).map((s) => s.id).join(",") === "s1,s2");
  const p1 = inkForPage(c.book, 1)[0].points;
  check("noktalar kırpılır, geçersiz atılır", p1.length === 1 && p1[0].x === 1 && p1[0].y === 0);
  check("sayfa zamanı güncellenir", c.book.ink?.find((p) => p.page === 3)?.updatedAt === NOW + 2);

  check("EPUB kitapta kalem hata", throws(() => addInkStroke({ ...book, format: "epub" }, 1, [{ x: 0, y: 0 }], NOW, "e1")));
  check("geçersiz sayfa hata", throws(() => addInkStroke(book, 0, [{ x: 0, y: 0 }], NOW, "z1")) && throws(() => addInkStroke(book, 1.5, [{ x: 0, y: 0 }], NOW, "z1")));
  check("boş çizgi hata", throws(() => addInkStroke(book, 1, [], NOW, "z1")) && throws(() => addInkStroke(book, 1, [{ x: NaN, y: 0 }], NOW, "z1")));
  check("tekrar eden kimlik hata", throws(() => addInkStroke(c.book, 1, [{ x: 0, y: 0 }], NOW, "s1")));
  check("geçersiz kimlik hata", throws(() => addInkStroke(book, 1, [{ x: 0, y: 0 }], NOW, "a/b")));

  const many = Array.from({ length: INK_MAX_POINTS * 2 + 7 }, (_, i) => ({ x: i / (INK_MAX_POINTS * 3), y: 0.5 }));
  const m = addInkStroke(book, 2, many, NOW, "m1").stroke;
  check("çok uzun çizgi seyreltilir, uçlar kalır", m.points.length === INK_MAX_POINTS && m.points[0].x === many[0].x);
  check("seyreltilen çizginin sonu korunur", m.points[m.points.length - 1].x === many[many.length - 1].x);

  // Geri al
  const u1 = undoInkStroke(c.book, 3, NOW + 4);
  check("geri al son çizgiyi kaldırır", inkForPage(u1, 3).map((s) => s.id).join(",") === "s1" && inkForPage(u1, 1).length === 1);
  const u2 = undoInkStroke(u1, 3, NOW + 5);
  check("son çizgi gidince sayfa silinir", inkPages(u2).join(",") === "1");
  check("çizgisiz sayfada geri al aynı kitap", undoInkStroke(u2, 3, NOW + 6) === u2);
  const u3 = undoInkStroke(u2, 1, NOW + 7);
  check("hiç çizgi kalmayınca ink alanı silinir", u3.ink === undefined && encodeBook(u3) === encodeBook({ ...book, updatedAt: NOW + 7 }));

  // Sayfayı temizle
  const cl = clearInkPage(c.book, 3, NOW + 8);
  check("temizle sayfadaki bütün çizgileri kaldırır", inkForPage(cl, 3).length === 0 && inkForPage(cl, 1).length === 1 && cl.updatedAt === NOW + 8);
  check("boş sayfayı temizle aynı kitap", clearInkPage(cl, 3, NOW + 9) === cl);

  // Temizlemeyi geri al
  const removed = inkForPage(c.book, 3);
  const back = restoreInkPage(cl, 3, removed, NOW + 10);
  check(
    "temizlemeyi geri al çizgileri aynı sırayla geri koyar",
    JSON.stringify(inkForPage(back, 3)) === JSON.stringify(removed) && back.updatedAt === NOW + 10,
  );
  check("geri koyulacak çizgi zaten varsa aynı kitap", restoreInkPage(back, 3, removed, NOW + 11) === back);
  const drawn = addInkStroke(cl, 3, [{ x: 0.9, y: 0.9 }], NOW + 12, "yeni01").book;
  const merged = restoreInkPage(drawn, 3, removed, NOW + 13);
  check(
    "arada çizilen çizgi korunur, geri gelenler önüne girer",
    inkForPage(merged, 3).map((x) => x.id).join() === [...removed.map((x) => x.id), "yeni01"].join(),
  );
  check("boş liste aynı kitap", restoreInkPage(cl, 3, [], NOW + 14) === cl);

  // Kimlik
  let n = 0;
  const seq = [0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  const rand = () => seq[n++ % seq.length];
  const taken = addInkStroke(book, 1, [{ x: 0, y: 0 }], NOW, "aaaaaa").book;
  const id = newInkStrokeId(taken, rand);
  check("yeni kimlik çakışmaz", id !== "aaaaaa" && /^[a-z0-9]{6}$/.test(id));

  // Kayıt turu: başka cihazda aynı yer
  const round = decodeBook(encodeBook(c.book));
  check("kayıt turunda çizgiler aynı sayfa ve yerde", !!round && JSON.stringify(round.ink) === JSON.stringify(c.book.ink));
}

// ─── Çizim ───
{
  const calls: string[] = [];
  const ctx: InkCanvas = {
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    strokeStyle: "",
    fillStyle: "",
    beginPath: () => calls.push("begin"),
    moveTo: (x, y) => calls.push(`M${x},${y}`),
    lineTo: (x, y) => calls.push(`L${x},${y}`),
    arc: (x, y, r) => calls.push(`A${x},${y},${r}`),
    stroke: () => calls.push("stroke"),
    fill: () => calls.push("fill"),
  };
  const strokes: Book["ink"] = [
    {
      page: 1,
      updatedAt: 0,
      strokes: [
        { id: "a", createdAt: 0, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.25 }] },
        { id: "b", createdAt: 0, points: [{ x: 1, y: 1 }] },
      ],
    },
  ];
  drawInkStrokes(ctx, strokes[0].strokes, 400, 800);
  check("çizgi piksele çizilir", calls.join(" ") === "begin M0,0 L200,200 stroke begin A400,800,0.5 fill", calls.join(" "));
  check("kalem ayarları", ctx.strokeStyle === INK_COLOR && ctx.lineCap === "round" && ctx.lineWidth === 1);
  check("SVG yolu", inkSvgPath([{ x: 0, y: 0 }, { x: 0.5, y: 0.25 }], 400, 800) === "M0 0L200 200");
  check("tek nokta SVG yolu", inkSvgPath([{ x: 0.5, y: 0.5 }], 10, 10) === "M5 5l0 0" && inkSvgPath([], 1, 1) === "");
}

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nKalem çekirdeği: tüm kontroller geçti");

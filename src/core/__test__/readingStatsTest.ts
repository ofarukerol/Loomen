// Okuma istatistiği çekirdeğinin node testi (LOM-87) — `npm test`.
process.env.TZ = "Europe/Berlin";

import { normalizeReadingLog, settleNewUnit } from "../habit";
import {
  IDLE_MS,
  PRUNE_DAYS,
  activeSeconds,
  clockFinish,
  clockStep,
  emptyStats,
  normalizeStats,
  pruneStats,
  statsAdd,
  summarizeStats,
  type ReadClock,
  type ReadingStats,
} from "../library/stats";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const T = "2026-11-08";

// ——— settleNewUnit: alışkanlıktan bağımsız "yeni sayfa" kararı ———
{
  let log = normalizeReadingLog(undefined, T);
  const a = settleNewUnit(log, T, { bookId: "b1", unit: 4 });
  check("ilk görülen birim yeni", a.fresh?.unit === 4 && a.fresh.bookId === "b1");
  log = a.log;
  const b = settleNewUnit(log, T, { bookId: "b1", unit: 4 });
  check("aynı gün aynı birim yeniden sayılmaz", b.fresh === null && b.log === log);
  const c = settleNewUnit(log, T, null);
  check("oturan birim yoksa kütük aynen", c.fresh === null && c.log === log);
  const d = settleNewUnit(log, "2026-11-09", { bookId: "b1", unit: 4 });
  check("ertesi gün aynı birim yine yeni", d.fresh !== null && d.log.day === "2026-11-09");
  const e = settleNewUnit(log, "2026-11-09", null);
  check("gün dönünce boş kütük", e.log.day === "2026-11-09" && Object.keys(e.log.seen).length === 0);
}

// ——— statsAdd / normalizeStats ———
{
  let s = emptyStats();
  s = statsAdd(s, T, "b1", { pages: 1 });
  s = statsAdd(s, T, "b1", { pages: 1, seconds: 30 });
  s = statsAdd(s, T, "b2", { seconds: 60 });
  check("sayfa ve süre birikir", s.days[T].b1[0] === 2 && s.days[T].b1[1] === 30 && s.days[T].b2[1] === 60);
  const same = statsAdd(s, T, "b1", { pages: 0, seconds: 0 });
  check("sıfır ekleme aynı nesne", same === s);
  check("geçersiz gün aynı nesne", statsAdd(s, "2026-02-30", "b1", { pages: 1 }) === s);
  check("geçersiz kimlik aynı nesne", statsAdd(s, T, "a/b", { pages: 1 }) === s);
  check("eksi ve NaN sayılmaz", statsAdd(s, T, "b1", { pages: -3, seconds: NaN }) === s);
  const capped = statsAdd(emptyStats(), T, "b1", { seconds: 999_999 });
  check("günlük süre sınırı", capped.days[T].b1[1] === 86_400);

  const round = normalizeStats(JSON.parse(JSON.stringify(s)));
  check("kayıt gidiş-dönüş", JSON.stringify(round) === JSON.stringify(s));
  check("bozuk kayıt boş", Object.keys(normalizeStats("x").days).length === 0 && normalizeStats(null).v === 1);
  const dirty = normalizeStats({
    v: 1,
    days: {
      [T]: { b1: [3.7, 12], "bad id": [1, 1], b2: [0, 0], b3: "x", b4: [-1, 5] },
      "2026-13-01": { b1: [1, 1] },
      "2026-11-07": { b1: [0, 0] },
    },
  });
  check(
    "bozuk satırlar ayıklanır",
    JSON.stringify(dirty.days) === JSON.stringify({ [T]: { b1: [3, 12], b4: [0, 5] } }),
    JSON.stringify(dirty.days),
  );
}

// ——— pruneStats ———
{
  let s: ReadingStats = emptyStats();
  s = statsAdd(s, "2025-01-01", "b1", { pages: 5 });
  s = statsAdd(s, "2026-01-01", "b1", { pages: 5 });
  s = statsAdd(s, T, "b1", { pages: 5 });
  const p = pruneStats(s, T);
  check("eski gün budanır", !p.days["2025-01-01"] && !!p.days["2026-01-01"] && !!p.days[T], `PRUNE_DAYS=${PRUNE_DAYS}`);
  check("değişiklik yoksa aynı nesne", pruneStats(p, T) === p);
}

// ——— aktif süre ———
{
  check("kısa aralık tam sayılır", activeSeconds(0, 0, 30_000) === 30);
  check("boşta kalınca en çok IDLE sayılır", activeSeconds(0, 0, 600_000) === IDLE_MS / 1000);
  check("son etkinlikten sonra IDLE", activeSeconds(0, 100_000, 400_000) === (100_000 + IDLE_MS) / 1000);
  check("saat geri giderse 0", activeSeconds(10_000, 10_000, 5_000) === 0);

  let c: ReadClock | null = null;
  let total = 0;
  const step = (bookId: string, now: number) => {
    const r = clockStep(c, bookId, now);
    c = r.next;
    if (r.credit) total += r.credit.seconds;
    return r.credit;
  };
  step("b1", 0);
  check("ilk etkinlik süre yazmaz", total === 0);
  step("b1", 1_500);
  step("b1", 2_700); // 2.7 s: 2 tam saniye yazılır, kesir saatte kalır
  check("tam saniyeler yazılır", total === 2, `toplam=${total}`);
  step("b1", 10_000);
  check("kesir kaybolmaz", total === 10, `toplam=${total}`);
  // 5 dakika boşta, sonra yeni etkinlik: en çok IDLE sayılır, sayaç baştan başlar
  step("b1", 10_000 + 300_000);
  check("boşta kalma IDLE ile sınırlı", total === 10 + IDLE_MS / 1000, `toplam=${total}`);
  const before = total;
  const cr = step("b2", 10_000 + 300_000 + 20_000);
  check("kitap değişince eski kitaba yazılır", cr?.bookId === "b1" && total === before + 20, `toplam=${total}`);
  const fin = clockFinish(c, 10_000 + 300_000 + 20_000 + 45_000);
  check("kapanınca kalan süre yazılır", fin?.bookId === "b2" && fin.seconds === 45);
  check("saat yoksa kapanış boş", clockFinish(null, 1) === null);
}

// ——— özet ———
{
  let s = emptyStats();
  s = statsAdd(s, T, "b1", { pages: 10, seconds: 600 });
  s = statsAdd(s, T, "b2", { pages: 2, seconds: 60 });
  s = statsAdd(s, "2026-11-05", "b1", { pages: 5, seconds: 300 });
  s = statsAdd(s, "2026-11-01", "b3", { pages: 7, seconds: 700 }); // 7 günün dışında
  const ms = (d: string) => new Date(`${d}T12:00:00`).getTime();
  const books = [
    { id: "b1", status: "done" as const, finishedAt: ms("2026-11-06") },
    { id: "b3", status: "done" as const, finishedAt: ms("2026-10-01") },
    { id: "b2", status: "reading" as const },
  ];
  const sum = summarizeStats(s, books, T);
  check("bugün", sum.today.pages === 12 && sum.today.seconds === 660);
  check("bu hafta (son 7 gün)", sum.week.pages === 17 && sum.week.seconds === 960);
  check("toplam", sum.total.pages === 24 && sum.total.seconds === 1660);
  check("son 7 gün sırası", sum.last7.length === 7 && sum.last7[0].day === "2026-11-02" && sum.last7[6].day === T);
  check("okumasız gün sıfır", sum.last7[1].pages === 0 && sum.last7[3].pages === 5);
  check("okuma yapılan gün", sum.activeDays === 3);
  check("biten kitap", sum.finishedBooks === 2 && sum.finishedThisWeek === 1);
  check("en çok okunan", sum.topBooks[0].bookId === "b1" && sum.topBooks[0].seconds === 900 && sum.topBooks.length === 2);
  check("dolu özet boş değil", !sum.empty);
  const none = summarizeStats(emptyStats(), [], T);
  check("hiç okuma yoksa boş", none.empty && none.week.pages === 0 && none.last7.length === 7 && none.finishedBooks === 0);
}

// ——— sınırlar ve inceleme bulguları ———
{
  const log = normalizeReadingLog(undefined, T);
  check("geçersiz kimlik yeni sayılmaz", settleNewUnit(log, T, { bookId: "a/b", unit: 1 }).fresh === null);
  check("kesirli/eksi birim yeni sayılmaz",
    settleNewUnit(log, T, { bookId: "b1", unit: 1.5 }).fresh === null && settleNewUnit(log, T, { bookId: "b1", unit: -1 }).fresh === null);

  // Aynı sayfa iki kez oturursa istatistiğe bir kez yazılır.
  let l = log;
  let s = emptyStats();
  for (const unit of [3, 3, 4, 3]) {
    const r = settleNewUnit(l, T, { bookId: "b1", unit });
    l = r.log;
    if (r.fresh) s = statsAdd(s, T, r.fresh.bookId, { pages: 1 });
  }
  check("aynı sayfa istatistikte bir kez", s.days[T].b1[0] === 2);

  const proto = normalizeStats({ days: { [T]: { __proto__: [1, 1], b1: [1, 1] } } });
  check("__proto__ kimliği alınmaz", Object.keys(proto.days[T]).join() === "b1");
  check("__proto__ eklenmez", statsAdd(emptyStats(), T, "__proto__", { pages: 1 }).days[T] === undefined);

  let b = emptyStats();
  b = statsAdd(b, "2025-10-04", "b1", { pages: 1 }); // T - 400 → budanır
  b = statsAdd(b, "2025-10-05", "b1", { pages: 1 }); // T - 399 → kalır
  const pb = pruneStats(b, T);
  check("budama sınırı", !pb.days["2025-10-04"] && !!pb.days["2025-10-05"]);

  const at = (d: string, hm: string) => new Date(`${d}T${hm}:00`).getTime();
  const sum = summarizeStats(emptyStats(), [
    { id: "x1", status: "done", finishedAt: at("2026-11-02", "00:01") }, // T-6, hafta içi
    { id: "x2", status: "done", finishedAt: at("2026-11-01", "23:59") }, // T-7, dışarıda
    { id: "x3", status: "done" },
    { id: "x4", status: "done", finishedAt: NaN },
  ], T);
  check("bitiş haftası gece yarısı sınırı", sum.finishedBooks === 4 && sum.finishedThisWeek === 1);
  check("geçersiz bugün hata atmaz", summarizeStats(emptyStats(), [], "bozuk").last7.length === 7);

  // Tam IDLE boşluk: saat sürer, aradaki süre sayılır.
  const r1 = clockStep({ bookId: "b1", from: 0, last: 0 }, "b1", IDLE_MS);
  check("tam IDLE sınırında sayılır", r1.credit?.seconds === IDLE_MS / 1000 && r1.next.from === IDLE_MS);
}

if (fails) {
  console.error(`\n${fails} test başarısız`);
  process.exit(1);
}
console.log("\nOkuma istatistiği testleri geçti");

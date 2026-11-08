// Okuma alışkanlığı sayımının node testi (LOM-93) — `npm test`.
process.env.TZ = "Europe/Berlin";

import {
  EPUB_PAGE_BYTES,
  READ_DWELL_MS,
  applyReading,
  dwellFinish,
  dwellStep,
  logAdd,
  normalizeReadingLog,
  pageUnit,
  type Dwell,
  type Habit,
} from "../habit";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const T = "2026-10-10";
const base = (o: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Okuma",
  emoji: "📖",
  color: "teal",
  days: 21,
  start: "2026-10-01",
  round: 1,
  lineageId: "h1",
  status: "active",
  done: [],
  excused: [],
  half: [],
  createdAt: 1,
  ...o,
});

// ---------------------------------------------------------------- birim

check("PDF: sayfa numarası", pageUnit({ kind: "pdf", page: 7, offset: 0.4 }, 0.1) === 7);
check("PDF: bozuk sayfa null", pageUnit({ kind: "pdf", page: 0, offset: 0 }, 0) === null);
const epub = { kind: "epub" as const, spine: 2, href: "c2.xhtml", offset: 0 };
check("EPUB: bölüm boyu yoksa null", pageUnit(epub, 0.5) === null && pageUnit(epub, 0.5, 0) === null);
// 20 000 bayt → 10 sanal sayfa
check("EPUB: ilerleme × sanal sayfa", pageUnit(epub, 0.35, 10 * EPUB_PAGE_BYTES) === 3);
check("EPUB: baş 0", pageUnit(epub, 0, 10 * EPUB_PAGE_BYTES) === 0);
check("EPUB: son sayfa taşmıyor", pageUnit(epub, 1, 10 * EPUB_PAGE_BYTES) === 9);
check("EPUB: küçük kitap tek sayfa", pageUnit(epub, 0.9, 500) === 0);
check("Kindle: null", pageUnit({ kind: "kindle", location: 120 }, 0.5) === null);

// ---------------------------------------------------------------- bekleme (3 sn)

let d: Dwell | null = null;
let r = dwellStep(d, "b1", 1, 0);
check("ilk birim beklemeye giriyor, oturan yok", r.settled === null && r.next?.unit === 1);
d = r.next;
r = dwellStep(d, "b1", 1, 2000);
check("aynı birim beklemeyi sıfırlamıyor", r.next === d && r.settled === null);
r = dwellStep(d, "b1", 2, READ_DWELL_MS - 1);
check("3 sn dolmadan geçilen sayfa sayılmıyor", r.settled === null && r.next?.unit === 2 && r.next.since === READ_DWELL_MS - 1);
d = r.next;
r = dwellStep(d, "b1", 3, READ_DWELL_MS - 1 + READ_DWELL_MS);
check("3 sn kalan sayfa oturuyor", r.settled?.unit === 2 && r.settled.bookId === "b1");
d = r.next;
r = dwellStep(d, "b2", 3, 100_000);
check("kitap değişince yeni bekleme başlıyor", r.next?.bookId === "b2" && r.settled?.bookId === "b1" && r.settled.unit === 3);
d = r.next;
r = dwellStep(d, "b2", null, 100_500);
check("birimsiz konum beklemeyi bitiriyor", r.next === null && r.settled === null);
check("dwellFinish: yeterli bekleme oturuyor", dwellFinish({ bookId: "b", unit: 4, since: 0 }, READ_DWELL_MS)?.unit === 4);
check("dwellFinish: kısa bekleme sayılmıyor", dwellFinish({ bookId: "b", unit: 4, since: 0 }, READ_DWELL_MS - 1) === null);
check("dwellFinish: boş", dwellFinish(null, 10) === null);

// ---------------------------------------------------------------- kütük

let log = normalizeReadingLog(undefined, T);
let a = logAdd(log, T, "b1", 5);
check("yeni sayfa ekleniyor", a.added && a.log.seen.b1.join() === "5");
log = a.log;
a = logAdd(log, T, "b1", 5);
check("aynı sayfa aynı gün ikinci kez sayılmıyor", !a.added && a.log === log);
a = logAdd(log, T, "b2", 5);
check("başka kitabın aynı sayfası sayılıyor", a.added);
a = logAdd(log, "2026-10-11", "b1", 5);
check("gün değişince kütük sıfırlanıyor", a.added && a.log.day === "2026-10-11" && a.log.seen.b1.join() === "5" && Object.keys(a.log.seen).length === 1);

check("başka günün kaydı boşalıyor", Object.keys(normalizeReadingLog({ day: "2026-10-09", seen: { b1: [1] } }, T).seen).length === 0);
const norm = normalizeReadingLog({ day: T, seen: { b1: [3, 1, 3, -1, 2.5, "x"], "../x": [1], b2: "x", b3: [] } }, T);
check("bozuk kütük temizleniyor", JSON.stringify(norm) === JSON.stringify({ day: T, seen: { b1: [1, 3] } }), JSON.stringify(norm));
check("kütük nesne değilse boş", normalizeReadingLog([1, 2], T).day === T && Object.keys(normalizeReadingLog("x", T).seen).length === 0);

// ---------------------------------------------------------------- turlara uygulama

const any = base({ id: "any", reading: { pages: 2 } });
const book1 = base({ id: "bk1", reading: { pages: 1, bookId: "b1" } });
const book2 = base({ id: "bk2", reading: { pages: 1, bookId: "b2" } });
const noGoal = base({ id: "none" });
const ended = base({ id: "end", start: "2026-09-01", days: 7, reading: { pages: 1 } });
const quit = base({ id: "quit", status: "quit", quitAt: 5, reading: { pages: 1 } });
const changed = applyReading([any, book1, book2, noGoal, ended, quit], "b1", 1, T);
check("yalnız eşleşen süren hedefli turlar değişiyor", changed.map((h) => h.id).join() === "any,bk1", changed.map((h) => h.id).join());
check("kitaba bağlı hedef dolunca gün yapıldı", changed.find((h) => h.id === "bk1")!.done.includes(T));
check("her kitap hedefi henüz dolmadı", !changed.find((h) => h.id === "any")!.done.includes(T) && changed.find((h) => h.id === "any")!.pagesRead?.[T] === 1);
check("girdi turları değişmiyor", any.pagesRead === undefined && book1.done.length === 0);

console.log(fails === 0 ? "\nHepsi geçti." : `\n${fails} test başarısız.`);
process.exit(fails === 0 ? 0 : 1);

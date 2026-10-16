// Tekrar eden görev (🔁) testi — LOM-41: görev tamamlanınca/tarihi çekilince çoğalmamalı.
// `npm test` ile koşar (scripts/run-tests.mjs). Yalnız saf çekirdek modüllerini çağırır.

import { parseRecurrence, nextRecurrenceDate } from "../markdown/recurrence";
import { parseTasks, toggleTaskInContent, applyTaskPatch } from "../markdown/taskParser";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const eq = (name: string, actual: unknown, expected: unknown): void =>
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    JSON.stringify(actual) === JSON.stringify(expected)
      ? ""
      : `beklenen ${JSON.stringify(expected)}, gelen ${JSON.stringify(actual)}`
  );

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const TODAY = "2026-10-16"; // Cuma
const lineOf = (content: string, needle: string) => content.split(/\r\n|\n/).findIndex((l) => l.includes(needle));
const kapilar = (content: string) => parseTasks("t.md", content).filter((t) => t.description === "Kapılar");
const open = (content: string) => kapilar(content).filter((t) => !t.done);

// ─────────────────────────────────────────────────────────────────────────────
section("(a) Kural çözme ve sonraki tarih");

eq("every day", parseRecurrence("every day"), { interval: 1, unit: "day", whenDone: false });
eq("every 2 days", parseRecurrence("every 2 days"), { interval: 2, unit: "day", whenDone: false });
eq("every week on Monday", parseRecurrence("every week on Monday"), { interval: 1, unit: "week", whenDone: false, weekday: 1 });
eq("every month on the 15th", parseRecurrence("every month on the 15th"), { interval: 1, unit: "month", whenDone: false, dom: 15 });
eq("every year when done", parseRecurrence("every year when done"), { interval: 1, unit: "year", whenDone: true });
eq("tanınmayan: her ay", parseRecurrence("her ay"), null);
eq("tanınmayan: every week on Funday", parseRecurrence("every week on Funday"), null);

eq("günlük, zamanında", nextRecurrenceDate("every day", "2026-10-16", TODAY), "2026-10-17");
eq("günlük, 6 gün gecikmiş → yarın", nextRecurrenceDate("every day", "2026-10-10", TODAY), "2026-10-17");
eq("2 günde bir, gecikmiş → ritim korunur", nextRecurrenceDate("every 2 days", "2026-10-10", TODAY), "2026-10-18");
eq("haftalık Pazartesi", nextRecurrenceDate("every week on Monday", "2026-10-12", TODAY), "2026-10-19");
eq("haftalık Pazartesi, Cuma bazdan", nextRecurrenceDate("every week on Monday", "2026-10-16", TODAY), "2026-10-19");
eq("2 haftada bir Pazartesi, Pazartesi bazdan", nextRecurrenceDate("every 2 weeks on Monday", "2026-10-12", "2026-10-12"), "2026-10-26");
eq("2 haftada bir Pazartesi, Çarşamba bazdan", nextRecurrenceDate("every 2 weeks on Monday", "2026-10-14", "2026-10-14"), "2026-10-26");
eq("haftalık Cuma, Çarşamba bazdan → aynı hafta", nextRecurrenceDate("every week on Friday", "2026-10-14", "2026-10-14"), "2026-10-16");
eq("haftalık, gelecek baz", nextRecurrenceDate("every week", "2026-10-20", TODAY), "2026-10-27");
eq("aylık 15'i", nextRecurrenceDate("every month on the 15th", "2026-10-15", TODAY), "2026-11-15");
eq("aylık 31'i → Kasım 30'a kırpılır", nextRecurrenceDate("every month on the 31st", "2026-10-31", TODAY), "2026-11-30");
eq("aylık, ay sonu bazdan", nextRecurrenceDate("every month", "2027-01-31", TODAY), "2027-02-28");
eq("yıllık", nextRecurrenceDate("every year", "2026-10-16", TODAY), "2027-10-16");
eq("yıllık 29 Şubat → 28 Şubat", nextRecurrenceDate("every year", "2028-02-29", TODAY), "2029-02-28");
eq("when done: baz bugün", nextRecurrenceDate("every week when done", "2026-01-01", TODAY), "2026-10-23");
eq("tanınmayan kural → undefined", nextRecurrenceDate("her ay", "2026-10-16", TODAY), undefined);

// ─────────────────────────────────────────────────────────────────────────────
section("(b) Geciken günlük görev bugün tamamlanır — tek yeni örnek, aradaki günler yok");
{
  const src = "# Yapılacaklar\n- [ ] Kapılar 🔁 every day 📅 2026-10-10\n";
  const out = toggleTaskInContent(src, 1, TODAY, "- [ ] Kapılar 🔁 every day 📅 2026-10-10");
  const ks = kapilar(out);
  eq("Kapılar geçen tam 2 satır", ks.length, 2);
  eq("Tamamlanan satır ✅ bugünle kalır", out.split("\n")[1], "- [x] Kapılar 🔁 every day 📅 2026-10-10 ✅ 2026-10-16");
  eq("Yeni açık örnek yarına", out.split("\n")[2], "- [ ] Kapılar 🔁 every day 📅 2026-10-17");
  eq("Tek açık örnek", open(out).length, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
section("(c) Var olan açık kopyalar varken yeni örnek açılmaz, kopyalar eriyerek tükenir");
{
  const row = "- [ ] Kapılar 🔁 every day 📅 2026-10-10";
  let c = `${row}\n${row}\n${row}\n`;
  c = toggleTaskInContent(c, 0, TODAY, row);
  eq("1. tamamlama: satır eklenmedi", c.split("\n").length, 4);
  eq("1. tamamlama: 2 açık kaldı", open(c).length, 2);
  c = toggleTaskInContent(c, 1, TODAY, row);
  eq("2. tamamlama: satır eklenmedi", c.split("\n").length, 4);
  eq("2. tamamlama: 1 açık kaldı", open(c).length, 1);
  c = toggleTaskInContent(c, 2, TODAY, row);
  eq("3. tamamlama: tam bir yeni örnek", open(c).length, 1);
  eq("3. tamamlama: yeni örnek yarına", open(c)[0]?.due, "2026-10-17");
  eq("Hiçbir satır silinmedi", kapilar(c).length, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
section("(d) Tamamla → geri al döngüsü çoğaltmaz");
{
  const src = "- [ ] Kapılar 🔁 every day 📅 2026-10-16\n- [ ] Başka iş\n";
  const done = toggleTaskInContent(src, 0, TODAY);
  const undone = toggleTaskInContent(done, 0, TODAY);
  eq("Tamamla → geri al: dosya başlangıçla aynı", undone, src);
  const again = toggleTaskInContent(undone, 0, TODAY);
  eq("Tamamla → geri al → tamamla: tek açık örnek", open(again).length, 1);
  eq("Tamamla → geri al → tamamla: toplam 2 Kapılar", kapilar(again).length, 2);
  // Çift tık: aynı satıra ikinci dokunuş tamamlamayı geri alır; zincirleme çoğalma yok.
  const dbl = toggleTaskInContent(toggleTaskInContent(src, 0, TODAY), 0, TODAY);
  eq("Çift dokunuş başa döner", dbl, src);
  // Geri alma ertesi gün yapılsa da üretilen örnek kaldırılır (tamamlama günüyle hesaplanır).
  const late = "- [ ] Kapılar 🔁 every day 📅 2026-10-10";
  const lateDone = toggleTaskInContent(late, 0, TODAY);
  eq("Ertesi gün geri alma başa döner", toggleTaskInContent(lateDone, 0, "2026-10-17"), late);
  // Başka açık kopya varken tamamlamada satır eklenmez; geri alma hiçbir kopyayı silmez.
  const dups = "- [ ] Kapılar 🔁 every day 📅 2026-10-15\n- [ ] Kapılar 🔁 every day 📅 2026-10-16\n- [ ] Kapılar 🔁 every day 📅 2026-10-16";
  const dupsDone = toggleTaskInContent(dups, 0, "2026-10-15");
  eq("Kopyalar varken geri alma hiçbir satırı silmez", toggleTaskInContent(dupsDone, 0, "2026-10-15"), dups);
  // Kullanıcı üretilen örneği değiştirdiyse geri almada ona dokunulmaz.
  const edited = done.replace("📅 2026-10-17", "📅 2026-10-20");
  const keep = toggleTaskInContent(edited, 0, TODAY);
  eq("Değiştirilmiş örnek geri almada kalır", open(keep).length, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
section("(e) Tarihi bugüne çekmek kopya üretmez");
{
  const src = "- [ ] Kapılar 🔁 every day 📅 2026-10-10\n- [ ] Diğer\n";
  const t = parseTasks("t.md", src)[0];
  const out = applyTaskPatch(src, 0, t, { due: TODAY });
  eq("Satır sayısı aynı", out.split("\n").length, src.split("\n").length);
  eq("Tarih bugüne çekildi", parseTasks("t.md", out)[0].due, TODAY);
  eq("Tek Kapılar", kapilar(out).length, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
section("(f) Alt görevli/notlu görev — yeni örnek çocuk bloğunun altına");
{
  const src = [
    "- [ ] Kapılar 🔼 #ev 🔁 every week on Monday ⏰ 09:00 📅 2026-10-12",
    "    - [x] Ön kapı",
    "    not satırı",
    "- [ ] Sonraki",
  ].join("\n");
  const out = toggleTaskInContent(src, 0, TODAY).split("\n");
  eq("Çocuklar tamamlananın altında kalır", out.slice(1, 3), ["    - [x] Ön kapı", "    not satırı"]);
  eq(
    "Yeni örnek çocuk bloğundan sonra, öncelik/etiket/saat/kural korunur",
    out[3],
    "- [ ] Kapılar 🔼 #ev 🔁 every week on Monday ⏰ 09:00 📅 2026-10-19"
  );
  eq("Sonraki görev yerinde", out[4], "- [ ] Sonraki");
}

// ─────────────────────────────────────────────────────────────────────────────
section("Tarihler aynı farkla kayar, pomodoro sıfırlanır, tarihsiz göreve bugün baz");
{
  const src = "- [ ] Kapılar 🍅 ×3 🔁 every 2 days 🛫 2026-10-14 ⏳ 2026-10-15 📅 2026-10-16";
  const out = toggleTaskInContent(src, 0, TODAY).split("\n");
  eq("Yeni örnek: üç tarih +2 gün, 🍅 yok", out[1], "- [ ] Kapılar 🔁 every 2 days 🛫 2026-10-16 ⏳ 2026-10-17 📅 2026-10-18");
  const nodate = toggleTaskInContent("- [ ] Kapılar 🔁 every day", 0, TODAY).split("\n");
  eq("Tarihsiz: yeni örnek yarına tarihli", nodate[1], "- [ ] Kapılar 🔁 every day 📅 2026-10-17");
  const nested = toggleTaskInContent("- [ ] Üst\n    - [ ] Kapılar 🔁 every day 📅 2026-10-16", 1, TODAY).split("\n");
  eq("Girinti korunur", nested[2], "    - [ ] Kapılar 🔁 every day 📅 2026-10-17");
}

// ─────────────────────────────────────────────────────────────────────────────
section("(g) CRLF dosyada satır sonu korunur");
{
  const src = "# Başlık\r\n- [ ] Kapılar 🔁 every day 📅 2026-10-16\r\n- [ ] Diğer\r\n";
  const out = toggleTaskInContent(src, 1, TODAY);
  eq(
    "CRLF korunur, yeni satır doğru yerde",
    out,
    "# Başlık\r\n- [x] Kapılar 🔁 every day 📅 2026-10-16 ✅ 2026-10-16\r\n- [ ] Kapılar 🔁 every day 📅 2026-10-17\r\n- [ ] Diğer\r\n"
  );
  eq("CRLF geri al → başa döner", toggleTaskInContent(out, 1, TODAY), src);
}

// ─────────────────────────────────────────────────────────────────────────────
section("(h)(i)(j) Tanınmayan kural, kuralsız görev, satır kilidi");
{
  const bad = "- [ ] Kapılar 🔁 her ay 📅 2026-10-16";
  eq("Tanınmayan kural yalnız işaretlenir", toggleTaskInContent(bad, 0, TODAY), bad.replace("- [ ]", "- [x]") + " ✅ 2026-10-16");
  const plain = "- [ ] Süt al 📅 2026-10-16\n";
  eq("Kuralsız görev eski davranış", toggleTaskInContent(plain, 0, TODAY), "- [x] Süt al 📅 2026-10-16 ✅ 2026-10-16\n");
  eq("Kuralsız görev geri alınır", toggleTaskInContent("- [x] Süt al ✅ 2026-10-16\n", 0, TODAY), "- [ ] Süt al\n");
  const src = "- [ ] Kapılar 🔁 every day 📅 2026-10-16";
  eq("expectedRaw tutmazsa içerik aynen döner", toggleTaskInContent(src, 0, TODAY, "- [ ] Başka"), src);
  // Daha önce tamamlanıp örneği açılmış görev geri alınınca: tek açık örnek kalır.
  const pre = "- [x] Kapılar 🔁 every day 📅 2026-10-16 ✅ 2026-10-16\n- [ ] Kapılar 🔁 every day 📅 2026-10-17";
  eq("Geri alma üretilen örneği kaldırır, tek açık kalır", open(toggleTaskInContent(pre, 0, TODAY)).length, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${fails === 0 ? `✅ ${ran} testin tümü geçti` : `❌ ${ran} testten ${fails} tanesi başarısız`}`);
process.exit(fails === 0 ? 0 : 1);

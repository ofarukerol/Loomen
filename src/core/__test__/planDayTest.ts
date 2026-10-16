// "Günü planla" testi — LOM-40: geciken görevler seçilip bugüne çekilir, başka hiçbir şey değişmez.
// `npm test` ile koşar (scripts/run-tests.mjs). Yalnız saf çekirdek modüllerini çağırır.

import { parseTasks, rescheduleTaskLine, rescheduleTasksInContent } from "../markdown/taskParser";
import { overdueOpenTasks, planRescheduleBatches } from "../vault/planDay";
import { focusCounts } from "../vault/grouping";

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

const TODAY = "2026-10-16";

// ─────────────────────────────────────────────────────────────────────────────
section("(a) Tek satır: yalnız tarih değişir");

eq("📅 bugüne çekilir", rescheduleTaskLine("- [ ] Süt al 📅 2026-10-10", TODAY), "- [ ] Süt al 📅 2026-10-16");
eq(
  "Saat, tekrar, öncelik, etiket, pomodoro korunur",
  rescheduleTaskLine("- [ ] Kapılar 🔼 #ev 🍅 ×2 🔁 every day ⏰ 09:30 📅 2026-10-01", TODAY),
  "- [ ] Kapılar 🔼 #ev 🍅 ×2 🔁 every day ⏰ 09:30 📅 2026-10-16"
);
eq(
  "Bilinmeyen token'lar (➕ 🆔) ve 🛫 korunur",
  rescheduleTaskLine("- [ ] Rapor ➕ 2026-09-01 🆔 abc 🛫 2026-10-01 📅 2026-10-05", TODAY),
  "- [ ] Rapor ➕ 2026-09-01 🆔 abc 🛫 2026-10-01 📅 2026-10-16"
);
eq("Girinti ve sondaki \\r korunur", rescheduleTaskLine("  - [ ] Alt 📅 2026-10-01\r", TODAY), "  - [ ] Alt 📅 2026-10-16\r");
eq("Yalnız ⏳ varsa ⏳ çekilir", rescheduleTaskLine("- [ ] Ara ⏳ 2026-10-03", TODAY), "- [ ] Ara ⏳ 2026-10-16");
eq(
  "📅 + ⏳ varsa yalnız 📅 çekilir, ⏳ dokunulmaz",
  rescheduleTaskLine("- [ ] İkili ⏳ 2026-10-01 📅 2026-10-05", TODAY),
  "- [ ] İkili ⏳ 2026-10-01 📅 2026-10-16"
);
eq("Tarihsiz görev aynen kalır", rescheduleTaskLine("- [ ] Tarihsiz #ev", TODAY), "- [ ] Tarihsiz #ev");
eq(
  "Tamamlanmış görev aynen kalır",
  rescheduleTaskLine("- [x] Bitti 📅 2026-10-01 ✅ 2026-10-02", TODAY),
  "- [x] Bitti 📅 2026-10-01 ✅ 2026-10-02"
);
eq("Görev olmayan satır aynen kalır", rescheduleTaskLine("Not 📅 2026-10-01", TODAY), "Not 📅 2026-10-01");
eq(
  "Geçersiz 📅 varsa geçerli ⏳ çekilir, geçersiz token korunur",
  rescheduleTaskLine("- [ ] Bozuk 📅 2026-13-45 ⏳ 2026-10-02", TODAY),
  "- [ ] Bozuk 📅 2026-13-45 ⏳ 2026-10-16"
);
{
  const recurring = "- [ ] Kapılar 🔁 every day 📅 2026-10-10";
  const out = rescheduleTaskLine(recurring, TODAY);
  eq("Tekrar eden görev: tek satır, kopya yok", out.split("\n").length, 1);
  eq("Tekrar eden görev: kural aynı", parseTasks("t.md", out)[0].recurrence, "every day");
}

// ─────────────────────────────────────────────────────────────────────────────
section("(b) Dosya içeriği: toplu çekme");

const FILE = [
  "# Yapılacaklar",
  "- [ ] A 📅 2026-10-01",
  "- [ ] B ⏰ 08:00 📅 2026-10-02",
  "- [ ] C 🔁 every week 📅 2026-10-03",
  "    - [ ] C alt 📅 2026-10-04",
  "- [x] D 📅 2026-10-01 ✅ 2026-10-01",
  "- [ ] E",
  "- [ ] F 📅 2026-10-20",
  "",
].join("\n");
const fileTasks = parseTasks("Yapılacaklar.md", FILE);
const byDesc = (d: string) => fileTasks.find((t) => t.description === d)!;
const item = (d: string) => ({ line: byDesc(d).line, raw: byDesc(d).raw });

{
  const r = rescheduleTasksInContent(FILE, [item("A"), item("C")], TODAY);
  const before = FILE.split("\n");
  const after = r.content.split("\n");
  eq("İki görev değişti", r.changed, 2);
  eq("Stale yok", r.stale, []);
  eq("Satır sayısı sabit", after.length, before.length);
  eq("A bugüne", after[1], "- [ ] A 📅 2026-10-16");
  eq("C bugüne, kural korunur", after[3], "- [ ] C 🔁 every week 📅 2026-10-16");
  const untouched = [0, 2, 4, 5, 6, 7, 8];
  check(
    "Seçilmeyen satırlar (B, alt görev, D, E, F, boş) aynen",
    untouched.every((i) => after[i] === before[i])
  );
  const counts = (c: string) => {
    const ts = parseTasks("Yapılacaklar.md", c);
    return { c: ts.filter((t) => t.description === "C" && !t.done).length };
  };
  eq("Tekrar eden C tek açık örnek", counts(r.content).c, 1);
}
{
  const r = rescheduleTasksInContent(FILE, [item("D"), item("E")], TODAY);
  eq("Tamamlanmış/tarihsiz seçilse de değişmez", r.changed, 0);
  check("İçerik aynı nesne döner", r.content === FILE);
}
{
  const crlf = FILE.replace(/\n/g, "\r\n");
  const ts = parseTasks("x.md", crlf);
  const b = ts.find((t) => t.description === "B")!;
  const r = rescheduleTasksInContent(crlf, [{ line: b.line, raw: b.raw }], TODAY);
  eq("CRLF: tek görev değişti", r.changed, 1);
  check("CRLF satır sonları korunur", !/[^\r]\n/.test(r.content) && r.content.split("\r\n").length === crlf.split("\r\n").length);
  check("CRLF: B bugüne, saat korunur", r.content.includes("- [ ] B ⏰ 08:00 📅 2026-10-16\r\n"));
}
{
  const mixed = "- [ ] A 📅 2026-10-01\r\n- [ ] B 📅 2026-10-02\n- [ ] C 📅 2026-10-03";
  const r = rescheduleTasksInContent(mixed, [{ line: 1, raw: "- [ ] B 📅 2026-10-02" }], TODAY);
  eq("Karışık satır sonları aynen korunur", r.content, "- [ ] A 📅 2026-10-01\r\n- [ ] B 📅 2026-10-16\n- [ ] C 📅 2026-10-03");
}
{
  // Dosya arada dışarıdan değişti: A'nın satırında artık başka bir görev var.
  const shifted = FILE.replace("- [ ] A 📅 2026-10-01", "- [ ] Yeni 📅 2026-10-01");
  const r = rescheduleTasksInContent(shifted, [item("A"), item("B")], TODAY);
  eq("Kaymış satır stale'e düşer", r.stale, [item("A").line]);
  eq("Kaymış satıra dokunulmaz, diğeri değişir", r.changed, 1);
  check("Yeni görev aynen", r.content.includes("- [ ] Yeni 📅 2026-10-01"));
  check("B bugüne", r.content.includes("- [ ] B ⏰ 08:00 📅 2026-10-16"));
  eq("Dosya dışı satır stale", rescheduleTasksInContent(FILE, [{ line: 99, raw: "x" }], TODAY).stale, [99]);
}

// ─────────────────────────────────────────────────────────────────────────────
section("(c) Geciken listesi ve dosya grupları");

const other = parseTasks("Proje.md", ["- [ ] P1 ⏳ 2026-10-01", "- [ ] P2 📅 2026-09-30", "- [ ] P3 📅 2026-10-16"].join("\n"));
const all = [...fileTasks, ...other];
{
  const od = overdueOpenTasks(all, TODAY);
  eq(
    "Geciken: açık, üst düzey, tarihi geçmiş; tarih → dosya → satır sıralı",
    od.map((t) => t.description),
    ["P2", "P1", "A", "B", "C"]
  );
  eq("Geciken sayısı focusCounts ile aynı", od.length, focusCounts(all, TODAY).geciken);
  eq("Geciken yoksa boş", overdueOpenTasks(other.filter((t) => t.description === "P3"), TODAY), []);
}
{
  const ids = ["Proje.md:1", "Yapılacaklar.md:3", "Yapılacaklar.md:1", "Yapılacaklar.md:1", "Yok.md:5"];
  const b = planRescheduleBatches(ids, all);
  eq("Dosya başına gruplanır, bilinmeyen atlanır", [...b.keys()].sort(), ["Proje.md", "Yapılacaklar.md"]);
  eq("Satırlar artan sırada, tekrar atlanır", b.get("Yapılacaklar.md")!.map((x) => x.line), [1, 3]);
  eq("Ham satır taşınır", b.get("Proje.md")![0].raw, "- [ ] P2 📅 2026-09-30");
  eq("Boş seçim → boş", planRescheduleBatches([], all).size, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section("(d) Sayaçlar: Geciken düşer, Yapılacak artar");
{
  const before = focusCounts(fileTasks, TODAY);
  const picked = overdueOpenTasks(fileTasks, TODAY).filter((t) => t.description !== "B");
  const batch = planRescheduleBatches(picked.map((t) => `${t.file}:${t.line}`), fileTasks).get("Yapılacaklar.md")!;
  const after = focusCounts(parseTasks("Yapılacaklar.md", rescheduleTasksInContent(FILE, batch, TODAY).content), TODAY);
  eq("Önce: geciken 3, yapılacak 1", [before.geciken, before.yapilacak], [3, 1]);
  eq("Sonra: geciken 1 (B seçilmedi), yapılacak 3", [after.geciken, after.yapilacak], [1, 3]);
  eq("Planlanmamış değişmez", after.planlanmamis, before.planlanmamis);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${fails === 0 ? `✅ ${ran} testin tümü geçti` : `❌ ${ran} testten ${fails} tanesi başarısız`}`);
process.exit(fails === 0 ? 0 : 1);

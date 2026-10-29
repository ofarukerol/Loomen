// Planner liste süzgeçleri testi — LOM-63: gecikenler varsayılan mini listede, Pano'da tamamlanan yok.
// `npm test` ile koşar (scripts/run-tests.mjs). Yalnız saf çekirdek modüllerini çağırır.

import { parseTasks } from "../markdown/taskParser";
import { focusCounts, groupTasks } from "../vault/grouping";
import { boardColumns, miniAgendaSections, openTasks, overdueOpenCount } from "../vault/agendaView";

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

const TODAY = "2026-10-29";

const tasks = parseTasks(
  "Yapılacaklar.md",
  [
    "- [ ] Eski fatura 📅 2026-10-20",
    "- [x] Bitmiş eski iş 📅 2026-10-20",
    "- [x] Yalnız bitmiş gün 📅 2026-10-22",
    "- [ ] Dünkü iş 📅 2026-10-28",
    "\t- [ ] Alt görev sayılmaz 📅 2026-10-28",
    "- [ ] Bugünkü iş 📅 2026-10-29",
    "- [x] Bugün bitti 📅 2026-10-29",
    "- [ ] Yarınki iş 📅 2026-10-30",
    "- [ ] Tarihsiz iş",
    "- [x] Tarihsiz bitmiş",
  ].join("\n") + "\n"
);
const { groups, unplannedTasks } = groupTasks(tasks, TODAY);
const counts = focusCounts(tasks, TODAY);
const texts = (ts: { text: string }[]) => ts.map((t) => t.text);

// ─────────────────────────────────────────────────────────────────────────────
section("(a) Varsayılan mini liste: gecikenler en üstte");
{
  const secs = miniAgendaSections(groups, unplannedTasks, "yapilacak");
  eq("Bölüm türleri: geciken günler önce", secs.map((s) => s.kind), ["overdue", "overdue", "today", "upcoming"]);
  eq(
    "Satırlar yalnız açık görev",
    secs.flatMap((s) => texts(s.tasks)),
    ["Eski fatura", "Dünkü iş", "Bugünkü iş", "Yarınki iş"]
  );
  check("Yalnız tamamlanmış gün bölüm üretmez", !secs.some((s) => s.key === "d2026-10-22"));
  const overdueRows = secs.filter((s) => s.kind === "overdue").reduce((n, s) => n + s.tasks.length, 0);
  eq("Varsayılan listedeki geciken sayısı = Geciken sayacı", overdueRows, counts.geciken);
  const rows = secs.reduce((n, s) => n + s.tasks.length, 0);
  eq("Varsayılan listedeki satır sayısı = Yapılacak sayacı (LOM-67)", rows, counts.yapilacak);
  eq("Yapılacak sayısı 4 (gecikenler dahil)", counts.yapilacak, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
section("(b) Süzgeçler ve sayaç tutarlılığı");
{
  eq("overdueOpenCount = focusCounts.geciken", overdueOpenCount(groups), counts.geciken);
  eq("Geciken sayısı 2", counts.geciken, 2);
  const late = miniAgendaSections(groups, unplannedTasks, "geciken");
  eq("Geciken süzgeci yalnız geciken gün", late.map((s) => s.kind), ["overdue", "overdue"]);
  eq("Geciken süzgeci sayısı = sayaç", late.reduce((n, s) => n + s.tasks.length, 0), counts.geciken);
  const un = miniAgendaSections(groups, unplannedTasks, "planlanmamis");
  eq("Planlanmamış kaynak nota göre", un.map((s) => [s.kind, s.label, texts(s.tasks)]), [
    ["source", "Yapılacaklar", ["Tarihsiz iş"]],
  ]);
  eq(
    "Planlanmamış sayısı = sayaç",
    un.reduce((n, s) => n + s.tasks.length, 0),
    counts.planlanmamis
  );
  eq("openTasks tamamlananı atar", texts(openTasks(groups.flatMap((g) => g.tasks))).length, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
section("(c) Pano: tamamlanan görev hiçbir sütunda yok");
{
  const cols = boardColumns(groups);
  eq("Geciken sütunu yalnız açık", texts(cols.overdue), ["Eski fatura", "Dünkü iş"]);
  eq("Bugün sütunu yalnız açık", texts(cols.today), ["Bugünkü iş"]);
  eq("Yaklaşan sütunu", texts(cols.upcoming), ["Yarınki iş"]);
  const all = [...cols.overdue, ...cols.today, ...cols.upcoming];
  check("Hiçbir sütunda tamamlanmış görev yok", all.every((t) => !t.done));
  eq("Geciken sütun sayacı = Geciken sayacı", cols.overdue.length, counts.geciken);
  eq("Boş grup listesinde sütunlar boş", boardColumns([]), { overdue: [], today: [], upcoming: [] });
}

console.log(`\n${ran - fails}/${ran} geçti`);
if (fails > 0) {
  console.error(`${fails} test BAŞARISIZ`);
  process.exit(1);
}

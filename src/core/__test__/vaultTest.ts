// Çekirdek vault mantığının node testi (esbuild ile bundle edilip çalıştırılır).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseTasks, toggleTaskInContent, buildTaskLine } from "../markdown/taskParser";
import { groupTasks, focusCounts } from "../vault/grouping";
import { relativeLabel } from "../../lib/relativeDate";
import type { ParsedTask } from "../vault/types";

const VAULT = process.argv[2];
const TODAY = "2026-06-17";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
  });
}

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const files = walk(VAULT);
const allTasks: ParsedTask[] = files.flatMap((f) =>
  parseTasks(relative(VAULT, f), readFileSync(f, "utf8"))
);

console.log(`\n=== ${files.length} dosya, ${allTasks.length} görev ===`);

// Parse doğruluğu
const t1 = allTasks.find((t) => t.description === "Tasarımı bitir");
check("Görev metni temiz parse edildi", !!t1 && t1.description === "Tasarımı bitir");
check("📅 due parse", t1?.due === "2026-06-17", t1?.due);
check("🍅×N parse", t1?.pomos === 3, String(t1?.pomos));
check("#etiket parse", t1?.tags[0] === "Yapılacaklar", t1?.tags.join(","));
const doneTask = allTasks.find((t) => t.description.startsWith("Elektrik"));
check("Tamamlanmış görev (✅)", doneTask?.done === true && doneTask?.doneDate === "2026-06-16");

// Göreli tarih
check("relativeLabel bugün", relativeLabel("2026-06-17", TODAY) === "bugün");
check("relativeLabel bir gün önce", relativeLabel("2026-06-16", TODAY) === "bir gün önce");
check("relativeLabel 6 gün sonra", relativeLabel("2026-06-23", TODAY) === "6 gün sonra");
check("relativeLabel bir ay sonra", relativeLabel("2026-07-17", TODAY) === "bir ay sonra");

// Gruplama + sayaçlar
const { groups, unplanned } = groupTasks(allTasks, TODAY);
const counts = focusCounts(allTasks, TODAY);
console.log(`\nGruplar: ${groups.map((g) => `${g.label} [${g.sub}] (${g.tasks.length})`).join(" | ")}`);
console.log(`Sayaçlar: Yapılacak=${counts.yapilacak} Geciken=${counts.geciken} Planlanmamış=${counts.planlanmamis} (unplanned grup=${unplanned})`);
check("Bugün grubu var", groups.some((g) => g.kind === "today"));
check("Geciken grubu var", groups.some((g) => g.kind === "overdue"));
check("Yaklaşan grubu var", groups.some((g) => g.kind === "upcoming"));
check("Planlanmamış sayısı doğru (3 tarihsiz açık görev)", counts.planlanmamis === 3, String(counts.planlanmamis));
check("Gruplar tarihe göre sıralı", JSON.stringify(groups.map((g) => g.id)) === JSON.stringify([...groups.map((g) => g.id)].sort()));

// Round-trip: tamamla/geri al
const sample = "- [ ] Test görevi 📅 2026-06-20 #X";
const toggled = toggleTaskInContent(sample, 0, TODAY);
check("Toggle done (✅ eklendi)", toggled.includes("- [x]") && toggled.includes("✅ 2026-06-17"));
const back = toggleTaskInContent(toggled, 0, TODAY);
check("Toggle geri (round-trip = orijinal)", back.trim() === sample.trim(), back);

// Hızlı ekle
check("buildTaskLine", buildTaskLine("Yeni görev", "2026-06-17") === "- [ ] Yeni görev 📅 2026-06-17");

console.log(`\n${fails === 0 ? "✅ TÜM TESTLER GEÇTİ" : `❌ ${fails} test başarısız`}`);
process.exit(fails === 0 ? 0 : 1);

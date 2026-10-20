// "Geçmiş yıllarda bugün" testi (LOM-52) — saf çekirdek, hiçbir şey yazmaz.
import { findOnThisDay, summarizeDay } from "../vault/onThisDay";

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

section("findOnThisDay");
const cur = "Günlük/2026/10-Ekim/2026-10-20-Salı.md";
const paths = [
  cur,
  "Günlük/2025/10-Ekim/2025-10-20-Pazartesi.md",
  "Günlük/2023/10-Ekim/2023-10-20-Cuma.md",
  "Günlük/2024/10-Ekim/2024-10-20-Pazar.md",
  "Günlük/2025/10-Ekim/2025-10-21-Salı.md", // başka gün
  "Günlük/2027/10-Ekim/2027-10-20-Çarşamba.md", // gelecek yıl
  "Notlar/Fikir.md", // günlük değil
  "Günlük/2022/10-Ekim/2022-10-20-Perşembe.md",
  "Daily/2022-10-20-Perşembe.md", // yinelenen yıl
];
const r = findOnThisDay(paths, cur);
eq("yıllar yeniden eskiye", r.map((e) => e.year), [2025, 2024, 2023, 2022]);
eq("yearsAgo", r.map((e) => e.yearsAgo), [1, 2, 3, 4]);
eq("Günlük/ tercih edilir", r[3].path, "Günlük/2022/10-Ekim/2022-10-20-Perşembe.md");
eq("Daily/ tek başınaysa alınır", findOnThisDay(["Daily/2020-10-20-Salı.md"], cur).map((e) => e.path), ["Daily/2020-10-20-Salı.md"]);
eq("günlük olmayan açık not", findOnThisDay(paths, "Notlar/Fikir.md"), []);
eq("aynı yıl hariç", findOnThisDay([cur, "Günlük/2026/09-Eylül/2026-09-20-Pazar.md"], cur), []);
const leap = "Günlük/2028/02-Şubat/2028-02-29-Salı.md";
eq("29 Şubat yalnız 29 Şubat", findOnThisDay(["Günlük/2024/02-Şubat/2024-02-29-Perşembe.md", "Günlük/2027/02-Şubat/2027-02-28-Pazar.md", "Günlük/2026/03-Mart/2026-03-01-Pazar.md"], leap).map((e) => e.year), [2024]);

section("summarizeDay");
const note = `Sabah koşu yaptım. [[Proje X|X projesi]] ile ilgilendim.

## 💭 Ephemeral Notlar (Gün İçi Notlar)
- **Önemli** fikir [bağlantı](https://a.b)
- ikinci
- üçüncü
- dördüncü
- beşinci
- [ ] açık iş
- [x] Bitti bir iş ✅ 2025-10-20

## 📝 Günün Özeti

## 💡 Günün Kattıkları
1. Öğrendim: \`code\` ve [[Not]]
\`\`\`
gizli kod
\`\`\`
`;
const s = summarizeDay(note);
eq("bölüm başlıkları", s.sections.map((x) => x.title), ["", "Ephemeral Notlar", "Günün Kattıkları"]);
eq("emoji ayrılır", s.sections.map((x) => x.emoji), [undefined, "💭", "💡"]);
eq("serbest metin wikilink temiz", s.sections[0].lines, ["Sabah koşu yaptım. X projesi ile ilgilendim."]);
eq("emphasis/link temiz + 3 satır", s.sections[1].lines, ["Önemli fikir bağlantı", "ikinci", "üçüncü"]);
eq("more sayısı", s.sections[1].more, 2);
eq("kod bloğu atlanır, madde işareti temiz", s.sections[2].lines, ["Öğrendim: code ve Not"]);
eq("tamamlanan görevler", s.done, ["Bitti bir iş"]);
eq("açık görev sayısı", s.openCount, 1);
eq("boş bölüm düşer", s.sections.length, 3);
check("empty false", !s.empty);

const long = summarizeDay("## Not\n" + "a".repeat(300));
check("uzun satır kısalır", [...long.sections[0].lines[0]].length === 140 && long.sections[0].lines[0].endsWith("…"));

const many = summarizeDay(Array.from({ length: 8 }, (_, i) => `- [x] iş ${i}`).join("\n"));
eq("done en çok 5", many.done.length, 5);
eq("doneMore", many.doneMore, 3);
check("yalnız görevle empty false", !many.empty);

const tmpl = summarizeDay("---\ntags: [daily]\n---\n\n## 💭 Ephemeral Notlar (Gün İçi Notlar)\n\n## 📝 Günün Özeti\n\n## 💡 Günün Kattıkları\n\n## 📚 Okuduklarım/İzlediklerim\n\n");
check("boş şablon empty", tmpl.empty && tmpl.sections.length === 0);

console.log(`\n${fails === 0 ? "✅" : "❌"} ${ran} kontrol, ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);

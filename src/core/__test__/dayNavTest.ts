import { readFileSync } from "node:fs";
import { addDaysISO, localISO, isoToLocalDate, dailyDateOfPath } from "../vault/dayNav";

let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) console.log(`  ok   ${name}`);
  else {
    fail++;
    console.error(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
}

console.log("dayNav");
eq("ileri gün", addDaysISO("2026-11-28", 1), "2026-11-29");
eq("geri gün", addDaysISO("2026-11-28", -1), "2026-11-27");
eq("ay sonu ileri", addDaysISO("2026-11-30", 1), "2026-12-01");
eq("ay başı geri", addDaysISO("2026-12-01", -1), "2026-11-30");
eq("yıl sonu ileri", addDaysISO("2026-12-31", 1), "2027-01-01");
eq("yıl başı geri", addDaysISO("2027-01-01", -1), "2026-12-31");
eq("artık yıl şubat", addDaysISO("2028-02-28", 1), "2028-02-29");
eq("artık yıl mart geri", addDaysISO("2028-03-01", -1), "2028-02-29");
eq("artık olmayan şubat", addDaysISO("2027-02-28", 1), "2027-03-01");
eq("çok gün", addDaysISO("2026-01-01", 365), "2027-01-01");
eq("sıfır", addDaysISO("2026-11-28", 0), "2026-11-28");
eq("geçersiz tarih", addDaysISO("2026-02-30", 1), undefined);
eq("geçersiz biçim", addDaysISO("28.11.2026", 1), undefined);
eq("kesirli gün", addDaysISO("2026-11-28", 1.5), undefined);
// Yaz saati geçiş günleri (ABD 2026-03-08, AB 2026-03-29, güz 2026-10-25/11-01): her adım tam 1 gün.
for (const start of ["2026-03-07", "2026-03-28", "2026-10-24", "2026-10-31"]) {
  const a = addDaysISO(start, 1)!;
  const b = addDaysISO(a, 1)!;
  eq(`dst ${start} ardışık`, [a, addDaysISO(b, -2)], [a, start]);
}
eq("dst Mart 2026 zinciri", addDaysISO("2026-03-28", 2), "2026-03-30");
eq("localISO", localISO(new Date(2026, 10, 28, 23, 59)), "2026-11-28");
eq("isoToLocalDate gidiş-dönüş", localISO(isoToLocalDate("2026-03-29")!), "2026-03-29");
eq("isoToLocalDate geçersiz", isoToLocalDate("2026-13-01"), undefined);
eq("dosya yolundan tarih", dailyDateOfPath("Günlük/2026/11-Kasım/2026-11-28-Cumartesi.md"), "2026-11-28");
eq("yalnız ad", dailyDateOfPath("2026-01-05.md"), "2026-01-05");
eq("tarihsiz not", dailyDateOfPath("Notlar/Toplantı.md"), undefined);
eq("geçersiz gün adı", dailyDateOfPath("2026-02-31-X.md"), undefined);

// DailyHeader'daki her t("...") anahtarı üç dilde de var olmalı (eksik anahtar ekranda ham yazılır).
const src = readFileSync("src/screens/Editor/DailyHeader.tsx", "utf8");
const keys = [...src.matchAll(/\bt\("([^"]+)"/g)].map((m) => m[1]);
eq("DailyHeader anahtar sayısı > 0", keys.length > 0, true);
for (const lang of ["tr", "en", "ar"]) {
  const json = JSON.parse(readFileSync(`src/i18n/locales/${lang}/translation.json`, "utf8"));
  const missing = keys.filter((k) => typeof k.split(".").reduce((o: any, p) => o?.[p], json) !== "string");
  eq(`${lang}: DailyHeader anahtarları tam`, missing, []);
}

if (fail) {
  console.error(`dayNav: ${fail} FAILED`);
  process.exit(1);
}
console.log("dayNav: all passed");

// Uygulama içi güncellemenin saf mantığının node testi (LOM-31).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import { compareVersions, isNewer, progressPercent, errorText } from "../updater";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

function eq(name: string, got: unknown, want: unknown): void {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  check(name, a === b, a === b ? "" : `beklenen ${b}, gelen ${a}`);
}

// compareVersions
eq("eşit sürüm", compareVersions("0.1.0", "0.1.0"), 0);
eq("yama büyük", compareVersions("0.1.1", "0.1.0"), 1);
eq("yama küçük", compareVersions("0.1.0", "0.1.1"), -1);
eq("ana sürüm büyük", compareVersions("1.0.0", "0.9.9"), 1);
eq("sayısal karşılaştırma (10 > 9)", compareVersions("0.10.0", "0.9.0"), 1);
eq("farklı uzunluk eşit", compareVersions("1.0", "1.0.0"), 0);
eq("farklı uzunluk büyük", compareVersions("1.0.0.1", "1.0"), 1);
eq("farklı uzunluk küçük", compareVersions("1", "1.0.1"), -1);
eq("ön ek v", compareVersions("v0.1.1", "0.1.0"), 1);
eq("ön ek V ve boşluk", compareVersions(" V1.2.3 ", "1.2.3"), 0);
eq("ön sürüm yayından küçük", compareVersions("1.0.0-beta.1", "1.0.0"), -1);
eq("yayın ön sürümden büyük", compareVersions("1.0.0", "1.0.0-beta.1"), 1);
eq("ön sürüm sayısal", compareVersions("1.0.0-beta.2", "1.0.0-beta.10"), -1);
eq("ön sürüm alfabetik", compareVersions("1.0.0-alpha", "1.0.0-beta"), -1);
eq("derleme bilgisi yok sayılır", compareVersions("1.0.0+abc", "1.0.0"), 0);

// isNewer
check("yeni sürüm → true", isNewer({ version: "0.1.1", currentVersion: "0.1.0" }));
check("aynı sürüm → false", !isNewer({ version: "0.1.0", currentVersion: "0.1.0" }));
check("eski sürüm → false", !isNewer({ version: "0.0.9", currentVersion: "0.1.0" }));
check("null → false", !isNewer(null));
check("boş sürüm → false", !isNewer({ version: "", currentVersion: "0.1.0" }));

// progressPercent
eq("toplam bilinmiyor", progressPercent({ downloaded: 10, total: null }), null);
eq("yarı", progressPercent({ downloaded: 50, total: 100 }), 50);
eq("taşma 100'de kalır", progressPercent({ downloaded: 150, total: 100 }), 100);

// errorText
eq("string hata", errorText("ağ yok"), "ağ yok");
eq("Error nesnesi", errorText(new Error("imza tutmadı")), "imza tutmadı");

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

// Kasa açılamadı şeridinin saf mantığının node testi (LOM-23).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import {
  classifyOpenError,
  openErrorDetail,
  openErrorMessageKey,
  vaultLabel,
  recordOpenError,
  openErrorKey,
  type VaultOpenError,
} from "../vault/openError";

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

// ---- sınıflandırma ----
eq(
  "Windows: yol bulunamadı → missing",
  classifyOpenError(
    "failed to read directory at path: C:\\Users\\x\\Notlar with error: The system cannot find the path specified. (os error 3)",
  ),
  "missing",
);
eq("POSIX: dosya yok → missing", classifyOpenError("No such file or directory (os error 2)"), "missing");
eq("Windows: erişim reddedildi → permission", classifyOpenError("Access is denied. (os error 5)"), "permission");
eq("Tauri: yasak yol → permission", classifyOpenError("forbidden path: /Users/x/Notlar"), "permission");
eq("macOS: izin yok → permission", classifyOpenError("Operation not permitted (os error 1)"), "permission");
eq("tanınmayan metin → unknown", classifyOpenError("tuhaf bir şey"), "unknown");

// ---- ayrıntı metni ----
eq("Error nesnesinden mesaj", openErrorDetail(new Error("boom")), "boom");
eq("düz metin olduğu gibi", openErrorDetail("düz"), "düz");
eq("300 karakterle kırpılır", openErrorDetail("a".repeat(500)).length, 300);

// ---- mesaj anahtarı ----
eq("missing anahtarı", openErrorMessageKey("missing"), "errors.vaultMissing");
eq("permission anahtarı", openErrorMessageKey("permission"), "errors.vaultNoAccess");
eq("unknown anahtarı", openErrorMessageKey("unknown"), "errors.vaultOpenFailed");

// ---- kasa adı ----
eq("POSIX yolu", vaultLabel("/Users/x/Notlar"), "Notlar");
eq("Windows yolu, sonda ayraç", vaultLabel("C:\\Users\\x\\Notlar\\"), "Notlar");
eq("sonda eğik çizgi", vaultLabel("/a/b/"), "b");

// ---- tek şerit: aynı hata birikmez ----
const first: VaultOpenError = { path: "/v/Notlar", code: "missing", detail: "No such file (os error 2)" };
check("önceki yoksa yeni hata yazılır", recordOpenError(null, first) === first);
{
  // Kartın durumu: açılışta aynı kasa için art arda 6 başarısız deneme → hep aynı tek hata.
  let cur: VaultOpenError | null = null;
  for (let i = 0; i < 6; i++) {
    cur = recordOpenError(cur, { path: "/v/Notlar", code: "missing", detail: `deneme ${i}` });
  }
  const again = recordOpenError(cur, { path: "/v/Notlar", code: "missing", detail: "son" });
  check("6 tekrar sonrası aynı referans", again === cur);
  eq("ilk hatanın ayrıntısı korunur", cur?.detail, "deneme 0");
}
{
  const otherPath = { path: "/v/Baska", code: "missing" as const, detail: "x" };
  check("farklı kasa → yeni hata", recordOpenError(first, otherPath) === otherPath);
  const otherCode = { path: "/v/Notlar", code: "permission" as const, detail: "x" };
  check("farklı sebep → yeni hata", recordOpenError(first, otherCode) === otherCode);
}
eq("anahtar biçimi", openErrorKey(first), "missing:/v/Notlar");

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

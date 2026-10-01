// Kasa açılamadı şeridinin saf mantığının node testi (LOM-23).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import {
  classifyOpenError,
  openErrorDetail,
  openErrorMessageKey,
  vaultLabel,
  recordOpenError,
  openErrorKey,
  refineOpenErrorCode,
  decideRepick,
  shouldAutoRetry,
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

// ---- klasörün gerçek durumuna göre düzeltme (LOM-24) ----
{
  // Excalibur'da görülen: kasa klasörü silinmişken Windows "forbidden path" döndürüyor.
  const forbidden = classifyOpenError("forbidden path: C:\\Users\\x\\Notlar");
  eq("forbidden path + klasör yok → missing", refineOpenErrorCode(forbidden, "missing"), "missing");
  eq("forbidden path + klasör var → permission", refineOpenErrorCode(forbidden, "present"), "permission");
  eq("forbidden path + bakılamadı → permission", refineOpenErrorCode(forbidden, "unknown"), "permission");
  eq("tanınmayan hata + klasör yok → missing", refineOpenErrorCode("unknown", "missing"), "missing");
  eq("tanınmayan hata + klasör var → unknown", refineOpenErrorCode("unknown", "present"), "unknown");
  eq("missing her durumda missing", refineOpenErrorCode("missing", "present"), "missing");
}

// ---- onarımda klasör seçimi (LOM-25) ----
eq("seçim iptal → cancel", decideRepick("/a", null, ["/a"]), "cancel");
eq("aynı klasör → same", decideRepick("/a", "/a", ["/a", "/b"]), "same");
eq("başka kasanın klasörü → other-vault", decideRepick("/a", "/b", ["/a", "/b"]), "other-vault");
eq("yeni klasör → new", decideRepick("/a", "/c", ["/a", "/b"]), "new");
eq("Windows: büyük-küçük harf farkı aynı klasör", decideRepick("C:\\Notlar", "c:\\notlar", ["C:\\Notlar"]), "same");
eq("Windows: sondaki \\ aynı klasör", decideRepick("C:\\Notlar", "C:\\Notlar\\", ["C:\\Notlar"]), "same");
eq("Windows: başka kasa farklı harfle", decideRepick("C:\\A", "c:\\b\\", ["C:\\A", "C:\\B"]), "other-vault");
eq("Unix: büyük-küçük harf farklı klasör", decideRepick("/a/Notlar", "/a/notlar", ["/a/Notlar"]), "new");
// Odakla otomatik deneme yalnız açık kasanın kendisi için (LOM-25 inceleme, engel).
const errB = { path: "/v/B", code: "missing" as const, detail: "x" };
check("otomatik deneme: açık kasa A, hata B → denenmez", !shouldAutoRetry(errB, "/v/A"));
check("otomatik deneme: hata açık kasanın kendisi → denenir", shouldAutoRetry(errB, "/v/B"));
check("otomatik deneme: hata yok → denenmez", !shouldAutoRetry(null, "/v/B"));
check("otomatik deneme: açık kasa yok → denenmez", !shouldAutoRetry(errB, null));

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

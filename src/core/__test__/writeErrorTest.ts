// Kasaya yazma hatası sınıflandırma ve şerit durumunun node testi (LOM-20).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import { classifyWriteError, errorDetail, messageKeyFor, recordWriteError, writeErrorKey } from "../vault/writeError";

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
  "Windows erişim reddi (os error 5) → permission",
  classifyWriteError("failed to open file at path: C:/x/y.md.tmp with error: Access is denied. (os error 5)"),
  "permission"
);
eq("POSIX izin reddi (os error 13) → permission", classifyWriteError("Permission denied (os error 13)"), "permission");
eq("Tauri kapsam dışı yol → permission", classifyWriteError("forbidden path: /Users/x"), "permission");
eq("yalnız hata numarası 5 → permission", classifyWriteError("something odd (os error 5)"), "permission");
eq("disk dolu (os error 28) → diskFull", classifyWriteError("No space left on device (os error 28)"), "diskFull");
eq(
  "Windows disk dolu (os error 112) → diskFull",
  classifyWriteError("There is not enough space on the disk. (os error 112)"),
  "diskFull"
);
eq("dosya yok (os error 2) → missing", classifyWriteError("No such file or directory (os error 2)"), "missing");
eq(
  "yol yok (os error 3) → missing",
  classifyWriteError("The system cannot find the path specified. (os error 3)"),
  "missing"
);
eq("tanınmayan metin → unknown", classifyWriteError("tuhaf bir şey"), "unknown");
eq("os error 50 tek başına → unknown", classifyWriteError("x (os error 50)"), "unknown");

// ---- ayrıntı metni ----
eq("Error → message", errorDetail(new Error("boom")), "boom");
eq("string olduğu gibi", errorDetail("düz metin"), "düz metin");
{
  const long = errorDetail("a".repeat(500));
  check("300 karakterde kırpılır", long.length === 301 && long.endsWith("…"), `uzunluk ${long.length}`);
}

// ---- anahtar eşlemesi ----
eq("permission anahtarı", messageKeyFor("permission"), "errors.writePermission");
eq("diskFull anahtarı", messageKeyFor("diskFull"), "errors.writeDiskFull");
eq("missing anahtarı", messageKeyFor("missing"), "errors.writeMissing");
eq("unknown → null", messageKeyFor("unknown"), null);

// ---- durum takibi ----
{
  const a = recordWriteError(null, { code: "permission", detail: "d1", kind: "note", path: "a.md" }, 100);
  eq("ilk hata sayaç 1", a.count, 1);
  eq("ilk hata kapatılmamış", a.dismissed, false);
  eq("ilk hata zamanları", [a.firstAt, a.lastAt], [100, 100]);

  const b = recordWriteError({ ...a, dismissed: true }, { code: "permission", detail: "d2", kind: "draw", path: "b.excalidraw" }, 200);
  eq("aynı tür ikinci hata sayaç 2", b.count, 2);
  eq("kapatılmışlık korunur", b.dismissed, true);
  eq("firstAt sabit, lastAt güncel", [b.firstAt, b.lastAt], [100, 200]);
  eq("ayrıntı/tür/yol güncel", [b.detail, b.kind, b.path], ["d2", "draw", "b.excalidraw"]);

  const c = recordWriteError(b, { code: "diskFull", detail: "d3", kind: "note", path: "a.md" }, 300);
  eq("farklı tür sayaç 1", c.count, 1);
  eq("farklı tür şeridi yeniden açar", c.dismissed, false);
  eq("farklı tür yeni zaman", [c.firstAt, c.lastAt], [300, 300]);
}

// ---- yeni hata anahtarı (LOM-21): Ayrıntılar her yeni hatada kapalı açılsın ----
{
  const a = recordWriteError(null, { code: "permission", detail: "d1", kind: "note", path: "a.md" }, 100);
  eq("anahtar biçimi code:firstAt", writeErrorKey(a), "permission:100");
  const b = recordWriteError(a, { code: "permission", detail: "d2", kind: "note", path: "a.md" }, 200);
  eq("aynı tür sürerken anahtar değişmez", writeErrorKey(b), writeErrorKey(a));
  const c = recordWriteError(b, { code: "diskFull", detail: "d3", kind: "note", path: "a.md" }, 300);
  check("farklı tür anahtarı değiştirir", writeErrorKey(c) !== writeErrorKey(b));
  // clearWriteError durumu null yapar; sonraki hata null'dan başlar.
  const d = recordWriteError(null, { code: "permission", detail: "d4", kind: "note", path: "a.md" }, 400);
  check("temizlendikten sonra aynı tür yeni anahtar alır", writeErrorKey(d) !== writeErrorKey(a));
}

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

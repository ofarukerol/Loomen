// Google Takvim eşitleme durumu (LOM-117) — hata sınıflama ve sonuç kararı.
import { isGcalAuthError, gcalSyncStatus, shouldSkipOrphanDelete } from "../gcalSyncState";

let fails = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) fails++;
}
const eq = (name: string, a: unknown, b: unknown): void => check(name, JSON.stringify(a) === JSON.stringify(b));

check("invalid_grant (Rust refresh)", isGcalAuthError("invalid_grant: Bad Request"));
check("list 401", isGcalAuthError("Etkinlik listesi hatası: 401 Unauthorized"));
check("upsert 401", isGcalAuthError("Token has been expired (401 Unauthorized)"));
check("Error nesnesi", isGcalAuthError(new Error("invalid_grant")));
check("UNAUTHENTICATED", isGcalAuthError("status: UNAUTHENTICATED"));
check("Invalid Credentials küçük harf", isGcalAuthError("invalid credentials"));
check("unauthorized_client", isGcalAuthError("Unauthorized_Client"));
check("ağ hatası değil", !isGcalAuthError("Failed to fetch"));
check("403 rate limit değil", !isGcalAuthError("Rate Limit Exceeded (403 Forbidden)"));
check("500 değil", !isGcalAuthError("Internal error (500)"));
check("4010 değil", !isGcalAuthError("code 4010"));
check("status 401", isGcalAuthError("status 401"));
check("HTTP 401", isGcalAuthError("HTTP 401"));
check("(401)", isGcalAuthError("failed (401)"));
check("item 401 not found değil", !isGcalAuthError("item 401 not found"));
check("görev #401 değil", !isGcalAuthError("Task 401 failed"));
check("null değil", !isGcalAuthError(null));
check("undefined değil", !isGcalAuthError(undefined));

eq("hepsi tamam", gcalSyncStatus({ pushTotal: 3, pushFailed: 0, firstPushError: null, pullError: null }), { code: "synced" });
eq("pull hatası", gcalSyncStatus({ pushTotal: 3, pushFailed: 0, firstPushError: null, pullError: "boom (500)" }), {
  code: "partial",
  detail: "boom (500)",
});
eq("push kısmi", gcalSyncStatus({ pushTotal: 3, pushFailed: 1, firstPushError: "x (500)", pullError: null }), {
  code: "partial",
  detail: "x (500)",
});
eq("yetki hatası kısmiyi ezer", gcalSyncStatus({ pushTotal: 3, pushFailed: 2, firstPushError: "x (500)", pullError: "401 Unauthorized" }), {
  code: "authExpired",
});
eq("push yetki hatası", gcalSyncStatus({ pushTotal: 1, pushFailed: 1, firstPushError: "invalid_grant", pullError: null }), {
  code: "authExpired",
});

check("boş istek + dolu eşleme → silme atla", shouldSkipOrphanDelete(0, 5));
check("boş + boş → atlamaya gerek yok", !shouldSkipOrphanDelete(0, 0));
check("istek var → normal sil", !shouldSkipOrphanDelete(3, 5));

if (fails) {
  console.error(`${fails} başarısız`);
  process.exit(1);
}
console.log("gcalSyncStateTest: hepsi geçti");

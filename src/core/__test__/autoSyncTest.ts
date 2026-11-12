// Otomatik senkron karar testleri (LOM-105): ne zaman senkron başlar, şerit ne zaman çıkar.
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import {
  AUTO_SYNC_INTERVAL_MS,
  MIN_GAP_MS,
  STALE_AFTER_MS,
  CHECK_EVERY_MS,
  shouldSyncNow,
  syncHealth,
  parseSyncTime,
  type SyncReason,
} from "../sync/autoSync";

let fails = 0;
let ran = 0;
function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const NOW = 1_800_000_000_000;
const go = (reason: SyncReason, lastAttemptAt: number | null, extra: { enabled?: boolean; syncing?: boolean; now?: number } = {}) =>
  shouldSyncNow({ enabled: extra.enabled ?? true, syncing: extra.syncing ?? false, reason, lastAttemptAt, now: extra.now ?? NOW });

// Sabitler
check("aralık 3 dakika", AUTO_SYNC_INTERVAL_MS === 180_000);
check("öne gelme eşiği 30 sn", MIN_GAP_MS === 30_000);
check("eskime eşiği 15 dk", STALE_AFTER_MS === 900_000);
check("kontrol aralığı 30 sn ve 3 dakikadan kısa", CHECK_EVERY_MS === 30_000 && CHECK_EVERY_MS < AUTO_SYNC_INTERVAL_MS);

// K1: açılışta hemen
check("start: hiç deneme yokken senkron", go("start", null));
check("start: az önce deneme olsa da senkron", go("start", NOW - 1000));

// Kapalı ya da sürüyorsa hiçbir neden tetiklemez (K5)
for (const r of ["start", "foreground", "tick", "background", "online"] as SyncReason[]) {
  check(`${r}: otomatik senkron kapalıyken yok`, !go(r, null, { enabled: false }));
  check(`${r}: senkron sürerken ikinci yok`, !go(r, NOW - 10 * AUTO_SYNC_INTERVAL_MS, { syncing: true }));
}

// K2: öne gelme / ağ / arka plan — 30 sn eşiği
for (const r of ["foreground", "online", "background"] as SyncReason[]) {
  check(`${r}: deneme yoksa senkron`, go(r, null));
  check(`${r}: 29 sn önce denendiyse yok`, !go(r, NOW - (MIN_GAP_MS - 1000)));
  check(`${r}: tam 30 sn sonra senkron`, go(r, NOW - MIN_GAP_MS));
  check(`${r}: 5 dk sonra senkron`, go(r, NOW - 5 * 60_000));
}

// K3: sayaç turu — 3 dk eşiği; donmuş sayaç uyanınca ilk turda yakalar
check("tick: deneme yoksa senkron", go("tick", null));
check("tick: 2 dk 59 sn sonra yok", !go("tick", NOW - (AUTO_SYNC_INTERVAL_MS - 1000)));
check("tick: tam 3 dk sonra senkron", go("tick", NOW - AUTO_SYNC_INTERVAL_MS));
check("tick: iki gün donmuş sayaç ilk turda senkron", go("tick", NOW - 2 * 24 * 3600_000));
check("tick: 1 dk sonra yok (öne gelme eşiği sayaca uygulanmaz)", !go("tick", NOW - 60_000));

// Saat geri alınmışsa
check("saat geri alındı (tick): senkron", go("tick", NOW + 3600_000));
check("saat geri alındı (foreground): senkron", go("foreground", NOW + 1000));

// syncHealth
const h = (o: Partial<{ enabled: boolean; syncing: boolean; lastSuccessAt: number | null; failed: boolean; now: number }>) =>
  syncHealth({ enabled: true, syncing: false, lastSuccessAt: NOW - 60_000, failed: false, now: NOW, ...o });
check("health: yeni senkron → ok", h({}) === "ok");
check("health: kapalıyken eski bile olsa ok", h({ enabled: false, lastSuccessAt: null, failed: true }) === "ok");
check("health: senkron sürerken ok", h({ syncing: true, failed: true, lastSuccessAt: null }) === "ok");
check("health: son deneme hata → error", h({ failed: true }) === "error");
check("health: hata eskimeden önce gelir", h({ failed: true, lastSuccessAt: null }) === "error");
check("health: hiç senkron yok → stale", h({ lastSuccessAt: null }) === "stale");
check("health: tam 15 dk → ok", h({ lastSuccessAt: NOW - STALE_AFTER_MS }) === "ok");
check("health: 15 dk + 1 sn → stale", h({ lastSuccessAt: NOW - STALE_AFTER_MS - 1000 }) === "stale");
check("health: iki gün → stale", h({ lastSuccessAt: NOW - 2 * 24 * 3600_000 }) === "stale");

// parseSyncTime
check("parse: ISO", parseSyncTime("2026-11-12T10:00:00.000Z") === Date.parse("2026-11-12T10:00:00.000Z"));
check("parse: null", parseSyncTime(null) === null);
check("parse: bozuk", parseSyncTime("dün") === null);

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

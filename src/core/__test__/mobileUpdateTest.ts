// Mobil güncelleme uyarısı mantığının node testi (LOM-32) — sürüm karşılaştırma, günlük kontrol, erteleme.
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import {
  STORE_URLS,
  CHECK_INTERVAL_MS,
  SNOOZE_MS,
  PREFS_KEY,
  EMPTY_PREFS,
  parseVersion,
  compareVersions,
  latestVersionFor,
  storeUrlFor,
  shouldCheck,
  markChecked,
  isUpdateAvailable,
  isSnoozed,
  shouldShowBanner,
  snooze,
  loadPrefs,
  savePrefs,
  type UpdatePrefs,
} from "../update/mobileUpdate";

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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

// ---- parseVersion ----
eq("parseVersion baştaki v'yi atar", parseVersion("v0.1.2"), [0, 1, 2]);
eq("parseVersion -beta ekini yok sayar", parseVersion("1.0.0-beta"), [1, 0, 0]);
eq("parseVersion +build ekini yok sayar", parseVersion("1.2.3+45"), [1, 2, 3]);
eq("parseVersion harfli metinde null", parseVersion("abc"), null);
eq("parseVersion yalnız v null", parseVersion("v"), null);
eq("parseVersion büyük V ve boşluk", parseVersion(" V1.0 "), [1, 0]);
eq("parseVersion çift nokta null", parseVersion("1..2"), null);
eq("parseVersion boş metinde null", parseVersion(""), null);
eq("parseVersion metin olmayanda null", parseVersion(5), null);

// ---- compareVersions ----
eq("0.1.0 < 0.1.1", compareVersions("0.1.0", "0.1.1"), -1);
eq("0.1.1 > 0.1.0", compareVersions("0.1.1", "0.1.0"), 1);
eq("0.1.0 == 0.1.0", compareVersions("0.1.0", "0.1.0"), 0);
eq("eksik parça 0 sayılır: 0.1 == 0.1.0", compareVersions("0.1", "0.1.0"), 0);
eq("sayısal karşılaştırma: 0.2.0 < 0.10.0", compareVersions("0.2.0", "0.10.0"), -1);
eq("1.0.0-beta == 1.0.0", compareVersions("1.0.0-beta", "1.0.0"), 0);
eq("bozuk metin eşit sayılır", compareVersions("abc", "0.1.0"), 0);
eq("bozuk metin eşit sayılır (ters)", compareVersions("0.1.0", "x.y"), 0);

// ---- latestVersionFor ----
eq(
  "platform girdisi ortak version'ı ezer",
  latestVersionFor("android", { version: "0.1.0", android: { version: "0.2.0" } }),
  "0.2.0"
);
eq("yalnız ortak version varsa o", latestVersionFor("ios", { version: "0.3.0" }), "0.3.0");
eq("diğer platformun girdisi karışmaz", latestVersionFor("ios", { android: { version: "0.2.0" } }), null);
eq("yalnız versionCode varsa null", latestVersionFor("android", { android: { versionCode: 1001 } }), null);
eq("bozuk platform sürümü ortak sürüme düşmez", latestVersionFor("ios", { ios: { version: "x" }, version: "0.4.0" }), null);
eq("platform girdisinde version yoksa ortak sürüm", latestVersionFor("ios", { ios: { url: "https://a.b" }, version: "0.4.0" }), "0.4.0");
eq("boşluklu sürüm kırpılır", latestVersionFor("android", { android: { version: " 0.2.0 " } }), "0.2.0");
eq("sayı tipindeki sürüm null", latestVersionFor("android", { android: { version: 2 } }), null);
eq("null girdi null", latestVersionFor("android", null), null);
eq("metin girdi null", latestVersionFor("android", "0.2.0"), null);
eq("dizi girdi null", latestVersionFor("android", ["0.2.0"]), null);

// ---- storeUrlFor ----
eq("varsayılan Play adresi", storeUrlFor("android"), "https://play.google.com/store/apps/details?id=org.loomen.notes");
eq("varsayılan App Store adresi", storeUrlFor("ios"), "https://apps.apple.com/app/id6821169163");
eq("STORE_URLS ile aynı", storeUrlFor("ios", {}), STORE_URLS.ios);
eq(
  "https url ezer",
  storeUrlFor("android", { android: { url: "https://play.google.com/store/apps/details?id=x" } }),
  "https://play.google.com/store/apps/details?id=x"
);
eq("http url ezmez", storeUrlFor("android", { android: { url: "http://evil.example" } }), STORE_URLS.android);
eq("sunucusuz https:// ezmez", storeUrlFor("android", { android: { url: "https://" } }), STORE_URLS.android);
eq("metin olmayan url ezmez", storeUrlFor("ios", { ios: { url: 42 } }), STORE_URLS.ios);
eq("boş url ezmez",storeUrlFor("ios", { ios: { url: "" } }), STORE_URLS.ios);
eq("bozuk dosya varsayılana düşer", storeUrlFor("ios", "çöp"), STORE_URLS.ios);

// ---- shouldCheck / markChecked ----
check("hiç kontrol yoksa kontrol et", shouldCheck(EMPTY_PREFS, NOW));
check("23 saat sonra kontrol yok", !shouldCheck({ ...EMPTY_PREFS, lastCheckAt: NOW - 23 * HOUR }, NOW));
check("25 saat sonra kontrol", shouldCheck({ ...EMPTY_PREFS, lastCheckAt: NOW - 25 * HOUR }, NOW));
check("tam 24 saatte kontrol", shouldCheck({ ...EMPTY_PREFS, lastCheckAt: NOW - CHECK_INTERVAL_MS }, NOW));
check("gelecekteki lastCheckAt (saat geri alınmış) → kontrol", shouldCheck({ ...EMPTY_PREFS, lastCheckAt: NOW + HOUR }, NOW));
{
  const base: UpdatePrefs = { lastCheckAt: null, snoozedVersion: "0.2.0", snoozedUntil: NOW + DAY };
  const after = markChecked(base, NOW);
  eq("markChecked zamanı yazar", after.lastCheckAt, NOW);
  eq("markChecked ertelemeyi korur", [after.snoozedVersion, after.snoozedUntil], ["0.2.0", NOW + DAY]);
  eq("markChecked girdiyi değiştirmez", base.lastCheckAt, null);
  check("markChecked sonrası aynı gün kontrol yok", !shouldCheck(after, NOW + HOUR));
}

// ---- isUpdateAvailable ----
check("yeni sürüm var", isUpdateAvailable("0.1.0", "0.1.1"));
check("aynı sürümde yok", !isUpdateAvailable("0.1.0", "0.1.0"));
check("latest null ise yok", !isUpdateAvailable("0.1.0", null));
check("bozuk kurulu sürümde yok", !isUpdateAvailable("dev", "9.9.9"));

// ---- shouldShowBanner ----
check("eski sürüm → şerit", shouldShowBanner({ current: "0.1.0", latest: "0.2.0", prefs: EMPTY_PREFS, now: NOW }));
check("aynı sürüm → şerit yok", !shouldShowBanner({ current: "0.2.0", latest: "0.2.0", prefs: EMPTY_PREFS, now: NOW }));
check("daha yeni kurulu → şerit yok", !shouldShowBanner({ current: "0.3.0", latest: "0.2.0", prefs: EMPTY_PREFS, now: NOW }));
check("latest null → şerit yok", !shouldShowBanner({ current: "0.1.0", latest: null, prefs: EMPTY_PREFS, now: NOW }));
{
  const snoozed = snooze(EMPTY_PREFS, "0.2.0", NOW);
  check(
    "aynı sürüm 3 gün içinde ertelenmiş → şerit yok",
    !shouldShowBanner({ current: "0.1.0", latest: "0.2.0", prefs: snoozed, now: NOW + 2 * DAY })
  );
  check(
    "başka sürüm ertelenmiş → şerit",
    shouldShowBanner({ current: "0.1.0", latest: "0.3.0", prefs: snoozed, now: NOW + DAY })
  );
  check("erteleme bitişinden hemen önce gizli", isSnoozed(snoozed, "0.2.0", NOW + SNOOZE_MS - 1));
  check("bitişi boş erteleme geçersiz", !isSnoozed({ ...snoozed, snoozedUntil: null }, "0.2.0", NOW));
  check("bozuk kurulu sürüm → şerit yok", !shouldShowBanner({ current: "dev", latest: "0.2.0", prefs: EMPTY_PREFS, now: NOW }));
  check(
    "erteleme süresi dolmuş → şerit",
    shouldShowBanner({ current: "0.1.0", latest: "0.2.0", prefs: snoozed, now: NOW + SNOOZE_MS })
  );
}

// ---- snooze ----
{
  const s = snooze({ ...EMPTY_PREFS, lastCheckAt: NOW - HOUR }, "0.2.0", NOW);
  eq("snooze bitişi now + 3 gün", s.snoozedUntil, NOW + 3 * DAY);
  eq("snooze sürümü yazar", s.snoozedVersion, "0.2.0");
  eq("snooze lastCheckAt'i korur", s.lastCheckAt, NOW - HOUR);
}

// ---- loadPrefs / savePrefs ----
function memStorage(initial: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    raw: m,
  };
}

eq("boş depoda EMPTY_PREFS", loadPrefs(memStorage()), EMPTY_PREFS);
eq("bozuk JSON → EMPTY_PREFS", loadPrefs(memStorage({ [PREFS_KEY]: "{bozuk" })), EMPTY_PREFS);
eq("JSON dizi → EMPTY_PREFS", loadPrefs(memStorage({ [PREFS_KEY]: "[1,2]" })), EMPTY_PREFS);
eq(
  "eksik alan null olur",
  loadPrefs(memStorage({ [PREFS_KEY]: JSON.stringify({ lastCheckAt: NOW }) })),
  { lastCheckAt: NOW, snoozedVersion: null, snoozedUntil: null }
);
eq(
  "yanlış tipte alan null olur",
  loadPrefs(memStorage({ [PREFS_KEY]: JSON.stringify({ lastCheckAt: "dün", snoozedVersion: 3, snoozedUntil: null }) })),
  EMPTY_PREFS
);
{
  const throwing = {
    getItem: (): string | null => {
      throw new Error("kapalı");
    },
  };
  eq("getItem hata atarsa EMPTY_PREFS", loadPrefs(throwing), EMPTY_PREFS);
  let threw = false;
  try {
    savePrefs({ setItem: () => { throw new Error("dolu"); } }, EMPTY_PREFS);
  } catch {
    threw = true;
  }
  check("setItem hata atarsa savePrefs sessiz", !threw);
}
{
  const st = memStorage();
  const prefs: UpdatePrefs = { lastCheckAt: NOW, snoozedVersion: "0.2.0", snoozedUntil: NOW + SNOOZE_MS };
  savePrefs(st, prefs);
  check("savePrefs PREFS_KEY anahtarına yazar", st.raw.has(PREFS_KEY));
  eq("save/load gidiş-dönüş", loadPrefs(st), prefs);
}
{
  const p = loadPrefs(memStorage());
  p.lastCheckAt = 1;
  eq("loadPrefs EMPTY_PREFS'in kopyasını döner", EMPTY_PREFS.lastCheckAt, null);
}

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

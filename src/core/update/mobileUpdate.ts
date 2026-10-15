// Mobil güncelleme uyarısı (LOM-32) — saf mantık; React, Tauri ve i18n'e bağlı değil, node testinde koşar.
//
// Açılışta en fazla günde bir kez loomen.org/surum.json (Rust'tan) okunur, telefondaki sürümle
// karşılaştırılır; mağazada daha yeni sürüm varsa küçük bir şerit çıkar. "Sonra" aynı sürümü 3 gün
// gizler. Ağ yoksa ya da dosya bozuksa hiçbir şey gösterilmez: bu modüldeki her fonksiyon bozuk
// girdide "gösterme" yönüne düşer.
//
// surum.json biçimi: { "android": { "version": "0.1.1", "url"?: "..." }, "ios": { ... }, "version"?: "..." }
// Semver metni kullanılır çünkü uygulama kendi sürümünü yalnız tauri.conf.json'daki 0.1.0 biçiminde
// bilir; versionCode alanı gelirse yok sayılır.

export type MobilePlatform = "android" | "ios";

export const STORE_URLS: Record<MobilePlatform, string> = {
  android: "https://play.google.com/store/apps/details?id=org.loomen.notes",
  ios: "https://apps.apple.com/app/id6821169163",
};

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

/** Tercihler useAppStore'a değil kendi localStorage anahtarına yazılır. */
export const PREFS_KEY = "loomen.update";

export interface UpdatePrefs {
  lastCheckAt: number | null;
  snoozedVersion: string | null;
  snoozedUntil: number | null;
}

export const EMPTY_PREFS: UpdatePrefs = { lastCheckAt: null, snoozedVersion: null, snoozedUntil: null };

/**
 * "v0.1.2" → [0, 1, 2]. Baştaki "v" ve "-beta" / "+build" gibi ekler yok sayılır; mağaza sürümleri
 * yalnız sayısal parçalarla karşılaştırılır. Sayı olmayan parça varsa null — yanlış şerit çıkmasın.
 */
export function parseVersion(v: unknown): number[] | null {
  if (typeof v !== "string") return null;
  const core = v.trim().replace(/^v/i, "").split(/[-+]/)[0];
  if (!core) return null;
  const parts = core.split(".");
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    nums.push(Number(p));
  }
  return nums;
}

/**
 * -1 / 0 / 1. Eksik parça 0 sayılır ("0.1" == "0.1.0"); parçalar sayısal karşılaştırılır
 * ("0.2.0" < "0.10.0"). İkisinden biri okunamazsa 0 (eşit) — bozuk metin şerit açtırmasın.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Sürüm dosyasından bu platformun en son sürümü. Platforma özel girdi ortak "version"ı ezer
 * (bir mağaza diğerinden geç onaylayabilir). Platform girdisinde version yazılı ama bozuksa ortak
 * sürüme düşülmez — o mağaza henüz onaylamamış olabilir. Okunabilir sürüm yoksa null.
 */
export function latestVersionFor(platform: MobilePlatform, file: unknown): string | null {
  if (!isRecord(file)) return null;
  const own = file[platform];
  const c = isRecord(own) && own.version !== undefined ? own.version : file.version;
  return typeof c === "string" && parseVersion(c) ? c.trim() : null;
}

/**
 * "Güncelle"nin açacağı adres. Dosyada https ile başlayan url varsa o (mağaza adresi değişirse
 * uygulama sürümü beklemeden düzeltilebilsin); yoksa sabit mağaza sayfası. http ya da boş url
 * yok sayılır.
 */
export function storeUrlFor(platform: MobilePlatform, file?: unknown): string {
  if (isRecord(file)) {
    const own = file[platform];
    if (isRecord(own) && typeof own.url === "string" && /^https:\/\/[^/\s]+/.test(own.url)) return own.url;
  }
  return STORE_URLS[platform];
}

/**
 * Günde en fazla bir kontrol. Saat geri alındıysa (lastCheckAt gelecekte) kontrol yeniden açılır;
 * yoksa kullanıcı saat düzelene kadar hiç uyarı görmezdi.
 */
export function shouldCheck(prefs: UpdatePrefs, now: number): boolean {
  if (prefs.lastCheckAt === null) return true;
  if (prefs.lastCheckAt > now) return true;
  return now - prefs.lastCheckAt >= CHECK_INTERVAL_MS;
}

/** Kontrol başlamadan yazılır: ağ hatası da bir deneme sayılır, sunucu dövülmez. */
export function markChecked(prefs: UpdatePrefs, now: number): UpdatePrefs {
  return { ...prefs, lastCheckAt: now };
}

/** Uzaktaki sürüm kuruludan kesinlikle yeniyse true; okunamayan sürümde false. */
export function isUpdateAvailable(current: string, latest: string | null): boolean {
  if (!latest || !parseVersion(latest) || !parseVersion(current)) return false;
  return compareVersions(latest, current) > 0;
}

/** Erteleme yalnız ertelenen sürüm için geçerli; daha yeni bir sürüm çıkarsa şerit yeniden görünür. */
export function isSnoozed(prefs: UpdatePrefs, version: string, now: number): boolean {
  return prefs.snoozedVersion === version && prefs.snoozedUntil !== null && now < prefs.snoozedUntil;
}

export function shouldShowBanner(args: {
  current: string;
  latest: string | null;
  prefs: UpdatePrefs;
  now: number;
}): boolean {
  const { current, latest, prefs, now } = args;
  if (!latest) return false;
  return isUpdateAvailable(current, latest) && !isSnoozed(prefs, latest, now);
}

/** "Sonra" (ve "Güncelle") aynı sürümü 3 gün gizler. */
export function snooze(prefs: UpdatePrefs, version: string, now: number): UpdatePrefs {
  return { ...prefs, snoozedVersion: version, snoozedUntil: now + SNOOZE_MS };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Bozuk JSON ya da eksik/yanlış tipte alan çökertmez; o alan boş sayılır. */
export function loadPrefs(storage: { getItem(key: string): string | null }): UpdatePrefs {
  let raw: unknown;
  try {
    const text = storage.getItem(PREFS_KEY);
    if (!text) return { ...EMPTY_PREFS };
    raw = JSON.parse(text);
  } catch {
    return { ...EMPTY_PREFS };
  }
  if (!isRecord(raw)) return { ...EMPTY_PREFS };
  return {
    lastCheckAt: numOrNull(raw.lastCheckAt),
    snoozedVersion: typeof raw.snoozedVersion === "string" ? raw.snoozedVersion : null,
    snoozedUntil: numOrNull(raw.snoozedUntil),
  };
}

/** Depo dolu ya da kapalıysa sessiz geçilir; en kötü durumda kontrol ertesi açılışta tekrarlanır. */
export function savePrefs(storage: { setItem(key: string, value: string): void }, prefs: UpdatePrefs): void {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // sessiz
  }
}

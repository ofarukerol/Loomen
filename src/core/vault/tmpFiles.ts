/**
 * Atomik yazmanın yan dosya adı ve artık yan dosyaların tanınması (LOM-8, LOM-18).
 *
 * Kalıp: `<hedef dosya>.<zaman36><sıra36>.tmp` — zaman `Date.now()`'ın 36 tabanlı hali
 * (2059'a kadar 8 hane), sıra oturum içi sayaç. Ör. `Not.md.mfz3k2a80.tmp`.
 * Yazma bitince yan dosya rename ile yerine konur; çökme/güç kesintisinde geride kalır.
 * Açılışta yalnız BU kalıba uyan ve belirli yaştan eski dosyalar silinir: kullanıcının
 * kendi `.tmp` dosyalarına dokunulmaz.
 */

/** Zaman damgasının 36 tabanlı hane sayısı (Date.now() 2059'a kadar 8 hane). */
const TIME_DIGITS = 8;

/** Bundan eski yan dosyalar artık sayılır: tek yazma milisaniyeler sürer. */
export const STALE_TMP_AGE_MS = 60 * 60 * 1000;

/** Makul zaman aralığı alt sınırı (2024-01-01): rastgele eşleşmeleri eler. */
const MIN_TIME = Date.UTC(2024, 0, 1);

const TMP_RE = /^.+\.([0-9a-z]{9,})\.tmp$/;

/** Bir yazmaya özel yan dosya adı. */
export function tmpNameFor(target: string, now: number, seq: number): string {
  return `${target}.${now.toString(36)}${seq.toString(36)}.tmp`;
}

/** Dosya adı yan dosya kalıbına uyuyorsa üretildiği an (ms), yoksa null. */
export function tmpCreatedAt(name: string): number | null {
  const m = TMP_RE.exec(name);
  if (!m) return null;
  const t = parseInt(m[1].slice(0, TIME_DIGITS), 36);
  return Number.isFinite(t) && t >= MIN_TIME ? t : null;
}

/** Kalıba uyan ve `maxAgeMs`'den eski (artık) yan dosya mı? */
export function isStaleTmpName(name: string, now: number, maxAgeMs = STALE_TMP_AGE_MS): boolean {
  const t = tmpCreatedAt(name);
  return t !== null && t <= now - maxAgeMs;
}

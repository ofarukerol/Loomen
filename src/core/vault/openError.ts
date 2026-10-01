// Kasa açılamadı hatasının saf mantığı (LOM-23). React/i18n/Tauri/store içermez; node testinde koşar.
//
// Açılışta aynı kasa için reopenVault birden çok kez çağrılır (persist geri yüklemesi + bootstrap).
// Eskiden her başarısız denemede yeni bir yerel pencere açılıyor, pencereler üst üste birikiyordu.
// Artık hata store'da tek durum olarak tutulur; aynı hata tekrar gelince durum değişmez.

export type OpenErrorCode = "missing" | "permission" | "unknown";

/** Kasa klasörünün diskteki durumu (çekirdekteki vault_path_state cevabı). */
export type VaultPathState = "missing" | "present" | "unknown";

export interface VaultOpenError {
  path: string;
  code: OpenErrorCode;
  detail: string;
}

const MISSING = ["no such file", "cannot find the file", "cannot find the path", "not found"];
const PERMISSION = ["permission denied", "access is denied", "forbidden path", "not allowed", "operation not permitted"];
const MISSING_OS = new Set([2, 3]);
const PERMISSION_OS = new Set([1, 5, 13]);

/** Ham hata metninden sebebi çıkarır: klasör yok, izin yok ya da bilinmiyor. */
export function classifyOpenError(raw: string): OpenErrorCode {
  const s = raw.toLowerCase();
  const os = /\(os error (\d+)\)/.exec(s);
  const n = os ? Number(os[1]) : null;
  if ((n !== null && MISSING_OS.has(n)) || MISSING.some((m) => s.includes(m))) return "missing";
  if ((n !== null && PERMISSION_OS.has(n)) || PERMISSION.some((m) => s.includes(m))) return "permission";
  return "unknown";
}

/**
 * Klasörün gerçek durumuna göre sebebi düzeltir (LOM-24). Windows silinmiş/taşınmış klasöre de
 * "forbidden path" diyor; metne bakınca izin sorunu sanılıyordu. Klasör yoksa sebep "missing";
 * klasör yerindeyse ya da bakılamadıysa ilk sınıflandırma korunur.
 */
export function refineOpenErrorCode(code: OpenErrorCode, state: VaultPathState): OpenErrorCode {
  return state === "missing" ? "missing" : code;
}

/** Hatanın ham metni; "Ayrıntılar" altında gösterilir, 300 karakterle sınırlı. */
export function openErrorDetail(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  return s.length > 300 ? s.slice(0, 300) : s;
}

export function openErrorMessageKey(code: OpenErrorCode): string {
  if (code === "missing") return "errors.vaultMissing";
  if (code === "permission") return "errors.vaultNoAccess";
  return "errors.vaultOpenFailed";
}

/** Yolun son parçası (Windows ve POSIX ayraçları); boşsa yolun kendisi. */
export function vaultLabel(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

/** Aynı kasa ve aynı sebep tekrar gelirse önceki nesneyi AYNI referansla döndürür (yeni bildirim yok). */
export function recordOpenError(prev: VaultOpenError | null, next: VaultOpenError): VaultOpenError {
  if (prev && prev.path === next.path && prev.code === next.code) return prev;
  return next;
}

export function openErrorKey(e: VaultOpenError): string {
  return `${e.code}:${e.path}`;
}

/** Onarım için seçilen klasörün ne yapılacağı: iptal, aynı klasör, başka kasanın klasörü ya da yeni klasör (LOM-25). */
export type RepickDecision = "cancel" | "same" | "other-vault" | "new";

/** Windows yolunu (sürücü harfi ya da \\sunucu) karşılaştırma için sadeleştirir: büyük-küçük harf, / ve sondaki ayraç. */
export function normalizeVaultPath(p: string): string {
  if (!/^([A-Za-z]:|\\\\|\/\/)/.test(p)) return p;
  const s = p.replace(/\//g, "\\").replace(/\\+$/, "");
  return s.toLowerCase();
}

/**
 * "Klasörü yeniden seç" sonrası seçime karar verir. Aynı klasör sessizce çıkılmaz: izin düşünce
 * düzeltme tam olarak aynı klasörü yeniden seçmektir. Başka bir kasanın klasörü uyarı gerektirir.
 * Windows yolları karşılaştırmadan önce sadeleştirilir (büyük-küçük harf, sondaki \).
 */
export function decideRepick(failedPath: string, picked: string | null, vaultPaths: string[]): RepickDecision {
  if (!picked) return "cancel";
  const n = normalizeVaultPath(picked);
  if (n === normalizeVaultPath(failedPath)) return "same";
  if (vaultPaths.some((v) => normalizeVaultPath(v) === n)) return "other-vault";
  return "new";
}

/**
 * Odağa dönünce kendiliğinden yeniden denemek yalnız açık kasanın kendisi açılamadıysa güvenlidir.
 * Açık olmayan bir kasayı denemek habersiz kasa değiştirir ve taslak yazılamazsa uyarı döngüsü açar;
 * o yalnız düğmeyle denenir.
 */
export function shouldAutoRetry(err: VaultOpenError | null, activeVaultPath: string | null): boolean {
  return err !== null && err.path === activeVaultPath;
}

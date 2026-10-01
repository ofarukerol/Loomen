// Kasa açılamadı hatasının saf mantığı (LOM-23). React/i18n/Tauri/store içermez; node testinde koşar.
//
// Açılışta aynı kasa için reopenVault birden çok kez çağrılır (persist geri yüklemesi + bootstrap).
// Eskiden her başarısız denemede yeni bir yerel pencere açılıyor, pencereler üst üste birikiyordu.
// Artık hata store'da tek durum olarak tutulur; aynı hata tekrar gelince durum değişmez.

export type OpenErrorCode = "missing" | "permission" | "unknown";

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

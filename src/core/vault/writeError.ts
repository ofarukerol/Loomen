// Kasaya yazma hatalarının sınıflandırılması ve "aynı hata sürüyor mu" takibi (LOM-20).
//
// Otomatik kayıt (not, taslak, çizim) başarısız olunca her denemede yeni bir hata penceresi
// açmak yerine tek bir sabit uyarı şeridi gösterilir. Bu modül saftır: React, i18n ya da
// Tauri import etmez — node testinde koşar (bkz __test__/writeErrorTest.ts).

export type WriteErrorCode = "permission" | "diskFull" | "missing" | "unknown";

const PERMISSION_TEXT = ["permission denied", "access is denied", "forbidden path", "not allowed"];
const DISK_FULL_TEXT = ["no space left", "not enough space"];
const MISSING_TEXT = ["no such file", "cannot find the file", "cannot find the path"];

// İşletim sistemi hata numaraları: Windows 5 = ERROR_ACCESS_DENIED, POSIX 13 = EACCES;
// 28 = ENOSPC, Windows 112 = ERROR_DISK_FULL; 2 = ENOENT / FILE_NOT_FOUND, 3 = PATH_NOT_FOUND.
const PERMISSION_OS = [5, 13];
const DISK_FULL_OS = [28, 112];
const MISSING_OS = [2, 3];

/** Ham hata metnini (Rust/plugin-fs'ten gelen) kullanıcıya anlatılabilir bir türe indirger. */
export function classifyWriteError(raw: string): WriteErrorCode {
  const text = raw.toLowerCase();
  const m = /\(os error (\d+)\)/.exec(text);
  const os = m ? Number(m[1]) : null;
  const has = (list: string[]) => list.some((s) => text.includes(s));
  if (has(PERMISSION_TEXT) || (os !== null && PERMISSION_OS.includes(os))) return "permission";
  if (has(DISK_FULL_TEXT) || (os !== null && DISK_FULL_OS.includes(os))) return "diskFull";
  if (has(MISSING_TEXT) || (os !== null && MISSING_OS.includes(os))) return "missing";
  return "unknown";
}

const DETAIL_MAX = 300;

/** Yakalanan hatanın ham (teknik) metni; çok uzunsa kırpılır. */
export function errorDetail(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  return s.length > DETAIL_MAX ? s.slice(0, DETAIL_MAX) + "…" : s;
}

/** Türe göre sade metnin çeviri anahtarı. `unknown` → null (çağıran genel metni seçer). */
export function messageKeyFor(code: WriteErrorCode): string | null {
  switch (code) {
    case "permission":
      return "errors.writePermission";
    case "diskFull":
      return "errors.writeDiskFull";
    case "missing":
      return "errors.writeMissing";
    default:
      return null;
  }
}

export type WriteErrorKind = "note" | "draw";

export interface WriteErrorState {
  code: WriteErrorCode;
  detail: string;
  kind: WriteErrorKind;
  path: string;
  /** Aynı hata sürerken kaç yazma denemesi başarısız oldu. */
  count: number;
  firstAt: number;
  lastAt: number;
  /** Kullanıcı şeridi kapattı: aynı hata sürerken yeniden gösterilmez. */
  dismissed: boolean;
}

/**
 * Yeni bir başarısız yazmayı işler. Farklı türde bir hata yeni bir durum başlatır (şerit yeniden
 * görünür); aynı tür sürüyorsa yalnız sayaç ve son ayrıntı güncellenir, kapatılmışlık korunur.
 */
export function recordWriteError(
  prev: WriteErrorState | null,
  next: { code: WriteErrorCode; detail: string; kind: WriteErrorKind; path: string },
  now: number
): WriteErrorState {
  if (!prev || prev.code !== next.code) {
    return { ...next, count: 1, firstAt: now, lastAt: now, dismissed: false };
  }
  return { ...prev, ...next, count: prev.count + 1, lastAt: now, dismissed: prev.dismissed };
}

/**
 * Şeridin "yeni hata" kimliği (LOM-21). Aynı tür sürerken firstAt korunduğu için değişmez;
 * farklı tür ya da temizlendikten sonra gelen hata yeni firstAt alır, anahtar değişir.
 * Şerit gövdesi bu anahtarla yeniden kurulur, böylece Ayrıntılar her yeni hatada kapalı açılır.
 */
export function writeErrorKey(s: WriteErrorState): string {
  return `${s.code}:${s.firstAt}`;
}

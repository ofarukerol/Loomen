// Çöp kutusu — silinen notlar kalıcı silinmez; `.trash/` altına taşınır, 30 gün saklanır.
// `.trash` bir dotfolder olduğundan vault tarayıcısı (walk) onu atlar → ağaçta görünmez.
// Orijinal yol + silinme zamanı, trash dosya adına kodlanır (ayrı index dosyası yok → bozulmaz).

export const TRASH_DIR = ".trash";
export const TRASH_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Bir çöp kutusu kaydı (UI + geri yükleme için). */
export interface TrashEntry {
  /** `.trash` içindeki dosya adı (kodlanmış). */
  trashName: string;
  /** Silinmeden önceki vault yolu. */
  originalPath: string;
  /** Uzantısız ad. */
  name: string;
  /** Orijinal üst klasör ("" = kök). */
  folder: string;
  /** Silinme zamanı (epoch ms). */
  deletedAt: number;
  /** Dosya türü. */
  kind: "note" | "draw";
}

// Unicode-güvenli base64url (Türkçe karakterli yollar için).
function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Çöp dosya adı: `<deletedAtMs>__<b64url(orijinalYol)>`. */
export function encodeTrashName(originalPath: string, deletedAt: number): string {
  return `${deletedAt}__${b64urlEncode(originalPath)}`;
}

/** Çöp dosya adını çöz → kayıt; tanınmayan biçim için null. */
export function toTrashEntry(trashName: string): TrashEntry | null {
  const sep = trashName.indexOf("__");
  if (sep <= 0) return null;
  const deletedAt = Number(trashName.slice(0, sep));
  if (!Number.isFinite(deletedAt)) return null;
  let originalPath: string;
  try {
    originalPath = b64urlDecode(trashName.slice(sep + 2));
  } catch {
    return null;
  }
  if (!originalPath) return null;
  const parts = originalPath.split("/");
  const file = parts.pop()!;
  const kind = /\.excalidraw$/i.test(file) ? "draw" : "note";
  return {
    trashName,
    originalPath,
    name: file.replace(/\.(md|excalidraw)$/i, ""),
    folder: parts.join("/"),
    deletedAt,
    kind,
  };
}

/** Saklama süresi dolmuş mu (deletedAt + 30 gün < şimdi). */
export function isExpired(deletedAt: number, now: number): boolean {
  return now - deletedAt > TRASH_RETENTION_DAYS * DAY_MS;
}

/** Kalıcı silinmeye kalan gün (en az 0). */
export function daysLeft(deletedAt: number, now: number): number {
  return Math.max(0, Math.ceil((deletedAt + TRASH_RETENTION_DAYS * DAY_MS - now) / DAY_MS));
}

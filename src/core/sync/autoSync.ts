// Otomatik senkron kararları (LOM-105). Saf modül: zamanlayıcı, pencere ya da store bilmez;
// kanca ve uyarı şeridi buradaki kararları kullanır, test burada koşar.

/** Uygulama açıkken iki otomatik senkron arasındaki süre. */
export const AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000;
/** Öne gelme / ağ dönüşü / arka plana geçişte son denemeden en az bu kadar geçmiş olmalı. */
export const MIN_GAP_MS = 30 * 1000;
/** Son başarılı senkron bundan eskiyse uyarı şeridi çıkar (5 kaçan tur). */
export const STALE_AFTER_MS = 15 * 60 * 1000;
/** Kanca duvar saatine bu aralıkla bakar; donmuş sayaç uyanınca ilk turda yakalar. */
export const CHECK_EVERY_MS = 30 * 1000;

export type SyncReason = "start" | "foreground" | "tick" | "background" | "online";

export interface ShouldSyncInput {
  enabled: boolean;
  syncing: boolean;
  reason: SyncReason;
  lastAttemptAt: number | null;
  now: number;
}

export function shouldSyncNow({ enabled, syncing, reason, lastAttemptAt, now }: ShouldSyncInput): boolean {
  if (!enabled || syncing) return false;
  if (reason === "start") return true;
  if (lastAttemptAt == null) return true;
  // Saat geri alınmışsa geçen süre ölçülemez: beklemek yerine senkron yap.
  if (now < lastAttemptAt) return true;
  const gap = reason === "tick" ? AUTO_SYNC_INTERVAL_MS : MIN_GAP_MS;
  return now - lastAttemptAt >= gap;
}

export type SyncHealth = "ok" | "stale" | "error";

export interface SyncHealthInput {
  enabled: boolean;
  syncing: boolean;
  /** Son başarılı senkronun zamanı (ms); hiç olmadıysa null. */
  lastSuccessAt: number | null;
  failed: boolean;
  now: number;
}

export function syncHealth({ enabled, syncing, lastSuccessAt, failed, now }: SyncHealthInput): SyncHealth {
  if (!enabled || syncing) return "ok";
  if (failed) return "error";
  if (lastSuccessAt == null || !Number.isFinite(lastSuccessAt)) return "stale";
  if (now - lastSuccessAt > STALE_AFTER_MS) return "stale";
  return "ok";
}

/** ISO tarih metnini ms'ye çevirir; boş ya da bozuksa null. */
export function parseSyncTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

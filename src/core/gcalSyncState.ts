// Google Takvim eşitleme sonucu (LOM-117) — yetki hatası tanıma ve durum kararı. Saf modül.

const AUTH_RE = /invalid_grant|\b401\s+Unauthorized|\b(?:status|http|code)[\s:=]*401\b|\(\s*401\s*\)|UNAUTHENTICATED|invalid credentials|unauthorized_client/i;

/** Hata, Google bağlantısının/yetkisinin bittiğini mi gösteriyor (yeniden bağlanmadan düzelmez)? */
export function isGcalAuthError(e: unknown): boolean {
  if (e == null) return false;
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return AUTH_RE.test(msg);
}

export interface GcalSyncResult {
  pushTotal: number;
  pushFailed: number;
  firstPushError: string | null;
  pullError: string | null;
}

export type GcalSyncCode = "synced" | "authExpired" | "partial";

export function gcalSyncStatus(r: GcalSyncResult): { code: GcalSyncCode; detail?: string } {
  if (isGcalAuthError(r.firstPushError) || isGcalAuthError(r.pullError)) return { code: "authExpired" };
  if (r.pullError || r.pushFailed > 0) return { code: "partial", detail: r.firstPushError ?? r.pullError ?? undefined };
  return { code: "synced" };
}

/** İstenen görev yokken eski eşleme doluysa yetim silme yapılmaz (okuma boş kaldıysa hepsini silmesin). */
export function shouldSkipOrphanDelete(desiredCount: number, prevCount: number): boolean {
  return desiredCount === 0 && prevCount > 0;
}

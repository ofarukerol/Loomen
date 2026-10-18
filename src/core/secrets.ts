// GitHub ve Google girişleri işletim sisteminin anahtar zincirinde (LOM-46).
// Komutlar src-tauri/src/secrets.rs; saf yardımcılar node testinde koşar (__test__/secretsTest.ts).

import { invoke } from "@tauri-apps/api/core";
import type { GoogleTokens } from "./google";

export type SecretName = "github" | "google";

export const secretSet = (name: SecretName, value: string) => invoke<void>("secret_set", { name, value });
export const secretGet = (name: SecretName) => invoke<string | null>("secret_get", { name });
export const secretDelete = (name: SecretName) => invoke<void>("secret_delete", { name });

/**
 * Google token'ının saklanan hali: yalnız bilinen alanlar. Windows Credential Manager bir
 * kayıtta ~2,5 KB'a izin veriyor; sunucunun eklediği fazladan alanlar sınırı aşmasın.
 */
export function encodeGoogle(t: GoogleTokens): string {
  return JSON.stringify({
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? null,
    expires_in: t.expires_in,
    scope: t.scope,
    token_type: t.token_type,
  });
}

/** Saklanan Google kaydını çöz; bozuk ya da eksikse null (kullanıcı yeniden bağlanır). */
export function decodeGoogle(raw: string | null | undefined): GoogleTokens | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<GoogleTokens>;
    if (!v || typeof v.access_token !== "string" || !v.access_token) return null;
    return {
      access_token: v.access_token,
      refresh_token: typeof v.refresh_token === "string" ? v.refresh_token : null,
      expires_in: typeof v.expires_in === "number" ? v.expires_in : 0,
      scope: typeof v.scope === "string" ? v.scope : "",
      token_type: typeof v.token_type === "string" ? v.token_type : "Bearer",
    };
  } catch {
    return null;
  }
}

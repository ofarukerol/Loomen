// Google Takvim — Rust komutlarına ince sarmalayıcı (OAuth Loopback+PKCE, Calendar v3).
import { invoke } from "@tauri-apps/api/core";

/**
 * Google OAuth "Desktop app" client kimlikleri. .env dosyasına ekleyin (bkz .env.example):
 *   VITE_GOOGLE_CLIENT_ID=...
 *   VITE_GOOGLE_CLIENT_SECRET=...
 * Not: Desktop app client'ında "secret" gerçek bir sır değildir (Google dökümanı); token
 * değişimi için zorunlu alandır, PKCE asıl güvenliği sağlar.
 */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? "";
export const GOOGLE_CLIENT_SECRET =
  (import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined)?.trim() ?? "";
/**
 * Mobil OAuth: platforma özel "iOS" / "Android" client id (secret'sız, ters-client-id özel şema).
 * Google Cloud Console'da ilgili tipte client oluşturup .env'e:
 *   VITE_GOOGLE_IOS_CLIENT_ID=...        (Application type: iOS, Bundle ID: org.loomen.notes)
 *   VITE_GOOGLE_ANDROID_CLIENT_ID=...    (Application type: Android, package: org.loomen.notes + SHA-1)
 */
export const GOOGLE_IOS_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined)?.trim() ?? "";
export const GOOGLE_ANDROID_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID as string | undefined)?.trim() ?? "";
/** calendar = okuma+yazma (çift yönlü); openid/email/profile = hesap bilgisi. */
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar openid email profile";

/** Platform ("ios"|"android") → o platformun Google client id'si. */
export function mobileClientId(platform: string): string {
  return platform === "android" ? GOOGLE_ANDROID_CLIENT_ID : GOOGLE_IOS_CLIENT_ID;
}

/** client id → Google'ın ters-client-id özel şema redirect'i (iOS + Android aynı desen). */
export function reversedRedirectUri(clientId: string): string {
  const id = clientId.replace(/\.apps\.googleusercontent\.com$/, "");
  return `com.googleusercontent.apps.${id}:/oauth2redirect`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
  scope: string;
  token_type: string;
}
export interface GUser {
  email: string;
  name: string | null;
  picture: string | null;
}
export interface GCalendar {
  id: string;
  summary: string;
  primary: boolean;
  background_color: string | null;
}
export interface GEvent {
  id: string;
  summary: string;
  start: string; // ISO tarih (all-day) ya da RFC3339 dateTime
  end: string;
  all_day: boolean;
  html_link: string | null;
  loomen: boolean; // Loomen'in oluşturduğu görev mi
}

export const gcal = {
  login: () =>
    invoke<GoogleTokens>("google_login", {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      scope: GOOGLE_SCOPE,
    }),
  refresh: (refreshToken: string) =>
    invoke<GoogleTokens>("google_refresh", {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      refreshToken,
    }),
  userinfo: (accessToken: string) => invoke<GUser>("google_userinfo", { accessToken }),
  listCalendars: (accessToken: string) => invoke<GCalendar[]>("google_list_calendars", { accessToken }),
  listEvents: (accessToken: string, calendarId: string, timeMin: string, timeMax: string) =>
    invoke<GEvent[]>("google_list_events", { accessToken, calendarId, timeMin, timeMax }),
  upsertEvent: (accessToken: string, calendarId: string, eventId: string | null, payload: unknown) =>
    invoke<{ id: string }>("google_upsert_event", { accessToken, calendarId, eventId, payload }),
  deleteEvent: (accessToken: string, calendarId: string, eventId: string) =>
    invoke<void>("google_delete_event", { accessToken, calendarId, eventId }),

  // — Mobil OAuth (deep-link + PKCE, secret'sız) —
  refreshPkce: (clientId: string, refreshToken: string) =>
    invoke<GoogleTokens>("google_refresh_pkce", { clientId, refreshToken }),

  /**
   * Mobil giriş: Rust'tan auth URL al → tarayıcıda aç → deep-link redirect'i (özel şema) yakala →
   * kodu token'a çevir. clientId = platforma özel (iOS/Android). onOpenUrl deep-link olayını dinler.
   */
  mobileLogin: async (clientId: string): Promise<GoogleTokens> => {
    if (!clientId) throw new Error("Google mobil client id tanımlı değil (.env: iOS/Android client)");
    const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    const redirectUri = reversedRedirectUri(clientId);
    const { url, verifier, state } = await invoke<{ url: string; verifier: string; state: string }>(
      "google_auth_url",
      { clientId, scope: GOOGLE_SCOPE, redirectUri }
    );

    let resolveCode!: (c: string) => void;
    let rejectCode!: (e: Error) => void;
    const codeP = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });
    const unlisten = await onOpenUrl((urls) => {
      for (const u of urls) {
        try {
          const p = new URL(u);
          if (p.searchParams.get("state") !== state) continue;
          const err = p.searchParams.get("error");
          if (err) return rejectCode(new Error(err));
          const c = p.searchParams.get("code");
          if (c) return resolveCode(c);
        } catch {
          /* geçersiz URL — yoksay */
        }
      }
    });
    const timeout = setTimeout(() => rejectCode(new Error("OAuth zaman aşımı")), 300_000);
    try {
      await openUrl(url);
      const code = await codeP;
      return await invoke<GoogleTokens>("google_exchange", {
        clientId,
        code,
        verifier,
        redirectUri,
      });
    } finally {
      clearTimeout(timeout);
      unlisten();
    }
  },
};

// ---------- Görev → Google etkinlik eşlemesi (yardımcılar) ----------

/** Yerel IANA saat dilimi (ör. "Europe/Istanbul"). */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** "yyyy-mm-dd" + gün ekle (all-day end exclusive için). */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "yyyy-mm-dd" + "HH:MM" → RFC3339 yerel naif ("2026-06-25T09:00:00"); +dakika kaydırabilir. */
export function localDateTime(dateISO: string, time: string, addMinutes = 0): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(dateISO + "T00:00:00");
  d.setHours(h, m + addMinutes, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes()
  )}:00`;
}

/**
 * Bir görevden Google Calendar etkinlik gövdesi üret.
 * Saatli görev → 1 saatlik dateTime etkinlik; saatsiz → tüm gün (end exclusive +1 gün).
 * loomenKey ile etiketlenir → pull'da kendi etkinliklerimizi ayırt ederiz.
 */
export function taskToEventPayload(opts: {
  summary: string;
  due: string;
  time?: string;
  loomenKey: string;
  timeZone: string;
}): Record<string, unknown> {
  const { summary, due, time, loomenKey, timeZone } = opts;
  const start = time
    ? { dateTime: localDateTime(due, time), timeZone }
    : { date: due };
  const end = time
    ? { dateTime: localDateTime(due, time, 60), timeZone }
    : { date: addDaysISO(due, 1) };
  return {
    summary,
    start,
    end,
    description: "🌙 Loomen görevi",
    source: { title: "Loomen", url: "https://loomen.app" },
    extendedProperties: { private: { loomen: "1", loomenKey } },
  };
}

// GitHub senkronizasyonu — Rust komutlarına ince sarmalayıcı.
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * GitHub OAuth App client_id (Device Flow etkin olmalı).
 * .env dosyasına `VITE_GITHUB_CLIENT_ID=...` ekleyin (bkz docs).
 */
export const GITHUB_CLIENT_ID = (import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined)?.trim() ?? "";
export const GITHUB_SCOPE = "repo";

export interface DeviceStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}
export interface DevicePoll {
  status: string;
  access_token: string | null;
}
export interface GhUser {
  login: string;
  name: string | null;
  avatar_url: string;
}
export interface GhRepo {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  clone_url: string;
  updated_at: string;
}
export interface SyncResult {
  committed: boolean;
  pulled: boolean;
  message: string;
}
/** Mobil (ve isteğe bağlı masaüstü) için REST/Git-Data-API senkron sonucu. */
export interface ApiSyncResult {
  base_sha: string | null;
  pulled: number;
  pushed: number;
  conflicts: string[];
  message: string;
}

/** Platform mobil mi? (Rust cfg(mobile)) — komut yoksa false. */
export const appIsMobile = () => invoke<boolean>("app_is_mobile").catch(() => false);
/** Hedef platform ("ios"|"android"|"macos"|...) — komut yoksa "desktop". */
export const appPlatform = () => invoke<string>("app_platform").catch(() => "desktop");

export const gh = {
  deviceStart: () =>
    invoke<DeviceStart>("github_device_start", { clientId: GITHUB_CLIENT_ID, scope: GITHUB_SCOPE }),
  devicePoll: (deviceCode: string) =>
    invoke<DevicePoll>("github_device_poll", { clientId: GITHUB_CLIENT_ID, deviceCode }),
  user: (token: string) => invoke<GhUser>("github_user", { token }),
  listRepos: (token: string) => invoke<GhRepo[]>("github_list_repos", { token }),
  createRepo: (token: string, name: string, priv_: boolean) =>
    invoke<GhRepo>("github_create_repo", { token, name, private: priv_ }),
  // Masaüstü: git2 tabanlı senkron.
  sync: (path: string, remoteUrl: string, token: string, name: string, email: string) =>
    invoke<SyncResult>("git_sync", { path, remoteUrl, token, name, email }),
  // Tüm platformlar (mobil): GitHub REST API senkron. baseSha = son senkron commit'i (yoksa null).
  apiSync: (
    path: string,
    owner: string,
    repo: string,
    branch: string,
    token: string,
    baseSha: string | null
  ) => invoke<ApiSyncResult>("github_api_sync", { path, owner, repo, branch, token, baseSha }),
  openUrl: (url: string) => openUrl(url),
};

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * Uygulama içi güncelleme (LOM-31) — Rust tarafındaki `updater` komutlarının ince sarmalayıcısı.
 *
 * JS updater eklentisi yerine Rust komutları kullanılır: App Store derlemesi
 * (`--no-default-features`) güncelleme kodu olmadan derlenir ve capability dosyalarında
 * updater izni bulunmaz. Komut yoksa (mobil, MAS, tarayıcı) `app_update_supported`
 * hata verir ya da false döner; arayüz güncelleme bölümünü hiç göstermez.
 *
 * Komutlar:
 * - `app_update_supported` → boolean
 * - `update_check` → yeni sürüm varsa `UpdateInfo`, yoksa null
 * - `update_install` → indirir, kurar, uygulamayı yeniden başlatır
 * - olay `update://progress` → `{ downloaded, total }` (bayt; total bilinmiyorsa null)
 */

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string | null;
  date?: string | null;
}

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "installing"; info: UpdateInfo; progress: UpdateProgress }
  | { kind: "error"; message: string; info?: UpdateInfo };

/** "v1.2.3", "1.2.3-beta.1" gibi sürümleri karşılaştırır: a<b → -1, eşit → 0, a>b → 1. */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const clean = v.trim().replace(/^v/i, "").split("+")[0];
    const dash = clean.indexOf("-");
    const core = dash < 0 ? clean : clean.slice(0, dash);
    const pre = dash < 0 ? "" : clean.slice(dash + 1);
    return { nums: core.split(".").map((p) => parseInt(p, 10) || 0), pre };
  };
  const x = split(a);
  const y = split(b);
  const len = Math.max(x.nums.length, y.nums.length, 3);
  for (let i = 0; i < len; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  // Ön sürüm (beta) aynı çekirdek sürümün yayınından düşüktür.
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  const xs = x.pre.split(".");
  const ys = y.pre.split(".");
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    const p = xs[i];
    const q = ys[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) {
      const d = Number(p) - Number(q);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (pn !== qn) {
      return pn ? -1 : 1;
    } else if (p !== q) {
      return p < q ? -1 : 1;
    }
  }
  return 0;
}

/** Sunulan sürüm kurulu sürümden gerçekten yeniyse true (aynı/düşük sürümde şerit çıkmaz). */
export function isNewer(info: UpdateInfo | null | undefined): info is UpdateInfo {
  return !!info && !!info.version && compareVersions(info.version, info.currentVersion) > 0;
}

/** İndirme yüzdesi (0-100); toplam bilinmiyorsa null. */
export function progressPercent(p: UpdateProgress): number | null {
  if (!p.total || p.total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((p.downloaded / p.total) * 100)));
}

/** Hata nesnesini kısa metne çevirir (Tauri komut hataları string gelir). */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

let supportedCache: Promise<boolean> | null = null;

/** Bu derlemede uygulama içi güncelleme var mı? Mobil, App Store ve tarayıcıda false. */
export function updateSupported(): Promise<boolean> {
  if (!supportedCache) {
    // Yalnız kesin cevap önbelleğe girer; hata (komut yok ya da köprü henüz hazır değil)
    // bir sonraki çağrıda yeniden sorulur. Komut yoksa hata hızlı döner, maliyeti yok.
    supportedCache = invoke<boolean>("app_update_supported").then(
      (v) => v === true,
      () => {
        supportedCache = null;
        return false;
      },
    );
  }
  return supportedCache;
}

/** Yeni sürümü sorar; yoksa (ya da sunulan sürüm yeni değilse) null. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const info = await invoke<UpdateInfo | null>("update_check");
  return isNewer(info) ? info : null;
}

/** Paketi indirir ve kurar; başarılıysa uygulama yeniden başlar (bu söz dönmeyebilir). */
export async function installUpdate(onProgress?: (p: UpdateProgress) => void): Promise<void> {
  const unlisten = onProgress
    ? await listen<UpdateProgress>("update://progress", (e) => onProgress(e.payload))
    : null;
  try {
    await invoke("update_install");
  } finally {
    unlisten?.();
  }
}

/* ---------- Ortak durum: şerit ve ayarlar aynı kontrolü paylaşır ---------- */

let status: UpdateStatus = { kind: "idle" };
/** Kullanıcı "Sonra" dediği sürüm; aynı sürüm için şerit bu oturumda tekrar çıkmaz. */
let dismissedVersion: string | null = null;
const listeners = new Set<() => void>();

function setStatus(next: UpdateStatus) {
  status = next;
  listeners.forEach((l) => l());
}

export const updateStore = {
  get: () => status,
  dismissed: () => dismissedVersion,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Kontrol sürüyor mu? Durumdan ayrı tutulur: zaten bilinen sürüm kontrol sırasında da görünür kalır. */
let checking = false;

/** Kontrol çalıştırır; kurulum sürerken ya da başka kontrol varken yeni kontrol başlatmaz. */
export async function runUpdateCheck(): Promise<void> {
  if (checking || status.kind === "installing") return;
  checking = true;
  try {
    if (!(await updateSupported())) return;
    // Bilinen bir sürüm varken "aranıyor" durumuna geçilmez (şerit titremesin).
    const known = status.kind === "available" ? status : null;
    if (!known) setStatus({ kind: "checking" });
    try {
      const info = await checkForUpdate();
      if (updateStore.get().kind === "installing") return; // await sırasında kurulum başladıysa ezme
      setStatus(info ? { kind: "available", info } : { kind: "none" });
    } catch (e) {
      if (updateStore.get().kind === "installing") return; // await sırasında kurulum başladıysa ezme
      // Ağ hatası bilinen güncellemeyi silmesin; yalnız ilk kontrolde hata gösterilir.
      setStatus(known ?? { kind: "error", message: errorText(e) });
    }
  } finally {
    checking = false;
  }
}

export const isChecking = () => checking;

/** Mevcut sürümü indirip kurar; başarılıysa Rust tarafı uygulamayı yeniden başlatır. */
export async function runUpdateInstall(): Promise<void> {
  const info = status.kind === "available" || status.kind === "error" ? status.info : undefined;
  if (!info) return;
  setStatus({ kind: "installing", info, progress: { downloaded: 0, total: null } });
  try {
    await installUpdate((progress) => setStatus({ kind: "installing", info, progress }));
    // Normalde buraya gelinmez (uygulama yeniden başlar); geldiyse arayüz takılı kalmasın.
    setStatus({ kind: "error", message: "restart did not happen", info });
  } catch (e) {
    setStatus({ kind: "error", message: errorText(e), info });
  }
}

/** Şeridi bu sürüm için kapatır (ayarlardan yine kurulabilir). */
export function dismissUpdate(): void {
  if (status.kind === "available" || status.kind === "error") dismissedVersion = status.info?.version ?? null;
  if (status.kind === "error" && !status.info) setStatus({ kind: "idle" });
  else listeners.forEach((l) => l());
}

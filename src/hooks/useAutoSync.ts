import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { CHECK_EVERY_MS, shouldSyncNow, type SyncReason } from "../core/sync/autoSync";

/**
 * GitHub otomatik senkronu (LOM-105). Eskiden yalnız 3 dakikalık bir sayaç vardı; telefonda arka
 * planda sayaç donuyor, kısa kullanımda hiç senkron olmuyordu. Şimdi: açılışta hemen, öne gelince,
 * ağ dönünce, telefonda arka plana geçerken ve açıkken 3 dakikada bir. Sayaç duvar saatine bakar;
 * donmuş sayaç uyanınca ilk turda yakalar. Kararı shouldSyncNow verir, aynı anda tek senkron koşar.
 */
export function useAutoSync(): void {
  // Özellik kartı kapalıysa otomatik eşitleme kurulmaz; bağlantı yerinde kalır (LOM-82).
  const ghOn = useAppStore((s) => s.features.github);
  const ghAutoSync = useAppStore((s) => s.ghAutoSync);
  const hasToken = useAppStore((s) => !!s.ghToken);
  // Depo nesnesi değil adı: nesne yeniden yazılınca sayaç baştan kurulmasın.
  const repoName = useAppStore((s) => s.ghRepo?.full_name ?? null);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const mobile = useAppStore((s) => s.platformMobile);

  useEffect(() => {
    if (!ghOn || !ghAutoSync || !hasToken || !repoName) return;
    // Kasa yolu henüz yoksa bekle; gelince effect yeniden kurulur ve 'start' ile dener.
    if (!vaultPath) return;

    const attempt = (reason: SyncReason) => {
      const s = useAppStore.getState();
      const ok = shouldSyncNow({
        enabled: s.features.github && s.ghAutoSync && !!s.ghToken && !!s.ghRepo && !!s.vaultPath,
        syncing: s.ghSyncing,
        reason,
        lastAttemptAt: s.ghLastAttempt,
        now: Date.now(),
      });
      if (ok) void s.ghSync();
    };

    attempt("start");
    const id = setInterval(() => attempt("tick"), CHECK_EVERY_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") attempt("foreground");
      else if (mobile) attempt("background");
    };
    const onForeground = () => attempt("foreground");
    const onOnline = () => attempt("online");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onForeground);
    window.addEventListener("pageshow", onForeground);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onForeground);
      window.removeEventListener("pageshow", onForeground);
      window.removeEventListener("online", onOnline);
    };
  }, [ghOn, ghAutoSync, hasToken, repoName, vaultPath, mobile]);
}

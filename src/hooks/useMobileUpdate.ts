import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../store/useAppStore";
import { isTauri } from "../core/vault";
import {
  latestVersionFor,
  loadPrefs,
  markChecked,
  savePrefs,
  shouldCheck,
  shouldShowBanner,
  snooze,
  storeUrlFor,
  type MobilePlatform,
} from "../core/update/mobileUpdate";

/** Rust surum_kontrol komutunun dönüşü (src-tauri/src/surum.rs). */
interface SurumKontrol {
  current: string;
  remote: unknown;
}

export interface MobileUpdate {
  version: string;
  url: string;
}

/** Açılışta kasa yüklenirken ağı meşgul etmesin diye kontrol biraz geciktirilir. */
const START_DELAY_MS = 4000;

function mobilePlatform(os: string): MobilePlatform | null {
  return os === "ios" || os === "android" ? os : null;
}

/**
 * Mobil güncelleme uyarısı (LOM-32). Yalnız gerçek iOS/Android uygulamasında, günde en fazla bir
 * kez loomen.org/surum.json'u (Rust'tan) okur; mağazada daha yeni sürüm varsa `update` dolar.
 * Ağ yoksa ya da dosya bozuksa hiçbir şey göstermez. Kurallar core/update/mobileUpdate.ts'te.
 */
export function useMobileUpdate(): { update: MobileUpdate | null; later: () => void; openStore: () => void } {
  const platformMobile = useAppStore((s) => s.platformMobile);
  const platformOs = useAppStore((s) => s.platformOs);
  const [update, setUpdate] = useState<MobileUpdate | null>(null);

  useEffect(() => {
    const platform = mobilePlatform(platformOs);
    // Masaüstünde ve tarayıcıda hiç kontrol yok (masaüstü güncellemesi ayrı iş).
    if (!platformMobile || !platform || !isTauri()) return;
    let alive = true;
    let running = false;

    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const now = Date.now();
        const prefs = loadPrefs(localStorage);
        if (!shouldCheck(prefs, now)) return;
        // Önce "kontrol edildi" yazılır: ağ hatası da bir deneme sayılır, günde bir kuralı aşılmaz.
        const checked = markChecked(prefs, now);
        savePrefs(localStorage, checked);
        const res = await invoke<SurumKontrol>("surum_kontrol");
        const latest = latestVersionFor(platform, res.remote);
        if (alive && latest && shouldShowBanner({ current: res.current, latest, prefs: checked, now })) {
          setUpdate({ version: latest, url: storeUrlFor(platform, res.remote) });
        }
      } catch (e) {
        // Sessiz: ağ yok, dosya yok (404) ya da bozuk — kullanıcıya pencere/şerit gösterilmez.
        console.debug("[update] sürüm kontrolü atlandı", e);
      } finally {
        running = false;
      }
    };

    const timer = window.setTimeout(() => void tick(), START_DELAY_MS);
    // iOS'ta uygulama nadiren soğuk açılır; öne gelince de bakılır (24 saat kısıtı tick içinde).
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [platformMobile, platformOs]);

  const later = useCallback(() => {
    if (!update) return;
    savePrefs(localStorage, snooze(loadPrefs(localStorage), update.version, Date.now()));
    setUpdate(null);
  }, [update]);

  // Mağazadan dönünce şerit yeniden dürtmesin: Güncelle de aynı sürümü erteler.
  const openStore = useCallback(() => {
    if (!update) return;
    openUrl(update.url).catch(() => {});
    later();
  }, [update, later]);

  return { update, later, openStore };
}

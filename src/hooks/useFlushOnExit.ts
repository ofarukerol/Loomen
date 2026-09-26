import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { isTauri } from "../core/vault";
import { createCloseGuard } from "../core/vault/closeGuard";
import i18n from "../i18n";

/**
 * Ekrandan çıkarken (başka ekrana geçiş, uygulama kapanışı, uygulamanın arka plana
 * alınması) bekleyen not taslağını VE bekleyen çizim kaydını diske yazar.
 * Otomatik kayıtlar 700 ms gecikmeli; boşaltılmazsa o penceredeki son değişiklikler
 * hiç diske gitmeden kaybolur. Editör ve çizim ekranı ortak kullanır (LOM-6).
 */
export function useFlushOnExit(isMobile: boolean): void {
  useEffect(() => {
    const flush = () => void useAppStore.getState().flushDraft();
    // Mobilde "beforeunload" hiç ateşlenmez: kullanıcı uygulamadan çıkıp onu kapatınca
    // son yazdıkları kaybolurdu. Sayfa gizlendiği anda (ana ekrana dönüş, uygulama
    // değiştirme) yazmak tek güvenli noktadır; "pagehide" de iOS'ta kapanışı yakalar.
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      flush();
    };
  }, []);

  // Masaüstü: pencere kapanma isteğini bekleyen kayıt diske yazılana kadar ERTELE.
  // "beforeunload" içinden başlatılan yazma eşzamansızdır; Tauri penceresi kapanırsa
  // webview onu tamamlamadan ölür ve son yazılanlar kaybolur.
  // LOM-18: yazılamazsa ya da yazma asılı kalırsa pencere sessizce kapanmaz; bir kez
  // sorulur (bkz. closeGuard). Soru Tauri'nin kendi iletişim penceresiyle sorulur:
  // window.confirm Tauri'de sessizce false döner.
  useEffect(() => {
    if (!isTauri() || isMobile) return;
    let un: (() => void) | undefined;
    let alive = true;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const guard = createCloseGuard({
          // Sessiz: hata ayrıca "kaydedilemedi" penceresiyle gösterilmez, tek soru sorulur.
          flush: () => useAppStore.getState().flushDraft({ quiet: true }),
          ask: async () => {
            const { ask } = await import("@tauri-apps/plugin-dialog");
            return ask(i18n.t("errors.closeUnsaved"), {
              title: "Loomen",
              kind: "warning",
              okLabel: i18n.t("errors.closeAnyway"),
              cancelLabel: i18n.t("errors.keepOpen"),
            });
          },
          close: () => win.close(),
        });
        const unlisten = await win.onCloseRequested((e) => guard(() => e.preventDefault()));
        if (alive) un = unlisten;
        else unlisten();
      } catch {
        /* Tauri pencere API'si yoksa (tarayıcı) beforeunload yeterli */
      }
    })();
    return () => {
      alive = false;
      un?.();
    };
  }, [isMobile]);
}

import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { isTauri } from "../core/vault";

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
  useEffect(() => {
    if (!isTauri() || isMobile) return;
    let un: (() => void) | undefined;
    let closing = false;
    let alive = true;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const unlisten = await win.onCloseRequested(async (e) => {
          if (closing) return; // ikinci istek: bırak kapansın
          closing = true;
          e.preventDefault();
          try {
            await useAppStore.getState().flushDraft();
          } catch {
            /* yazılamadıysa da kapanışı kilitleme */
          }
          await win.close();
        });
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

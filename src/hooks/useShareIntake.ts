import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { isTauri } from "../core/vault";
import { SHARE_URL_PREFIX } from "../core/library";

/**
 * Paylaş menüsünden / Kısayol'dan gelen alıntıyı alır (LOM-96).
 *
 * Android'de Paylaş ile gelen metni uygulamanın Android tarafı `loomen://share?text=…` adresine
 * çevirir; iPhone/iPad'de Kısayol aynı adresi açar. Adres derin bağlantı eklentisiyle gelir:
 * uygulama kapalıyken açıldıysa `getCurrent`, açıkken `onOpenUrl`.
 *
 * Yalnız `loomen://share` adresleri alınır: Google giriş dönüşü ve kitap bağlantıları başka
 * yerde işlenir. Kasa açılmadan gelen adres kuyrukta bekler (soğuk açılışta kasa henüz yok);
 * kasa açılınca sırayla işlenir. Aynı adres art arda iki kez gelirse (soğuk açılışta hem
 * `getCurrent` hem olay) bir kez işlenir.
 */
export function useShareIntake(): void {
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    let unlisten: (() => void) | null = null;
    let unsub: (() => void) | null = null;
    const queue: string[] = [];
    let running = false;
    let last: { url: string; at: number } | null = null;

    // Kasa açık olmalı ve önceki paylaşımın seçim penceresi kapanmış olmalı: ikinci paylaşım
    // açık penceredeki ilkini ezmesin, sırasını beklesin.
    const ready = () => {
      const s = useAppStore.getState();
      return !!s.vaultPath && !s.pendingShare;
    };

    const drain = async () => {
      if (running) return;
      running = true;
      try {
        while (alive && queue.length && ready()) {
          const url = queue.shift()!;
          try {
            await useAppStore.getState().libraryReceiveShare(url);
          } catch (e) {
            console.error("[share] paylaşım işlenemedi:", e);
          }
        }
      } finally {
        running = false;
      }
    };

    const take = (urls: string[] | null | undefined) => {
      for (const u of urls ?? []) {
        if (typeof u !== "string" || !u.toLowerCase().startsWith(SHARE_URL_PREFIX)) continue;
        const now = Date.now();
        if (last && last.url === u && now - last.at < 3000) continue;
        last = { url: u, at: now };
        queue.push(u);
      }
      void drain();
    };

    // Kasa sonradan açılınca ya da seçim penceresi kapanınca kuyruktakiler işlensin.
    unsub = useAppStore.subscribe((s, prev) => {
      if (!queue.length) return;
      if ((s.vaultPath && s.vaultPath !== prev.vaultPath) || (!s.pendingShare && prev.pendingShare)) void drain();
    });

    void (async () => {
      try {
        const dl = await import("@tauri-apps/plugin-deep-link");
        const off = await dl.onOpenUrl((urls) => take(urls));
        if (!alive) off();
        else unlisten = off;
        take(await dl.getCurrent());
      } catch (e) {
        // Masaüstünde derin bağlantı yapılandırılmamış olabilir: paylaşım alımı yok.
        console.warn("[share] derin bağlantı dinlenemedi:", e);
      }
    })();

    return () => {
      alive = false;
      unlisten?.();
      unsub?.();
    };
  }, []);
}

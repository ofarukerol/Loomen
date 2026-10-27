// Alışkanlık ekranlarının ortak küçük yardımcıları (LOM-55): bugünün anahtarı, renk değişkenleri,
// tarih yazımı, uzun basış ve günlük not araması. Hiçbiri dosyaya yazmaz.

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { format } from "date-fns";
import { tr, enUS, ar } from "date-fns/locale";
import { dayKey, finishedOn, parseKey, type Habit, type HabitColor } from "../../core/habit";
import { dailyPathFor } from "../../core/vault";

const LOCALES: Record<string, typeof tr> = { tr, en: enUS, ar };
export const dateLocale = (lang: string) => LOCALES[lang] ?? tr;

/** Gün anahtarını yerel tarihle yaz (ör. "12 Kas" / "12 Kasım 2026, Perşembe"). */
export function fmtDay(key: string, pattern: string, lang: string): string {
  const d = parseKey(key);
  return d ? format(d, pattern, { locale: dateLocale(lang) }) : key;
}

/** "3 Eki – 23 Eki 2026"; yıl farklıysa iki uç da yıllı. */
export function fmtRange(start: string, end: string, lang: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${fmtDay(start, sameYear ? "d MMM" : "d MMM yyyy", lang)} – ${fmtDay(end, "d MMM yyyy", lang)}`;
}

/**
 * Bugünün yerel gün anahtarı. Gece yarısı geçince ve pencere yeniden görünür olunca güncellenir:
 * uygulama gece açık kalırsa dünün dizisi "bugün" diye işaretlenmesin.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => dayKey(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => setToday(dayKey(new Date()));
    const arm = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
      timer = setTimeout(() => {
        check();
        arm();
      }, next.getTime() - now.getTime());
    };
    arm();
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", check);
    };
  }, []);
  return today;
}

/**
 * Alışkanlık rengi CSS değişkenleri: `--hab-c` (dolu renk) ve `--hab-c-soft` (zemin). Değerler
 * app.css'teki `--hab-<renk>` / `--hab-<renk>-soft` tokenlarından gelir (açık/koyu ayrı).
 */
export function colorVars(color: HabitColor): CSSProperties {
  return { "--hab-c": `var(--hab-${color})`, "--hab-c-soft": `var(--hab-${color}-soft)` } as CSSProperties;
}

/** Sayfa sağdan sola mı (Arapça). Ok tuşlarının yönü buna göre çevrilir. */
export const isRtl = () => typeof document !== "undefined" && document.documentElement.dir === "rtl";

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

/**
 * Dokunmatik uzun basış. WebView'da uzun basış `contextmenu` üretmeyebilir; zamanlayıcı açar.
 * Basış menüyü açtıysa ardından gelen tıklama `consumeClick()` ile yutulur (yoksa menü açılır
 * açılmaz gün çentiklenirdi). Bazı WebView'lar ayrıca `contextmenu` da üretir: `firedRecently`
 * ile aynı basışta menü iki kez açılmaz.
 */
export function useLongPress(onLong: (target: HTMLElement) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const at = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(0);
  const cbRef = useRef(onLong);
  cbRef.current = onLong;

  const cancel = () => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
    at.current = null;
  };
  useEffect(() => cancel, []);

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") return;
      cancel();
      const el = e.currentTarget;
      at.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = Date.now();
        cbRef.current(el);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const p = at.current;
      if (p && (Math.abs(e.clientX - p.x) > LONG_PRESS_SLOP || Math.abs(e.clientY - p.y) > LONG_PRESS_SLOP)) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    /** Uzun basış az önce menü açtı mı (tıklama ya da ikinci contextmenu yutulmalı). */
    firedRecently: () => Date.now() - fired.current < 900,
    consumeClick: () => {
      if (Date.now() - fired.current < 900) {
        fired.current = 0;
        return true;
      }
      return false;
    },
  };
}

/** Yol karşılaştırması: macOS/senkron NFD getirebilir, klasör harf büyüklüğü de farklı olabilir. */
const pathKey = (p: string) => p.normalize("NFC").replace(/\\/g, "/").toLowerCase();

/**
 * O günün günlük notu kasada varsa yolu (yoksa null). Yol dailyPathFor ile üretilir, var olan
 * notlarla NFC karşılaştırılır. YALNIZ OKUR — not oluşturmaz, yazmaz.
 */
export function dailyNoteFor(key: string, notePaths: string[]): string | null {
  const d = parseKey(key);
  if (!d) return null;
  const want = pathKey(dailyPathFor(d));
  return notePaths.find((p) => pathKey(p) === want) ?? null;
}

/** Bırakılan turun bırakma günü (son günden sonra olamaz); bırakılmadıysa null. */
export function quitDay(habit: Habit): string | null {
  return habit.status === "quit" ? finishedOn(habit) : null;
}

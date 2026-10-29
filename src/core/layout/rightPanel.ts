// Sağ blok genişliği (LOM-63) — saf hesap; tutamak (RightPanel) ve kayıt (store) bunu kullanır.

export const RIGHT_PANEL_DEFAULT = 312;
export const RIGHT_PANEL_MIN = 260;
export const RIGHT_PANEL_MAX = 560;
/** Ok tuşuyla bir adım (Shift ile dört katı). */
export const RIGHT_PANEL_STEP = 16;

/** Genişliği sınırlar içine al; sayı değilse (bozuk kayıt) varsayılana dön. */
export function clampRightWidth(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return RIGHT_PANEL_DEFAULT;
  return Math.round(Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, v)));
}

/**
 * Sürükleme sırasında yeni genişlik. Sağ blok soldan tutulur: imleç sola gidince (dx < 0)
 * blok genişler. Arapçada (RTL) blok solda durur ve sağ kenarından tutulur; yön tersine döner.
 */
export function nextRightWidth(start: number, dx: number, rtl: boolean): number {
  return clampRightWidth(start + (rtl ? dx : -dx));
}

/**
 * Sürükleme/klavye başlangıcı (LOM-67). Dar pencerede CSS bloğu kayıtlı genişlikten dar
 * gösterir; kayıtlı değerden başlanırsa imleç bir süre "boşa" gider, sonra blok zıplar.
 * Bu yüzden ekranda ölçülen genişlik esas alınır; ölçüm yoksa (0/NaN) kayıtlı değere dönülür.
 */
export function dragStartWidth(measured: number, stored: number): number {
  return Number.isFinite(measured) && measured > 0 ? clampRightWidth(measured) : clampRightWidth(stored);
}

/**
 * Tutamakta basılan tuşun verdiği yeni genişlik; tuş bizim değilse `null`.
 * Home en küçük, End en büyük, Enter varsayılan; oklar bir adım (Shift ile dört adım).
 */
export function rightWidthForKey(key: string, start: number, shift: boolean, rtl: boolean): number | null {
  switch (key) {
    case "Home":
      return RIGHT_PANEL_MIN;
    case "End":
      return RIGHT_PANEL_MAX;
    case "Enter":
      return RIGHT_PANEL_DEFAULT;
    case "ArrowLeft":
    case "ArrowRight": {
      const step = RIGHT_PANEL_STEP * (shift ? 4 : 1);
      return nextRightWidth(start, key === "ArrowLeft" ? -step : step, rtl);
    }
    default:
      return null;
  }
}

// Sol panel (gezgin) genişliği (LOM-80) — saf hesap; tutamak (LeftPanel) ve kayıt (store) bunu kullanır.
// Sağ bloğun (rightPanel.ts) aynası; fark: tutamak panelin bitiş kenarında, yön ters.

/** Bugünkü sabit genişlik (LOM-80 öncesi 248 px). */
export const LEFT_PANEL_DEFAULT = 248;
/** Alt sınır: araç şeridi (trafik ışıkları + düğmeler), arama ve alt senkron satırı sığar.
 *  CSS'teki `.lo-explorer` formülündeki `max(200px, …)` ile aynı tutulur (leftPanelTest denetler). */
export const LEFT_PANEL_MIN = 200;
export const LEFT_PANEL_MAX = 480;
/** Ok tuşuyla bir adım (Shift ile dört katı). */
export const LEFT_PANEL_STEP = 16;

/** Genişliği sınırlar içine al; sayı değilse (bozuk kayıt) varsayılana dön. */
export function clampLeftWidth(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return LEFT_PANEL_DEFAULT;
  return Math.round(Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, v)));
}

/**
 * Sürükleme sırasında yeni genişlik. Sol panel sağ kenarından tutulur: imleç sağa gidince
 * (dx > 0) panel genişler. Arapçada (RTL) panel sağda durur ve sol kenarından tutulur; yön tersine döner.
 */
export function nextLeftWidth(start: number, dx: number, rtl: boolean): number {
  return clampLeftWidth(start + (rtl ? -dx : dx));
}

/**
 * Sürükleme/klavye başlangıcı. Dar pencerede CSS paneli kayıtlı genişlikten dar gösterir;
 * ekranda ölçülen genişlik esas alınır ki imleç boşa gidip panel zıplamasın. Ölçüm yoksa
 * (0/NaN) kayıtlı değere dönülür.
 */
export function leftDragStartWidth(measured: number, stored: number): number {
  return Number.isFinite(measured) && measured > 0 ? clampLeftWidth(measured) : clampLeftWidth(stored);
}

/**
 * Tutamakta basılan tuşun verdiği yeni genişlik; tuş bizim değilse `null`.
 * Home en küçük, End en büyük, Enter varsayılan; oklar bir adım (Shift ile dört adım).
 * Sağ ok soldan-sağa düzende genişletir, sağdan-sola düzende daraltır (ok, kenarın gittiği yön).
 */
export function leftWidthForKey(key: string, start: number, shift: boolean, rtl: boolean): number | null {
  switch (key) {
    case "Home":
      return LEFT_PANEL_MIN;
    case "End":
      return LEFT_PANEL_MAX;
    case "Enter":
      return LEFT_PANEL_DEFAULT;
    case "ArrowLeft":
    case "ArrowRight": {
      const step = LEFT_PANEL_STEP * (shift ? 4 : 1);
      return nextLeftWidth(start, key === "ArrowLeft" ? -step : step, rtl);
    }
    default:
      return null;
  }
}

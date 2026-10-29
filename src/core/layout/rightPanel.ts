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

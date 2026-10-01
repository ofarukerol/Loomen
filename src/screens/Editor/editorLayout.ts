/**
 * Editör yerleşiminin saf kuralları (React'e bağlı değil; node testinden çağrılır).
 *
 * Dar sütun: masaüstünde orta sütun daraldığında (ör. 800x600, gezgin + sağ panel açık ≈ 184px)
 * 288px'lik Bağlantılar yan paneli yazı alanını sıfıra düşürüyordu. Eşiğin altında panel
 * mobildeki gibi alttan pencereye döner ve araç çubuğu boşlukları daralır.
 */

/** 288px Bağlantılar paneli + okunabilir en az yazı genişliği. */
export const NARROW_EDITOR_PX = 560;

/** Sütun genişliği eşiğin altındaysa true. Ölçülmemiş (<=0 / NaN) genişlik dar sayılmaz. */
export function isNarrowEditor(width: number): boolean {
  if (!(width > 0)) return false;
  return width < NARROW_EDITOR_PX;
}

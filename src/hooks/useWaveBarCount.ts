import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Dalga formu kabına GERÇEKTEN sığan çubuk sayısı (varsayılan 2px çubuk + 2px boşluk).
 * Sabit çubuk sayısı dar ekranlarda kabın dışına taşıyordu (imleç/süre metni üstüne binme
 * hatası); kap ölçüsü ResizeObserver ile izlenir, sayı ekrana göre uyarlanır.
 */
export function useWaveBarCount(
  ref: RefObject<HTMLElement | null>,
  barPx = 2,
  gapPx = 2,
  min = 12,
  max = 96
): number {
  const [count, setCount] = useState(48);
  // Ölçüm hedefi mount sonrası değişmez; parametreler sabit kabul edilir.
  const cfg = useRef({ barPx, gapPx, min, max });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { barPx, gapPx, min, max } = cfg.current;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setCount(Math.max(min, Math.min(max, Math.floor((w + gapPx) / (barPx + gapPx)))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return count;
}

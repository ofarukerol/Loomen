import { useEffect, useState } from "react";

/**
 * Mobil (dar ekran / Tauri iOS-Android) modu. Masaüstü dar pencere de mobil kabul edilir
 * (responsive). Eşik 768px — telefon + küçük tabletler. matchMedia ile reaktif.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isMobile;
}

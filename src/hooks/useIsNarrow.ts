import { useCallback, useEffect, useRef, useState } from "react";
import { isNarrowEditor } from "../screens/Editor/editorLayout";

/**
 * Bir öğenin genişliği dar sütun eşiğinin altında mı (bkz. isNarrowEditor). Pencere değil
 * öğe ölçülür: masaüstünde gezgin ve sağ panel açıkken orta sütun pencereden çok daha dar.
 * Callback ref döner — öğe sonradan mount olsa da (erken return) gözlemci bağlanır.
 */
export function useIsNarrow(): [(el: HTMLElement | null) => void, boolean] {
  const [narrow, setNarrow] = useState(false);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setNarrow(isNarrowEditor(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    observer.current = ro;
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return [ref, narrow];
}

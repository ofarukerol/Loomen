// PDF görüntüleyici (LOM-83, parça 2). pdf.js ile sayfaları alt alta çizer; çizim katmanı,
// seçim → çizim yeri, kalınan yer, hedefe gitme, başlık/yazar ve kapak burada.
//
// pdf.js (`pdfjs-dist`) tembel ve İSTEĞE BAĞLI yüklenir: `import.meta.glob` paket kurulu değilse
// boş döner, derleme ve tip denetimi bozulmaz; görüntüleyici "PDF okuyucu kurulu değil" der.
// Paket kurulunca kod değişmeden çalışır. Eski WebKit (macOS 11, eski Android WebView) için
// `legacy` derlemesi kullanılır. Çalışan (worker) ayrı dosya olarak paketlenir; CSP
// `worker-src 'self'` buna izin verir. `isEvalSupported: false` — CSP'de `unsafe-eval` yok.
//
// Çizim yeri sayfaya göre 0..1 oranıdır (core/library/pdfAnchor.ts): yazı boyutu = yakınlaştırma
// değişince çizimler ve kalınan yer kaymaz (K5).
//
// Kalem (LOM-97): her sayfada çizimlerin üstünde, metnin altında ayrı bir tuval (`.lo-pdf__ink`)
// kayıttaki çizgileri çizer; tema süzgeci ona uygulanmaz. Kalem açıkken sayfanın en üstüne bir
// yakalama katmanı (`.lo-pdf__pen`) gelir: kalem ve fare çizer, parmak kaydırır. Kalemli sayfanın
// not resmi (açık sayfa + çizgiler, ~800 px PNG) ayrı, ekran dışı bir tuvalde üretilir.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { BookPosition, Highlight, InkPoint, InkStroke, PdfAnchor, ReaderTheme } from "../../../core/library/types";
import {
  INK_COLOR,
  drawInkPolyline,
  drawInkStrokes,
  inkLineWidth,
  shouldAddPoint,
  strokeFromPixels,
  type PixelPoint,
} from "../../../core/library/ink";
import {
  anchorBounds,
  anchorFromClientRects,
  anchorHit,
  cleanQuote,
  fromPageRect,
  pageOffsets,
  positionAt,
  scrollTopFor,
  visibleRange,
  type PageBox,
} from "../../../core/library/pdfAnchor";
import { HIGHLIGHT_CSS, type ReaderViewProps, type TocItem, type ViewRect } from "../readerTypes";
import "./pdfView.css";

// ─── pdf.js'in kullandığımız kadar türü (paket kurulu olmasa da tip denetimi geçsin) ──

interface PdfViewport {
  width: number;
  height: number;
}
interface PdfRenderTask {
  promise: Promise<void>;
  cancel(): void;
}
interface PdfPageProxy {
  getViewport(o: { scale: number }): PdfViewport;
  render(o: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: PdfViewport; transform?: number[] }): PdfRenderTask;
  streamTextContent(o?: { includeMarkedContent?: boolean; disableNormalization?: boolean }): unknown;
  cleanup(): void;
}
interface PdfOutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: PdfOutlineNode[];
}
interface PdfDocProxy {
  numPages: number;
  getPage(n: number): Promise<PdfPageProxy>;
  getMetadata(): Promise<{ info?: Record<string, unknown> }>;
  getOutline(): Promise<PdfOutlineNode[] | null>;
  getDestination(name: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  destroy(): Promise<void>;
}
interface PdfTextLayer {
  render(): Promise<void>;
  cancel(): void;
}
interface PdfJs {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; enableXfa?: boolean }): {
    promise: Promise<PdfDocProxy>;
    destroy(): Promise<void>;
  };
  GlobalWorkerOptions: { workerSrc: string };
  TextLayer: new (o: { textContentSource: unknown; container: HTMLElement; viewport: PdfViewport }) => PdfTextLayer;
}

const PDFJS_LOADERS = import.meta.glob<PdfJs>("/node_modules/pdfjs-dist/legacy/build/pdf.min.mjs", { exhaustive: true });
const WORKER_URLS = import.meta.glob<string>("/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", {
  exhaustive: true,
  eager: true,
  query: "?url",
  import: "default",
});

class PdfJsMissing extends Error {}

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  if (pdfjsPromise) return pdfjsPromise;
  const loader = Object.values(PDFJS_LOADERS)[0];
  const workerUrl = Object.values(WORKER_URLS)[0];
  if (!loader || !workerUrl) return Promise.reject(new PdfJsMissing("pdfjs-dist"));
  pdfjsPromise = loader().then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    return lib;
  });
  pdfjsPromise.catch(() => (pdfjsPromise = null));
  return pdfjsPromise;
}

// ─── Düzen sabitleri ──────────────────────────────────────────────────────────────

/** Sayfalar arası boşluk ve listenin üst/alt payı (piksel). */
const GAP = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 40;
/** %100 yazı boyutunda sayfanın en geniş hâli: geniş ekranda satırlar okunur kalsın. */
const MAX_PAGE_WIDTH = 880;
/** Görünen sayfaların öncesinde/sonrasında kaç sayfa önceden çizilir. */
const OVERSCAN = 2;
/** iOS tuvalinin piksel sınırı ~16.7 milyon; birkaç sayfa aynı anda açık durduğu için sayfa
 *  başına çok daha azı verilir (Safari'nin toplam tuval belleği sınırlı). */
const MAX_CANVAS_PIXELS = 6_000_000;
/** Genişlik değişince yeniden çizimi bekletme (pencere sürükleme, klavye, döndürme). */
const RESIZE_DEBOUNCE_MS = 150;

/** Safari tuval belleğini ancak boyut sıfırlanınca bırakır. */
function freeCanvas(c: Element | null | undefined) {
  if (c instanceof HTMLCanvasElement) {
    c.width = 0;
    c.height = 0;
  }
}
function freeCanvases(host: HTMLElement | null) {
  host?.querySelectorAll("canvas").forEach(freeCanvas);
}
/** Hedefe gidilince çizimin vurgulanma süresi. */
const FLASH_MS = 1800;
const COVER_WIDTH = 300;

/** Kalem tuvali için cihaz pikseli sınırı (sayfa tuvalinden ayrı; kalem için 2× yeter). */
const INK_MAX_DPR = 2;
const INK_MAX_CANVAS_PIXELS = 4_000_000;
/** Karanlık temada koyu mavi okunmaz: ekranda açık mavi çizilir (kayıt ve not resmi aynı kalır). */
const INK_COLOR_DARK = "#9db8ff";
/** Not resmi genişliği ve piksel sınırı (iOS ekran dışı tuval belleği). */
const SNAPSHOT_WIDTH = 800;
const SNAPSHOT_MAX_PIXELS = 3_000_000;
/** Son değişiklikten bu kadar sonra not resmi üretilir (art arda çizgilerde tek resim). */
const SNAPSHOT_DELAY_MS = 1500;
/** Kapanışta bekleyen resimler için belgeyi en çok bu kadar açık tut. */
const SNAPSHOT_CLOSE_WAIT_MS = 10_000;

const isCancel = (e: unknown) =>
  !!e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "RenderingCancelledException";

interface Size {
  w: number;
  h: number;
}

/** pdf.js'in anlamsız ürettiği başlıkları ("Microsoft Word - x.docx", "untitled") ele. */
function cleanMetaText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || s.length > 300) return undefined;
  if (/^(untitled|unknown|anonymous|microsoft word\b)/i.test(s)) return undefined;
  if (/\.(docx?|pdf|indd|tex|dvi|rtf|odt|qxd)$/i.test(s)) return undefined;
  return s;
}

async function outlineToToc(doc: PdfDocProxy, nodes: PdfOutlineNode[]): Promise<TocItem[]> {
  const out: TocItem[] = [];
  const walk = async (list: PdfOutlineNode[], depth: number) => {
    for (const n of list) {
      if (out.length >= 500) return;
      let page: number | null = null;
      try {
        const dest = typeof n.dest === "string" ? await doc.getDestination(n.dest) : n.dest;
        const ref = Array.isArray(dest) ? dest[0] : null;
        if (typeof ref === "number") page = ref + 1;
        else if (ref && typeof ref === "object") page = (await doc.getPageIndex(ref)) + 1;
      } catch {
        page = null;
      }
      const label = (n.title ?? "").replace(/\s+/g, " ").trim();
      if (page && label) out.push({ label, depth, position: { kind: "pdf", page, offset: 0 } });
      if (n.items?.length && depth < 4) await walk(n.items, depth + 1);
    }
  };
  await walk(nodes, 0);
  return out;
}

/** Kalemli sayfanın not resmi: açık sayfa (süzgeçsiz) + çizgiler, PNG. */
async function renderInkSnapshot(doc: PdfDocProxy, num: number, strokes: readonly InkStroke[]): Promise<Blob | undefined> {
  const page = await doc.getPage(num);
  const vp1 = page.getViewport({ scale: 1 });
  let scale = SNAPSHOT_WIDTH / vp1.width;
  if (vp1.width * vp1.height * scale * scale > SNAPSHOT_MAX_PIXELS) scale = Math.sqrt(SNAPSHOT_MAX_PIXELS / (vp1.width * vp1.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    drawInkStrokes(ctx, strokes, canvas.width, canvas.height, INK_COLOR);
    return await new Promise<Blob | undefined>((res) => canvas.toBlob((b) => res(b ?? undefined), "image/png"));
  } finally {
    freeCanvas(canvas);
  }
}

/**
 * Bekleyen resim işleri. Belge, çizgiler ve geri çağrı İŞ KURULURKEN yakalanır: kitap değişip
 * belge kapanırken üretilen resim yeni kitabın çizgisiyle ya da kabuğuyla karışmasın.
 */
interface SnapJob {
  tm: ReturnType<typeof setTimeout>;
  doc: PdfDocProxy;
  strokes: readonly InkStroke[];
  emit: (page: number, png: Blob) => void;
}

async function renderCover(doc: PdfDocProxy): Promise<Blob | undefined> {
  const page = await doc.getPage(1);
  const vp1 = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: COVER_WIDTH / vp1.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    return await new Promise<Blob | undefined>((res) => canvas.toBlob((b) => res(b ?? undefined), "image/jpeg", 0.82));
  } finally {
    freeCanvas(canvas);
  }
}

// ─── Tek sayfa ────────────────────────────────────────────────────────────────────

interface PageProps {
  doc: PdfDocProxy;
  lib: PdfJs;
  num: number;
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  active: boolean;
  highlights: Highlight[];
  flashId: string | null;
  /** Bu sayfanın kayıttaki kalem çizgileri. */
  strokes: readonly InkStroke[];
  penMode: boolean;
  dark: boolean;
  /** Çizgi bitti: noktalar 0..1 oranı. Kararlı (değişmeyen) işlev verilmeli. */
  onStroke: (page: number, points: InkPoint[]) => void;
}

/** Bu dokunuş Apple Pencil mi? (iOS `Touch.touchType`; Chromium da destekler.) */
const isStylusTouch = (t: Touch) => (t as Touch & { touchType?: string }).touchType === "stylus";

const PdfPage = memo(function PdfPage({
  doc,
  lib,
  num,
  left,
  top,
  width,
  height,
  scale,
  active,
  highlights,
  flashId,
  strokes,
  penMode,
  dark,
  onStroke,
}: PageProps) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const penRef = useRef<HTMLDivElement>(null);
  /** Kalem tuvali yalnız görünür sayfada ve çizgi varken ya da kalem açıkken (bellek). */
  const showInk = active && (strokes.length > 0 || penMode);
  const inkColor = dark ? INK_COLOR_DARK : INK_COLOR;

  // ── Kalem tuvali: kayıttaki çizgiler ──
  useLayoutEffect(() => {
    const c = inkRef.current;
    if (!showInk || !c) return;
    let dpr = Math.min(INK_MAX_DPR, window.devicePixelRatio || 1);
    if (width * height * dpr * dpr > INK_MAX_CANVAS_PIXELS) dpr = Math.max(0.5, Math.sqrt(INK_MAX_CANVAS_PIXELS / (width * height)));
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
    drawInkStrokes(ctx, strokes, width, height, inkColor);
  }, [showInk, strokes, width, height, inkColor]);

  // Gizlenen kalem tuvalinin belleğini bırak (Safari).
  useEffect(() => {
    if (!showInk) return;
    const c = inkRef.current;
    return () => freeCanvas(c);
  }, [showInk]);

  // ── Kalem yakalama: kalem ve fare çizer; parmak (avuç) kaydırır ──
  const strokeRef = useRef<{ id: number; pts: PixelPoint[] } | null>(null);
  const redrawRef = useRef<() => void>(() => {});
  redrawRef.current = () => {
    const c = inkRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(c.width / width, 0, 0, c.height / height, 0, 0);
    drawInkStrokes(ctx, strokes, width, height, inkColor);
  };
  const liveRef = useRef({ width, height, inkColor, num, onStroke });
  liveRef.current = { width, height, inkColor, num, onStroke };

  useEffect(() => {
    const el = penRef.current;
    if (!penMode || !active || !el) return;

    const ctxFor = () => {
      const c = inkRef.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return null;
      const { width: w, height: h, inkColor: color } = liveRef.current;
      ctx.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = inkLineWidth(w);
      return ctx;
    };
    // Kutu her olayda yeniden okunur: çizerken parmak sayfayı kaydırırsa nokta kaymasın.
    const local = (e: PointerEvent, box: DOMRect): PixelPoint => ({
      x: ((e.clientX - box.left) * liveRef.current.width) / (box.width || 1),
      y: ((e.clientY - box.top) * liveRef.current.height) / (box.height || 1),
    });

    // Windows/Android kalemi dokunuş olayı vermeyebilir; `touch-action` dokunuşta değiştirilemez.
    // Kalem yaklaşınca (havada) kaydırma kapatılır, parmak dokununca ya da kalem uzaklaşınca açılır.
    const penNear = (on: boolean) => {
      el.style.touchAction = on ? "none" : "";
    };
    const onHover = (e: PointerEvent) => {
      if (e.pointerType === "pen" && e.buttons === 0) penNear(true);
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "pen" && !strokeRef.current) penNear(false);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        if (!strokeRef.current) penNear(false);
        return; // parmak: kaydırma
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (strokeRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* yakalama desteklenmezse olaylar yine gelir */
      }
      const p = local(e, el.getBoundingClientRect());
      strokeRef.current = { id: e.pointerId, pts: [p] };
      const ctx = ctxFor();
      if (ctx) drawInkPolyline(ctx, [p], ctx.lineWidth);
    };
    const onMove = (e: PointerEvent) => {
      const s = strokeRef.current;
      if (!s || s.id !== e.pointerId) return;
      e.preventDefault();
      const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      const ctx = ctxFor();
      const box = el.getBoundingClientRect();
      for (const ev of events.length ? events : [e]) {
        const p = local(ev, box);
        const last = s.pts[s.pts.length - 1];
        if (!shouldAddPoint(last, p)) continue;
        s.pts.push(p);
        if (ctx) drawInkPolyline(ctx, [last, p], ctx.lineWidth);
      }
    };
    const onUp = (e: PointerEvent) => {
      const s = strokeRef.current;
      if (!s || s.id !== e.pointerId) return;
      strokeRef.current = null;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* zaten bırakılmış */
      }
      const last = local(e, el.getBoundingClientRect());
      const prev = s.pts[s.pts.length - 1];
      if (shouldAddPoint(prev, last)) {
        s.pts.push(last);
        const ctx = ctxFor();
        if (ctx) drawInkPolyline(ctx, [prev, last], ctx.lineWidth);
      }
      const { width: w, height: h, num: page, onStroke: emit } = liveRef.current;
      const points = strokeFromPixels(s.pts, w, h);
      if (points.length) emit(page, points);
      else redrawRef.current();
    };
    const onCancel = (e: PointerEvent) => {
      const s = strokeRef.current;
      if (!s || s.id !== e.pointerId) return;
      // Sistem dokunuşu aldı (kaydırma, hareket): yarım çizgi kaydedilmez.
      strokeRef.current = null;
      redrawRef.current();
    };
    // iOS: Apple Pencil dokunuşunda kaydırmayı durdur; parmak dokunuşuna dokunma.
    const onTouch = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (isStylusTouch(t)) {
          if (e.cancelable) e.preventDefault();
          return;
        }
      }
    };

    el.addEventListener("pointerover", onHover);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("lostpointercapture", onCancel);
    el.addEventListener("touchstart", onTouch, { passive: false });
    el.addEventListener("touchmove", onTouch, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("lostpointercapture", onCancel);
      el.removeEventListener("touchstart", onTouch);
      el.removeEventListener("touchmove", onTouch);
      el.removeEventListener("pointerover", onHover);
      el.removeEventListener("pointerleave", onLeave);
      penNear(false);
      if (strokeRef.current) {
        strokeRef.current = null;
        redrawRef.current();
      }
    };
  }, [penMode, active]);

  useEffect(() => {
    const host = canvasHost.current;
    const textEl = textHost.current;
    if (!active || !host || !textEl) return;
    let alive = true;
    let task: PdfRenderTask | null = null;
    let text: PdfTextLayer | null = null;
    let pending: HTMLCanvasElement | null = null;
    (async () => {
      const page = await doc.getPage(num);
      if (!alive) return;
      const viewport = page.getViewport({ scale });
      // Tuval cihaz pikseliyle çizilir (keskin yazı) ama iOS sınırını aşmaz.
      let dpr = window.devicePixelRatio || 1;
      const px = viewport.width * viewport.height;
      if (px * dpr * dpr > MAX_CANVAS_PIXELS) dpr = Math.max(0.5, Math.sqrt(MAX_CANVAS_PIXELS / px));
      const canvas = document.createElement("canvas");
      canvas.className = "lo-pdf__canvas";
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      pending = canvas;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      task = page.render({ canvasContext: ctx, canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      await task.promise;
      if (!alive) return;
      // Yeni tuval hazır olunca eskisiyle değiştir: yakınlaştırırken sayfa boş görünmesin.
      freeCanvases(host);
      host.replaceChildren(canvas);
      pending = null;

      textEl.replaceChildren();
      text = new lib.TextLayer({
        textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
        container: textEl,
        viewport,
      });
      await text.render();
      if (!alive) return;
      // Seçim sayfa sonunda zıplamasın (pdf.js görüntüleyicisindeki yöntem).
      const end = document.createElement("div");
      end.className = "endOfContent";
      textEl.append(end);
    })().catch((e) => {
      if (!isCancel(e) && alive) console.warn(`[pdf] sayfa ${num} çizilemedi:`, e);
    });
    return () => {
      alive = false;
      task?.cancel();
      text?.cancel();
      freeCanvas(pending);
    };
  }, [active, doc, lib, num, scale]);

  // Görünümden çıkan sayfanın tuvalini ve metnini bırak (bellek); pdf.js önbelleğini de temizle.
  // Yalnız açıktan kapalıya geçişte: binlerce sayfalık kitapta açılışta her sayfa için çağrılmasın.
  const wasActive = useRef(false);
  useEffect(() => {
    if (active) {
      wasActive.current = true;
      return;
    }
    if (!wasActive.current) return;
    wasActive.current = false;
    freeCanvases(canvasHost.current);
    canvasHost.current?.replaceChildren();
    textHost.current?.replaceChildren();
    let cancelled = false;
    void doc
      .getPage(num)
      .then((p) => !cancelled && p.cleanup())
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active, doc, num]);

  return (
    <div
      className={"lo-pdf__page" + (active ? " is-active" : "")}
      data-page={num}
      style={{
        left,
        top,
        width,
        height,
        ["--scale-factor" as string]: String(scale),
        ["--total-scale-factor" as string]: String(scale),
        ["--user-unit" as string]: "1",
        ["--scale-round-x" as string]: "1px",
        ["--scale-round-y" as string]: "1px",
      }}
    >
      <div ref={canvasHost} className="lo-pdf__canvas-host" />
      <div className="lo-pdf__hl" aria-hidden>
        {highlights.map((h) =>
          (h.anchor as PdfAnchor).rects.map((r, i) => {
            const b = fromPageRect(r, width, height);
            return (
              <div
                key={h.id + ":" + i}
                className={"lo-pdf__mark" + (h.id === flashId ? " is-flash" : "") + (h.note ? " has-note" : "")}
                style={{ left: b.left, top: b.top, width: b.width, height: b.height, background: HIGHLIGHT_CSS[h.color] }}
              />
            );
          })
        )}
      </div>
      {showInk && <canvas ref={inkRef} className="lo-pdf__ink" aria-hidden />}
      <div ref={textHost} className="textLayer lo-pdf__text" />
      {penMode && active && <div ref={penRef} className="lo-pdf__pen" aria-hidden />}
    </div>
  );
});

// ─── Görüntüleyici ────────────────────────────────────────────────────────────────

type Status = { kind: "loading" } | { kind: "ready"; lib: PdfJs; doc: PdfDocProxy } | { kind: "failed" };

export default function PdfView({
  data,
  fontScale,
  theme,
  highlights,
  initialPosition,
  target,
  onPosition,
  onSelection,
  onHighlightClick,
  onMeta,
  onToc,
  onError,
  ink,
  penMode = false,
  onInkStroke,
  onInkSnapshot,
}: ReaderViewProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  /** Sayfa ölçüleri (ölçek 1). İlk sayfanın ölçüsüyle başlar, arkada gerçekleriyle tamamlanır. */
  const [sizes, setSizes] = useState<Size[] | null>(null);
  const [viewW, setViewW] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, -1]);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Geri çağrılar her çizimde değişebilir; etkileri yeniden kurmamak için ref'te tutulur.
  const cb = useRef({ onPosition, onSelection, onHighlightClick, onMeta, onToc, onError, onInkStroke, onInkSnapshot });
  cb.current = { onPosition, onSelection, onHighlightClick, onMeta, onToc, onError, onInkStroke, onInkSnapshot };
  const penRef = useRef(penMode);
  penRef.current = penMode;
  /** Bekleyen not resimlerini hemen üret (kapanış, arka plana geçiş). Kalem bölümünde atanır. */
  const flushSnapshotsRef = useRef<() => void>(() => {});
  /** Üretilmekte olan not resimleri: belge bunlar bitmeden kapatılmaz. */
  const snapQueueRef = useRef<Promise<void>>(Promise.resolve());
  const hlRef = useRef(highlights);
  hlRef.current = highlights;
  const tRef = useRef(t);
  tRef.current = t;

  // ── Belgeyi aç ──
  useEffect(() => {
    let alive = true;
    let destroy: (() => Promise<void>) | null = null;
    let docRef: PdfDocProxy | null = null;
    setStatus({ kind: "loading" });
    setSizes(null);
    (async () => {
      const lib = await loadPdfJs();
      if (!alive) return;
      // pdf.js baytları çalışana aktarır (kaynak boşalır): kabuğun kopyası bozulmasın.
      const task = lib.getDocument({ data: data.slice(), isEvalSupported: false, enableXfa: false });
      destroy = () => task.destroy();
      const doc = await task.promise;
      if (!alive) return;
      docRef = doc;
      const first = (await doc.getPage(1)).getViewport({ scale: 1 });
      if (!alive) return;
      const base: Size = { w: first.width, h: first.height };
      setSizes(Array.from({ length: doc.numPages }, () => base));
      setStatus({ kind: "ready", lib, doc });

      // Başlık, yazar, sayfa sayısı; içindekiler; kapak (ekran açıldıktan sonra, acele yok).
      void (async () => {
        let title: string | undefined;
        let author: string | undefined;
        try {
          const meta = await doc.getMetadata();
          title = cleanMetaText(meta.info?.Title);
          author = cleanMetaText(meta.info?.Author);
        } catch {
          /* bilgi yoksa yalnız sayfa sayısı */
        }
        if (!alive) return;
        try {
          const outline = await doc.getOutline();
          if (alive && outline?.length && cb.current.onToc) cb.current.onToc(await outlineToToc(doc, outline));
        } catch {
          /* içindekiler isteğe bağlı */
        }
        await new Promise((r) => setTimeout(r, 600));
        if (!alive) return;
        let cover: Blob | undefined;
        try {
          cover = await renderCover(doc);
        } catch (e) {
          if (!isCancel(e)) console.warn("[pdf] kapak çizilemedi:", e);
        }
        if (alive) cb.current.onMeta({ title, author, pages: doc.numPages, cover });
      })();

      // Bütün sayfaların gerçek ölçüleri (karışık boyutlu PDF'ler); parça parça, ana iş beklemez.
      const all: Size[] = Array.from({ length: doc.numPages }, () => base);
      let differs = false;
      for (let i = 2; i <= doc.numPages && alive; i += 40) {
        const chunk = await Promise.all(
          Array.from({ length: Math.min(40, doc.numPages - i + 1) }, (_, k) => doc.getPage(i + k).then((p) => p.getViewport({ scale: 1 })))
        );
        chunk.forEach((vp, k) => {
          if (Math.abs(vp.width - base.w) > 0.5 || Math.abs(vp.height - base.h) > 0.5) differs = true;
          all[i - 1 + k] = { w: vp.width, h: vp.height };
        });
      }
      if (alive && differs) setSizes(all);
    })().catch((e) => {
      if (!alive) return;
      setStatus({ kind: "failed" });
      if (e instanceof PdfJsMissing) {
        cb.current.onError(new Error(tRef.current("library.pdf.missingLib", "PDF okuyucu bu sürümde kurulu değil.")));
      } else if (e && typeof e === "object" && (e as { name?: string }).name === "PasswordException") {
        cb.current.onError(new Error(tRef.current("library.pdf.password", "Bu PDF parolalı; açılamıyor.")));
      } else {
        cb.current.onError(e);
      }
    });
    return () => {
      alive = false;
      // Bekleyen kalem resimleri bu belgeyle üretilir: önce onlar bitsin, sonra belge kapansın.
      flushSnapshotsRef.current();
      const close = () => {
        if (destroy) void destroy().catch(() => {});
        else if (docRef) void docRef.destroy().catch(() => {});
      };
      // Takılan bir çizim belgeyi sonsuza dek açık tutmasın.
      void Promise.race([snapQueueRef.current, new Promise((r) => setTimeout(r, SNAPSHOT_CLOSE_WAIT_MS))]).then(close, close);
    };
  }, [data]);

  // ── Genişliği izle ──
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setViewW(el.clientWidth);
    let tm: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (tm) clearTimeout(tm);
      tm = setTimeout(() => {
        const w = el.clientWidth;
        setViewW((old) => (Math.abs(old - w) < 2 ? old : w));
      }, RESIZE_DEBOUNCE_MS);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (tm) clearTimeout(tm);
    };
  }, []);

  // ── Düzen: genişliğe sığdır × yazı boyutu ──
  const pad = viewW < 600 ? 6 : 20;
  const layout = useMemo(() => {
    if (!sizes?.length || viewW <= 0) return null;
    const fit = Math.min(viewW - pad * 2, MAX_PAGE_WIDTH) / sizes[0].w;
    const scale = Math.max(0.1, fit * fontScale);
    const widths = sizes.map((s) => s.w * scale);
    const heights = sizes.map((s) => s.h * scale);
    const offsets = pageOffsets(heights, GAP, PAD_TOP);
    const maxW = widths.reduce((m, w) => (w > m ? w : m), 0);
    const innerW = Math.max(viewW, maxW + pad * 2);
    const total = offsets[offsets.length - 1] + heights[heights.length - 1] + PAD_BOTTOM;
    const lefts = widths.map((w) => Math.max(pad, (innerW - w) / 2));
    return { scale, widths, heights, offsets, lefts, innerW, total };
  }, [sizes, viewW, fontScale, pad]);

  // Kalınan yer: kaydırdıkça güncellenir; düzen değişince (yazı boyutu, ekran) buna geri dönülür.
  const posRef = useRef<{ page: number; offset: number } | null>(
    initialPosition?.kind === "pdf" ? { page: initialPosition.page, offset: initialPosition.offset } : null
  );
  const restoredRef = useRef(false);
  const lastSentRef = useRef("");
  /** Kaydırma dinleyicisi düzeni buradan okur: dinleyici yeniden kurulmadan önce gelen olay eski düzenle hesaplamasın. */
  const layoutRef = useRef(layout);

  const updateRange = useCallback(() => {
    const el = rootRef.current;
    const lay = layoutRef.current;
    if (!el || !lay) return;
    const [a, b] = visibleRange(lay.offsets, lay.heights, el.scrollTop, el.scrollTop + el.clientHeight);
    setRange((r) => (r[0] === a && r[1] === b ? r : [a, b]));
  }, []);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || !layout) return;
    const prev = layoutRef.current;
    layoutRef.current = layout;
    const p = posRef.current;
    if (p) el.scrollTop = scrollTopFor(layout.offsets, layout.heights, p.page, p.offset);
    // Yatay konum da oranıyla korunur (büyütülmüş sayfada satırın ortası kaybolmasın).
    if (prev && prev.innerW > 0 && prev.innerW !== layout.innerW) el.scrollLeft = (el.scrollLeft * layout.innerW) / prev.innerW;
    restoredRef.current = true;
    updateRange();
  }, [layout, updateRange]);

  // ── Kaydırma ──
  const updateRangeRef = useRef(updateRange);
  updateRangeRef.current = updateRange;
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const lay = layoutRef.current;
        if (!lay) return;
        updateRangeRef.current();
        if (!restoredRef.current) return;
        const { pos, progress } = positionAt(lay.offsets, lay.heights, el.scrollTop);
        if (pos.kind !== "pdf") return;
        posRef.current = { page: pos.page, offset: pos.offset };
        const key = pos.page + ":" + pos.offset.toFixed(3);
        if (key === lastSentRef.current) return;
        lastSentRef.current = key;
        cb.current.onPosition(pos satisfies BookPosition, progress);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // ── Hedefe git (bağlantı, çizim listesi, içindekiler) ──
  const doneSeq = useRef<number | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!target || !layout || !el || doneSeq.current === target.seq) return;
    let page: number | null = null;
    let y = 0;
    if (target.anchor?.kind === "pdf") {
      page = target.anchor.page;
      y = anchorBounds(target.anchor)?.y ?? 0;
    } else if (target.position?.kind === "pdf") {
      page = target.position.page;
      y = target.position.offset;
    }
    if (page == null) return;
    doneSeq.current = target.seq;
    const i = Math.max(0, Math.min(layout.offsets.length - 1, page - 1));
    // Çizim ekranın üst dörtte birine gelsin (bağlamıyla görünsün); sayfa başıysa sayfa üstüne.
    const top = scrollTopFor(layout.offsets, layout.heights, i + 1, y) - (target.anchor ? el.clientHeight * 0.25 : PAD_TOP / 2);
    el.scrollTop = Math.max(0, top);
    const at = positionAt(layout.offsets, layout.heights, el.scrollTop).pos;
    if (at.kind === "pdf") posRef.current = { page: at.page, offset: at.offset };
    if (target.highlightId) setFlashId(target.highlightId);
  }, [target, layout]);

  useEffect(() => {
    if (!flashId) return;
    const tm = setTimeout(() => setFlashId(null), FLASH_MS);
    return () => clearTimeout(tm);
  }, [flashId, target?.seq]);

  // ── Seçim → çizim yeri ──
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let down = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastKey: string | null = null;

    const clear = () => {
      if (lastKey !== null) {
        lastKey = null;
        cb.current.onSelection(null);
      }
    };
    const check = () => {
      timer = null;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return clear();
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return clear();
      const pages: PageBox[] = Array.from(root.querySelectorAll<HTMLElement>(".lo-pdf__page.is-active")).map((el) => {
        const r = el.getBoundingClientRect();
        return { page: Number(el.dataset.page), box: { left: r.left, top: r.top, width: r.width, height: r.height } };
      });
      const anchor = anchorFromClientRects(
        Array.from(range.getClientRects()).map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height })),
        pages
      );
      if (!anchor) return clear();
      // Alıntı çizimin sayfasıyla sınırlı: iki sayfaya taşan seçimde öteki sayfanın metni girmesin.
      const layer = root.querySelector<HTMLElement>(`.lo-pdf__page[data-page="${anchor.page}"] .textLayer`);
      let raw = sel.toString();
      if (layer && !(layer.contains(range.startContainer) && layer.contains(range.endContainer))) {
        const r2 = range.cloneRange();
        if (!layer.contains(range.startContainer)) r2.setStart(layer, 0);
        if (!layer.contains(range.endContainer)) r2.setEnd(layer, layer.childNodes.length);
        raw = r2.toString();
      }
      const text = cleanQuote(raw);
      if (!text) return clear();
      const key = anchor.page + ":" + JSON.stringify(anchor.rects);
      if (key === lastKey) return;
      lastKey = key;
      const pb = pages.find((p) => p.page === anchor.page)!.box;
      const b = anchorBounds(anchor)!;
      const rect: ViewRect = { x: pb.left + b.x * pb.width, y: pb.top + b.y * pb.height, w: b.w * pb.width, h: b.h * pb.height };
      cb.current.onSelection({ text, anchor, rect });
    };
    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, ms);
    };

    const onDown = (e: PointerEvent) => {
      down = true;
      (e.target as HTMLElement).closest?.(".textLayer")?.classList.add("selecting");
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      root.querySelectorAll(".textLayer.selecting").forEach((n) => n.classList.remove("selecting"));
      schedule(40);
    };
    // Dokunmatikte seçim tutamaçları sürüklenirken işaretçi olayı gelmez; seçim durulunca bakılır.
    const onSelChange = () => !down && schedule(250);

    // Var olan çizime dokunma: seçim yoksa noktayı çizimlerle karşılaştır.
    const onClick = (e: MouseEvent) => {
      if (penRef.current) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const pageEl = (e.target as HTMLElement).closest?.<HTMLElement>(".lo-pdf__page");
      if (!pageEl) return;
      const pr = pageEl.getBoundingClientRect();
      const page = Number(pageEl.dataset.page);
      const x = (e.clientX - pr.left) / pr.width;
      const y = (e.clientY - pr.top) / pr.height;
      for (let i = hlRef.current.length - 1; i >= 0; i--) {
        const h = hlRef.current[i];
        if (h.anchor.kind !== "pdf" || !anchorHit(h.anchor, page, x, y)) continue;
        const b = anchorBounds(h.anchor);
        if (!b) continue;
        cb.current.onHighlightClick(h.id, { x: pr.left + b.x * pr.width, y: pr.top + b.y * pr.height, w: b.w * pr.width, h: b.h * pr.height });
        return;
      }
    };

    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("selectionchange", onSelChange);
    root.addEventListener("click", onClick);
    return () => {
      if (timer) clearTimeout(timer);
      root.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("selectionchange", onSelChange);
      root.removeEventListener("click", onClick);
    };
  }, []);

  // Yazı boyutu değişince seçim kutuları eski ölçekte kalır: menüyü kapat.
  useEffect(() => {
    window.getSelection()?.removeAllRanges();
  }, [fontScale]);

  // Çizimler sayfa sayfa (yalnız PDF çıpalıları).
  const byPage = useMemo(() => {
    const m = new Map<number, Highlight[]>();
    for (const h of highlights) {
      if (h.anchor.kind !== "pdf") continue;
      const list = m.get(h.anchor.page) ?? [];
      list.push(h);
      m.set(h.anchor.page, list);
    }
    return m;
  }, [highlights]);

  // ── Kalem ──
  // Kasa yeniden okununca kayıt yeni nesnelerle gelir; içerik (çizgi kimlikleri) aynıysa
  // eski diziyi/haritayı koru ki not resmi ve katman çizimi boş yere yeniden tetiklenmesin.
  const inkStableRef = useRef<Map<number, readonly InkStroke[]>>(new Map());
  const inkByPage = useMemo(() => {
    const prev = inkStableRef.current;
    const m = new Map<number, readonly InkStroke[]>();
    let same = true;
    for (const p of ink ?? []) {
      if (!p.strokes.length) continue;
      const old = prev.get(p.page);
      if (old && sameStrokeIds(old, p.strokes)) m.set(p.page, old);
      else {
        m.set(p.page, p.strokes);
        same = false;
      }
    }
    if (same && m.size === prev.size) return prev;
    inkStableRef.current = m;
    return m;
  }, [ink]);
  const inkMapRef = useRef(inkByPage);
  inkMapRef.current = inkByPage;

  // Kalem açılınca metin seçimi kalksın (renk menüsü kapanır).
  useEffect(() => {
    if (penMode) window.getSelection()?.removeAllRanges();
  }, [penMode]);

  /** Bu oturumda çizilen sayfalar: yalnız bunların (ve o an okunan sayfanın) resmi üretilir. */
  const touchedRef = useRef(new Set<number>());
  const onStroke = useCallback((page: number, points: InkPoint[]) => {
    touchedRef.current.add(page);
    cb.current.onInkStroke?.(page, points);
  }, []);

  const docRefForInk = useRef<PdfDocProxy | null>(null);
  docRefForInk.current = status.kind === "ready" ? status.doc : null;
  const snapJobs = useRef(new Map<number, SnapJob>());

  const runSnapshot = useCallback((page: number, job: Omit<SnapJob, "tm">) => {
    // Sırayla: aynı anda tek ekran dışı tuval (iOS belleği).
    snapQueueRef.current = snapQueueRef.current.then(async () => {
      try {
        const png = await renderInkSnapshot(job.doc, page, job.strokes);
        if (png) job.emit(page, png);
      } catch (e) {
        if (!isCancel(e)) console.warn(`[pdf] sayfa ${page} kalem resmi üretilemedi:`, e);
      }
    });
  }, []);

  flushSnapshotsRef.current = () => {
    const jobs = [...snapJobs.current.entries()];
    snapJobs.current.clear();
    for (const [page, job] of jobs) {
      clearTimeout(job.tm);
      runSnapshot(page, job);
    }
  };

  // Sayfanın çizgileri değişince (çizgi, geri al) gecikmeli not resmi.
  const prevInkRef = useRef<Map<number, readonly InkStroke[]> | null>(null);
  useEffect(() => {
    const prev = prevInkRef.current;
    prevInkRef.current = inkByPage;
    if (!prev) return; // açılıştaki kayıt: resmi zaten var
    const pages = new Set([...prev.keys(), ...inkByPage.keys()]);
    for (const page of pages) {
      if (prev.get(page) === inkByPage.get(page)) continue;
      const own = touchedRef.current.has(page) || posRef.current?.page === page;
      const old = snapJobs.current.get(page);
      if (old) clearTimeout(old.tm);
      snapJobs.current.delete(page);
      const strokes = inkByPage.get(page);
      const doc = docRefForInk.current;
      const emit = cb.current.onInkSnapshot;
      if (!own || !strokes?.length || !doc || !emit) continue;
      const job: SnapJob = {
        doc,
        strokes,
        emit,
        tm: setTimeout(() => {
          snapJobs.current.delete(page);
          runSnapshot(page, job);
        }, SNAPSHOT_DELAY_MS),
      };
      snapJobs.current.set(page, job);
    }
  }, [inkByPage, runSnapshot]);

  // Uygulama arka plana geçince / sayfa kapanırken bekleyen resimleri hemen üret.
  useEffect(() => {
    const onVis = () => document.visibilityState === "hidden" && flushSnapshotsRef.current();
    const onHide = () => flushSnapshotsRef.current();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  const ready = status.kind === "ready" ? status : null;
  const from = Math.max(0, range[0] - OVERSCAN);
  const to = range[1] + OVERSCAN;
  const themeClass: Record<ReaderTheme, string> = { light: "", dark: " is-dark", sepia: " is-sepia" };

  return (
    <div ref={rootRef} className={"lo-pdf" + themeClass[theme] + (penMode ? " is-pen" : "")} dir="ltr">
      {status.kind === "loading" && (
        <div className="lo-reader__state">
          <Loader2 size={24} strokeWidth={2} className="lo-spin" aria-hidden />
          <p>{t("library.loading")}</p>
        </div>
      )}
      {ready && layout && (
        <div className="lo-pdf__inner" style={{ width: layout.innerW, height: layout.total }}>
          {layout.heights.map((h, i) => (
            <PdfPage
              key={i}
              doc={ready.doc}
              lib={ready.lib}
              num={i + 1}
              left={layout.lefts[i]}
              top={layout.offsets[i]}
              width={layout.widths[i]}
              height={h}
              scale={layout.scale}
              active={i >= from && i <= to}
              highlights={byPage.get(i + 1) ?? EMPTY}
              flashId={flashId}
              strokes={inkByPage.get(i + 1) ?? NO_STROKES}
              penMode={penMode}
              dark={theme === "dark"}
              onStroke={onStroke}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY: Highlight[] = [];
/** Çizgiler değişmez nesnelerdir: aynı kimlik sırası = aynı içerik. */
function sameStrokeIds(a: readonly InkStroke[], b: readonly InkStroke[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id) return false;
  return true;
}

const NO_STROKES: readonly InkStroke[] = [];

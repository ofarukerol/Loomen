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

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { BookPosition, Highlight, PdfAnchor, ReaderTheme } from "../../../core/library/types";
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
}

const PdfPage = memo(function PdfPage({ doc, lib, num, left, top, width, height, scale, active, highlights, flashId }: PageProps) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);

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
      <div ref={textHost} className="textLayer lo-pdf__text" />
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
  const cb = useRef({ onPosition, onSelection, onHighlightClick, onMeta, onToc, onError });
  cb.current = { onPosition, onSelection, onHighlightClick, onMeta, onToc, onError };
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
      if (destroy) void destroy().catch(() => {});
      else if (docRef) void docRef.destroy().catch(() => {});
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

  const ready = status.kind === "ready" ? status : null;
  const from = Math.max(0, range[0] - OVERSCAN);
  const to = range[1] + OVERSCAN;
  const themeClass: Record<ReaderTheme, string> = { light: "", dark: " is-dark", sepia: " is-sepia" };

  return (
    <div ref={rootRef} className={"lo-pdf" + themeClass[theme]} dir="ltr">
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY: Highlight[] = [];

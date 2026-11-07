// EPUB görüntüleyici (LOM-83, parça 3). Dış kütüphane yok: ZIP ve yapı `core/library/zip.ts` ve
// `epub.ts`'te, çizim yeri hesabı `epubAnchor.ts`'te.
//
// Kitap bölüm bölüm, alt alta kayan tek sütunda gösterilir. Bölüm XHTML'i DOMParser ile açılır
// ve temizlenir: betik, çerçeve, form, olay öznitelikleri ve dış adresler atılır; resimler ve
// CSS'teki url() arşivden blob: adresine çevrilir; bölüm CSS'i okuyucu kabına kapsamlanır
// (uygulamanın görünümüne sızmaz). Shadow DOM kullanılmaz: WebKit'te seçim (Selection) gölge
// ağaca girmiyor, çizim yapılamazdı.
//
// Çizim yeri = bölümün temizlenmiş gövdesindeki düz metinde [start, end) aralığı. Yazı boyutu,
// tema ve pencere genişliği metni değiştirmez; çizimler yerinde kalır (K5). Çizimler <mark> ile
// sarılır; sarmak metni değiştirmediği için konumlar sarmadan sonra da geçerlidir.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, List, Loader2, X } from "lucide-react";
import type { BookPosition, EpubAnchor, Highlight, ReaderTheme } from "../../../core/library/types";
import { cleanQuote } from "../../../core/library/model";
import { readZip, type ZipArchive } from "../../../core/library/zip";
import {
  EpubError,
  chapterTitle,
  epubProgress,
  isExternalHref,
  mimeOf,
  parseEpub,
  resolveHref,
  scopeCss,
  spineIndexOf,
  type EpubStructure,
} from "../../../core/library/epub";
import { locateOffset, paintSegments, prefixOffsets, relocateRange, trimRange } from "../../../core/library/epubAnchor";
import { HIGHLIGHT_CSS, type ReaderViewProps, type TocItem, type ViewRect } from "../readerTypes";
import "./epubView.css";

/** Bölüm içeriğinin kapsam seçicisi (kitap CSS'i yalnız bunun içinde geçerli). */
const SCOPE = ".lo-epub__body";
const FLASH_MS = 1800;
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/** Bölümden tamamen atılan öğeler (küçük harfle). */
const DROP = new Set([
  "script",
  "style",
  "link",
  "meta",
  "base",
  "title",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "noscript",
  "template",
  "audio",
  "video",
  "source",
  "track",
  "portal",
  "dialog",
  "foreignobject",
  "set",
  "animate",
  "animatemotion",
  "animatetransform",
  "handler",
  "listener",
]);

interface Loaded {
  zip: ZipArchive;
  s: EpubStructure;
}

/** Boyalı bölümün metin düğümleri ve konumları (seçim, kalınan yer ve atlama bunu kullanır). */
interface TextMap {
  nodes: Text[];
  starts: number[];
  full: string;
}

/** Bölüm açılınca ya da atlama isteğinde gidilecek yer. */
interface Jump {
  offset?: number;
  fragment?: string;
  highlightId?: string;
  /** Yer kullanıcı isteğiyle değişti: kalınan yer olarak bildir. */
  emit: boolean;
}

function errMessage(e: unknown, t: (k: string, d: string) => string): Error {
  if (e instanceof EpubError) {
    if (e.code === "drm") return new Error(t("library.epub.drm", "Bu kitap DRM ile korunuyor; açılamıyor."));
    if (e.code === "notEpub") return new Error(t("library.epub.notEpub", "Bu dosya geçerli bir EPUB değil."));
  }
  return e instanceof Error ? e : new Error(String(e));
}

// ─── Kaynaklar (resim, CSS) ───────────────────────────────────────────────────────

class Resources {
  private urls = new Map<string, string>();
  private types = new Map<string, string>();
  constructor(private zip: ZipArchive, s: EpubStructure) {
    for (const m of s.manifest) if (m.mediaType) this.types.set(m.path, m.mediaType);
  }
  /** Arşivdeki dosyanın blob: adresi; yoksa null. */
  url(path: string): string | null {
    const real = this.zip.resolve(path);
    if (!real) return null;
    const hit = this.urls.get(real);
    if (hit) return hit;
    try {
      const bytes = this.zip.read(real);
      const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(real, this.types.get(real)) }));
      this.urls.set(real, u);
      return u;
    } catch (e) {
      console.warn("[epub] kaynak okunamadı:", real, e);
      return null;
    }
  }
  /** `base` dosyasına göre göreli adres → blob: adresi. Resim olan data: adresi olduğu gibi geçer. */
  resolve(base: string, href: string): string | null {
    const h = href.trim();
    if (/^data:image\//i.test(h)) return h;
    if (isExternalHref(h)) return null;
    const r = resolveHref(base, h);
    return r ? this.url(r.path) : null;
  }
  dispose() {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
  }
}

// ─── Bölümü aç ve temizle ─────────────────────────────────────────────────────────

function parseChapter(text: string): Document {
  const parser = new DOMParser();
  const x = parser.parseFromString(text, "application/xhtml+xml");
  if (!x.getElementsByTagName("parsererror").length && x.body) return x;
  // Bozuk XHTML (kapanmamış etiket, HTML varlığı): hoşgörülü HTML ayrıştırıcısı.
  return parser.parseFromString(text, "text/html");
}

/** Satır içi stil: kapsamlayıcıdan geçirilir (url, ifade, sabit konum temizlenir). */
function cleanInlineStyle(style: string, base: string, res: Resources): string {
  const out = scopeCss(`x{${style}}`, "", (u) => res.resolve(base, u));
  const a = out.indexOf("{");
  const b = out.lastIndexOf("}");
  return a >= 0 && b > a ? out.slice(a + 1, b).trim() : "";
}

interface Built {
  body: HTMLDivElement;
  css: string;
}

/** Bölüm ve CSS için üst sınır: çok büyük metin ayrıştırılırken arayüz donar. */
const MAX_CHAPTER_BYTES = 24 * 1024 * 1024;
const MAX_CSS_BYTES = 4 * 1024 * 1024;

function buildChapter(zip: ZipArchive, path: string, res: Resources): Built {
  if (zip.sizeOf(path) > MAX_CHAPTER_BYTES) throw new Error("Bölüm çok büyük");
  const doc = parseChapter(zip.readText(path));
  const cssParts: string[] = [];

  // Kitap CSS'i: bağlı dosyalar ve <style> blokları, sırayla.
  for (const el of Array.from(doc.querySelectorAll("link, style"))) {
    if (el.localName === "link") {
      const rel = (el.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
      const href = el.getAttribute("href");
      if (!rel.includes("stylesheet") || rel.includes("alternate") || !href) continue;
      const r = resolveHref(path, href);
      const real = r && zip.resolve(r.path);
      if (!real || zip.sizeOf(real) > MAX_CSS_BYTES) continue;
      try {
        cssParts.push(scopeCss(zip.readText(real), SCOPE, (u) => res.resolve(real, u)));
      } catch (e) {
        console.warn("[epub] CSS okunamadı:", real, e);
      }
    } else {
      cssParts.push(scopeCss(el.textContent ?? "", SCOPE, (u) => res.resolve(path, u)));
    }
  }

  const body = document.createElement("div");
  body.className = SCOPE.slice(1);
  const srcBody = doc.body;
  if (srcBody) {
    // Temizlik ayrıştırılmış (etkisiz) belgede yapılır; uygulamanın belgesine yalnız temiz düğüm
    // aktarılır. Önce aktarılsaydı resimler temizlenmeden yüklenmeye başlardı.
    sanitize(srcBody, path, res);
    for (const child of Array.from(srcBody.childNodes)) body.appendChild(document.importNode(child, true));
    // <body class="..."> kitap CSS'inde "body.x" olarak geçer; kapta da aynı sınıflar olsun.
    for (const c of Array.from(srcBody.classList)) if (/^[\w-]+$/.test(c) && !c.startsWith("lo-")) body.classList.add(c);
    const lang = srcBody.getAttribute("lang") ?? srcBody.getAttribute("xml:lang") ?? doc.documentElement.getAttribute("lang") ?? doc.documentElement.getAttribute("xml:lang");
    if (lang) body.lang = lang;
    const dir = srcBody.getAttribute("dir") ?? doc.documentElement.getAttribute("dir");
    if (dir === "rtl" || dir === "ltr") body.dir = dir;
  }
  return { body, css: cssParts.filter(Boolean).join("\n") };
}

function sanitize(root: HTMLElement, base: string, res: Resources) {
  // Önce yapısal temizlik: yorum, işlem talimatı ve CDATA (CDATA düz metne çevrilir: metin
  // konumları yalnız Text düğümlerinden hesaplanır).
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ALL);
  const removeNodes: Node[] = [];
  const cdata: Node[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.COMMENT_NODE || n.nodeType === Node.PROCESSING_INSTRUCTION_NODE) removeNodes.push(n);
    else if (n.nodeType === Node.CDATA_SECTION_NODE) cdata.push(n);
    else if (n.nodeType === Node.ELEMENT_NODE && DROP.has((n as Element).localName.toLowerCase())) removeNodes.push(n);
  }
  const owner = root.ownerDocument;
  for (const n of cdata) n.parentNode?.replaceChild(owner.createTextNode((n as CharacterData).data), n);
  for (const n of removeNodes) n.parentNode?.removeChild(n);

  for (const el of Array.from(root.querySelectorAll("*"))) {
    const name = el.localName.toLowerCase();
    const isSvg = el.namespaceURI === SVG_NS;
    // Görüntüleyicinin kendi işaretleri kitaptan gelemez (sahte çizim, sahte bağlantı). Önce
    // bunlar silinir; aşağıda kimlik taşınırken yazılan data-epub-id sonra silinmesin.
    for (const a of Array.from(el.attributes)) {
      const an = a.name.toLowerCase();
      if (an.startsWith("data-epub-") || an === "data-hl" || an === "data-hls") el.removeAttributeNode(a);
    }
    for (const a of Array.from(el.attributes)) {
      const an = a.name.toLowerCase();
      const v = a.value;
      if (
        an.startsWith("on") ||
        an === "srcset" ||
        an === "formaction" ||
        an === "action" ||
        an === "ping" ||
        an === "contenteditable" ||
        an === "autofocus" ||
        an === "background" ||
        an === "poster" ||
        an === "usemap"
      ) {
        // Olaylar ve adres alanları.
        el.removeAttributeNode(a);
      } else if (an === "id") {
        // Kitabın kimlikleri uygulamanınkilerle çakışmasın: veri özniteliğine taşınır (#parça
        // bağlantıları ve kitap CSS'indeki #kimlik bunu kullanır). SVG içi başvurular (use, url(#g),
        // clip-path) için SVG öğelerinde kimlik kalır.
        if (!isSvg) el.removeAttributeNode(a);
        el.setAttribute("data-epub-id", v);
      } else if (an === "class") {
        // Uygulamanın sınıfları (lo-…) kitaptan gelemez.
        const cls = v.split(/\s+/).filter((c) => c && !c.startsWith("lo-"));
        if (cls.length) el.setAttribute("class", cls.join(" "));
        else el.removeAttribute("class");
      } else if (isSvg && /url\(\s*['"]?\s*[^#\s'"]/i.test(v)) {
        // SVG sunum öznitelikleri (fill, filter, mask …) yalnız belge içi #başvuru alabilir.
        el.removeAttributeNode(a);
      } else if (an === "style") {
        const st = cleanInlineStyle(v, base, res);
        if (st) el.setAttribute("style", st);
        else el.removeAttribute("style");
      } else if (/^(javascript|vbscript):/i.test(v.trim().replace(/[\s\u0000-\u001f]+/g, ""))) {
        el.removeAttributeNode(a);
      }
    }
    if (name === "a" && !isSvg) {
      const href = el.getAttribute("href");
      const nm = el.getAttribute("name");
      if (nm && !el.hasAttribute("data-epub-id")) el.setAttribute("data-epub-id", nm);
      el.removeAttribute("target");
      if (href) {
        const r = isExternalHref(href) ? null : resolveHref(base, href);
        el.removeAttribute("href");
        if (r) {
          el.setAttribute("data-epub-href", r.path + (r.fragment ? "#" + r.fragment : ""));
          el.setAttribute("href", "#");
        } else if (/^https?:/i.test(href.trim())) {
          el.setAttribute("title", href.trim());
        }
      }
    } else if (name === "img") {
      const src = el.getAttribute("src");
      const u = src ? res.resolve(base, src) : null;
      if (u) el.setAttribute("src", u);
      else el.removeAttribute("src");
      el.setAttribute("draggable", "false");
    } else if (isSvg) {
      // SVG: resim öğeleri arşivden blob: alır; diğerleri yalnız belge içi #başvuru tutar.
      for (const attrName of ["href", "xlink:href"]) {
        const v = attrName === "href" ? el.getAttribute("href") : el.getAttributeNS(XLINK_NS, "href");
        if (v == null) continue;
        const keep = v.trim().startsWith("#") && name !== "image";
        const u = name === "image" || name === "feimage" ? res.resolve(base, v) : null;
        if (attrName === "href") el.removeAttribute("href");
        else el.removeAttributeNS(XLINK_NS, "href");
        if (u || keep) el.setAttribute("href", u ?? v);
      }
    } else if (el.hasAttribute("href")) {
      // <area>, <link> benzeri öğeler: adres bırakılmaz (tıklanınca uygulama penceresi gitmesin).
      el.removeAttribute("href");
    }
  }
}

// ─── Metin, çizim ve konum yardımcıları ───────────────────────────────────────────

function collectText(root: HTMLElement): TextMap {
  const nodes: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n as Text);
  const starts = prefixOffsets(nodes.map((n) => n.data.length));
  return { nodes, starts, full: nodes.map((n) => n.data).join("") };
}

/** Bölüm metnindeki konum: kabın başından sınır noktasına kadarki metin uzunluğu. */
function pointOffset(root: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

function unwrapMarks(root: HTMLElement) {
  const marks = root.querySelectorAll("mark.lo-epub__mark");
  if (!marks.length) return;
  for (const m of Array.from(marks)) {
    const parent = m.parentNode;
    if (!parent) continue;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
  }
  root.normalize();
}

/** Bölümdeki çizimleri <mark> ile boya. Önce eskileri söker; metin değişmez. */
function paint(root: HTMLElement, highlights: Highlight[]): TextMap {
  unwrapMarks(root);
  const map = collectText(root);
  if (!highlights.length) return map;
  // En yeni çizim üstte görünsün: eklenme sırasıyla.
  const ordered = [...highlights].sort((a, b) => a.createdAt - b.createdAt);
  const byId = new Map(ordered.map((h) => [h.id, h]));
  const ranges = [];
  for (const h of ordered) {
    const a = h.anchor as EpubAnchor;
    const r = relocateRange(map.full, a.start, a.end, h.text);
    if (r) ranges.push({ id: h.id, start: r[0], end: r[1] });
  }
  const segs = paintSegments(
    map.nodes.map((n) => n.data.length),
    ranges
  );
  // Düğüm düğüm, sondan başa: bölünen düğümün baş kısmı önceki parçalar için geçerli kalır.
  for (let i = segs.length - 1; i >= 0; i--) {
    const sg = segs[i];
    const node = map.nodes[sg.node];
    const parent = node.parentElement;
    if (!parent || parent.namespaceURI === SVG_NS) continue;
    if (!/\S/.test(node.data.slice(sg.from, sg.to))) continue; // tablo/liste arası boşluk
    let piece = node;
    if (sg.to < piece.data.length) piece.splitText(sg.to);
    if (sg.from > 0) piece = piece.splitText(sg.from);
    const top = byId.get(sg.ids[sg.ids.length - 1]);
    if (!top) continue;
    const mark = document.createElement("mark");
    mark.className = "lo-epub__mark" + (sg.ids.some((id) => byId.get(id)?.note) ? " has-note" : "");
    mark.dataset.hl = top.id;
    mark.dataset.hls = sg.ids.join(" ");
    mark.style.setProperty("background-color", HIGHLIGHT_CSS[top.color], "important");
    piece.parentNode!.insertBefore(mark, piece);
    mark.appendChild(piece);
  }
  return collectText(root);
}

function unionRect(els: Element[]): ViewRect | null {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const el of els) {
    for (const c of Array.from(el.getClientRects())) {
      if (!c.width && !c.height) continue;
      l = Math.min(l, c.left);
      t = Math.min(t, c.top);
      r = Math.max(r, c.right);
      b = Math.max(b, c.bottom);
    }
  }
  return Number.isFinite(l) ? { x: l, y: t, w: r - l, h: b - t } : null;
}

type CaretDoc = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

/** Ekrandaki noktanın metin konumu (yoksa null). */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as CaretDoc;
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    if (p) return { node: p.offsetNode, offset: p.offset };
  }
  if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y);
    if (r) return { node: r.startContainer, offset: r.startOffset };
  }
  return null;
}

/** Metin konumunun ekrandaki dikdörtgeni (görünmeyen boşluk düğümünde üst öğeninki). */
function offsetRect(map: TextMap, offset: number): DOMRect | null {
  const p = locateOffset(map.starts, offset, "start");
  if (!p) return null;
  const node = map.nodes[p.node];
  const r = document.createRange();
  r.setStart(node, p.offset);
  r.setEnd(node, Math.min(node.data.length, p.offset + 1));
  const rects = r.getClientRects();
  if (rects.length && (rects[0].width || rects[0].height)) return rects[0];
  return node.parentElement?.getBoundingClientRect() ?? null;
}

// ─── Görüntüleyici ────────────────────────────────────────────────────────────────

export default function EpubView({
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
  const tt = useCallback((k: string, d: string, o?: Record<string, unknown>) => String(t(k, { defaultValue: d, ...o })), [t]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLStyleElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [renderTick, setRenderTick] = useState(0);

  const cb = useRef({ onPosition, onSelection, onHighlightClick, onMeta, onToc, onError });
  cb.current = { onPosition, onSelection, onHighlightClick, onMeta, onToc, onError };
  const ttRef = useRef(tt);
  ttRef.current = tt;

  const resRef = useRef<Resources | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<TextMap | null>(null);
  const shownRef = useRef(-1);
  const jumpRef = useRef<Jump | null>(null);
  /** Kalınan yer (bölüm metnindeki ofset) — yazı boyutu değişince ve resim yüklenince buna dönülür. */
  const posRef = useRef<{ spine: number; offset: number } | null>(null);
  /** Kullanıcı kaydırmaya başlayana kadar konum korunur (resimler sonradan yüklenip metni iterse). */
  const holdRef = useRef(true);
  const lastSentRef = useRef("");

  // ── Kitabı aç ──
  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setFailed(false);
    let res: Resources | null = null;
    // Bir sonraki çerçevede: yükleniyor göstergesi önce çizilsin.
    const tm = setTimeout(() => {
      try {
        const zip = readZip(data);
        const s = parseEpub(zip);
        if (!alive) return;
        res = new Resources(zip, s);
        resRef.current = res;
        let start = 0;
        if (initialPosition?.kind === "epub") {
          start = spineIndexOf(s, initialPosition.href, initialPosition.spine);
          posRef.current = { spine: start, offset: initialPosition.offset };
          jumpRef.current = { offset: initialPosition.offset, emit: false };
        }
        shownRef.current = -1;
        setChapter(start);
        setLoaded({ zip, s });

        // İçindekiler ve kitap bilgisi (kapak dahil).
        cb.current.onToc?.(
          s.toc
            .filter((e) => e.spine >= 0)
            .map((e): TocItem => ({ label: e.label, depth: e.depth, position: { kind: "epub", spine: e.spine, href: s.spine[e.spine].path, offset: 0 } }))
        );
        let cover: Blob | undefined;
        if (s.coverPath) {
          try {
            cover = new Blob([zip.read(s.coverPath) as BlobPart], { type: mimeOf(s.coverPath, s.coverType) });
          } catch (e) {
            console.warn("[epub] kapak okunamadı:", e);
          }
        }
        cb.current.onMeta({ title: s.title, author: s.author, pages: s.spine.length, cover });
      } catch (e) {
        if (!alive) return;
        console.warn("[epub] kitap açılamadı:", e);
        setFailed(true);
        cb.current.onError(errMessage(e, (k, d) => ttRef.current(k, d)));
      }
    }, 0);
    return () => {
      alive = false;
      clearTimeout(tm);
      res?.dispose();
      if (resRef.current === res) resRef.current = null;
    };
    // initialPosition yalnız açılışta okunur (kabuk sabit tutar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const s = loaded?.s ?? null;

  /** Konumu bildir (yalnız değiştiyse). */
  const emitPosition = useCallback((spine: number, offset: number, fraction: number) => {
    if (!s) return;
    const href = s.spine[spine]?.path;
    if (!href) return;
    posRef.current = { spine, offset };
    const key = spine + ":" + offset;
    if (key === lastSentRef.current) return;
    lastSentRef.current = key;
    const pos: BookPosition = { kind: "epub", spine, href, offset };
    cb.current.onPosition(pos, epubProgress(s, spine, fraction));
  }, [s]);

  /** Bekleyen atlamayı uygula (bölüm çizildikten sonra). */
  const applyJump = useCallback(() => {
    const sc = scrollRef.current;
    const map = mapRef.current;
    const body = bodyRef.current;
    const j = jumpRef.current;
    if (!sc || !map || !body || !j) return;
    const top = sc.getBoundingClientRect().top;
    let y: number | null = null;
    let offset = j.offset;
    if (j.highlightId) {
      const marks = Array.from(body.querySelectorAll<HTMLElement>("mark.lo-epub__mark")).filter((m) => (m.dataset.hls ?? "").split(" ").includes(j.highlightId!));
      if (marks.length) {
        const r = marks[0].getBoundingClientRect();
        y = r.top - top - sc.clientHeight * 0.25;
        offset = pointOffset(body, marks[0], 0);
        for (const m of marks) m.classList.add("is-flash");
        setTimeout(() => marks.forEach((m) => m.classList.remove("is-flash")), FLASH_MS);
      }
    }
    if (y === null && j.fragment) {
      const el = Array.from(body.querySelectorAll<HTMLElement>("[data-epub-id]")).find((e) => e.dataset.epubId === j.fragment);
      if (el) {
        y = el.getBoundingClientRect().top - top - 8;
        offset = pointOffset(body, el, 0);
      }
    }
    if (y === null && offset !== undefined && offset > 0) {
      const r = offsetRect(map, offset);
      if (r) y = r.top - top - 8;
    }
    sc.scrollTop = Math.max(0, sc.scrollTop + (y ?? -sc.scrollTop));
    const spine = shownRef.current;
    posRef.current = { spine, offset: offset ?? 0 };
    if (j.emit) {
      const max = sc.scrollHeight - sc.clientHeight;
      emitPosition(spine, offset ?? 0, max > 0 ? sc.scrollTop / max : 0);
    }
    // Atlama bir kez uygulanır; sonrasında yalnız kalınan yer korunur.
    jumpRef.current = null;
  }, [emitPosition]);

  /** Kalınan yere dön (yazı boyutu değişti, resim yüklendi). */
  const holdPosition = useCallback(() => {
    const sc = scrollRef.current;
    const map = mapRef.current;
    const p = posRef.current;
    if (!sc || !map || !p || p.spine !== shownRef.current) return;
    if (p.offset <= 0) {
      sc.scrollTop = 0;
      return;
    }
    const r = offsetRect(map, p.offset);
    if (r) sc.scrollTop = Math.max(0, sc.scrollTop + r.top - sc.getBoundingClientRect().top - 8);
  }, []);

  /** Gösterilen bölümün çizimleri; bölüm çizimi ve yeniden boyama aynı listeyi kullanır. */
  const chapterHls = useMemo(
    () => (s ? highlights.filter((h) => h.anchor.kind === "epub" && spineIndexOf(s, h.anchor.href, h.anchor.spine) === chapter) : []),
    [highlights, s, chapter]
  );
  const chapterHlsRef = useRef(chapterHls);
  chapterHlsRef.current = chapterHls;
  const paintedRef = useRef<Highlight[] | null>(null);

  // ── Bölümü çiz ──
  useLayoutEffect(() => {
    const host = hostRef.current;
    const res = resRef.current;
    if (!loaded || !host || !res) return;
    const item = loaded.s.spine[chapter];
    if (!item) return;
    let built: Built;
    try {
      built = buildChapter(loaded.zip, item.path, res);
    } catch (e) {
      console.warn("[epub] bölüm açılamadı:", item.path, e);
      const div = document.createElement("div");
      div.className = SCOPE.slice(1) + " is-broken";
      const p = document.createElement("p");
      p.textContent = ttRef.current("library.epub.chapterError", "Bu bölüm açılamadı.");
      div.append(p);
      built = { body: div, css: "" };
    }
    if (styleRef.current) styleRef.current.textContent = built.css;
    host.replaceChildren(built.body);
    bodyRef.current = built.body;
    shownRef.current = chapter;
    // Aynı çizim listesi boya etkisine de bildirilir: hemen ardından ikinci kez boyamasın
    // (yeniden boyama işaretleri söker; atlamanın yanıp sönmesi kaybolurdu).
    const hls = chapterHlsRef.current;
    paintedRef.current = hls;
    mapRef.current = paint(built.body, hls);
    const sc = scrollRef.current;
    if (sc) sc.scrollTop = 0;
    holdRef.current = true;
    if (jumpRef.current) applyJump();
    else posRef.current = { spine: chapter, offset: 0 };
    setRenderTick((n) => n + 1);
  }, [loaded, chapter, applyJump]);

  // ── Çizimler değişince yeniden boya (kaydırma yeri değişmez) ──
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || renderTick === 0) return;
    if (paintedRef.current === chapterHls) return;
    paintedRef.current = chapterHls;
    mapRef.current = paint(body, chapterHls);
  }, [chapterHls, renderTick]);

  // ── Yazı boyutu: kalınan yer korunur ──
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    sc.style.setProperty("--lo-epub-scale", String(fontScale));
    window.getSelection()?.removeAllRanges();
    holdRef.current = true;
    holdPosition();
  }, [fontScale, holdPosition]);

  // İçerik boyu değişince (resim yüklendi, pencere daraldı) kullanıcı kaydırmadıysa yerinde kal.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !loaded) return;
    const ro = new ResizeObserver(() => holdRef.current && holdPosition());
    ro.observe(host);
    return () => ro.disconnect();
  }, [loaded, holdPosition]);

  // ── Hedefe git (bağlantı, çizim listesi, içindekiler) ──
  const doneSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!target || !s || doneSeq.current === target.seq) return;
    let spine: number | null = null;
    let offset = 0;
    if (target.anchor?.kind === "epub") {
      spine = spineIndexOf(s, target.anchor.href, target.anchor.spine);
      offset = target.anchor.start;
    } else if (target.position?.kind === "epub") {
      spine = spineIndexOf(s, target.position.href, target.position.spine);
      offset = target.position.offset;
    }
    if (spine === null) return;
    doneSeq.current = target.seq;
    jumpRef.current = { offset, highlightId: target.highlightId, emit: true };
    setTocOpen(false);
    if (spine !== shownRef.current) setChapter(spine);
    else applyJump();
  }, [target, s, applyJump]);

  const goChapter = useCallback(
    (spine: number, fragment?: string) => {
      if (!s || spine < 0 || spine >= s.spine.length) return;
      jumpRef.current = { offset: 0, fragment, emit: true };
      setTocOpen(false);
      window.getSelection()?.removeAllRanges();
      if (spine !== shownRef.current) setChapter(spine);
      else applyJump();
    },
    [s, applyJump]
  );

  // ── Kaydırma → kalınan yer ──
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !s) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const body = bodyRef.current;
      const map = mapRef.current;
      if (!body || !map || holdRef.current) return;
      const box = sc.getBoundingClientRect();
      const col = body.getBoundingClientRect();
      const x = Math.min(box.right - 4, Math.max(box.left + 4, col.left + Math.min(40, col.width / 2)));
      let offset: number | null = null;
      for (const dy of [12, 32, 64, 120, 200]) {
        const c = caretAt(x, box.top + dy);
        if (c && body.contains(c.node)) {
          offset = pointOffset(body, c.node, c.offset);
          break;
        }
      }
      const max = sc.scrollHeight - sc.clientHeight;
      const fraction = max > 0 ? sc.scrollTop / max : 0;
      if (offset === null) offset = Math.round(fraction * map.full.length);
      if (sc.scrollTop <= 2) offset = 0;
      emitPosition(shownRef.current, offset, fraction);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    // Kullanıcı kendisi kaydırınca korunan yer bırakılır.
    const release = () => {
      holdRef.current = false;
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    sc.addEventListener("wheel", release, { passive: true });
    sc.addEventListener("touchstart", release, { passive: true });
    sc.addEventListener("pointerdown", release);
    const onKey = (e: KeyboardEvent) => {
      if (/^(PageUp|PageDown|ArrowUp|ArrowDown|Home|End| )$/.test(e.key)) release();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      sc.removeEventListener("scroll", onScroll);
      sc.removeEventListener("wheel", release);
      sc.removeEventListener("touchstart", release);
      sc.removeEventListener("pointerdown", release);
      window.removeEventListener("keydown", onKey);
    };
  }, [s, emitPosition]);

  // ── Seçim → çizim yeri; çizime ve bağlantıya dokunma ──
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !s) return;
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
      const body = bodyRef.current;
      const map = mapRef.current;
      const sel = window.getSelection();
      if (!body || !map || !sel || sel.isCollapsed || !sel.rangeCount) return clear();
      const range = sel.getRangeAt(0);
      if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) return clear();
      const a = pointOffset(body, range.startContainer, range.startOffset);
      const b = pointOffset(body, range.endContainer, range.endOffset);
      const tr = trimRange(map.full, a, b);
      if (!tr) return clear();
      const text = cleanQuote(map.full.slice(tr[0], tr[1]));
      if (!text) return clear();
      const spine = shownRef.current;
      const key = spine + ":" + tr[0] + ":" + tr[1];
      if (key === lastKey) return;
      lastKey = key;
      const br = range.getBoundingClientRect();
      const rects = Array.from(range.getClientRects()).filter((r) => r.width || r.height);
      const first = rects[0] ?? br;
      const rect: ViewRect = rects.length ? { x: br.left, y: first.top, w: br.width, h: br.bottom - first.top } : { x: br.left, y: br.top, w: br.width, h: br.height };
      const anchor: EpubAnchor = { kind: "epub", spine, href: s.spine[spine].path, start: tr[0], end: tr[1] };
      cb.current.onSelection({ text, anchor, chapter: chapterTitle(s, spine), rect });
    };
    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, ms);
    };
    const onDown = () => {
      down = true;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      schedule(40);
    };
    // Dokunmatikte seçim tutamaçları sürüklenirken işaretçi olayı gelmez; seçim durulunca bakılır.
    const onSelChange = () => !down && schedule(250);

    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      const link = el?.closest?.<HTMLElement>("a[data-epub-href]");
      const anyHref = el?.closest?.("[href]");
      if (anyHref && anyHref.closest(SCOPE)) e.preventDefault();
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const mark = el?.closest?.<HTMLElement>("mark.lo-epub__mark");
      if (mark?.dataset.hl) {
        const id = mark.dataset.hl;
        const body = bodyRef.current;
        const same = body ? Array.from(body.querySelectorAll<HTMLElement>("mark.lo-epub__mark")).filter((m) => m.dataset.hl === id) : [mark];
        const rect = unionRect(same) ?? unionRect([mark]);
        if (rect) cb.current.onHighlightClick(id, rect);
        return;
      }
      const href = link?.dataset.epubHref;
      if (href) {
        const hash = href.indexOf("#");
        const path = hash < 0 ? href : href.slice(0, hash);
        const frag = hash < 0 ? undefined : href.slice(hash + 1);
        const idx = s.spine.findIndex((x) => x.path === path);
        if (idx >= 0) goChapter(idx, frag);
      }
    };

    sc.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("selectionchange", onSelChange);
    sc.addEventListener("click", onClick);
    return () => {
      if (timer) clearTimeout(timer);
      sc.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("selectionchange", onSelChange);
      sc.removeEventListener("click", onClick);
    };
  }, [s, goChapter]);

  // Bölüm değişince açık seçim menüsü kapansın.
  useEffect(() => {
    cb.current.onSelection(null);
  }, [chapter]);

  // İçindekiler: Esc ile kapanır.
  useEffect(() => {
    if (!tocOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setTocOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tocOpen]);

  const themeClass: Record<ReaderTheme, string> = { light: "", dark: " is-dark", sepia: " is-sepia" };
  const rtl = s?.direction === "rtl" || (!s?.direction && /^(ar|he|fa|ur|yi|ps|ckb)\b/i.test(s?.language ?? ""));
  const total = s?.spine.length ?? 0;
  const title = s ? (chapterTitle(s, chapter) ?? tt("library.note.section", "Bölüm {{n}}", { n: chapter + 1 })) : "";
  const tocItems = s
    ? s.toc.length
      ? s.toc.filter((e) => e.spine >= 0)
      : s.spine.map((x) => ({ label: tt("library.note.section", "Bölüm {{n}}", { n: x.index + 1 }), depth: 0, path: x.path, spine: x.index, fragment: undefined }))
    : [];

  return (
    <div className={"lo-epub" + themeClass[theme]}>
      {s && (
        <div className="lo-epub__bar">
          <button
            type="button"
            className="lo-epub__barbtn"
            onClick={() => setTocOpen((o) => !o)}
            aria-expanded={tocOpen}
            title={tt("library.epub.toc", "İçindekiler")}
            aria-label={tt("library.epub.toc", "İçindekiler")}
          >
            <List size={17} strokeWidth={1.8} aria-hidden />
          </button>
          <span className="lo-epub__chapter" dir="auto" title={title}>
            {title}
          </span>
          <span className="lo-epub__count">
            {chapter + 1} / {total}
          </span>
          <button
            type="button"
            className="lo-epub__barbtn"
            disabled={chapter <= 0}
            onClick={() => goChapter(chapter - 1)}
            title={tt("library.epub.prev", "Önceki bölüm")}
            aria-label={tt("library.epub.prev", "Önceki bölüm")}
          >
            <ChevronLeft size={18} strokeWidth={1.8} aria-hidden className="lo-epub__flip" />
          </button>
          <button
            type="button"
            className="lo-epub__barbtn"
            disabled={chapter >= total - 1}
            onClick={() => goChapter(chapter + 1)}
            title={tt("library.epub.next", "Sonraki bölüm")}
            aria-label={tt("library.epub.next", "Sonraki bölüm")}
          >
            <ChevronRight size={18} strokeWidth={1.8} aria-hidden className="lo-epub__flip" />
          </button>
        </div>
      )}
      <div ref={scrollRef} className="lo-epub__scroll" tabIndex={-1}>
        {!s && !failed && (
          <div className="lo-reader__state">
            <Loader2 size={24} strokeWidth={2} className="lo-spin" aria-hidden />
            <p>{tt("library.loading", "Kitaplar okunuyor…")}</p>
          </div>
        )}
        <style ref={styleRef} />
        <div className="lo-epub__col" dir={s ? (rtl ? "rtl" : "ltr") : undefined} lang={s?.language}>
          <div ref={hostRef} className="lo-epub__host" />
          {s && (
            <nav className="lo-epub__pager">
              {chapter > 0 ? (
                <button type="button" className="lo-btn" onClick={() => goChapter(chapter - 1)}>
                  {tt("library.epub.prev", "Önceki bölüm")}
                </button>
              ) : (
                <span />
              )}
              {chapter < total - 1 && (
                <button type="button" className="lo-btn lo-btn--primary" onClick={() => goChapter(chapter + 1)}>
                  {tt("library.epub.next", "Sonraki bölüm")}
                </button>
              )}
            </nav>
          )}
        </div>
      </div>
      {s && tocOpen && (
        <div className="lo-epub__toc" role="dialog" aria-label={tt("library.epub.toc", "İçindekiler")}>
          <div className="lo-epub__tochead">
            <strong>{tt("library.epub.toc", "İçindekiler")}</strong>
            <button type="button" className="lo-epub__barbtn" onClick={() => setTocOpen(false)} aria-label={tt("library.close", "Kapat")}>
              <X size={17} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
          <ol className="lo-epub__toclist">
            {tocItems.map((e, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={"lo-epub__tocitem" + (e.spine === chapter ? " is-current" : "")}
                  style={{ paddingInlineStart: 12 + Math.min(e.depth, 4) * 14 }}
                  onClick={() => goChapter(e.spine, e.fragment)}
                  dir="auto"
                >
                  {e.label}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

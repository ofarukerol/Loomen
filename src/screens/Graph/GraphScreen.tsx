import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Move, SlidersHorizontal, Plus, Minus, Crosshair } from "lucide-react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { useAppStore } from "../../store/useAppStore";
import { extractWikiLinks, extractTags } from "../../core/markdown/links";

type NodeKind = "note" | "tag";
interface GNode extends SimulationNodeDatum {
  id: string; // not: path · etiket: "#"+ad
  name: string; // ekranda görünen etiket
  deg: number;
  kind: NodeKind;
}
interface GLink {
  source: string | GNode;
  target: string | GNode;
}

interface Forces {
  repel: number; // pozitif; charge.strength = -repel
  linkDist: number;
  gravity: number;
}
const DEFAULTS: Forces = { repel: 340, linkDist: 72, gravity: 0.11 };

/** Obsidian'daki gibi açılıp kapanan görünüm seçenekleri. */
interface Display {
  tags: boolean; // #etiketleri düğüm olarak göster ve paylaşan notları bağla
  orphans: boolean; // bağlantısız notları göster
  arrows: boolean; // kenarlarda yön okları
  textFade: number; // etiket solma eşiği (k); bunun altında yazılar kaybolur
}
const DISPLAY_DEFAULTS: Display = { tags: true, orphans: true, arrows: false, textFade: 1.1 };

const FONT = "'DM Sans', system-ui, sans-serif";

/** Düğüm yarıçapı (dünya birimi) — derece arttıkça yumuşakça büyür, üstten sınırlı. */
function nodeRadius(deg: number) {
  return Math.min(26, 5 + Math.sqrt(deg) * 2.6);
}

/** Vault notları + [[link]] + #etiketlerden graf verisi (düğüm, kenar, hub, komşuluk). */
function buildGraph(
  notes: { path: string; name: string }[],
  contents: Record<string, string>,
  opts: { tags: boolean; orphans: boolean },
) {
  const byName = new Map(notes.map((n) => [n.name, n.path]));
  const noteNodes: GNode[] = notes.map((n) => ({ id: n.path, name: n.name, deg: 0, kind: "note" }));
  const deg = new Map<string, number>(noteNodes.map((n) => [n.id, 0]));
  const links: GLink[] = [];
  const seen = new Set<string>();
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    neighbors.get(a)!.add(b);
  };
  const addEdge = (a: string, b: string) => {
    if (a === b) return;
    const key = [a, b].sort().join("→");
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source: a, target: b });
    deg.set(a, (deg.get(a) ?? 0) + 1);
    deg.set(b, (deg.get(b) ?? 0) + 1);
    link(a, b);
    link(b, a);
  };

  // [[wiki-link]] kenarları (not → not)
  for (const n of notes) {
    for (const targetName of extractWikiLinks(contents[n.path] ?? "")) {
      const tpath = byName.get(targetName);
      if (tpath) addEdge(n.path, tpath);
    }
  }

  // #etiket düğümleri + kenarları (not → etiket); paylaşan notlar etiket üzerinden bağlanır
  const tagNodes = new Map<string, GNode>();
  if (opts.tags) {
    for (const n of notes) {
      for (const tag of extractTags(contents[n.path] ?? "")) {
        const id = "#" + tag;
        if (!tagNodes.has(id)) {
          tagNodes.set(id, { id, name: id, deg: 0, kind: "tag" });
          deg.set(id, 0);
        }
        addEdge(n.path, id);
      }
    }
  }

  let nodes: GNode[] = [...noteNodes, ...tagNodes.values()];
  nodes.forEach((n) => (n.deg = deg.get(n.id) ?? 0));

  // Yetimler: bağlantısı olmayan notları gizle (etiket düğümleri daima en az 1 bağlantılı)
  if (!opts.orphans) nodes = nodes.filter((n) => n.kind === "tag" || n.deg > 0);

  const hubId = nodes.reduce<GNode | null>((a, b) => (!a || b.deg > a.deg ? b : a), null)?.id ?? null;
  const noteCount = noteNodes.length;
  const tagCount = tagNodes.size;
  return { nodes, links, hubId, neighbors, noteCount, tagCount };
}

interface Colors {
  accent: string;
  accentSoft: string;
  line: string;
  nodeBg: string;
  nodeLine: string;
  linkCol: string;
  fg2: string;
  tag: string;
  tagSoft: string;
}
function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const g = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    accent: g("--accent", "#C2603A"),
    accentSoft: g("--accent-soft", "#C2603A22"),
    line: g("--line", "#E9E6DF"),
    nodeBg: g("--graph-node", "#E6DFD2"),
    nodeLine: g("--graph-node-line", "#CDC4B2"),
    linkCol: g("--graph-link", "#D8CFBF"),
    fg2: g("--fg2", "#6E6A62"),
    tag: g("--graph-tag", "#5E8C6A"),
    tagSoft: g("--graph-tag-soft", "#5E8C6A3D"),
  };
}

export function GraphScreen() {
  const { t } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const contents = useAppStore((s) => s.noteContents);
  const openNote = useAppStore((s) => s.openNote);
  const theme = useAppStore((s) => s.theme);
  const accent = useAppStore((s) => s.accent);

  const [showSettings, setShowSettings] = useState(false);
  const [forces, setForces] = useState<Forces>(DEFAULTS);
  const [display, setDisplay] = useState<Display>(DISPLAY_DEFAULTS);

  // Yapısal seçenekler (tags/orphans) grafı yeniden kurar; arrows/textFade yalnız çizimi etkiler.
  const graph = useMemo(
    () => buildGraph(notes, contents, { tags: display.tags, orphans: display.orphans }),
    [notes, contents, display.tags, display.orphans],
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  const tfRef = useRef({ x: 0, y: 0, k: 1 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const hoverRef = useRef<string | null>(null);
  const colorsRef = useRef<Colors>(readColors());
  const forcesRef = useRef<Forces>(forces);
  const displayRef = useRef<Display>(display);
  const fitRef = useRef<(() => void) | null>(null);
  displayRef.current = display;

  // Tema/vurgu değişince renkleri yenile (sim'i yeniden kurmadan).
  useEffect(() => {
    colorsRef.current = readColors();
  }, [theme, accent]);

  // Sliders → kuvvetleri canlı uygula + simülasyonu yeniden ısıt.
  const applyForces = (f: Forces) => {
    setForces(f);
    forcesRef.current = f;
    const s = simRef.current;
    if (!s) return;
    (s.force("charge") as ReturnType<typeof forceManyBody>)?.strength(-f.repel);
    (s.force("link") as ReturnType<typeof forceLink<GNode, GLink>>)?.distance(f.linkDist);
    (s.force("x") as ReturnType<typeof forceX>)?.strength(f.gravity);
    (s.force("y") as ReturnType<typeof forceY>)?.strength(f.gravity);
    s.alpha(0.7).restart();
  };

  const zoomBy = (factor: number) => {
    const tf = tfRef.current;
    const { w, h } = sizeRef.current;
    const k2 = Math.min(4, Math.max(0.2, tf.k * factor));
    tf.x = w / 2 - ((w / 2 - tf.x) / tf.k) * k2;
    tf.y = h / 2 - ((h / 2 - tf.y) / tf.k) * k2;
    tf.k = k2;
  };
  const resetView = () => {
    // Obsidian gibi: grafı viewport'a sığdır (mevcut yerleşimi çerçevele).
    fitRef.current?.();
  };

  // Ana motor: simülasyon + canvas + etkileşim. Graf verisi değişince yeniden kurulur.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || graph.nodes.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const nodes: GNode[] = graph.nodes.map((n) => ({ ...n }));
    const links: GLink[] = graph.links.map((l) => ({ ...l }));
    const f = forcesRef.current;

    const sim = forceSimulation<GNode>(nodes)
      .force("link", forceLink<GNode, GLink>(links).id((d) => d.id).distance(f.linkDist).strength(0.35))
      .force("charge", forceManyBody<GNode>().strength(-f.repel).distanceMax(420))
      .force("center", forceCenter(0, 0))
      .force("x", forceX(0).strength(f.gravity))
      .force("y", forceY(0).strength(f.gravity))
      .force("collide", forceCollide<GNode>().radius((d) => nodeRadius(d.deg) + 6))
      .alpha(1)
      .alphaDecay(0.022)
      .velocityDecay(0.32);
    simRef.current = sim as unknown as Simulation<GNode, GLink>;

    // Grafı viewport'a sığdır (Obsidian açılış davranışı + "sıfırla").
    const fitView = () => {
      const { w, h } = sizeRef.current;
      if (!w || !h) return;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const n of nodes) {
        if (n.x == null) continue;
        const r = nodeRadius(n.deg);
        minX = Math.min(minX, n.x - r);
        maxX = Math.max(maxX, n.x + r);
        minY = Math.min(minY, n.y! - r);
        maxY = Math.max(maxY, n.y! + r);
      }
      if (!isFinite(minX)) return;
      const bw = maxX - minX || 1;
      const bh = maxY - minY || 1;
      const pad = 64;
      const k = Math.min(2.5, Math.max(0.12, Math.min((w - pad) / bw, (h - pad) / bh)));
      tfRef.current = { x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k, k };
    };
    fitRef.current = fitView;

    let inited = false;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = r.width + "px";
      canvas.style.height = r.height + "px";
      if (!inited && r.width > 0) {
        tfRef.current = { x: r.width / 2, y: r.height / 2, k: 1 };
        inited = true;
      }
    });
    ro.observe(wrap);

    // Etiket görünürlüğü: yakınlaşınca belirir, uzaklaşınca solar (textFade eşiği).
    // Tag düğümlerinin etiketleri daha erken görünür (bağlayıcı oldukları için).
    const labelAlpha = (
      n: GNode,
      k: number,
      hovering: boolean,
      isHover: boolean,
      near: boolean,
      fade: number,
    ) => {
      if (isHover) return 1;
      if (hovering) return near ? 1 : 0;
      const thr = n.kind === "tag" ? fade * 0.6 : fade;
      const band = 0.35;
      if (k >= thr) return 1;
      if (k <= thr - band) return 0;
      return (k - (thr - band)) / band;
    };

    let didFit = false;

    let raf = 0;
    const draw = () => {
      const tf = tfRef.current;
      const c = colorsRef.current;
      const hover = hoverRef.current;
      const d = displayRef.current;
      const nb = hover ? graph.neighbors.get(hover) : null;

      // İlk yerleşim oturunca grafı bir kez viewport'a sığdır.
      if (!didFit && sizeRef.current.w > 0 && sim.alpha() < 0.4) {
        fitView();
        didFit = true;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      ctx.translate(tf.x, tf.y);
      ctx.scale(tf.k, tf.k);
      ctx.lineCap = "round";

      // Kenarlar (+ isteğe bağlı yön okları)
      for (const l of links) {
        const s = l.source as GNode;
        const tg = l.target as GNode;
        if (s.x == null || tg.x == null) continue;
        const act = !!hover && (s.id === hover || tg.id === hover);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);
        ctx.lineTo(tg.x, tg.y!);
        ctx.strokeStyle = act ? c.accent : c.linkCol;
        ctx.globalAlpha = hover ? (act ? 0.95 : 0.09) : 0.62;
        ctx.lineWidth = (act ? 1.9 : 1) / tf.k;
        ctx.stroke();

        if (d.arrows) {
          const tr = nodeRadius(tg.deg);
          const ang = Math.atan2(tg.y! - s.y!, tg.x! - s.x!);
          const ax = tg.x! - Math.cos(ang) * (tr + 1.5 / tf.k);
          const ay = tg.y! - Math.sin(ang) * (tr + 1.5 / tf.k);
          const ah = 5 / tf.k;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - Math.cos(ang - 0.42) * ah, ay - Math.sin(ang - 0.42) * ah);
          ctx.lineTo(ax - Math.cos(ang + 0.42) * ah, ay - Math.sin(ang + 0.42) * ah);
          ctx.closePath();
          ctx.fillStyle = act ? c.accent : c.line;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Düğümler + etiketler
      for (const n of nodes) {
        if (n.x == null) continue;
        const isHover = n.id === hover;
        const near = !hover || isHover || !!nb?.has(n.id);
        const isTag = n.kind === "tag";
        const isHub = n.id === graph.hubId && n.deg > 0 && !isTag;
        const stroke = isHover ? c.accent : isTag ? c.tag : isHub ? c.accent : c.nodeLine;
        const glow = isHover || isHub || isTag;
        const r = nodeRadius(n.deg);

        ctx.globalAlpha = near ? 1 : 0.16;
        ctx.beginPath();
        ctx.arc(n.x, n.y!, r, 0, Math.PI * 2);
        ctx.fillStyle = isHover
          ? c.accent
          : isTag
            ? c.tagSoft
            : isHub
              ? c.accentSoft
              : c.nodeBg;
        // İnce derinlik: etiket/hub/hover düğümlerine yumuşak hale
        if (glow && near) {
          ctx.shadowColor = isTag ? c.tag : c.accent;
          ctx.shadowBlur = 9;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.lineWidth = (isHover || isHub || isTag ? 2 : 1.4) / tf.k;
        ctx.strokeStyle = stroke;
        ctx.stroke();

        const la = labelAlpha(n, tf.k, !!hover, isHover, near, d.textFade);
        if (la > 0.04) {
          ctx.globalAlpha = (near ? 1 : 0.16) * la;
          ctx.fillStyle = isHover ? c.accent : isTag ? c.tag : c.fg2;
          const weight = isHover || isTag ? 600 : 400;
          ctx.font = `${weight} ${(isHover ? 12.5 : 11.5) / tf.k}px ${FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(n.name, n.x, n.y! + r + 4 / tf.k);
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // — Etkileşim —
    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const tf = tfRef.current;
      return { x: (clientX - rect.left - tf.x) / tf.k, y: (clientY - rect.top - tf.y) / tf.k };
    };
    const hitTest = (wx: number, wy: number): GNode | null => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.x == null) continue;
        const r = nodeRadius(n.deg) + 4;
        if ((wx - n.x) ** 2 + (wy - n.y!) ** 2 <= r * r) return n;
      }
      return null;
    };

    let mode: "drag" | "pan" | null = null;
    let dragNode: GNode | null = null;
    let startCX = 0,
      startCY = 0,
      startTx = 0,
      startTy = 0,
      moved = false;

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      startCX = e.clientX - rect.left;
      startCY = e.clientY - rect.top;
      moved = false;
      const w = toWorld(e.clientX, e.clientY);
      const hit = hitTest(w.x, w.y);
      if (hit) {
        mode = "drag";
        dragNode = hit;
        sim.alphaTarget(0.3).restart();
        hit.fx = hit.x;
        hit.fy = hit.y;
      } else {
        mode = "pan";
        startTx = tfRef.current.x;
        startTy = tfRef.current.y;
      }
    };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (mode == null) {
        const w = toWorld(e.clientX, e.clientY);
        const hit = hitTest(w.x, w.y);
        hoverRef.current = hit ? hit.id : null;
        canvas.style.cursor = hit ? "pointer" : "grab";
        return;
      }
      if (Math.abs(cx - startCX) + Math.abs(cy - startCY) > 3) moved = true;
      if (mode === "drag" && dragNode) {
        const w = toWorld(e.clientX, e.clientY);
        dragNode.fx = w.x;
        dragNode.fy = w.y;
      } else if (mode === "pan") {
        tfRef.current.x = startTx + (cx - startCX);
        tfRef.current.y = startTy + (cy - startCY);
        canvas.style.cursor = "grabbing";
      }
    };
    const onUp = (e: PointerEvent) => {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* yoksay */
      }
      if (mode === "drag" && dragNode) {
        dragNode.fx = null;
        dragNode.fy = null;
        sim.alphaTarget(0);
        if (!moved && dragNode.kind === "note") openNote(dragNode.id);
      }
      mode = null;
      dragNode = null;
      canvas.style.cursor = "grab";
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const tf = tfRef.current;
      const factor = Math.exp(-e.deltaY * 0.0016);
      const k2 = Math.min(4, Math.max(0.2, tf.k * factor));
      tf.x = cx - ((cx - tf.x) / tf.k) * k2;
      tf.y = cy - ((cy - tf.y) / tf.k) * k2;
      tf.k = k2;
    };
    const onLeave = () => {
      if (mode == null) hoverRef.current = null;
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sim.stop();
      simRef.current = null;
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const empty = graph.nodes.length === 0;

  return (
    <div className="lo-graph">
      <div className="lo-graph__head">
        <span className="lo-graph__title">{t("graph.title")}</span>
        <span className="lo-graph__stats">
          {t("graph.stats", {
            notes: graph.noteCount,
            tags: graph.tagCount,
            links: graph.links.length,
          })}
        </span>
        <div style={{ flex: 1 }} />
        <span className="lo-graph__hint">
          <Move size={14} strokeWidth={2} />
          {t("graph.hint")}
        </span>
      </div>

      <div className="lo-graph__canvas" ref={wrapRef}>
        {empty ? (
          <div className="lo-placeholder">
            <p>{t("graph.empty")}</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="lo-graph__cv" />
        )}

        {!empty && (
          <>
            {/* Zoom + sıfırla kontrolleri */}
            <div className="lo-graph__ctrls">
              <button className="lo-graph__ctl" title={t("graph.zoomIn")} onClick={() => zoomBy(1.25)}>
                <Plus size={16} strokeWidth={2} />
              </button>
              <button className="lo-graph__ctl" title={t("graph.zoomOut")} onClick={() => zoomBy(0.8)}>
                <Minus size={16} strokeWidth={2} />
              </button>
              <button className="lo-graph__ctl" title={t("graph.reset")} onClick={resetView}>
                <Crosshair size={16} strokeWidth={2} />
              </button>
              <button
                className={"lo-graph__ctl" + (showSettings ? " is-active" : "")}
                title={t("graph.settings")}
                onClick={() => setShowSettings((v) => !v)}
              >
                <SlidersHorizontal size={16} strokeWidth={2} />
              </button>
            </div>

            {/* Görünüm + kuvvet ayar paneli */}
            {showSettings && (
              <div className="lo-graph__panel">
                <div className="lo-graph__panelhead">{t("graph.display")}</div>
                <label className="lo-graph__check">
                  <input
                    type="checkbox"
                    checked={display.tags}
                    onChange={(e) => setDisplay((d) => ({ ...d, tags: e.target.checked }))}
                  />
                  <span>{t("graph.tags")}</span>
                </label>
                <label className="lo-graph__check">
                  <input
                    type="checkbox"
                    checked={display.orphans}
                    onChange={(e) => setDisplay((d) => ({ ...d, orphans: e.target.checked }))}
                  />
                  <span>{t("graph.orphans")}</span>
                </label>
                <label className="lo-graph__check">
                  <input
                    type="checkbox"
                    checked={display.arrows}
                    onChange={(e) => setDisplay((d) => ({ ...d, arrows: e.target.checked }))}
                  />
                  <span>{t("graph.arrows")}</span>
                </label>
                <label className="lo-graph__field">
                  <span>{t("graph.textFade")}</span>
                  <input
                    type="range"
                    min={0.4}
                    max={2.2}
                    step={0.05}
                    value={display.textFade}
                    onChange={(e) => setDisplay((d) => ({ ...d, textFade: Number(e.target.value) }))}
                  />
                </label>

                <div className="lo-graph__panelhead lo-graph__panelhead--sep">{t("graph.forces")}</div>
                <label className="lo-graph__field">
                  <span>{t("graph.repel")}</span>
                  <input
                    type="range"
                    min={40}
                    max={900}
                    step={10}
                    value={forces.repel}
                    onChange={(e) => applyForces({ ...forces, repel: Number(e.target.value) })}
                  />
                </label>
                <label className="lo-graph__field">
                  <span>{t("graph.linkDist")}</span>
                  <input
                    type="range"
                    min={24}
                    max={200}
                    step={2}
                    value={forces.linkDist}
                    onChange={(e) => applyForces({ ...forces, linkDist: Number(e.target.value) })}
                  />
                </label>
                <label className="lo-graph__field">
                  <span>{t("graph.gravity")}</span>
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.01}
                    value={forces.gravity}
                    onChange={(e) => applyForces({ ...forces, gravity: Number(e.target.value) })}
                  />
                </label>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

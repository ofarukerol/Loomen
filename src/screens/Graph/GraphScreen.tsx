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
import { extractWikiLinks } from "../../core/markdown/links";

interface GNode extends SimulationNodeDatum {
  id: string; // path
  name: string;
  deg: number;
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

const FONT = "'DM Sans', system-ui, sans-serif";

/** Düğüm yarıçapı (dünya birimi) — derece arttıkça yumuşakça büyür. */
function nodeRadius(deg: number) {
  return 5 + Math.sqrt(deg) * 3.4;
}

/** Vault notları + [[link]]'lerden graf verisi (düğüm, kenar, hub, komşuluk). */
function buildGraph(notes: { path: string; name: string }[], contents: Record<string, string>) {
  const byName = new Map(notes.map((n) => [n.name, n.path]));
  const nodes: GNode[] = notes.map((n) => ({ id: n.path, name: n.name, deg: 0 }));
  const deg = new Map(nodes.map((n) => [n.id, 0]));
  const links: GLink[] = [];
  const seen = new Set<string>();
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    neighbors.get(a)!.add(b);
  };

  for (const n of notes) {
    for (const targetName of extractWikiLinks(contents[n.path] ?? "")) {
      const tpath = byName.get(targetName);
      if (!tpath || tpath === n.path) continue;
      const key = [n.path, tpath].sort().join("→");
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: n.path, target: tpath });
      deg.set(n.path, (deg.get(n.path) ?? 0) + 1);
      deg.set(tpath, (deg.get(tpath) ?? 0) + 1);
      link(n.path, tpath);
      link(tpath, n.path);
    }
  }
  nodes.forEach((n) => (n.deg = deg.get(n.id) ?? 0));
  const hubId = nodes.reduce<GNode | null>((a, b) => (!a || b.deg > a.deg ? b : a), null)?.id ?? null;
  return { nodes, links, hubId, neighbors };
}

interface Colors {
  accent: string;
  accentSoft: string;
  line: string;
  nodeBg: string;
  fg2: string;
}
function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const g = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    accent: g("--accent", "#C2603A"),
    accentSoft: g("--accent-soft", "#C2603A22"),
    line: g("--line", "#E9E6DF"),
    nodeBg: g("--bg-elev", "#FFFFFF"),
    fg2: g("--fg2", "#6E6A62"),
  };
}

export function GraphScreen() {
  const { t } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const contents = useAppStore((s) => s.noteContents);
  const openNote = useAppStore((s) => s.openNote);
  const theme = useAppStore((s) => s.theme);
  const accent = useAppStore((s) => s.accent);

  const graph = useMemo(() => buildGraph(notes, contents), [notes, contents]);
  const [showSettings, setShowSettings] = useState(false);
  const [forces, setForces] = useState<Forces>(DEFAULTS);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  const tfRef = useRef({ x: 0, y: 0, k: 1 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const hoverRef = useRef<string | null>(null);
  const colorsRef = useRef<Colors>(readColors());
  const forcesRef = useRef<Forces>(forces);

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
    const { w, h } = sizeRef.current;
    tfRef.current = { x: w / 2, y: h / 2, k: 1 };
    simRef.current?.alpha(0.6).restart();
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

    const labelAlpha = (n: GNode, k: number, hovering: boolean, isHover: boolean, near: boolean) => {
      if (hovering) return near ? 1 : 0;
      if (isHover) return 1;
      if (k >= 1.0) return 1;
      if (k <= 0.5) return n.deg >= 3 ? 0.75 : 0;
      return (k - 0.5) / 0.5;
    };

    let raf = 0;
    const draw = () => {
      const tf = tfRef.current;
      const c = colorsRef.current;
      const hover = hoverRef.current;
      const nb = hover ? graph.neighbors.get(hover) : null;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      ctx.translate(tf.x, tf.y);
      ctx.scale(tf.k, tf.k);
      ctx.lineCap = "round";

      // Kenarlar
      for (const l of links) {
        const s = l.source as GNode;
        const tg = l.target as GNode;
        if (s.x == null || tg.x == null) continue;
        const act = !!hover && (s.id === hover || tg.id === hover);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);
        ctx.lineTo(tg.x, tg.y!);
        ctx.strokeStyle = act ? c.accent : c.line;
        ctx.globalAlpha = hover ? (act ? 0.95 : 0.1) : 0.5;
        ctx.lineWidth = (act ? 1.9 : 1) / tf.k;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Düğümler + etiketler
      for (const n of nodes) {
        if (n.x == null) continue;
        const isHover = n.id === hover;
        const near = !hover || isHover || !!nb?.has(n.id);
        const isHub = n.id === graph.hubId && n.deg > 0;
        const r = nodeRadius(n.deg);

        ctx.globalAlpha = near ? 1 : 0.16;
        ctx.beginPath();
        ctx.arc(n.x, n.y!, r, 0, Math.PI * 2);
        ctx.fillStyle = isHover ? c.accent : isHub ? c.accentSoft : c.nodeBg;
        ctx.fill();
        ctx.lineWidth = (isHover || isHub ? 2 : 1.4) / tf.k;
        ctx.strokeStyle = isHover || isHub ? c.accent : c.line;
        ctx.stroke();

        const la = labelAlpha(n, tf.k, !!hover, isHover, near);
        if (la > 0.04) {
          ctx.globalAlpha = (near ? 1 : 0.16) * la;
          ctx.fillStyle = isHover ? c.accent : c.fg2;
          ctx.font = `${(isHover ? 600 : 400)} ${(isHover ? 12.5 : 11.5) / tf.k}px ${FONT}`;
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
        if (!moved) openNote(dragNode.id);
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
          {t("graph.stats", { notes: graph.nodes.length, links: graph.links.length })}
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

            {/* Kuvvet ayar paneli */}
            {showSettings && (
              <div className="lo-graph__panel">
                <div className="lo-graph__panelhead">{t("graph.settings")}</div>
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

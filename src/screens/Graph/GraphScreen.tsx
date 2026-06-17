import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Move } from "lucide-react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from "d3-force";
import { useAppStore } from "../../store/useAppStore";
import { extractWikiLinks } from "../../core/markdown/links";

const W = 820;
const H = 520;

interface GNode extends SimulationNodeDatum {
  id: string; // path
  name: string;
  deg: number;
}
interface GLink {
  source: string | GNode;
  target: string | GNode;
}

function nodeRadius(deg: number) {
  return 16 + Math.min(deg, 6) * 5;
}

/** Vault notlarından + [[link]]'lerden force-directed graf hesapla (deterministik). */
function buildGraph(notes: { path: string; name: string }[], contents: Record<string, string>) {
  const byName = new Map(notes.map((n) => [n.name, n.path]));
  const nodes: GNode[] = notes.map((n) => ({ id: n.path, name: n.name, deg: 0 }));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const links: GLink[] = [];
  const seen = new Set<string>();

  for (const n of notes) {
    for (const targetName of extractWikiLinks(contents[n.path] ?? "")) {
      const tpath = byName.get(targetName);
      if (!tpath || tpath === n.path) continue;
      const key = [n.path, tpath].sort().join("→");
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: n.path, target: tpath });
      nodes[index.get(n.path)!].deg++;
      nodes[index.get(tpath)!].deg++;
    }
  }

  const sim = forceSimulation<GNode>(nodes)
    .force("link", forceLink<GNode, GLink>(links).id((d) => d.id).distance(95).strength(0.5))
    .force("charge", forceManyBody().strength(-280))
    .force("center", forceCenter(W / 2, H / 2))
    .force("collide", forceCollide<GNode>().radius((d) => nodeRadius(d.deg) + 8))
    .stop();
  for (let i = 0; i < 320; i++) sim.tick();

  // En çok bağlantılı düğüm = merkez (hub)
  const hubId = nodes.reduce((a, b) => (b.deg > a.deg ? b : a), nodes[0])?.id;
  return { nodes, links, hubId };
}

export function GraphScreen() {
  const { t } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const contents = useAppStore((s) => s.noteContents);
  const openNote = useAppStore((s) => s.openNote);
  const [hover, setHover] = useState<string | null>(null);

  const { nodes, links, hubId } = useMemo(() => buildGraph(notes, contents), [notes, contents]);

  // Hover komşuları
  const neighbors = new Set<string>();
  if (hover) {
    for (const l of links) {
      const s = (l.source as GNode).id;
      const tg = (l.target as GNode).id;
      if (s === hover) neighbors.add(tg);
      if (tg === hover) neighbors.add(s);
    }
    neighbors.add(hover);
  }

  return (
    <div className="lo-graph">
      <div className="lo-graph__head">
        <span className="lo-graph__title">{t("graph.title")}</span>
        <span className="lo-graph__stats">{t("graph.stats", { notes: nodes.length, links: links.length })}</span>
        <div style={{ flex: 1 }} />
        <span className="lo-graph__hint">
          <Move size={14} strokeWidth={2} />
          {t("graph.hint")}
        </span>
      </div>

      <div className="lo-graph__canvas" onMouseLeave={() => setHover(null)}>
        {nodes.length === 0 ? (
          <div className="lo-placeholder">
            <p>{t("graph.empty")}</p>
          </div>
        ) : (
          <div className="lo-graph__stage" style={{ width: W, height: H }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="lo-graph__edges">
              {links.map((l, i) => {
                const s = l.source as GNode;
                const tg = l.target as GNode;
                const active = !!hover && (s.id === hover || tg.id === hover);
                return (
                  <line
                    key={i}
                    x1={s.x} y1={s.y} x2={tg.x} y2={tg.y}
                    stroke={active ? "var(--accent)" : "var(--line)"}
                    strokeWidth={active ? 2 : 1.25}
                    strokeOpacity={!hover || active ? 1 : 0.35}
                    style={{ transition: "all .18s" }}
                  />
                );
              })}
            </svg>

            {nodes.map((n) => {
              const r = nodeRadius(n.deg);
              const active = !hover || neighbors.has(n.id);
              const isHub = n.id === hubId && n.deg > 0;
              const isFocus = n.id === hover;
              return (
                <div
                  key={n.id}
                  className="lo-node"
                  style={{ left: n.x, top: n.y, opacity: active ? 1 : 0.2 }}
                  onMouseEnter={() => setHover(n.id)}
                  onClick={() => openNote(n.id)}
                >
                  <div
                    className="lo-node__dot"
                    style={{
                      width: r,
                      height: r,
                      background: isFocus ? "var(--accent)" : isHub ? "var(--accent-soft)" : "var(--bg-elev)",
                      borderColor: isFocus || isHub ? "var(--accent)" : "var(--line)",
                    }}
                  />
                  <div
                    className="lo-node__label"
                    style={{ color: isFocus ? "var(--accent)" : "var(--fg2)", fontWeight: isFocus ? 600 : 400 }}
                  >
                    {n.name}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="lo-graph__legend">
          <span>
            <span className="lo-graph__leg lo-graph__leg--hub" />
            {t("graph.centerNote")}
          </span>
          <span>
            <span className="lo-graph__leg lo-graph__leg--note" />
            {t("graph.note")}
          </span>
        </div>
      </div>
    </div>
  );
}

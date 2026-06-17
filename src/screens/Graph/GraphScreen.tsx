import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Move } from "lucide-react";

type NodeId =
  | "proje" | "daily" | "fikirler" | "loomen" | "tasarim"
  | "toplanti" | "odemeler" | "okul" | "vize";

// [x, y, çap] — prototipteki el-yerleştirme. Gerçekte force-directed gelecek (docs 04).
const POS: Record<NodeId, [number, number, number]> = {
  proje: [440, 258, 64],
  daily: [248, 150, 54],
  fikirler: [624, 148, 50],
  loomen: [196, 360, 50],
  tasarim: [664, 360, 54],
  toplanti: [440, 86, 44],
  odemeler: [150, 250, 44],
  okul: [440, 452, 48],
  vize: [702, 470, 44],
};

const LABELS: Record<NodeId, string> = {
  proje: "Proje X",
  daily: "2026-06-13",
  fikirler: "Fikirler",
  loomen: "Loomen",
  tasarim: "Tasarım Sistemi",
  toplanti: "Toplantı Notları",
  odemeler: "Ödemeler",
  okul: "Okul",
  vize: "Vize Başvurusu",
};

const EDGES: [NodeId, NodeId][] = [
  ["proje", "daily"], ["proje", "fikirler"], ["proje", "loomen"], ["proje", "toplanti"],
  ["proje", "tasarim"], ["daily", "fikirler"], ["daily", "odemeler"], ["daily", "okul"],
  ["loomen", "tasarim"], ["vize", "odemeler"], ["vize", "okul"], ["fikirler", "tasarim"],
];

const HUB: NodeId = "proje";

export function GraphScreen() {
  const { t } = useTranslation();
  const [hover, setHover] = useState<NodeId | null>(null);

  const neighbors = new Set<NodeId>();
  if (hover) {
    EDGES.forEach(([a, b]) => {
      if (a === hover) neighbors.add(b);
      if (b === hover) neighbors.add(a);
    });
    neighbors.add(hover);
  }

  return (
    <div className="lo-graph">
      <div className="lo-graph__head">
        <span className="lo-graph__title">{t("graph.title")}</span>
        <span className="lo-graph__stats">{t("graph.stats")}</span>
        <div style={{ flex: 1 }} />
        <span className="lo-graph__hint">
          <Move size={14} strokeWidth={2} />
          {t("graph.hint")}
        </span>
      </div>

      <div className="lo-graph__canvas" onMouseLeave={() => setHover(null)}>
        <div className="lo-graph__stage">
          <svg width="860" height="540" viewBox="0 0 860 540" className="lo-graph__edges">
            {EDGES.map(([a, b], i) => {
              const [x1, y1] = POS[a];
              const [x2, y2] = POS[b];
              const active = !!hover && (a === hover || b === hover);
              return (
                <line
                  key={i}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={active ? "var(--accent)" : "var(--line)"}
                  strokeWidth={active ? 2 : 1.25}
                  strokeOpacity={!hover || active ? 1 : 0.35}
                  style={{ transition: "all .18s" }}
                />
              );
            })}
          </svg>

          {(Object.keys(POS) as NodeId[]).map((id) => {
            const [x, y, r] = POS[id];
            const active = !hover || neighbors.has(id);
            const isHub = id === HUB;
            const isFocus = id === hover;
            return (
              <div
                key={id}
                className="lo-node"
                style={{ left: x, top: y, opacity: active ? 1 : 0.22 }}
                onMouseEnter={() => setHover(id)}
              >
                <div
                  className="lo-node__dot"
                  style={{
                    width: r,
                    height: r,
                    background: isFocus
                      ? "var(--accent)"
                      : isHub
                      ? "var(--accent-soft)"
                      : "var(--bg-elev)",
                    borderColor: isFocus || isHub ? "var(--accent)" : "var(--line)",
                  }}
                />
                <div
                  className="lo-node__label"
                  style={{ color: isFocus ? "var(--accent)" : "var(--fg2)", fontWeight: isFocus ? 600 : 400 }}
                >
                  {LABELS[id]}
                </div>
              </div>
            );
          })}
        </div>

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

import type { ReactNode } from "react";
import { Check } from "lucide-react";

interface Props {
  content: string;
  onLink: (name: string) => void;
  onToggleTask: (line: number) => void;
}

const INLINE_RE = /\*\*([^*]+)\*\*|`([^`]+)`|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Satır içi: **kalın**, `kod`, [[wiki-link]]. */
function inlineNodes(text: string, onLink: (n: string) => void, kp: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(<strong key={`${kp}-b${i}`}>{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      nodes.push(
        <code key={`${kp}-c${i}`} style={{ fontFamily: "var(--font-mono)", fontSize: "0.9em", background: "var(--bg-sunken)", padding: "1px 5px", borderRadius: 5 }}>
          {m[2]}
        </code>
      );
    } else {
      const target = m[3].trim();
      const label = m[4] ?? m[3];
      nodes.push(
        <button key={`${kp}-l${i}`} className="lo-wiki" onClick={() => onLink(target)}>
          [[{label}]]
        </button>
      );
    }
    last = INLINE_RE.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const TASK_RE = /^\s*- \[([ xX])\]\s+(.*)$/;
const BULLET_RE = /^\s*[-*]\s+/;

/** Görev açıklamasından meta token'ları temizle (gösterim için). */
function cleanTaskText(s: string): string {
  return s
    .replace(/[📅⏳🛫✅]\s*\d{4}-\d{2}-\d{2}/gu, "")
    .replace(/🍅\s*[×x]\s*\d+/g, "")
    .replace(/#[\p{L}\d_/-]+/gu, "")
    .replace(/[🔺⏫🔼🔽⏬]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Markdown içeriğini React öğelerine çevirir (CodeMirror canlı önizleme sonraki adım). */
export function Markdown({ content, onLink, onToggleTask }: Props) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const k = () => "blk" + key++;

  // Frontmatter atla
  if (lines[0]?.trim() === "---") {
    let j = 1;
    while (j < lines.length && lines[j].trim() !== "---") j++;
    i = j + 1;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") {
      i++;
      continue;
    }

    // Kod bloğu
    if (trimmed.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(<pre key={k()}>{buf.join("\n")}</pre>);
      continue;
    }

    // Başlık
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const inner = inlineNodes(h[2], onLink, k());
      blocks.push(h[1].length === 1 ? <h1 key={k()}>{inner}</h1> : <h2 key={k()}>{inner}</h2>);
      i++;
      continue;
    }

    // Alıntı
    if (trimmed.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={k()}>{inlineNodes(buf.join(" "), onLink, k())}</blockquote>);
      continue;
    }

    // Görev listesi
    if (TASK_RE.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && TASK_RE.test(lines[i])) {
        const lineIdx = i;
        const m = lines[i].match(TASK_RE)!;
        const done = m[1].toLowerCase() === "x";
        items.push(
          <label key={k()} className={done ? "is-done" : ""}>
            <span
              className={"lo-checkbox" + (done ? " is-done" : "")}
              onClick={() => onToggleTask(lineIdx)}
              style={{ cursor: "pointer" }}
            >
              {done && <Check size={12} strokeWidth={3} color="#fff" />}
            </span>
            <span>{inlineNodes(cleanTaskText(m[2]), onLink, k())}</span>
          </label>
        );
        i++;
      }
      blocks.push(
        <div key={k()} className="lo-tasklist">
          {items}
        </div>
      );
      continue;
    }

    // Madde listesi
    if (BULLET_RE.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i]) && !TASK_RE.test(lines[i])) {
        const m = lines[i].match(/^\s*[-*]\s+(.*)$/)!;
        items.push(<li key={k()}>{inlineNodes(m[1], onLink, k())}</li>);
        i++;
      }
      blocks.push(<ul key={k()}>{items}</ul>);
      continue;
    }

    // Paragraf
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|>|```)/.test(lines[i]) &&
      !BULLET_RE.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    blocks.push(<p key={k()}>{inlineNodes(buf.join(" "), onLink, k())}</p>);
  }

  return <div className="lo-prose">{blocks}</div>;
}

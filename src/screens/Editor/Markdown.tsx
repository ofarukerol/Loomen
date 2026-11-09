import type { ReactNode } from "react";
import { BookOpen, Check } from "lucide-react";
import { isHighlightMarkerLine, parseBookLink } from "../../core/library/links";
import { useAppStore } from "../../store/useAppStore";
import { AudioEmbedPlayer } from "./AudioEmbedPlayer";
import { ImageEmbed, parseImageLine } from "./ImageEmbed";
import i18n from "../../i18n";
import { evaluateTable, formatFormulaResult } from "../../core/markdown/tableFormula";
import { columnCurrency, formatCellDisplay, formatCurrency, isTableMetaLine, parseTableMeta } from "../../core/markdown/tableMeta";
import { effectiveCellStyle, parseSeparatorAlign, styleClasses } from "../../core/markdown/tableStyle";

interface Props {
  content: string;
  onLink: (name: string) => void;
  onToggleTask: (line: number) => void;
}

const INLINE_RE =
  /\*\*([^*]+)\*\*|`([^`]+)`|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[((?:\\.|[^\]\\\n])*)\]\((loomen:\/\/book\/[^\s)]+)\)/gi;

/** Kitap bağlantısı (LOM-83): okuyucuyu o çizimde açar; geçersizse düz metin kalır. */
function openBookLink(href: string) {
  useAppStore.getState().libraryOpenLink(href);
}

/** Satır içi: **kalın**, `kod`, [[wiki-link]], [etiket](loomen://book/…). */
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
    } else if (m[6] !== undefined) {
      const href = m[6];
      const label = m[5].replace(/\\([[\]\\])/g, "$1");
      if (parseBookLink(href)) {
        nodes.push(
          <button key={`${kp}-k${i}`} type="button" className="lo-booklink" data-href={href} onClick={() => openBookLink(href)}>
            <BookOpen size={13} strokeWidth={2} aria-hidden />
            {label}
          </button>
        );
      } else nodes.push(m[0]);
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

/** GFM tablo satırını hücrelere böl (baş/son boru ve kaçışlı \| dikkate alınır). */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (s[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

/** Ayraç satırı mı? ör. | --- | :--: | ---: | */
function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  const cells = splitTableRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

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
    // Kütüphane çizim işaretleri (`<!-- loomen:hl … -->`) okuma modunda görünmez (LOM-83).
    if (trimmed === "" || isHighlightMarkerLine(line)) {
      i++;
      continue;
    }

    // Yatay çizgi
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(
        <hr key={k()} style={{ border: "none", borderTop: "1px solid var(--line)", margin: "20px 0" }} />
      );
      i++;
      continue;
    }

    // Ses notu embed: ![[Ses Notları/xxx.flac]] (VoiceRecorder'ın nota eklediği satır)
    const audioEmbed = trimmed.match(/^!\[\[(.+\.(?:flac|wav|webm|m4a|mp3|aac))\]\]$/i);
    if (audioEmbed) {
      blocks.push(<AudioEmbedPlayer key={k()} path={audioEmbed[1]} />);
      i++;
      continue;
    }

    // Resim embed: ![[Ekler/x.png]] ya da ![alt](yol) — düzenleme moduyla aynı yorum.
    const img = parseImageLine(trimmed);
    if (img) {
      blocks.push(<ImageEmbed key={k()} {...img} raw={trimmed} />);
      i++;
      continue;
    }

    // GFM tablo: "| ... |" satırı + hemen ardından ayraç "| --- | --- |"
    if (trimmed.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      const cols = header.length;
      // Sütun hizası (LOM-98) standart ayraç satırında: :--- / :---: / ---:
      const colAlign = parseSeparatorAlign(lines[i + 1]);
      i += 2; // başlık + ayraç satırlarını atla
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        const cells = splitTableRow(lines[i]);
        while (cells.length < cols) cells.push("");
        rows.push(cells.slice(0, cols));
        i++;
      }
      // Tablonun hemen altındaki gizli not satırı (LOM-89): para birimi; ekranda gösterilmez.
      const meta = i < lines.length && isTableMetaLine(lines[i]) ? parseTableMeta(lines[i++]) : null;
      // Formül hücreleri (LOM-79): okuma modunda da sonuç gösterilir; dosyada formül kalır.
      const results = evaluateTable(header, rows);
      // Biçim sınıfları (LOM-98): hücre > satır > sütun; başlık satırı -1.
      const fmt = (row: number, col: number, base = ""): string | undefined => {
        const cls = [base, ...styleClasses(effectiveCellStyle(colAlign, meta, row, col))].filter(Boolean).join(" ");
        return cls || undefined;
      };
      blocks.push(
        <div className="lo-tablewrap lo-scroll" key={k()}>
          <table className="lo-table">
            <thead>
              <tr>
                {header.map((c, ci) => (
                  <th key={ci} className={fmt(-1, ci)}>{inlineNodes(c, onLink, k())}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => {
                    const res = results[ri]?.[ci];
                    const cur = columnCurrency(meta, ci);
                    if (res?.formula) {
                      return (
                        <td
                          key={ci}
                          className={fmt(
                            ri,
                            ci,
                            "lo-table__formula" + (res.error ? " is-error" : "") + (cur && !res.error ? " lo-table__currency" : "")
                          )}
                          title={res.error ? `${res.formula} — ${i18n.t(`tableFormula.${res.error}`)}` : res.formula}
                        >
                          {res.error
                            ? i18n.t("tableFormula.errorLabel")
                            : cur
                              ? formatCurrency(res.value ?? 0, cur, i18n.language)
                              : formatFormulaResult(res.value ?? 0, i18n.language)}
                        </td>
                      );
                    }
                    // Para birimli sütunda sayı hücresi "212.500 ₺"; metin ve boş hücre olduğu gibi.
                    const shown = formatCellDisplay(c, cur, i18n.language);
                    if (shown !== null) {
                      return (
                        <td key={ci} className={fmt(ri, ci, "lo-table__currency")}>
                          {shown}
                        </td>
                      );
                    }
                    return <td key={ci} className={fmt(ri, ci)}>{inlineNodes(c, onLink, k())}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
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
      !BULLET_RE.test(lines[i]) &&
      !isHighlightMarkerLine(lines[i]) &&
      !parseImageLine(lines[i]) // resim satırı paragrafa yapışmasın (kendi bloğu)
    ) {
      buf.push(lines[i++]);
    }
    blocks.push(<p key={k()}>{inlineNodes(buf.join(" "), onLink, k())}</p>);
  }

  return <div className="lo-prose">{blocks}</div>;
}

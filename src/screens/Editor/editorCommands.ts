import type { EditorView } from "@codemirror/view";

/** Markdown biçimlendirme komutları — CodeMirror seçimi üzerinde çalışır, formatı bozmaz. */

function focus(v: EditorView) {
  v.focus();
}

/** Seçimi before/after ile sar; zaten sarılıysa kaldır (toggle). */
export function wrap(v: EditorView, before: string, after = before) {
  const r = v.state.selection.main;
  const sel = v.state.sliceDoc(r.from, r.to);
  const outB = v.state.sliceDoc(Math.max(0, r.from - before.length), r.from);
  const outA = v.state.sliceDoc(r.to, Math.min(v.state.doc.length, r.to + after.length));
  if (outB === before && outA === after) {
    v.dispatch({
      changes: [
        { from: r.from - before.length, to: r.from, insert: "" },
        { from: r.to, to: r.to + after.length, insert: "" },
      ],
      selection: { anchor: r.from - before.length, head: r.to - before.length },
    });
  } else if (sel.startsWith(before) && sel.endsWith(after) && sel.length >= before.length + after.length) {
    const inner = sel.slice(before.length, sel.length - after.length);
    v.dispatch({ changes: { from: r.from, to: r.to, insert: inner }, selection: { anchor: r.from, head: r.from + inner.length } });
  } else {
    v.dispatch({
      changes: { from: r.from, to: r.to, insert: before + sel + after },
      selection: { anchor: r.from + before.length, head: r.from + before.length + sel.length },
    });
  }
  focus(v);
}

export const bold = (v: EditorView) => wrap(v, "**");
export const italic = (v: EditorView) => wrap(v, "*");
export const strike = (v: EditorView) => wrap(v, "~~");
export const highlight = (v: EditorView) => wrap(v, "==");
export const inlineCode = (v: EditorView) => wrap(v, "`");

/** Seçili satırlara başı ekle/kaldır. */
function setLinePrefix(v: EditorView, prefix: string, opts: { toggle?: boolean; headingReset?: boolean } = {}) {
  const r = v.state.selection.main;
  const a = v.state.doc.lineAt(r.from);
  const b = v.state.doc.lineAt(r.to);
  const changes: { from: number; to?: number; insert: string }[] = [];
  for (let n = a.number; n <= b.number; n++) {
    const line = v.state.doc.line(n);
    if (prefix === "") {
      const m = line.text.match(/^#{1,6}\s+/);
      if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: "" });
      continue;
    }
    if (opts.toggle && line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
    } else {
      const resetLen = opts.headingReset ? line.text.match(/^#{1,6}\s+/)?.[0].length ?? 0 : 0;
      changes.push({ from: line.from, to: line.from + resetLen, insert: prefix });
    }
  }
  v.dispatch({ changes });
  focus(v);
}

export const heading = (v: EditorView, lvl: number) =>
  lvl === 0 ? setLinePrefix(v, "") : setLinePrefix(v, "#".repeat(lvl) + " ", { headingReset: true });
export const bulletList = (v: EditorView) => setLinePrefix(v, "- ", { toggle: true });
export const numberedList = (v: EditorView) => setLinePrefix(v, "1. ", { toggle: true });
export const checklist = (v: EditorView) => setLinePrefix(v, "- [ ] ", { toggle: true });
export const quote = (v: EditorView) => setLinePrefix(v, "> ", { toggle: true });

export function wikilink(v: EditorView) {
  const r = v.state.selection.main;
  const sel = v.state.sliceDoc(r.from, r.to);
  v.dispatch({ changes: { from: r.from, to: r.to, insert: `[[${sel}]]` }, selection: { anchor: r.from + 2, head: r.from + 2 + sel.length } });
  focus(v);
}
export function externalLink(v: EditorView) {
  const r = v.state.selection.main;
  const text = v.state.sliceDoc(r.from, r.to) || "metin";
  v.dispatch({ changes: { from: r.from, to: r.to, insert: `[${text}](url)` }, selection: { anchor: r.from + 1, head: r.from + 1 + text.length } });
  focus(v);
}

/** İmleç satırından sonra blok ekle. */
function insertBlock(v: EditorView, text: string) {
  const r = v.state.selection.main;
  const at = v.state.doc.lineAt(r.from).to;
  const insert = `\n${text}\n`;
  v.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length } });
  focus(v);
}
export const hr = (v: EditorView) => insertBlock(v, "\n---");
export const codeBlock = (v: EditorView) => insertBlock(v, "```\n\n```");
export const table = (v: EditorView) => insertBlock(v, "| Başlık | Başlık |\n| --- | --- |\n|  |  |");
export const callout = (v: EditorView) => insertBlock(v, "> [!note]\n> ");

export const clearFormat = (v: EditorView) => {
  const r = v.state.selection.main;
  const sel = v.state.sliceDoc(r.from, r.to).replace(/(\*\*|__|\*|_|~~|==|`)/g, "");
  v.dispatch({ changes: { from: r.from, to: r.to, insert: sel }, selection: { anchor: r.from, head: r.from + sel.length } });
  focus(v);
};

// — Pano —
export async function copy(v: EditorView) {
  const r = v.state.selection.main;
  if (!r.empty) await navigator.clipboard.writeText(v.state.sliceDoc(r.from, r.to)).catch(() => {});
  focus(v);
}
export async function cut(v: EditorView) {
  const r = v.state.selection.main;
  if (r.empty) return;
  await navigator.clipboard.writeText(v.state.sliceDoc(r.from, r.to)).catch(() => {});
  v.dispatch({ changes: { from: r.from, to: r.to, insert: "" } });
  focus(v);
}
export async function paste(v: EditorView) {
  const t = await navigator.clipboard.readText().catch(() => "");
  if (!t) return;
  const r = v.state.selection.main;
  v.dispatch({ changes: { from: r.from, to: r.to, insert: t }, selection: { anchor: r.from + t.length } });
  focus(v);
}
export const selectAll = (v: EditorView) => {
  v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
  focus(v);
};

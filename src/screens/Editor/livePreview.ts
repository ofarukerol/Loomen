import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/** Obsidian "Canlı Önizleme" benzeri: markdown işaretlerini aktif satır dışında gizle, biçimle. */

const HIDE = Decoration.replace({});
const INLINE_MARKS = new Set(["EmphasisMark", "CodeMark", "StrikethroughMark"]);
const WIKILINK = /\[\[([^\]\n]+?)\]\]/g;

interface Pending {
  from: number;
  to: number;
  deco: Decoration;
}

/** Günlük başlık (# YYYY-MM-DD-...) ve #günlük metadata satırı — banner üstte gösterir, gövdede gizle. */
const HIDE_LINE = (text: string) => /^#\s+\d{4}-\d{2}-\d{2}/.test(text) || /^#günlük\b/.test(text);

function buildDecos(view: EditorView): DecorationSet {
  const { state } = view;
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  const out: Pending[] = [];
  const hidden = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    // Tüm satırı gizlenecekler (günlük meta)
    let p = from;
    while (p <= to) {
      const line = state.doc.lineAt(p);
      if (HIDE_LINE(line.text)) {
        hidden.add(line.number);
        if (line.length > 0) out.push({ from: line.from, to: line.to, deco: HIDE });
      }
      p = line.to + 1;
    }

    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        const ln = state.doc.lineAt(node.from).number;
        if (hidden.has(ln)) return;
        if (/^ATXHeading[1-6]$/.test(name)) {
          // Başlık satırına boyut ver
          const line = state.doc.lineAt(node.from);
          out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `cm-h${name[10]}` }) });
        } else if (name === "HeaderMark") {
          const line = state.doc.lineAt(node.from);
          if (line.number !== cursorLine) {
            let end = node.to;
            if (state.doc.sliceString(end, end + 1) === " ") end++;
            out.push({ from: node.from, to: end, deco: HIDE });
          }
        } else if (INLINE_MARKS.has(name)) {
          const line = state.doc.lineAt(node.from);
          if (line.number !== cursorLine) out.push({ from: node.from, to: node.to, deco: HIDE });
        }
      },
    });

    // [[wiki-link]] — lezer parse etmez; regex ile aktif satır dışında parantezleri gizle.
    const text = state.doc.sliceString(from, to);
    let m: RegExpExecArray | null;
    WIKILINK.lastIndex = 0;
    while ((m = WIKILINK.exec(text))) {
      const start = from + m.index;
      const stop = start + m[0].length;
      const line = state.doc.lineAt(start);
      if (hidden.has(line.number)) continue;
      out.push({ from: start + 2, to: stop - 2, deco: Decoration.mark({ class: "cm-wikilink" }) });
      if (line.number !== cursorLine) {
        out.push({ from: start, to: start + 2, deco: HIDE });
        out.push({ from: stop - 2, to: stop, deco: HIDE });
      }
    }
  }

  // RangeSetBuilder sıralı ekleme ister: from artan; eşitse satır-deco (sıfır uzunluk) önce.
  out.sort((a, b) => a.from - b.from || a.to - a.from - (b.to - b.from));
  const builder = new RangeSetBuilder<Decoration>();
  for (const p of out) builder.add(p.from, p.to, p.deco);
  return builder.finish();
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecos(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = buildDecos(u.view);
    }
  },
  {
    decorations: (v) => v.decorations,
    // Gizli işaretlerin üzerinden imleç atlasın
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  }
);

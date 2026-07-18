import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { AudioEmbedPlayer } from "./AudioEmbedPlayer";

/** Obsidian "Canlı Önizleme" benzeri: markdown işaretlerini aktif satır dışında gizle, biçimle. */

const HIDE = Decoration.replace({});
const INLINE_MARKS = new Set(["EmphasisMark", "CodeMark", "StrikethroughMark"]);
const WIKILINK = /\[\[([^\]\n]+?)\]\]/g;
/** Tek başına bir satırı kaplayan ses embed'i: ![[Ses Notları/xxx.flac]] (bkz VoiceRecorder). */
const AUDIO_EMBED = /^!\[\[(.+\.(?:flac|wav|webm|m4a|mp3|aac))\]\]$/i;

/**
 * Düzenleme modunda ses embed satırının yerine TAM oynatıcıyı (AudioEmbedPlayer — ad + ⋮ menü +
 * dalga formu) koyar; okuma moduyla birebir aynı görünüm/işlev. Rename/sil sonrası CM dokümanı
 * onMutated callback'iyle güncellenir (CM dış value değişikliklerini almaz — bkz AudioEmbedPlayer).
 */
class AudioEmbedWidget extends WidgetType {
  private root: Root | null = null;
  constructor(readonly path: string) {
    super();
  }
  eq(other: AudioEmbedWidget) {
    return other.path === this.path; // aynı path → DOM yeniden kurulmaz (çalma kesilmez)
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-audioembed";
    this.root = createRoot(wrap);
    this.root.render(
      createElement(AudioEmbedPlayer, {
        path: this.path,
        onMutated: (kind, oldPath, newPath) => {
          const doc = view.state.doc.toString();
          const oldStr = `![[${oldPath}]]`;
          const idx = doc.indexOf(oldStr);
          if (idx < 0) return;
          if (kind === "rename" && newPath) {
            view.dispatch({ changes: { from: idx, to: idx + oldStr.length, insert: `![[${newPath}]]` } });
          } else if (kind === "delete") {
            let to = idx + oldStr.length;
            if (doc[to] === "\n") to++; // satırı boş bırakma
            view.dispatch({ changes: { from: idx, to } });
          }
        },
      })
    );
    return wrap;
  }
  destroy() {
    // React unmount'unu CM güncelleme döngüsünün dışına ertele (senkron unmount uyarısı).
    const root = this.root;
    this.root = null;
    if (root) setTimeout(() => root.unmount(), 0);
  }
  ignoreEvent() {
    return true; // oynatıcı etkileşimi editöre gitmesin (imleç sıçramasın)
  }
}

interface Pending {
  from: number;
  to: number;
  deco: Decoration;
}

function buildDecos(view: EditorView): DecorationSet {
  const { state } = view;
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  const out: Pending[] = [];

  // Ses embed satırları → oynatıcı widget'ı (aktif satır hariç — orada ham metin düzenlenir).
  // Bu satırlar wiki-link işlemesinden muaf tutulur (çakışan dekorasyon olmasın).
  const audioLines = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = state.doc.lineAt(pos);
      const m = line.text.trim().match(AUDIO_EMBED);
      if (m) {
        audioLines.add(line.number);
        if (line.number !== cursorLine && line.to > line.from) {
          out.push({
            from: line.from,
            to: line.to,
            deco: Decoration.replace({ widget: new AudioEmbedWidget(m[1]) }),
          });
        }
      }
      if (line.to + 1 > to) break;
      pos = line.to + 1;
    }
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
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
      if (audioLines.has(line.number)) continue; // embed satırı — widget hallediyor
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

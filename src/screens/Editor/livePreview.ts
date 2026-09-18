import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { AudioEmbedPlayer } from "./AudioEmbedPlayer";
import { ImageEmbed, parseImageLine, type ImageRef } from "./ImageEmbed";
import { createTauriBackend, isTauri } from "../../core/vault";
import { useAppStore } from "../../store/useAppStore";

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

/**
 * Düzenleme modunda resim embed satırının yerine resmin kendisini koyar (aktif satır hariç —
 * orada ham metin düzenlenir). Resim yüklenince satır yüksekliği değiştiği için CM'den yeniden
 * ölçüm istenir; yoksa imleç/fare isabeti resmin altındaki satırlarda kayar.
 */
class ImageEmbedWidget extends WidgetType {
  private root: Root | null = null;
  constructor(
    readonly raw: string,
    readonly ref: ImageRef
  ) {
    super();
  }
  eq(other: ImageEmbedWidget) {
    return other.raw === this.raw; // aynı satır → DOM yeniden kurulmaz (resim yeniden yüklenmez)
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-imgembed";
    this.root = createRoot(wrap);
    this.root.render(
      createElement(ImageEmbed, {
        ...this.ref,
        raw: this.raw,
        onLoad: () => view.requestMeasure(),
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
    return true; // resme tıklamak imleci sıçratmasın
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

  // Ses/resim embed satırları → oynatıcı ya da resim widget'ı (aktif satır hariç — orada ham
  // metin düzenlenir). Bu satırlar wiki-link işlemesinden muaf tutulur (çakışan dekorasyon olmasın).
  const embedLines = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = state.doc.lineAt(pos);
      const raw = line.text.trim();
      const m = raw.match(AUDIO_EMBED);
      if (m) {
        embedLines.add(line.number);
        if (line.number !== cursorLine && line.to > line.from) {
          out.push({
            from: line.from,
            to: line.to,
            deco: Decoration.replace({ widget: new AudioEmbedWidget(m[1]) }),
          });
        }
      } else {
        const img = parseImageLine(raw);
        if (img) {
          embedLines.add(line.number);
          if (line.number !== cursorLine && line.to > line.from) {
            out.push({
              from: line.from,
              to: line.to,
              deco: Decoration.replace({ widget: new ImageEmbedWidget(raw, img) }),
            });
          }
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
      if (embedLines.has(line.number)) continue; // embed satırı — widget hallediyor
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

/** Panodan yapıştırılan resimlerin kasadaki klasörü. */
const ATTACH_DIR = "Ekler";

/** MIME → dosya uzantısı (pano resmi çoğu platformda PNG gelir). */
function extFromMime(mime: string): string {
  const sub = mime.split("/")[1]?.split("+")[0]?.toLowerCase() ?? "";
  if (sub === "jpeg") return "jpg";
  if (/^(png|gif|webp|bmp|avif|svg)$/.test(sub)) return sub;
  return "png";
}

/** Dosya adı için zaman damgası: 2026-09-18_14-03-21 */
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
}

/** Pano resmini `Ekler/` altına yaz, kasaya göre yolunu dön (klasörü writeBinary oluşturur). */
async function saveClipboardImage(file: File, vaultRoot: string): Promise<string> {
  const backend = createTauriBackend(vaultRoot);
  const ext = extFromMime(file.type);
  const base = `Görsel ${stamp(new Date())}`;
  let path = `${ATTACH_DIR}/${base}.${ext}`;
  for (let n = 2; await backend.exists(path); n++) path = `${ATTACH_DIR}/${base} (${n}).${ext}`;
  await backend.writeBinary(path, new Uint8Array(await file.arrayBuffer()));
  return path;
}

/** Embed satırını imlece yaz — kendi satırında dursun (widget satır bazlı çalışır). */
function insertImageEmbed(view: EditorView, path: string): void {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const head = view.state.doc.sliceString(line.from, from);
  const insert = `${head.trim() === "" ? "" : "\n"}![[${path}]]\n`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
  });
  view.focus();
}

/**
 * Panodan resim yapıştırma: dosyayı `Ekler/` altına kaydedip yerine `![[...]]` embed'i yazar.
 * Tarayıcı/örnek kasa modunda (gerçek dosya sistemi yok) dokunmaz — CM'in varsayılan
 * yapıştırması çalışır, böylece metin yapıştırma hiçbir koşulda kaybolmaz.
 */
const imagePaste = EditorView.domEventHandlers({
  paste(event, view) {
    const items = event.clipboardData?.items;
    if (!items) return false;
    let file: File | null = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind !== "file" || !items[i].type.startsWith("image/")) continue;
      file = items[i].getAsFile();
      if (file) break;
    }
    if (!file) return false;
    const vaultRoot = useAppStore.getState().vaultPath;
    if (!vaultRoot || !isTauri()) return false;
    // Dosya elde edildi (getAsFile senkron) → yapıştırmayı devralabiliriz.
    event.preventDefault();
    const picked = file;
    void saveClipboardImage(picked, vaultRoot)
      .then((path) => insertImageEmbed(view, path))
      .catch((e) => console.error("Resim kasaya kaydedilemedi:", e));
    return true;
  },
});

const livePreviewPlugin = ViewPlugin.fromClass(
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

/** Canlı önizleme uzantısı: dekorasyonlar + panodan resim yapıştırma. */
export const livePreview: Extension = [livePreviewPlugin, imagePaste];

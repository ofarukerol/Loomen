import type { EditorView } from "@codemirror/view";
import { findFenceBlocks, findTables } from "./tableModel";

/** Markdown biçimlendirme komutları — CodeMirror seçimi üzerinde çalışır, formatı bozmaz. */

function focus(v: EditorView) {
  v.focus();
}

/** Metnin başındaki (fromEnd ise sonundaki) ardışık "*" sayısı. */
function starRun(s: string, fromEnd: boolean): number {
  let n = 0;
  while (n < s.length && s[fromEnd ? s.length - 1 - n : n] === "*") n++;
  return n;
}

/**
 * Tek yıldız (italik) gerçekten italik mi? "**metin**" kalının yıldızları italik sayılmaz;
 * iki taraftaki yıldız sayısının küçüğü tekse (1: italik, 3: kalın+italik) italik vardır.
 */
function italicStars(left: string, right: string): boolean {
  const n = Math.min(starRun(left, true), starRun(right, false));
  return n % 2 === 1;
}

/** Seçimi before/after ile sar; zaten sarılıysa kaldır (toggle). */
export function wrap(v: EditorView, before: string, after = before) {
  const r = v.state.selection.main;
  const sel = v.state.sliceDoc(r.from, r.to);
  const outB = v.state.sliceDoc(Math.max(0, r.from - before.length), r.from);
  const outA = v.state.sliceDoc(r.to, Math.min(v.state.doc.length, r.to + after.length));
  const star = before === "*" && after === "*";
  const outerIsMark =
    outB === before &&
    outA === after &&
    (!star ||
      italicStars(
        v.state.sliceDoc(Math.max(0, r.from - 6), r.from),
        v.state.sliceDoc(r.to, Math.min(v.state.doc.length, r.to + 6))
      ));
  const innerIsMark =
    sel.startsWith(before) &&
    sel.endsWith(after) &&
    sel.length >= before.length + after.length &&
    (!star || italicStars(sel, sel));
  if (outerIsMark) {
    v.dispatch({
      changes: [
        { from: r.from - before.length, to: r.from, insert: "" },
        { from: r.to, to: r.to + after.length, insert: "" },
      ],
      selection: { anchor: r.from - before.length, head: r.to - before.length },
    });
  } else if (innerIsMark) {
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

export interface BlockInsert {
  /** Eklemenin yapılacağı belge pozisyonu. */
  from: number;
  insert: string;
  /** Ekleme sonrası imlecin gideceği pozisyon. */
  caret: number;
}

/**
 * Blok ekleme planı (saf — node testlerinden koşulabilir).
 *
 * İmleç bir tablonun/kod bloğunun ya da dolu bir paragrafın içindeyse blok ARAYA değil,
 * o bloğun sonuna eklenir; öncesinde boş satır bırakılır ve arkasına boş bir satır açılır.
 * İmleç varsayılan olarak eklenen bloğun ALTINDAKİ boş satıra gider; `caretIn` verilirse
 * eklenen metnin içindeki o kaydırmaya (ör. kod bloğunun içi) gider.
 */
export function computeBlockInsert(doc: string, pos: number, text: string, caretIn?: number): BlockInsert {
  const lines = doc.split("\n");
  const starts: number[] = [];
  let acc = 0;
  for (const l of lines) {
    starts.push(acc);
    acc += l.length + 1;
  }
  const clamped = Math.max(0, Math.min(pos, doc.length));
  let idx = 0;
  while (idx + 1 < lines.length && starts[idx + 1] <= clamped) idx++;

  const tables = findTables(lines);
  const fences = findFenceBlocks(lines);
  const inTable = tables.find((t) => idx >= t.headerLine && idx <= t.endLine);
  const inFence = fences.find((f) => idx >= f.start && idx <= f.end);
  const startsTable = (i: number) => tables.some((t) => t.headerLine === i);
  const startsFence = (i: number) => fences.some((f) => f.start === i);

  let end = idx;
  if (inTable) end = inTable.endLine;
  else if (inFence) end = inFence.end;
  else if (lines[idx].trim() !== "") {
    while (end + 1 < lines.length && lines[end + 1].trim() !== "" && !startsTable(end + 1) && !startsFence(end + 1))
      end++;
  }

  const empty = lines[end].trim() === "";
  const at = empty ? starts[end] : starts[end] + lines[end].length;
  const prefix = empty ? "" : "\n\n";
  // Alttaki satır zaten boşsa yenisini açma — imleç var olan boş satıra gider.
  const nextBlank = end + 1 < lines.length && lines[end + 1].trim() === "";
  const insert = `${prefix}${text}${nextBlank ? "" : "\n"}`;
  const caret = caretIn == null ? at + prefix.length + text.length + 1 : at + prefix.length + caretIn;
  return { from: at, insert, caret };
}

/** İmlecin bulunduğu bloğun sonuna blok ekle. */
function insertBlock(v: EditorView, text: string, caretIn?: number) {
  const plan = computeBlockInsert(v.state.doc.toString(), v.state.selection.main.from, text, caretIn);
  v.dispatch({
    changes: { from: plan.from, insert: plan.insert },
    selection: { anchor: plan.caret },
    scrollIntoView: true,
  });
  focus(v);
}
export const hr = (v: EditorView) => insertBlock(v, "---");
// İmleç çitlerin arasındaki boş satıra.
export const codeBlock = (v: EditorView) => insertBlock(v, "```\n\n```", 4);
export const table = (v: EditorView) => insertBlock(v, "| Başlık | Başlık |\n| --- | --- |\n|  |  |");
// İmleç "> " işaretinden sonraya.
export const callout = (v: EditorView) => insertBlock(v, "> [!note]\n> ", 12);

export const clearFormat = (v: EditorView) => {
  const r = v.state.selection.main;
  const sel = v.state.sliceDoc(r.from, r.to).replace(/(\*\*|__|\*|_|~~|==|`)/g, "");
  v.dispatch({ changes: { from: r.from, to: r.to, insert: sel }, selection: { anchor: r.from, head: r.from + sel.length } });
  focus(v);
};

// — Pano —

/** Pano komutunun sonucu: "empty" = kopyalanacak seçim ya da yapıştırılacak metin yok. */
export type ClipResult = "ok" | "empty" | "unavailable";

/**
 * Pano erişimi — testlerde sahtesi verilir. Verilmeyen alan varsayılandan gelir.
 * notify, panoya erişilemeyince kullanıcıya gösterilecek ctx.* çeviri anahtarıyla çağrılır.
 */
export interface ClipboardIO {
  readText?: () => Promise<string>;
  writeText?: (text: string) => Promise<void>;
  /** Eski yol: document.execCommand("copy"). true = tarayıcı kopyaladı. */
  execCopy?: () => boolean;
  notify?: (key: "pasteUnavailable" | "copyUnavailable") => void;
}

const defaultIO: Required<ClipboardIO> = {
  readText: () => navigator.clipboard.readText(),
  writeText: (text) => navigator.clipboard.writeText(text),
  execCopy: () => {
    try {
      return typeof document !== "undefined" && document.execCommand("copy");
    } catch {
      return false;
    }
  },
  notify: () => {},
};

function clipIO(io?: ClipboardIO): Required<ClipboardIO> {
  // undefined verilen alan varsayılanı ezmesin.
  const given = Object.fromEntries(Object.entries(io ?? {}).filter(([, f]) => f != null));
  return { ...defaultIO, ...given } as Required<ClipboardIO>;
}

/** Metni panoya yaz: önce Clipboard API, olmazsa execCommand (editör odaktayken seçimi kopyalar). */
async function writeClip(v: EditorView, text: string, io: Required<ClipboardIO>): Promise<boolean> {
  try {
    await io.writeText(text);
    return true;
  } catch {
    /* izin yok ya da API yok — eski yolu dene */
  }
  focus(v);
  return io.execCopy();
}

export async function copy(v: EditorView, io?: ClipboardIO): Promise<ClipResult> {
  const c = clipIO(io);
  const r = v.state.selection.main;
  if (r.empty) {
    focus(v);
    return "empty";
  }
  const ok = await writeClip(v, v.state.sliceDoc(r.from, r.to), c);
  focus(v);
  if (!ok) {
    c.notify("copyUnavailable");
    return "unavailable";
  }
  return "ok";
}
export async function cut(v: EditorView, io?: ClipboardIO): Promise<ClipResult> {
  const c = clipIO(io);
  const r = v.state.selection.main;
  if (r.empty) {
    focus(v);
    return "empty";
  }
  const ok = await writeClip(v, v.state.sliceDoc(r.from, r.to), c);
  if (!ok) {
    // Panoya geçmeyen metni silmek veri kaybı olur: belgeye dokunma, haber ver.
    focus(v);
    c.notify("copyUnavailable");
    return "unavailable";
  }
  v.dispatch({ changes: { from: r.from, to: r.to, insert: "" } });
  focus(v);
  return "ok";
}
export async function paste(v: EditorView, io?: ClipboardIO): Promise<ClipResult> {
  const c = clipIO(io);
  let t: string;
  try {
    t = await c.readText();
  } catch {
    // İzin yok (Android WebView, Safari) ya da API yok — sessiz kalma.
    focus(v);
    c.notify("pasteUnavailable");
    return "unavailable";
  }
  if (!t) {
    focus(v);
    return "empty";
  }
  const r = v.state.selection.main;
  v.dispatch({ changes: { from: r.from, to: r.to, insert: t }, selection: { anchor: r.from + t.length } });
  focus(v);
  return "ok";
}
export const selectAll = (v: EditorView) => {
  v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
  focus(v);
};

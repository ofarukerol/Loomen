import type { EditorView } from "@codemirror/view";
import * as cmd from "./editorCommands";
import type { ClipboardIO } from "./editorCommands";

/**
 * Editör bağlam menüsünün saf modeli (DOM ve React yok — node testlerinden koşulabilir).
 *
 * Menü ağacı, yeniden boyutlanmada ne yapılacağı, ekrana kenetleme ve dokunmayla açılan menüde
 * parmak kalkana kadar tıklamaların yok sayılması burada. İkonlar ve çeviri bileşende kalır.
 */

export type CommandId =
  | "wikilink"
  | "externalLink"
  | "bold"
  | "italic"
  | "strike"
  | "highlight"
  | "inlineCode"
  | "clearFormat"
  | "bulletList"
  | "numberedList"
  | "checklist"
  | "heading"
  | "quote"
  | "table"
  | "callout"
  | "hr"
  | "codeBlock"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll";

export interface MenuNode {
  id: string;
  /** i18n anahtarı (ör. "ctx.insert"). Ayırıcıda yok. */
  labelKey?: string;
  /** Çeviri parametreleri (başlık düzeyi: { n: 2 }). */
  labelArgs?: Record<string, number>;
  sep?: boolean;
  children?: MenuNode[];
  command?: CommandId;
  /** Komut argümanı (başlık düzeyi; 0 = başlıksız). */
  arg?: number;
}

export const MENU: MenuNode[] = [
  { id: "wlink", labelKey: "ctx.addLink", command: "wikilink" },
  { id: "elink", labelKey: "ctx.addExternal", command: "externalLink" },
  { id: "s1", sep: true },
  {
    id: "fmt",
    labelKey: "ctx.format",
    children: [
      { id: "b", labelKey: "fmt.bold", command: "bold" },
      { id: "i", labelKey: "fmt.italic", command: "italic" },
      { id: "st", labelKey: "fmt.strike", command: "strike" },
      { id: "hl", labelKey: "fmt.highlight", command: "highlight" },
      { id: "sf1", sep: true },
      { id: "code", labelKey: "fmt.code", command: "inlineCode" },
      { id: "sf2", sep: true },
      { id: "clr", labelKey: "ctx.clearFormat", command: "clearFormat" },
    ],
  },
  {
    id: "para",
    labelKey: "ctx.paragraph",
    children: [
      { id: "ul", labelKey: "ctx.bulletList", command: "bulletList" },
      { id: "ol", labelKey: "ctx.numberedList", command: "numberedList" },
      { id: "cl", labelKey: "ctx.checklist", command: "checklist" },
      { id: "sp1", sep: true },
      ...[1, 2, 3, 4, 5, 6].map(
        (n): MenuNode => ({ id: "h" + n, labelKey: "ctx.heading", labelArgs: { n }, command: "heading", arg: n })
      ),
      { id: "h0", labelKey: "ctx.noHeading", command: "heading", arg: 0 },
      { id: "sp2", sep: true },
      { id: "q", labelKey: "fmt.quote", command: "quote" },
    ],
  },
  {
    id: "ins",
    labelKey: "ctx.insert",
    children: [
      { id: "tbl", labelKey: "ctx.table", command: "table" },
      { id: "cal", labelKey: "ctx.callout", command: "callout" },
      { id: "hr", labelKey: "ctx.hr", command: "hr" },
      { id: "si", sep: true },
      { id: "cb", labelKey: "ctx.codeBlock", command: "codeBlock" },
    ],
  },
  { id: "s2", sep: true },
  { id: "cut", labelKey: "ctx.cut", command: "cut" },
  { id: "copy", labelKey: "ctx.copy", command: "copy" },
  { id: "paste", labelKey: "ctx.paste", command: "paste" },
  { id: "selall", labelKey: "ctx.selectAll", command: "selectAll" },
];

/** Bir grubun ayırıcı olmayan alt öğelerinin kimlikleri (grup yoksa boş). */
export function subItems(id: string): string[] {
  const g = MENU.find((n) => n.id === id);
  return (g?.children ?? []).filter((n) => !n.sep).map((n) => n.id);
}

/** Kimliğe göre düğüm (alt gruplar dahil). */
export function findNode(id: string, nodes: MenuNode[] = MENU): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children && findNode(id, n.children);
    if (hit) return hit;
  }
  return undefined;
}

/** Bir düğümün komutunu görünüm üzerinde çalıştır. Pano komutları sonuç kodunu döndürür. */
export function runCommand(v: EditorView, node: MenuNode, io?: ClipboardIO): unknown {
  switch (node.command) {
    case "heading":
      return cmd.heading(v, node.arg ?? 0);
    case "cut":
      return cmd.cut(v, io);
    case "copy":
      return cmd.copy(v, io);
    case "paste":
      return cmd.paste(v, io);
    case undefined:
      return undefined;
    default:
      return cmd[node.command](v);
  }
}

export interface Size {
  w: number;
  h: number;
}

/**
 * Menü açıkken pencere boyutu değişince ne yapılmalı.
 *
 * Yalnız yükseklik değiştiyse bu çoğunlukla ekran klavyesinin açılıp kapanmasıdır (Android'de
 * menüdeki düğmeye basınca klavye kapanır ve WebView büyür) — menü kapanmaz, ekrana yeniden
 * kenetlenir. Genişlik değiştiyse (döndürme, pencere boyutu) konum anlamını yitirir: kapat.
 */
export function viewportChangeAction(before: Size, after: Size): "close" | "reclamp" | "none" {
  if (before.w !== after.w) return "close";
  if (before.h !== after.h) return "reclamp";
  return "none";
}

/** Ölçülmüş menüyü (w×h) görünür alanın (vw×vh) içine kenetle; kenarda pad kadar boşluk. */
export function clampMenuPosition(p: {
  x: number;
  y: number;
  w: number;
  h: number;
  vw: number;
  vh: number;
  pad?: number;
}): { left: number; top: number } {
  const pad = p.pad ?? 8;
  return {
    left: Math.max(pad, Math.min(p.x, p.vw - p.w - pad)),
    top: Math.max(pad, Math.min(p.y, p.vh - p.h - pad)),
  };
}

export interface ActivationGate {
  /** Menüdeki tıklamalar artık işlensin mi. */
  ready(): boolean;
  /** Parmak kalktı (pointerup / pointercancel): bundan sonra tıklamalar geçerli. */
  release(): void;
}

/**
 * Dokunmayla (uzun basma) açılan menü parmak hâlâ ekrandayken çizilir; parmak kalkınca gelen
 * tıklama altına denk gelen öğeyi çalıştırabilir. Kapı, ilk kalkışa kadar tıklamaları yok sayar.
 * Kalkış olayı kaçarsa graceMs sonra kendiliğinden açılır. Fareyle açılan menü hemen hazırdır.
 */
export function createActivationGate(opts: {
  openedBy: "mouse" | "touch";
  graceMs?: number;
  now?: () => number;
}): ActivationGate {
  const now = opts.now ?? (() => Date.now());
  const grace = opts.graceMs ?? 400;
  const start = now();
  let released = opts.openedBy === "mouse";
  return {
    ready: () => released || now() - start >= grace,
    release: () => {
      released = true;
    },
  };
}

/** Komutu (görünüm varsa) çalıştır, ardından menüyü kapat. Komutun dönüşünü verir. */
export function activate<T>(
  run: ((v: EditorView) => T) | undefined,
  getView: () => EditorView | null,
  onClose: () => void
): T | undefined {
  const v = getView();
  let out: T | undefined;
  try {
    if (v && run) out = run(v);
  } finally {
    onClose();
  }
  return out;
}

/**
 * Seçim çubuğu (LOM-110) — saf mantık. React ve DOM yok; node testlerinden koşulur.
 *
 * Notta metin seçilince üstünde çıkan küçük çubuk iki iş yapar: seçili metinden
 * "ön :: arka" Tekrar kartı satırı yazmak ve seçili metni başka bir nota [[bağlantı]]
 * yapmak. Üretilen metin elle yazılan işaretlerle birebir aynıdır; ayrıştırıcıya yeni
 * biçim eklenmez.
 */
import { computeBlockInsert } from "./editorCommands";
import { findFenceBlocks, findTables } from "./tableModel";
import { foldTr } from "../../core/search/search";
import type { SrsSettings } from "../../core/srs/types";

/** Tek satıra indir, boşlukları sadeleştir. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Metinde "::" kalmasın — kart ayracıyla karışmasın (":::" de ": : :" olur). */
function escapeSep(s: string): string {
  let out = s;
  while (out.includes("::")) out = out.replace(/::/g, ": :");
  return out;
}

/** "ön :: arka" kart satırı; ön ya da arka boşsa null. */
export function cardLine(front: string, back: string): string | null {
  const f = escapeSep(oneLine(front));
  const b = escapeSep(oneLine(back));
  if (!f || !b) return null;
  return `${f} :: ${b}`;
}

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
  /** Yazımdan sonra imlecin gideceği konum. */
  caret: number;
}

/** Satır başındaki girinti + liste işareti ("- ", "* ", "+ "); ayrıştırıcının attığı önek. */
const LIST_PREFIX = /^\s*[-*+]\s+/;

/**
 * Kart satırını nereye yazacağımızın planı.
 *
 * Seçim tam olarak tek bir satırın metniyse (liste işareti hariç) ve ön yüz seçimle aynıysa
 * o satır kart satırına dönüşür (liste işareti korunur). Aksi halde kart satırı seçimin
 * bulunduğu bloğun altına AYRI satır olarak eklenir — ayrıştırıcı satır bazlı çalışır,
 * paragrafın ortasına yazılan "::" bütün satırı soru yapardı.
 */
export function planCardInsert(doc: string, from: number, to: number, front: string, back: string): TextEdit | null {
  const line = cardLine(front, back);
  if (line == null) return null;
  let a = Math.max(0, Math.min(from, to, doc.length));
  let b = Math.max(0, Math.min(Math.max(from, to), doc.length));
  // Baştaki/sondaki boşluk ve satır sonu sayılmaz: üç tıklama satırı satır sonuyla birlikte
  // seçer; o zaman da satır kendi yerinde karta dönmeli, kart alttaki bloğa kaymamalı.
  while (b > a && /\s/.test(doc[b - 1])) b--;
  while (a < b && /\s/.test(doc[a])) a++;
  const sel = doc.slice(a, b);

  const lineStart = doc.lastIndexOf("\n", a - 1) + 1;
  let lineEnd = doc.indexOf("\n", a);
  if (lineEnd < 0) lineEnd = doc.length;
  const text = doc.slice(lineStart, lineEnd).replace(/\r$/, "");
  const prefix = text.match(LIST_PREFIX)?.[0] ?? "";
  const body = text.slice(prefix.length);
  const lines = doc.split("\n");
  const idx = doc.slice(0, lineStart).split("\n").length - 1;
  const inBlock =
    findFenceBlocks(lines).some((f) => idx >= f.start && idx <= f.end) ||
    findTables(lines).some((t) => idx >= t.headerLine && idx <= (t.metaLine ?? t.endLine));
  const heading = /^\s{0,3}#{1,6}\s/.test(text) || /^\s*>/.test(text);

  const wholeLine =
    !sel.includes("\n") &&
    b <= lineEnd &&
    !inBlock &&
    !heading &&
    oneLine(sel) !== "" &&
    oneLine(sel) === oneLine(body) &&
    oneLine(front) === oneLine(sel);
  if (wholeLine) {
    const start = lineStart + prefix.length;
    const end = lineStart + text.length;
    return { from: start, to: end, insert: line, caret: start + line.length };
  }
  const plan = computeBlockInsert(doc, b, line);
  return { from: plan.from, to: plan.from, insert: plan.insert, caret: plan.caret };
}

/**
 * Seçim bağlantı yapılabilir mi: baştaki/sondaki boşluk atıldıktan sonra tek satır olmalı.
 * Çok satırlı seçimi tek bağlantı etiketine çevirmek satırları birleştirir ve köşeli
 * parantez/dikey çizgi gibi işaretleri siler; bu yüzden düğme gizlenir.
 */
export function canLink(selected: string): boolean {
  const s = selected.trim();
  return s !== "" && !s.includes("\n");
}

/** Bağlantı metni: etiket hedefle aynıysa [[hedef]], değilse [[hedef|etiket]]. */
export function wikiLinkText(target: string, label: string): string {
  const clean = oneLine(label).replace(/[[\]|]/g, "").replace(/\s+/g, " ").trim();
  if (!clean || clean === target) return `[[${target}]]`;
  return `[[${target}|${clean}]]`;
}

/**
 * Seçimin yerine yazılacak bağlantı. Seçimin başındaki/sonundaki boşluklar bağlantının
 * dışında kalır ("kelime " seçilince boşluk yutulmasın).
 */
export function linkReplacement(selected: string, target: string): string {
  const lead = selected.match(/^\s*/)?.[0] ?? "";
  const trail = selected.slice(lead.length).match(/\s*$/)?.[0] ?? "";
  return lead + wikiLinkText(target, selected) + trail;
}

export interface NoteRef {
  path: string;
  name: string;
  kind?: "note" | "draw";
}

/** Bağlantı hedefi: aynı adlı birden çok not varsa uzantısız yol, yoksa not adı. */
export function linkTargetFor(note: NoteRef, notes: readonly NoteRef[]): string {
  const key = foldTr(note.name);
  const same = notes.filter((n) => foldTr(n.name) === key).length;
  return same > 1 ? note.path.replace(/\.(md|excalidraw)$/i, "") : note.name;
}

/**
 * Bağlantı penceresindeki not listesi: ada ve yola göre Türkçe harf katlamasıyla süzülür;
 * adı sorguyla başlayanlar önce, sonra adında geçenler, sonra yolunda geçenler.
 * `exclude` (açık notun kendisi) ve çizimler listede yer almaz.
 */
export function filterNotes<T extends NoteRef>(notes: readonly T[], query: string, limit = 50, exclude?: string): T[] {
  const q = foldTr(query.trim());
  const ranked: { n: T; r: number }[] = [];
  for (const n of notes) {
    if (n.path === exclude || n.kind === "draw") continue;
    const name = foldTr(n.name);
    let r: number;
    if (!q) r = 0;
    else if (name.startsWith(q)) r = 0;
    else if (name.includes(q)) r = 1;
    else if (foldTr(n.path).includes(q)) r = 2;
    else continue;
    ranked.push({ n, r });
  }
  ranked.sort((x, y) => x.r - y.r || x.n.name.localeCompare(y.n.name, "tr") || x.n.path.localeCompare(y.n.path, "tr"));
  return ranked.slice(0, Math.max(0, limit)).map((x) => x.n);
}

/** Bu notta "Tekrar kartı yap" anlamlı mı: Tekrar açık, "Soru :: Cevap" biçimi açık, not hariç klasörde değil. */
export function canMakeCard(settings: Pick<SrsSettings, "enabled" | "syntax" | "excluded">, path: string): boolean {
  if (!settings.enabled || !settings.syntax?.basic) return false;
  return !(settings.excluded ?? []).some((d) => d && (path === d || path.startsWith(d + "/")));
}

export interface BarPlaceInput {
  /** Seçimin ekrandaki üst/alt kenarı ve başlangıç x'i (px). */
  selTop: number;
  selBottom: number;
  selLeft: number;
  barW: number;
  barH: number;
  vw: number;
  vh: number;
  /** Dokunmatikte sistemin kendi seçim menüsü üstte çıkar → çubuk alta. */
  touch: boolean;
}

const GAP = 8;
const EDGE = 4;

/** Çubuğun konumu: seçimin üstü (dokunmatikte altı); sığmazsa öbür taraf; ekrana kenetli. */
export function placeBar(p: BarPlaceInput): { left: number; top: number; side: "above" | "below" } {
  const above = p.selTop - p.barH - GAP;
  const below = p.selBottom + GAP;
  const fitsAbove = above >= EDGE;
  const fitsBelow = below + p.barH <= p.vh - EDGE;
  let side: "above" | "below";
  if (p.touch) side = fitsBelow || !fitsAbove ? "below" : "above";
  else side = fitsAbove || !fitsBelow ? "above" : "below";
  let top = side === "above" ? above : below;
  top = Math.max(EDGE, Math.min(top, p.vh - p.barH - EDGE));
  const left = Math.max(EDGE, Math.min(p.selLeft, p.vw - p.barW - EDGE));
  return { left, top, side };
}

/** Çubuk görünsün mü: düzenleme modunda, boş olmayan ve tablo dışındaki seçimde. */
export function barVisible(s: { empty: boolean; text: string; inTable: boolean; editing: boolean }): boolean {
  return s.editing && !s.empty && s.text.trim() !== "" && !s.inTable;
}

/** Seçim (başı ya da sonu) bir tablonun satırlarında mı? Tablonun kendi hücre çubuğu var. */
export function selectionInTable(doc: string, from: number, to: number): boolean {
  if (!doc.includes("|")) return false;
  const lines = doc.split("\n");
  const lineOf = (pos: number) => doc.slice(0, Math.max(0, Math.min(pos, doc.length))).split("\n").length - 1;
  const a = lineOf(Math.min(from, to));
  const b = lineOf(Math.max(from, to));
  return findTables(lines).some((t) => a <= (t.metaLine ?? t.endLine) && b >= t.headerLine);
}

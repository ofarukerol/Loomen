/**
 * Tabloda biçim (LOM-98): hizalama, kalın, italik.
 *
 * Nerede saklanır:
 * - Sütun hizası standart GFM ayraç satırında: `| :--- | :---: | ---: |` (sol/orta/sağ).
 * - Satır ve hücre biçimi ile kalın/italik, tablonun altındaki gizli not satırının `bicim`
 *   bölümünde: `<!-- loomen: para B=TRY bicim B=kalin 2=orta,italik B2=sag,-kalin -->`.
 *   Anahtarlar formül diliyle aynı: sütun harfi (B), satır numarası (1 başlık, 2 ilk gövde
 *   satırı), hücre (B2). Belirteçler virgülle: sol|orta|sag|kalin|-kalin|italik|-italik.
 * - Öncelik: hücre > satır > sütun. `-kalin` kalıtılan kalını tek hücrede kapatır.
 *
 * Hücre metinleri ve formüller hiç değişmez; biçim yalnız ekranda uygulanır.
 *
 * Saf modül: DOM, i18n, CodeMirror bilmez (node testlerinden koşulur). tableModel'i içe
 * aktarmaz; tableMeta'dan yalnız tür alır (çalışma zamanı döngüsü olmasın).
 */

import type { TableMeta } from "./tableMeta";

export type Align = "left" | "center" | "right";

export interface CellStyle {
  align?: Align;
  bold?: boolean;
  italic?: boolean;
}

/** row: 0-tabanlı gövde indeksi, -1 = başlık (cellLineIndex ile aynı). */
export type StyleTarget =
  | { kind: "col"; col: number }
  | { kind: "row"; row: number }
  | { kind: "cell"; row: number; col: number };

export interface EffectiveCellStyle {
  align: Align | null;
  bold: boolean;
  italic: boolean;
}

export type FormatAction = { type: "align"; align: Align } | { type: "bold" } | { type: "italic" };

// ─── Anahtarlar ─────────────────────────────────────────────────────────────

function colLetter(idx: number): string {
  let n = idx + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function letterIndex(letters: string): number {
  if (!/^[A-Z]+$/.test(letters)) return -1;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Hedefin not satırı anahtarı: sütun "B", satır "2" (başlık "1"), hücre "B2". */
export function styleKey(t: StyleTarget): string {
  if (t.kind === "col") return colLetter(t.col);
  if (t.kind === "row") return String(t.row + 2);
  return `${colLetter(t.col)}${t.row + 2}`;
}

/** styleKey'in tersi; geçersizse null. */
export function parseStyleKey(s: string): StyleTarget | null {
  const m = (s ?? "").trim().toUpperCase().match(/^([A-Z]*)(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  const col = m[1] ? letterIndex(m[1]) : -1;
  const num = m[2] ? Number(m[2]) : 0;
  if (m[2] && (!Number.isInteger(num) || num < 1)) return null;
  if (m[1] && m[2]) return { kind: "cell", row: num - 2, col };
  if (m[1]) return { kind: "col", col };
  return { kind: "row", row: num - 2 };
}

// ─── Belirteçler ────────────────────────────────────────────────────────────

const ALIGN_TOKEN: Record<string, Align> = { sol: "left", orta: "center", sag: "right" };
const TOKEN_OF_ALIGN: Record<Align, string> = { left: "sol", center: "orta", right: "sag" };

/** "orta,kalin,-italik" → { align: "center", bold: true, italic: false }. Boşsa null. */
export function parseStyleFlags(s: string): CellStyle | null {
  const out: CellStyle = {};
  for (const raw of (s ?? "").split(",")) {
    const tok = raw.trim().toLowerCase();
    if (tok in ALIGN_TOKEN) out.align = ALIGN_TOKEN[tok];
    else if (tok === "kalin") out.bold = true;
    else if (tok === "-kalin") out.bold = false;
    else if (tok === "italik") out.italic = true;
    else if (tok === "-italik") out.italic = false;
    // tanınmayan belirteç yok sayılır (ileride eklenecek ayarlar eski sürümü bozmasın)
  }
  return isEmptyStyle(out) ? null : out;
}

/** Stil → "orta,kalin"; saklanacak bir şey yoksa null. */
export function serializeStyleFlags(st: CellStyle | null | undefined): string | null {
  if (!st) return null;
  const parts: string[] = [];
  if (st.align) parts.push(TOKEN_OF_ALIGN[st.align]);
  if (st.bold === true) parts.push("kalin");
  else if (st.bold === false) parts.push("-kalin");
  if (st.italic === true) parts.push("italik");
  else if (st.italic === false) parts.push("-italik");
  return parts.length ? parts.join(",") : null;
}

export function isEmptyStyle(st: CellStyle | null | undefined): boolean {
  return !st || (st.align == null && st.bold == null && st.italic == null);
}

// ─── Ayraç satırı ───────────────────────────────────────────────────────────

/** Kaçışsız borulara göre ham parçalar (uçtaki boş parçalar atılır). */
function rawCells(line: string): string[] {
  const t = (line ?? "").trim();
  const parts: string[] = [];
  let cur = "";
  const pipes: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\\") {
      cur += t[i] + (t[i + 1] ?? "");
      i++;
      continue;
    }
    if (t[i] === "|") {
      pipes.push(i);
      parts.push(cur);
      cur = "";
    } else cur += t[i];
  }
  parts.push(cur);
  if (pipes.length && pipes[0] === 0) parts.shift();
  if (pipes.length && pipes[pipes.length - 1] === t.length - 1 && t.length > 1) parts.pop();
  return parts;
}

function alignOfSepCell(cell: string): Align | null {
  const c = cell.trim();
  const l = c.startsWith(":");
  const r = c.endsWith(":") && c.length > 1;
  if (l && r) return "center";
  if (r) return "right";
  if (l) return "left";
  return null;
}

/** `| :--: | --- | --: | :-- |` → ["center", null, "right", "left"]. */
export function parseSeparatorAlign(sepLine: string): (Align | null)[] {
  return rawCells(sepLine).map(alignOfSepCell);
}

/**
 * Ayraç satırında yalnız `col` hücresini verilen hizaya çevirir (`:---:`, `:---`, `---:`,
 * null → `---`). Girinti, boru biçimi ve diğer hücreler aynen kalır; sütun yoksa girdi aynen.
 */
export function setSeparatorAlign(sepLine: string, col: number, align: Align | null): string {
  const line = sepLine ?? "";
  if (col < 0) return line;
  // Kaçışsız boruların konumları (ayraçta kaçış beklenmez ama yine de saygı duy).
  const pipes: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") {
      i++;
      continue;
    }
    if (line[i] === "|") pipes.push(i);
  }
  // Hücre sınırları: [başlangıç, bitiş) — baştaki/sondaki boru varsa ona göre.
  const first = line.search(/\S/);
  const last = line.length - (line.length - line.trimEnd().length);
  const bounds: number[] = [];
  const leadPipe = pipes.length > 0 && pipes[0] === first;
  const trailPipe = pipes.length > 0 && pipes[pipes.length - 1] === last - 1 && last - 1 !== pipes[0];
  if (!leadPipe) bounds.push(first - 1);
  bounds.push(...pipes);
  if (!trailPipe) bounds.push(last);
  if (col + 1 >= bounds.length) return line;
  const start = bounds[col] + 1;
  const end = bounds[col + 1];
  const raw = line.slice(start, end);
  const lead = raw.match(/^\s*/)?.[0] ?? "";
  const trail = raw.match(/\s*$/)?.[0] ?? "";
  const dashes = Math.max(3, (raw.trim().match(/-/g) ?? []).length);
  const d = "-".repeat(dashes);
  const body = align === "center" ? `:${d}:` : align === "left" ? `:${d}` : align === "right" ? `${d}:` : d;
  return line.slice(0, start) + lead + body + trail + line.slice(end);
}

// ─── Çözümleme ──────────────────────────────────────────────────────────────

function styleAt(meta: TableMeta | null | undefined, t: StyleTarget): CellStyle | undefined {
  return meta?.style?.[styleKey(t)];
}

/** Hücrenin ekrandaki biçimi: hücre > satır > sütun. */
export function effectiveCellStyle(
  colAlign: readonly (Align | null | undefined)[] | null | undefined,
  meta: TableMeta | null | undefined,
  row: number,
  col: number
): EffectiveCellStyle {
  const cell = styleAt(meta, { kind: "cell", row, col });
  const rowSt = styleAt(meta, { kind: "row", row });
  const colSt = styleAt(meta, { kind: "col", col });
  return {
    align: cell?.align ?? rowSt?.align ?? colAlign?.[col] ?? colSt?.align ?? null,
    bold: cell?.bold ?? rowSt?.bold ?? colSt?.bold ?? false,
    italic: cell?.italic ?? rowSt?.italic ?? colSt?.italic ?? false,
  };
}

/** Düzenleme ve okuma modunda ortak hücre sınıfları. */
export function styleClasses(eff: EffectiveCellStyle): string[] {
  const out: string[] = [];
  if (eff.align) out.push(`is-align-${eff.align}`);
  if (eff.bold) out.push("is-bold");
  if (eff.italic) out.push("is-italic");
  return out;
}

// ─── Uygulama ───────────────────────────────────────────────────────────────

function cloneMeta(meta: TableMeta | null | undefined): TableMeta {
  const out: TableMeta = { currency: { ...(meta?.currency ?? {}) } };
  if (meta?.style) {
    out.style = {};
    for (const [k, v] of Object.entries(meta.style)) out.style[k] = { ...v };
  }
  return out;
}

function putStyle(meta: TableMeta, t: StyleTarget, st: CellStyle): void {
  const key = styleKey(t);
  const clean: CellStyle = {};
  if (st.align != null) clean.align = st.align;
  if (st.bold != null) clean.bold = st.bold;
  if (st.italic != null) clean.italic = st.italic;
  const style = { ...(meta.style ?? {}) };
  if (isEmptyStyle(clean)) delete style[key];
  else style[key] = clean;
  if (Object.keys(style).length) meta.style = style;
  else delete meta.style;
}

/**
 * Biçim çubuğundaki bir tıklamayı uygular. Girdi nesneleri değişmez.
 * - Sütun + hizalama: yalnız colAlign (ayraç satırı) değişir; aynı hizaya ikinci tıklama kaldırır.
 * - Satır/hücre + hizalama: hedefin align'ı; aynı değere ikinci tıklama kaldırır.
 * - Kalın/italik: yeni değer = !etkin değer; kalıtılana eşitse anahtar silinir.
 */
export function applyFormat(args: {
  meta: TableMeta | null | undefined;
  colAlign: readonly (Align | null)[];
  target: StyleTarget;
  action: FormatAction;
}): { meta: TableMeta; colAlign: (Align | null)[] } {
  const { target, action } = args;
  const meta = cloneMeta(args.meta);
  const colAlign = args.colAlign.slice();
  const own: CellStyle = { ...(styleAt(meta, target) ?? {}) };

  if (action.type === "align") {
    if (target.kind === "col") {
      while (colAlign.length <= target.col) colAlign.push(null);
      colAlign[target.col] = colAlign[target.col] === action.align ? null : action.align;
      return { meta, colAlign };
    }
    own.align = own.align === action.align ? undefined : action.align;
    putStyle(meta, target, own);
    return { meta, colAlign };
  }

  const prop = action.type === "bold" ? "bold" : "italic";
  let inherited = false;
  if (target.kind === "cell") {
    const rowSt = styleAt(meta, { kind: "row", row: target.row });
    const colSt = styleAt(meta, { kind: "col", col: target.col });
    inherited = rowSt?.[prop] ?? colSt?.[prop] ?? false;
  }
  const effective = own[prop] ?? inherited;
  const next = !effective;
  own[prop] = next === inherited ? undefined : next;
  putStyle(meta, target, own);
  return { meta, colAlign };
}

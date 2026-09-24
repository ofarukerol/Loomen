/**
 * Saf (DOM'suz, CodeMirror'suz) tablo ve blok mantığı.
 *
 * tableWidget/editorCommands buradaki fonksiyonları kullanır; böylece tablo ayrıştırma,
 * hücre aralığı ve "belge sonu blok" kuralları node testlerinden doğrudan koşulabilir.
 * Satır indeksleri her yerde 0-TABANLI (CodeMirror'ın 1-tabanlı satır numarası DEĞİL).
 */

/** Kod bloğu çiti: ``` veya ~~~ (en fazla 3 boşluk girintili). */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

const AUDIO_EMBED = /^!\[\[.+\.(?:flac|wav|webm|m4a|mp3|aac)\]\]$/i;
const IMAGE_EMBED = /^!\[\[[^\]]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:\|[^\]]*)?\]\]$/i;
const IMAGE_MD = /^!\[[^\]]*\]\([^)]+\)$/;

export interface TableBlock {
  /** Başlık satırının 0-tabanlı indeksi. */
  headerLine: number;
  /** Tablonun son satırının 0-tabanlı indeksi (dahil). */
  endLine: number;
  header: string[];
  /** Gövde satırları — her biri header uzunluğuna tamamlanmış/kırpılmış. */
  rows: string[][];
}

export interface FenceBlock {
  /** Açılış çiti satırı (0-tabanlı). */
  start: number;
  /** Kapanış çiti satırı; çit kapanmadıysa son satır (0-tabanlı, dahil). */
  end: number;
}

/** `| a | b |` satırını hücrelere ayırır; `\|` kaçışını korur. */
export function splitTableRow(line: string): string[] {
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

/** GFM ayraç satırı mı: `| --- | :--: |` */
export function isSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  const cells = splitTableRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

/** Satırdaki (kaçışlı `\|` hariç) boru karakterlerinin indeksleri. */
export function pipePositions(text: string): number[] {
  const pos: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "|") pos.push(i);
  }
  return pos;
}

/** Belgedeki kod bloğu (```/~~~) aralıkları. */
export function findFenceBlocks(lines: string[]): FenceBlock[] {
  const out: FenceBlock[] = [];
  let open: { start: number; marker: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE);
    if (!m) continue;
    if (!open) {
      open = { start: i, marker: m[1][0] };
    } else if (m[1][0] === open.marker && m[2].trim() === "") {
      out.push({ start: open.start, end: i });
      open = null;
    }
  }
  if (open) out.push({ start: open.start, end: lines.length - 1 });
  return out;
}

/** Satır bir kod bloğunun içinde (ya da çitin kendisi) mi? */
export function isInFence(lines: string[], lineIdx: number): boolean {
  return findFenceBlocks(lines).some((f) => lineIdx >= f.start && lineIdx <= f.end);
}

/**
 * Belgedeki tüm GFM tabloları. Kod bloğu içindeki `|` satırları tablo SAYILMAZ
 * (aksi halde ``` içine yazılan bir örnek tablo gerçek tablo gibi gizleniyordu).
 */
export function findTables(lines: string[]): TableBlock[] {
  const fences = findFenceBlocks(lines);
  const inFence = (i: number) => fences.some((f) => i >= f.start && i <= f.end);
  const out: TableBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (inFence(i)) {
      i++;
      continue;
    }
    const header = lines[i];
    if (
      header.includes("|") &&
      i + 1 < lines.length &&
      !inFence(i + 1) &&
      isSeparator(lines[i + 1])
    ) {
      const cells = splitTableRow(header);
      const cols = cells.length;
      const rows: string[][] = [];
      let endLine = i + 1;
      let j = i + 2;
      while (j < lines.length && !inFence(j)) {
        const lt = lines[j];
        if (lt.trim() === "" || !lt.includes("|")) break;
        const c = splitTableRow(lt);
        while (c.length < cols) c.push("");
        rows.push(c.slice(0, cols));
        endLine = j;
        j++;
      }
      out.push({ headerLine: i, endLine, header: cells, rows });
      i = endLine + 1;
      continue;
    }
    i++;
  }
  return out;
}

/** Başlık satırı verilen tablo (yoksa null). */
export function tableBlockAt(lines: string[], headerLine: number): TableBlock | null {
  return findTables(lines).find((t) => t.headerLine === headerLine) ?? null;
}

/** Verilen satırı içeren tablo (yoksa null). */
export function tableContaining(lines: string[], lineIdx: number): TableBlock | null {
  return findTables(lines).find((t) => lineIdx >= t.headerLine && lineIdx <= t.endLine) ?? null;
}

/** Hücrenin bulunduğu satırın indeksi. `row < 0` → başlık satırı. */
export function cellLineIndex(block: TableBlock, row: number): number {
  return row < 0 ? block.headerLine : block.headerLine + 2 + row; // +1 ayraç, +1 ilk gövde
}

/** Hücrenin satır içindeki içerik aralığı (iki boru arası), yoksa null. */
export function cellRange(lineText: string, col: number): { from: number; to: number } | null {
  const pipes = pipePositions(lineText);
  if (col < 0 || col + 1 >= pipes.length) return null;
  return { from: pipes[col] + 1, to: pipes[col + 1] };
}

/** Hücreye yazılacak kaynak metin — boru kaçışlanır, satır sonları boşluğa döner. */
export function cellSourceText(value: string): string {
  return ` ${value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim()} `;
}

/** Tablonun sonuna eklenecek boş satır (başında \n ile). */
export function newRowText(cols: number): string {
  return "\n|" + "  |".repeat(Math.max(1, cols));
}

/** Yeni sütun için satır sonuna eklenecek metin. */
export function newColCellText(kind: "header" | "separator" | "body"): string {
  return kind === "header" ? " Başlık |" : kind === "separator" ? " --- |" : "  |";
}

/** Satır tek başına bir blok widget'ı mı (ses / resim embed'i)? */
export function isBlockEmbedLine(text: string): boolean {
  const t = text.trim();
  return AUDIO_EMBED.test(t) || IMAGE_EMBED.test(t) || IMAGE_MD.test(t);
}

/**
 * Belge bir blok widget'ıyla (tablo / ses / resim) bitiyor mu? Bitiyorsa altında imlecin
 * gidebileceği bir satır kalmaz; çağıran taraf boş satır eklemelidir.
 */
export function needsTrailingBlankLine(lines: string[]): boolean {
  if (lines.length === 0) return false;
  const lastIdx = lines.length - 1;
  const last = lines[lastIdx];
  if (last.trim() === "") return false;
  if (isInFence(lines, lastIdx)) return false;
  if (isBlockEmbedLine(last)) return true;
  return findTables(lines).some((t) => t.endLine === lastIdx);
}

/** Metin hâli — gerekiyorsa sona boş satır ekler. */
export function ensureTrailingBlankLine(text: string): string {
  return needsTrailingBlankLine(text.split("\n")) ? text + "\n" : text;
}

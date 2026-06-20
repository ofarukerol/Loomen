import { RangeSetBuilder, StateField, type EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";

/**
 * Canlı önizlemede (düzenleme modu) GFM tablolarını gerçek tablo olarak gösterir ve
 * hücreleri YERİNDE düzenlenebilir kılar. Tablo her zaman tablo olarak kalır; bir hücreye
 * tıklayıp yazabilirsin, odak tablodan çıkınca değişen hücreler kaynağa yazılır
 * (yalnız değişen hücre güncellenir; tablo yapısı/hizası korunur).
 */

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

function isSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  const cells = splitTableRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

/** Satırdaki (kaçışlı \| hariç) boru karakterlerinin indeksleri. */
function pipePositions(text: string): number[] {
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

/** Verilen başlık-satırı başından başlayan tablo bloğunun aralığı (yoksa null). */
function tableBlockRange(state: EditorState, headerFrom: number): { from: number; to: number } | null {
  if (headerFrom < 0 || headerFrom > state.doc.length) return null;
  const line = state.doc.lineAt(headerFrom);
  if (line.from !== headerFrom || !line.text.includes("|")) return null;
  const nextNo = line.number + 1;
  if (nextNo > state.doc.lines || !isSeparator(state.doc.line(nextNo).text)) return null;
  let endLine = nextNo;
  let j = nextNo + 1;
  while (j <= state.doc.lines) {
    const lt = state.doc.line(j).text;
    if (lt.trim() === "" || !lt.includes("|")) break;
    endLine = j;
    j++;
  }
  return { from: line.from, to: state.doc.line(endLine).to };
}

/** Bir hücrenin kaynak metindeki içerik aralığı (iki boru arası), yoksa null. */
function cellContentRange(
  state: EditorState,
  blockFrom: number,
  row: number,
  col: number
): { from: number; to: number } | null {
  if (!tableBlockRange(state, blockFrom)) return null;
  const headerNo = state.doc.lineAt(blockFrom).number;
  const lineNo = row < 0 ? headerNo : headerNo + 2 + row; // +1 ayraç, +1 ilk gövde
  if (lineNo < 1 || lineNo > state.doc.lines) return null;
  const line = state.doc.line(lineNo);
  const pipes = pipePositions(line.text);
  if (col + 1 >= pipes.length) return null;
  return { from: line.from + pipes[col] + 1, to: line.from + pipes[col + 1] };
}

class TableWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly header: string[],
    readonly rows: string[][]
  ) {
    super();
  }

  eq(o: TableWidget): boolean {
    return (
      o.from === this.from &&
      JSON.stringify(o.header) === JSON.stringify(this.header) &&
      JSON.stringify(o.rows) === JSON.stringify(this.rows)
    );
  }

  // Hücreye tıklayınca üstünde yüzen bir input aç (CM'den bağımsız, body'de).
  private editCell(view: EditorView, cellEl: HTMLElement, row: number, col: number, orig: string): void {
    const rect = cellEl.getBoundingClientRect();
    const input = document.createElement("input");
    input.type = "text";
    input.value = orig;
    input.className = "cm-table-editor";
    input.style.left = `${rect.left}px`;
    input.style.top = `${rect.top}px`;
    input.style.width = `${rect.width}px`;
    input.style.height = `${rect.height}px`;
    document.body.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      const val = input.value;
      input.remove();
      if (save && val.trim() !== orig.trim()) {
        const r = cellContentRange(view.state, this.from, row, col);
        if (r) {
          view.dispatch({
            changes: { from: r.from, to: r.to, insert: ` ${val.replace(/\|/g, "\\|").trim()} ` },
          });
        }
      }
      view.focus();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-tablewrap";
    const table = document.createElement("table");
    table.className = "cm-table";

    const mkCell = (tag: "th" | "td", text: string, row: number, col: number): HTMLElement => {
      const el = document.createElement(tag);
      el.textContent = text;
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.editCell(view, el, row, col, text);
      });
      return el;
    };

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    this.header.forEach((c, i) => htr.appendChild(mkCell("th", c, -1, i)));
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    this.rows.forEach((r, ri) => {
      const tr = document.createElement("tr");
      for (let i = 0; i < this.header.length; i++) tr.appendChild(mkCell("td", r[i] ?? "", ri, i));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildTables(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;
  let lineNo = 1;
  while (lineNo <= doc.lines) {
    const line = doc.line(lineNo);
    if (line.text.includes("|") && lineNo + 1 <= doc.lines && isSeparator(doc.line(lineNo + 1).text)) {
      const header = splitTableRow(line.text);
      const cols = header.length;
      const rows: string[][] = [];
      let endLine = lineNo + 1;
      let j = lineNo + 2;
      while (j <= doc.lines) {
        const lt = doc.line(j).text;
        if (lt.trim() === "" || !lt.includes("|")) break;
        const cells = splitTableRow(lt);
        while (cells.length < cols) cells.push("");
        rows.push(cells.slice(0, cols));
        endLine = j;
        j++;
      }
      const from = line.from;
      const to = doc.line(endLine).to;
      builder.add(from, to, Decoration.replace({ widget: new TableWidget(from, header, rows), block: true }));
      lineNo = endLine + 1;
      continue;
    }
    lineNo++;
  }
  return builder.finish();
}

export const tableField = StateField.define<DecorationSet>({
  create: (state) => buildTables(state),
  update(deco, tr) {
    if (tr.docChanged) return buildTables(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

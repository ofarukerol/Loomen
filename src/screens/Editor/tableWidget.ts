import { RangeSetBuilder, StateEffect, StateField, type EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";

/**
 * Canlı önizlemede (düzenleme modu) GFM tablolarını gerçek tablo olarak gösterir.
 * Tablolar HER ZAMAN render edilir; yalnız tabloya ÇİFT TIKLAYINCA o tablo ham markdown
 * olarak açılır (düzenlenebilir), imleç tablodan çıkınca tekrar render edilir.
 * Blok widget gerektiği için ViewPlugin değil StateField ile sağlanır.
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

/**
 * Tıklanan hücrenin kaynak metindeki konumu (imleci oraya koymak için).
 * row = -1 başlık satırı; row >= 0 gövde satırı. Bulunamazsa blok başını döner.
 */
function cellSourcePos(state: EditorState, blockFrom: number, row: number, col: number): number {
  const range = tableBlockRange(state, blockFrom);
  if (!range) return blockFrom;
  const headerNo = state.doc.lineAt(blockFrom).number;
  const lineNo = row < 0 ? headerNo : headerNo + 2 + row; // +1 ayraç, +1 ilk gövde
  if (lineNo < 1 || lineNo > state.doc.lines) return blockFrom;
  const line = state.doc.line(lineNo);
  const pipes = pipePositions(line.text);
  if (col + 1 >= pipes.length) return line.to;
  let off = pipes[col] + 1;
  while (off < line.text.length && line.text[off] === " ") off++; // baştaki boşlukları atla
  return line.from + off;
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

/** Hangi tablonun (başlık başı pozisyonu) düzenlendiğini tutar; imleç çıkınca temizlenir. */
const setEditingTable = StateEffect.define<number | null>();

const editingTableField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setEditingTable)) value = e.value;
    if (value != null) {
      const range = tableBlockRange(tr.state, value);
      if (!range) value = null;
      else {
        const sel = tr.state.selection.main;
        if (sel.from < range.from || sel.to > range.to) value = null;
      }
    }
    return value;
  },
});

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

  toDOM(view: EditorView): HTMLElement {
    const from = this.from;
    // Hücreye tıkla → imleç o hücrenin kaynak konumuna gider, tablo düzenlemeye açılır.
    const editCell = (e: MouseEvent, row: number, col: number) => {
      e.preventDefault();
      const pos = cellSourcePos(view.state, from, row, col);
      view.dispatch({ selection: { anchor: pos }, effects: setEditingTable.of(from) });
      view.focus();
    };

    const wrap = document.createElement("div");
    wrap.className = "cm-tablewrap";
    wrap.title = "Düzenlemek için bir hücreye tıkla";
    const table = document.createElement("table");
    table.className = "cm-table";

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    this.header.forEach((c, i) => {
      const th = document.createElement("th");
      th.textContent = c;
      th.addEventListener("mousedown", (e) => editCell(e, -1, i));
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    this.rows.forEach((r, ri) => {
      const tr = document.createElement("tr");
      for (let i = 0; i < this.header.length; i++) {
        const td = document.createElement("td");
        td.textContent = r[i] ?? "";
        td.addEventListener("mousedown", (e) => editCell(e, ri, i));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    // Hücre dışındaki boş alana tıklama → tablo başına aç.
    wrap.addEventListener("mousedown", (e) => {
      if (e.target === wrap || e.target === table) {
        e.preventDefault();
        view.dispatch({ selection: { anchor: from }, effects: setEditingTable.of(from) });
        view.focus();
      }
    });
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildTables(state: EditorState, editingFrom: number | null): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;
  let lineNo = 1;
  while (lineNo <= doc.lines) {
    const line = doc.line(lineNo);
    if (line.text.includes("|") && lineNo + 1 <= doc.lines && isSeparator(doc.line(lineNo + 1).text)) {
      const header = splitTableRow(line.text);
      const cols = header.length;
      const rows: string[][] = [];
      let endLine = lineNo + 1; // ayraç satırı
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
      // Düzenlenen tablo dışındaki tüm tablolar render edilir.
      if (from !== editingFrom) {
        builder.add(from, to, Decoration.replace({ widget: new TableWidget(from, header, rows), block: true }));
      }
      lineNo = endLine + 1;
      continue;
    }
    lineNo++;
  }
  return builder.finish();
}

const tableDecoField = StateField.define<DecorationSet>({
  create: (state) => buildTables(state, state.field(editingTableField)),
  update(deco, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setEditingTable))) {
      return buildTables(tr.state, tr.state.field(editingTableField));
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// editingTableField önce gelmeli (tableDecoField onu okur).
export const tableField = [editingTableField, tableDecoField];

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
    const wrap = document.createElement("div");
    wrap.className = "cm-tablewrap";
    const table = document.createElement("table");
    table.className = "cm-table";

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    for (const c of this.header) {
      const th = document.createElement("th");
      th.textContent = c;
      htr.appendChild(th);
    }
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const r of this.rows) {
      const tr = document.createElement("tr");
      for (let i = 0; i < this.header.length; i++) {
        const td = document.createElement("td");
        td.textContent = r[i] ?? "";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    wrap.title = "Düzenlemek için çift tıkla";

    // Çift tıkla → ham markdown'ı düzenlemeye aç (imleç tabloya gider).
    wrap.addEventListener("dblclick", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from }, effects: setEditingTable.of(this.from) });
      view.focus();
    });
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
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

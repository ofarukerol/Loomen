import { Prec, RangeSetBuilder, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, type KeyBinding, keymap, WidgetType } from "@codemirror/view";
import {
  cellLineIndex,
  cellRange,
  cellSourceText,
  findTables,
  newColCellText,
  newRowText,
  tableBlockAt,
  type TableBlock,
} from "./tableModel";
import i18n from "../../i18n";

/**
 * Canlı önizlemede (düzenleme modu) GFM tablolarını gerçek tablo olarak gösterir ve
 * hücreleri YERİNDE düzenlenebilir kılar. Tablo her zaman tablo olarak kalır; bir hücreye
 * tıklayıp yazabilirsin, odak tablodan çıkınca değişen hücreler kaynağa yazılır
 * (yalnız değişen hücre güncellenir; tablo yapısı/hizası korunur).
 *
 * Saf ayrıştırma mantığı tableModel.ts'te (node testlerinden koşulabilir); burada yalnız
 * CodeMirror dekorasyonu, DOM ve imleç davranışı var.
 */

function docLines(state: EditorState): string[] {
  return state.doc.toString().split("\n");
}

/** 0-tabanlı satır indeksinden belge pozisyonu (satır başı). */
function lineStart(state: EditorState, idx: number): number {
  return state.doc.line(idx + 1).from;
}

/** Tablo bloğunun belge aralığı. */
function blockRange(state: EditorState, block: TableBlock): { from: number; to: number } {
  return { from: state.doc.line(block.headerLine + 1).from, to: state.doc.line(block.endLine + 1).to };
}

/** Başlık satırı `headerFrom` pozisyonunda olan tablonun belge aralığı (yoksa null). */
function tableBlockRange(state: EditorState, headerFrom: number): { from: number; to: number } | null {
  if (headerFrom < 0 || headerFrom > state.doc.length) return null;
  const line = state.doc.lineAt(headerFrom);
  if (line.from !== headerFrom) return null;
  const block = tableBlockAt(docLines(state), line.number - 1);
  return block ? blockRange(state, block) : null;
}

/** Bir hücrenin kaynak metindeki içerik aralığı (iki boru arası), yoksa null. */
function cellContentRange(
  state: EditorState,
  blockFrom: number,
  row: number,
  col: number
): { from: number; to: number } | null {
  if (blockFrom < 0 || blockFrom > state.doc.length) return null;
  const headerLine = state.doc.lineAt(blockFrom);
  if (headerLine.from !== blockFrom) return null;
  const block = tableBlockAt(docLines(state), headerLine.number - 1);
  if (!block) return null;
  const idx = cellLineIndex(block, row);
  if (idx < 0 || idx >= state.doc.lines) return null;
  const line = state.doc.line(idx + 1);
  const r = cellRange(line.text, col);
  return r ? { from: line.from + r.from, to: line.from + r.to } : null;
}

// Tablo başına sütun genişlikleri (px) — oturum boyunca saklanır (markdown genişlik tutmaz).
// Anahtar: tablonun başlangıç pozisyonu (from). Pozisyonlar notlar arasında çakıştığı için
// editör her kurulduğunda temizlenir (bkz clearTableColWidths).
const colWidths = new Map<number, number[]>();

/** Yeni bir not açılırken çağrılır — önceki notun sütun genişlikleri sızmasın. */
export function clearTableColWidths(): void {
  colWidths.clear();
}

/** View yok edildikten sonra dispatch etmeyi engelle. */
function isLive(view: EditorView): boolean {
  return view.dom.isConnected;
}

/** İmleci tablonun altındaki satıra taşı (yoksa oluştur). */
function caretBelowTable(view: EditorView, headerFrom: number): void {
  if (!isLive(view)) return;
  const range = tableBlockRange(view.state, headerFrom);
  if (!range) return;
  const lastLine = view.state.doc.lineAt(range.to);
  if (lastLine.number < view.state.doc.lines) {
    const next = view.state.doc.line(lastLine.number + 1);
    view.dispatch({ selection: { anchor: next.from }, scrollIntoView: true });
  } else {
    view.dispatch({
      changes: { from: range.to, insert: "\n" },
      selection: { anchor: range.to + 1 },
      scrollIntoView: true,
    });
  }
  view.focus();
}

/**
 * Hücreye tıklayınca üstünde yüzen bir input açar (CM'den bağımsız, body'de).
 * Hücre elemanının data-* alanlarından konumunu okur; böylece Tab ile komşu hücreye
 * geçerken (dispatch sonrası DOM yenilenir) taze eleman üzerinden devam edilebilir.
 */
function openCellEditor(view: EditorView, cellEl: HTMLElement): void {
  const headerFrom = Number(cellEl.dataset.tableFrom);
  const row = Number(cellEl.dataset.row);
  const col = Number(cellEl.dataset.col);
  const orig = cellEl.dataset.raw ?? "";
  if (!Number.isFinite(headerFrom) || !Number.isFinite(row) || !Number.isFinite(col)) return;

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
  // Kaydırma/yeniden boyutlandırmada yüzen input yanlış yerde kalmasın: kaydet ve kapat.
  const onScroll = () => finish(true, false);
  const cleanup = () => {
    view.scrollDOM.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    window.removeEventListener("scroll", onScroll, true);
  };

  function finish(save: boolean, refocus = true): void {
    if (done) return;
    done = true;
    const val = input.value;
    cleanup();
    input.remove();
    // View yok edilmişse (not değişti/kapandı) dispatch etme — CM hata fırlatır.
    if (save && isLive(view) && val.trim() !== orig.trim()) {
      const r = cellContentRange(view.state, headerFrom, row, col);
      if (r) view.dispatch({ changes: { from: r.from, to: r.to, insert: cellSourceText(val) } });
    }
    if (refocus && isLive(view)) view.focus();
  }

  // Tab / Shift+Tab → komşu hücre. Dispatch sonrası widget DOM'u yenilendiği için
  // hedef hücre bir sonraki kareye ertelenerek yeniden sorgulanır.
  const moveTo = (nextRow: number, nextCol: number) => {
    finish(true, false);
    requestAnimationFrame(() => {
      if (!isLive(view)) return;
      const sel = `.cm-tablewrap[data-table-from="${headerFrom}"] [data-row="${nextRow}"][data-col="${nextCol}"]`;
      const el = view.dom.querySelector<HTMLElement>(sel);
      if (el) openCellEditor(view, el);
      else view.focus();
    });
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const wrap = cellEl.closest(".cm-tablewrap");
      const cols = wrap ? wrap.querySelectorAll('[data-row="-1"]').length : 0;
      const rows = wrap ? wrap.querySelectorAll("tbody tr").length : 0;
      if (!cols) return;
      let r = row;
      let c = col + (e.shiftKey ? -1 : 1);
      if (c >= cols) {
        c = 0;
        r += 1;
      } else if (c < 0) {
        c = cols - 1;
        r -= 1;
      }
      if (r < -1 || r >= rows) {
        finish(true);
        return;
      }
      moveTo(r, c);
    }
  });
  input.addEventListener("blur", () => finish(true, false));
  view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  window.addEventListener("scroll", onScroll, true);
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

  // Tablonun sonuna boş bir satır ekle.
  private addRow(view: EditorView): void {
    if (!isLive(view)) return;
    const range = tableBlockRange(view.state, this.from);
    if (!range) return;
    view.dispatch({ changes: { from: range.to, to: range.to, insert: newRowText(this.header.length) } });
  }

  // Tablonun sağına yeni bir sütun ekle (her satıra bir hücre).
  private addCol(view: EditorView): void {
    if (!isLive(view)) return;
    const range = tableBlockRange(view.state, this.from);
    if (!range) return;
    const headerNo = view.state.doc.lineAt(this.from).number;
    const lastNo = view.state.doc.lineAt(range.to).number;
    const changes: { from: number; to: number; insert: string }[] = [];
    for (let n = headerNo; n <= lastNo; n++) {
      const line = view.state.doc.line(n);
      const kind = n === headerNo ? "header" : n === headerNo + 1 ? "separator" : "body";
      changes.push({ from: line.to, to: line.to, insert: newColCellText(kind) });
    }
    view.dispatch({ changes });
  }

  private addBtn(cls: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = `cm-table__add ${cls}`;
    btn.type = "button";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.textContent = "+";
    // pointerdown: "mousedown" dokunmatikte ancak tarayıcı fare olaylarını taklit ederse ve
    // GECİKMELİ gelir; iOS'ta tıklama bazen hiç ulaşmıyordu. pointerdown her girdi için aynı.
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-tablewrap";
    wrap.dataset.tableFrom = String(this.from);
    const grid = document.createElement("div");
    grid.className = "cm-tablegrid";

    const table = document.createElement("table");
    table.className = "cm-table";

    const widths = colWidths.get(this.from);
    const mkCell = (tag: "th" | "td", text: string, row: number, col: number): HTMLElement => {
      const el = document.createElement(tag);
      el.textContent = text;
      el.dataset.col = String(col);
      el.dataset.row = String(row);
      el.dataset.raw = text;
      el.dataset.tableFrom = String(this.from);
      // Saklı sütun genişliği (oturum) min-width olarak uygulanır — border-collapse'ta
      // width tutmaz ama min-width tutar.
      if (widths && widths[col]) el.style.minWidth = `${widths[col]}px`;
      // pointerdown: dokunmatikte "mousedown" taklit edilir ve gecikir; hücreye dokunmak
      // düzenleme kutusunu açmıyordu.
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCellEditor(view, el);
      });
      return el;
    };

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    this.header.forEach((c, i) => {
      const th = mkCell("th", c, -1, i);
      // Sağ kenara sürükleme tutamacı → sütun genişliğini ayarla (min-width ile).
      const handle = document.createElement("div");
      handle.className = "cm-table__resize";
      // Pointer olayları: sütun genişletme yalnız fareyle çalışıyordu (mousedown/mousemove/
      // mouseup). Dokunmatikte bu olaylar ya hiç gelmiyor ya da tarayıcı taklidi olarak
      // gecikiyordu. setPointerCapture ile parmak tutamacın dışına çıksa da olaylar bize gelir.
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = th.getBoundingClientRect().width;
        const id = e.pointerId;
        let w = startW;
        handle.setPointerCapture(id);
        const onMove = (ev: PointerEvent) => {
          if (ev.pointerId !== id) return;
          w = Math.max(60, startW + (ev.clientX - startX));
          table.querySelectorAll<HTMLElement>(`[data-col="${i}"]`).forEach((c2) => {
            c2.style.minWidth = `${w}px`;
          });
        };
        const onUp = (ev: PointerEvent) => {
          if (ev.pointerId !== id) return;
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          handle.removeEventListener("pointercancel", onUp);
          const arr = colWidths.get(this.from) ?? this.header.map(() => 0);
          arr[i] = Math.round(w);
          colWidths.set(this.from, arr);
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
      });
      th.appendChild(handle);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    this.rows.forEach((r, ri) => {
      const tr = document.createElement("tr");
      for (let i = 0; i < this.header.length; i++) tr.appendChild(mkCell("td", r[i] ?? "", ri, i));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    grid.appendChild(table);
    grid.appendChild(this.addBtn("cm-table__add--col", i18n.t("ctx.addColumn"), () => this.addCol(view)));
    grid.appendChild(this.addBtn("cm-table__add--row", i18n.t("ctx.addRow"), () => this.addRow(view)));
    wrap.appendChild(grid);

    // Tablonun kendi boşluğuna (hücre dışına) tıklayınca imleç tablonun ALTINDAKİ satıra
    // gitsin — widget alanı CM'ye kapalı olduğu için aksi halde tıklama hiçbir şey yapmıyor,
    // ya da imleç gizlenen kaynağın içine düşüp kayboluyordu.
    wrap.addEventListener("mousedown", (e) => {
      if (e.target !== wrap && e.target !== grid) return;
      e.preventDefault();
      caretBelowTable(view, this.from);
    });
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildTables(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const block of findTables(docLines(state))) {
    const from = lineStart(state, block.headerLine);
    const to = state.doc.line(block.endLine + 1).to;
    builder.add(
      from,
      to,
      Decoration.replace({ widget: new TableWidget(from, block.header, block.rows), block: true })
    );
  }
  return builder.finish();
}

export const tableField = StateField.define<DecorationSet>({
  create: (state) => buildTables(state),
  update(deco, tr) {
    if (tr.docChanged) return buildTables(tr.state);
    return deco.map(tr.changes);
  },
  // Dekorasyon + atomik aralık: imleç ok tuşlarıyla gizlenen tablo kaynağının İÇİNE
  // giremez, üstünden/altından atlar (aksi halde imleç kayboluyor, yazılan metin tabloyu
  // bozuyordu).
  provide: (f) => [
    EditorView.decorations.from(f),
    EditorView.atomicRanges.of((view) => view.state.field(f, false) ?? Decoration.none),
  ],
});

/** Tablonun hemen altındaki/üstündeki satırda tek tuşla tabloyu yok etmeyi engelle. */
const tableGuards: KeyBinding[] = [
  {
    key: "Backspace",
    run: (view) => {
      const r = view.state.selection.main;
      if (!r.empty || r.from === 0) return false;
      const line = view.state.doc.lineAt(r.from);
      if (r.from !== line.from || line.number < 2) return false;
      const prev = view.state.doc.line(line.number - 1);
      const block = findTables(docLines(view.state)).find((t) => t.endLine === prev.number - 1);
      if (!block) return false;
      // Silmeden önce tabloyu seç — ikinci Backspace bilinçli olarak siler.
      const range = blockRange(view.state, block);
      view.dispatch({ selection: { anchor: range.from, head: range.to } });
      return true;
    },
  },
  {
    key: "Delete",
    run: (view) => {
      const r = view.state.selection.main;
      if (!r.empty) return false;
      const line = view.state.doc.lineAt(r.from);
      if (r.from !== line.to || line.number >= view.state.doc.lines) return false;
      const block = findTables(docLines(view.state)).find((t) => t.headerLine === line.number);
      if (!block) return false;
      const range = blockRange(view.state, block);
      view.dispatch({ selection: { anchor: range.from, head: range.to } });
      return true;
    },
  },
];

export const tableKeymap: Extension = Prec.high(keymap.of(tableGuards));

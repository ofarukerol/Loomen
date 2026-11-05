import { Prec, RangeSetBuilder, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, type KeyBinding, keymap, WidgetType } from "@codemirror/view";
import {
  cellLineIndex,
  cellRange,
  cellSourceText,
  dropIndex,
  findTables,
  moveItem,
  moveTableColumn,
  moveTableRow,
  newColCellText,
  slotToIndex,
  newRowText,
  tableBlockAt,
  type TableBlock,
} from "./tableModel";
import i18n from "../../i18n";
import { createTapTracker, isTapInput } from "./tapGesture";

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
 * Hücreye tıklayınca üstünde yüzen çok satırlı bir düzenleme kutusu açar (CM'den bağımsız, body'de).
 * Hücre elemanının data-* alanlarından konumunu okur; böylece Tab ile komşu hücreye
 * geçerken (dispatch sonrası DOM yenilenir) taze eleman üzerinden devam edilebilir.
 */
function openCellEditor(view: EditorView, cellEl: HTMLElement, opts: { viaTouch?: boolean } = {}): void {
  const headerFrom = Number(cellEl.dataset.tableFrom);
  const row = Number(cellEl.dataset.row);
  const col = Number(cellEl.dataset.col);
  const orig = cellEl.dataset.raw ?? "";
  if (!Number.isFinite(headerFrom) || !Number.isFinite(row) || !Number.isFinite(col)) return;

  const rect = cellEl.getBoundingClientRect();
  // Çok satırlı kutu: uzun yazı kutuda da sarılır ve kutu yazıyla büyür (LOM-77).
  // Kaynakta hücre tek satırdır; Enter kaydeder, satır sonu kaynağa yazılmaz.
  const input = document.createElement("textarea");
  input.rows = 1;
  input.value = orig;
  input.className = "cm-table-editor";
  input.enterKeyHint = "done";
  input.style.left = `${rect.left}px`;
  input.style.top = `${rect.top}px`;
  input.style.width = `${rect.width}px`;
  input.style.height = `${rect.height}px`;
  document.body.appendChild(input);
  // Yükseklik: hücre yüksekliği ile içerik yüksekliğinin (kenarlık dahil) büyüğü.
  const fitHeight = () => {
    input.style.height = "auto";
    const border = input.offsetHeight - input.clientHeight;
    input.style.height = `${Math.max(rect.height, input.scrollHeight + border)}px`;
  };
  fitHeight();
  input.focus();
  input.select();

  let done = false;
  // Kaydırma/yeniden boyutlandırmada yüzen input yanlış yerde kalmasın: kaydet ve kapat.
  const onScroll = () => finish(true, false);
  let bindTimer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    if (bindTimer !== undefined) clearTimeout(bindTimer);
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
  input.addEventListener("input", () => {
    // Mobil klavye Enter'ı satır sonu olarak gönderebilir: kaydetme sayılır.
    if (input.value.includes("\n")) {
      input.value = input.value.replace(/\r?\n/g, " ");
      finish(true);
      return;
    }
    fitHeight();
  });
  input.addEventListener("blur", () => finish(true, false));
  const bindClose = () => {
    bindTimer = undefined;
    if (done) return;
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
  };
  // Dokunmatikte klavye açılırken Android'de window resize, iOS'ta kaydırma olayı gelir;
  // dinleyiciler hemen bağlanırsa kutu açılır açılmaz kapanıyordu. Biraz sonra bağla.
  if (opts.viaTouch) bindTimer = setTimeout(bindClose, 500);
  else bindClose();
}

/** Sürüklemenin başlaması için gereken en az kayma (px); altı tıklama sayılır. */
const DRAG_THRESHOLD_PX = 4;

const DROP_CLASSES = ["is-drag-source", "is-drop-before", "is-drop-after"];

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

  // Satır ya da sütunu kaynak metinde yeni sırasına yazar (tek dispatch). LOM-78.
  private applyMove(view: EditorView, axis: "row" | "col", from: number, to: number): void {
    if (!isLive(view) || from === to) return;
    const range = tableBlockRange(view.state, this.from);
    if (!range) return;
    const oldText = view.state.sliceDoc(range.from, range.to);
    const lines = oldText.split("\n");
    const next = axis === "col" ? moveTableColumn(lines, from, to) : moveTableRow(lines, from, to);
    const newText = next.join("\n");
    if (newText === oldText) return;
    if (axis === "col") {
      // Saklı sütun genişlikleri taşınan sütunla birlikte yer değiştirir.
      const arr = colWidths.get(this.from);
      if (arr) {
        const full = this.header.map((_, i) => arr[i] ?? 0);
        colWidths.set(this.from, moveItem(full, from, to));
      }
    }
    view.dispatch({ changes: { from: range.from, to: range.to, insert: newText } });
  }

  /**
   * Tutma yeri: basılı tutup sürükleyince satır/sütun taşınır. Pointer olayları fare ve
   * dokunmada aynı çalışır; setPointerCapture ile parmak tutma yerinden çıksa da olaylar gelir.
   * Tutma yerine basmak hücre düzenleme kutusunu açmaz (stopPropagation).
   */
  private makeGrip(view: EditorView, table: HTMLTableElement, axis: "row" | "col", index: number): HTMLElement {
    const grip = document.createElement("div");
    grip.className = axis === "col" ? "cm-table__colgrip" : "cm-table__rowgrip";
    const title = i18n.t(axis === "col" ? "ctx.moveColumn" : "ctx.moveRow");
    grip.title = title;
    grip.setAttribute("aria-label", title);
    grip.setAttribute("role", "button");

    // Eksen boyunca öğeler: sütunda başlık hücreleri, satırda gövde satırları.
    const items = (): HTMLElement[] =>
      axis === "col"
        ? Array.from(table.querySelectorAll<HTMLElement>("thead th"))
        : Array.from(table.querySelectorAll<HTMLElement>("tbody tr"));
    // Bir öğenin (sütun ya da satır) hücreleri.
    const cellsOf = (i: number): HTMLElement[] =>
      axis === "col"
        ? Array.from(table.querySelectorAll<HTMLElement>(`[data-col="${i}"]`))
        : Array.from(table.querySelectorAll<HTMLElement>(`tbody [data-row="${i}"]`));
    // Tablodaki eksen sınıfı göstergenin yönünü seçer (sütunda sol/sağ, satırda üst/alt).
    const axisClass = axis === "col" ? "is-dragging-col" : "is-dragging-row";
    const clear = () => {
      table.classList.remove(axisClass);
      table.querySelectorAll<HTMLElement>(".is-drag-source, .is-drop-before, .is-drop-after").forEach((el) => {
        el.classList.remove(...DROP_CLASSES);
      });
    };

    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.button !== undefined && e.button > 0) return;
      const id = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;
      let target = index;
      try {
        grip.setPointerCapture(id);
      } catch {
        /* yakalama desteklenmiyorsa olaylar yine tutma yerine gelir */
      }

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (!dragging) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
          dragging = true;
        }
        const list = items();
        const edges = list.map((el) => {
          const r = el.getBoundingClientRect();
          return axis === "col" ? { start: r.left, end: r.right } : { start: r.top, end: r.bottom };
        });
        const slot = dropIndex(edges, axis === "col" ? ev.clientX : ev.clientY);
        target = slotToIndex(index, slot);
        clear();
        table.classList.add(axisClass);
        cellsOf(index).forEach((c) => c.classList.add("is-drag-source"));
        if (target === index) return;
        // Göstergede yuva: son öğeden sonrası "after", diğerleri hedef öğenin "before"u.
        if (slot >= list.length) cellsOf(list.length - 1).forEach((c) => c.classList.add("is-drop-after"));
        else cellsOf(slot).forEach((c) => c.classList.add("is-drop-before"));
      };
      const onEnd = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        ev.stopPropagation();
        grip.removeEventListener("pointermove", onMove);
        grip.removeEventListener("pointerup", onEnd);
        grip.removeEventListener("pointercancel", onEnd);
        clear();
        if (ev.type === "pointerup" && dragging && target !== index) this.applyMove(view, axis, index, target);
      };
      grip.addEventListener("pointermove", onMove);
      grip.addEventListener("pointerup", onEnd);
      grip.addEventListener("pointercancel", onEnd);
    });
    return grip;
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
      // Saklı sütun genişliği (oturum) hem width hem min-width olarak uygulanır: width
      // sütunu daraltır (yazı alt satıra sarılır), min-width genişletmeyi korur (LOM-77).
      if (widths && widths[col]) {
        el.style.width = `${widths[col]}px`;
        el.style.minWidth = `${widths[col]}px`;
      }
      // pointerdown: dokunmatikte "mousedown" taklit edilir ve gecikir; hücreye dokunmak
      // düzenleme kutusunu açmıyordu. Fare basıldığı anda açar. Dokunmatikte ise pointerdown'da
      // hemen açmak tablonun üstünden sayfayı kaydırmayı bozuyordu (parmak değer değmez kutu
      // açılıyordu); orada yalnız kısa ve yerinde dokunuşta, parmak kalkınca açılır.
      const tap = createTapTracker();
      el.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        if (!isTapInput(e.pointerType)) {
          e.preventDefault();
          openCellEditor(view, el);
          return;
        }
        // preventDefault yok: kaydırmayı tarayıcı devralabilsin (touch-action: pan-x pan-y).
        tap.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
      });
      el.addEventListener("pointermove", (e) => {
        if (isTapInput(e.pointerType)) tap.move(e.pointerId, e.clientX, e.clientY);
      });
      el.addEventListener("pointerup", (e) => {
        if (!isTapInput(e.pointerType)) return;
        if (tap.up(e.pointerId, e.clientX, e.clientY, e.timeStamp)) openCellEditor(view, el, { viaTouch: true });
      });
      // Tarayıcı kaydırmayı devraldı: bu bir dokunuş değil.
      el.addEventListener("pointercancel", (e) => tap.cancel(e.pointerId));
      return el;
    };

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    this.header.forEach((c, i) => {
      const th = mkCell("th", c, -1, i);
      // Sağ kenara sürükleme tutamacı → sütun genişliğini ayarla (width + min-width ile).
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
            c2.style.width = `${w}px`;
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
      // Üst kenarda sütun taşıma tutma yeri (LOM-78).
      th.appendChild(this.makeGrip(view, table, "col", i));
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    this.rows.forEach((r, ri) => {
      const tr = document.createElement("tr");
      for (let i = 0; i < this.header.length; i++) {
        const td = mkCell("td", r[i] ?? "", ri, i);
        // İlk hücrenin sol kenarında satır taşıma tutma yeri (LOM-78).
        if (i === 0) td.appendChild(this.makeGrip(view, table, "row", ri));
        tr.appendChild(td);
      }
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

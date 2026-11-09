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
import { evaluateTable, formatFormulaResult, type CellResult } from "../../core/markdown/tableFormula";
import { createTapTracker, isTapInput } from "./tapGesture";
import {
  applySuggestion,
  autoFunctionInsert,
  autoRangeRef,
  colLetter,
  suggestFormula,
  type FormulaSuggestResult,
} from "../../core/markdown/formulaSuggest";
import {
  CURRENCIES,
  columnCurrency,
  currencySymbol,
  formatCellDisplay,
  formatCurrency,
  isCurrencyCode,
  moveMetaColumn,
  moveMetaRow,
  serializeTableMeta,
  setColumnCurrency,
  type CurrencyCode,
  type TableMeta,
} from "../../core/markdown/tableMeta";
import {
  applyFormat,
  effectiveCellStyle,
  setSeparatorAlign,
  styleClasses,
  styleKey,
  type Align,
  type FormatAction,
  type StyleTarget,
} from "../../core/markdown/tableStyle";

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

/**
 * Tablonun not satırı (LOM-89) dahil belge aralığı: dekorasyon, seçim ve "tablonun altı" bunu
 * kullanır. Satır/sütun ekleme ve taşıma ise yalnız tablo satırlarını (blockRange) değiştirir.
 */
function fullBlockRange(state: EditorState, block: TableBlock): { from: number; to: number } {
  const last = block.metaLine ?? block.endLine;
  return { from: state.doc.line(block.headerLine + 1).from, to: state.doc.line(last + 1).to };
}

/** Başlık satırı `headerFrom` pozisyonunda olan tablo (yoksa null). */
function tableBlockFrom(state: EditorState, headerFrom: number): TableBlock | null {
  if (headerFrom < 0 || headerFrom > state.doc.length) return null;
  const line = state.doc.lineAt(headerFrom);
  if (line.from !== headerFrom) return null;
  return tableBlockAt(docLines(state), line.number - 1);
}

/** Başlık satırı `headerFrom` pozisyonunda olan tablonun belge aralığı (yoksa null). */
function tableBlockRange(state: EditorState, headerFrom: number): { from: number; to: number } | null {
  const block = tableBlockFrom(state, headerFrom);
  return block ? blockRange(state, block) : null;
}

/**
 * Sütunun para birimini tablonun not satırına yazar (tek dispatch, LOM-89). Not satırı yoksa
 * tablonun hemen altına eklenir; "Yok" ile saklanacak bir şey kalmazsa satır silinir.
 * Dosyadaki hücre metinleri değişmez.
 */
function writeTableMeta(view: EditorView, headerFrom: number, col: number, code: CurrencyCode | null): void {
  if (!isLive(view)) return;
  const block = tableBlockFrom(view.state, headerFrom);
  if (!block) return;
  const text = serializeTableMeta(setColumnCurrency(block.meta, col, code));
  const end = view.state.doc.line(block.endLine + 1);
  if (block.metaLine != null) {
    const metaLine = view.state.doc.line(block.metaLine + 1);
    if (text === null) {
      view.dispatch({ changes: { from: end.to, to: metaLine.to, insert: "" } });
    } else if (text !== metaLine.text) {
      view.dispatch({ changes: { from: metaLine.from, to: metaLine.to, insert: text } });
    }
  } else if (text !== null) {
    view.dispatch({ changes: { from: end.to, to: end.to, insert: `\n${text}` } });
  }
}

/**
 * Biçim çubuğundaki bir tıklamayı dosyaya yazar (LOM-98, tek dispatch). Sütun hizası ayraç
 * satırına (`:---:`), satır/hücre biçimi ve kalın/italik not satırının `bicim` bölümüne gider.
 * Not satırı yoksa tablonun altına eklenir, saklanacak bir şey kalmazsa silinir (LOM-89 kalıbı).
 * Hücre metinleri değişmez.
 */
function writeTableFormat(view: EditorView, headerFrom: number, target: StyleTarget, action: FormatAction): void {
  if (!isLive(view)) return;
  const block = tableBlockFrom(view.state, headerFrom);
  if (!block) return;
  const res = applyFormat({ meta: block.meta, colAlign: block.align, target, action });
  const changes: { from: number; to: number; insert: string }[] = [];
  // Ayraç satırı (yalnız sütun hizası değiştiyse).
  if (target.kind === "col" && (res.colAlign[target.col] ?? null) !== (block.align[target.col] ?? null)) {
    const sep = view.state.doc.line(block.headerLine + 2);
    const next = setSeparatorAlign(sep.text, target.col, res.colAlign[target.col] ?? null);
    if (next !== sep.text) changes.push({ from: sep.from, to: sep.to, insert: next });
  }
  // Not satırı.
  const text = serializeTableMeta(res.meta);
  const end = view.state.doc.line(block.endLine + 1);
  if (block.metaLine != null) {
    const metaLine = view.state.doc.line(block.metaLine + 1);
    if (text === null) changes.push({ from: end.to, to: metaLine.to, insert: "" });
    else if (text !== metaLine.text) changes.push({ from: metaLine.from, to: metaLine.to, insert: text });
  } else if (text !== null) {
    changes.push({ from: end.to, to: end.to, insert: `\n${text}` });
  }
  if (changes.length) view.dispatch({ changes });
}

/**
 * Şerit düğmesine basma: fare basınca hemen, dokunmatikte parmak yerinde kalkınca (şerit erken
 * kalkarsa dokunuş alttaki hücreye düşerdi). Odak düzenleme kutusunda kalsın diye pointerdown
 * ve mousedown'da preventDefault (blur → finish kutuyu seçimden önce kapatırdı).
 */
function onStripPress(btn: HTMLElement, fn: () => void): void {
  const tap = createTapTracker();
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isTapInput(e.pointerType)) {
      fn();
      return;
    }
    tap.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
  });
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("pointermove", (e) => {
    if (isTapInput(e.pointerType)) tap.move(e.pointerId, e.clientX, e.clientY);
  });
  btn.addEventListener("pointerup", (e) => {
    if (!isTapInput(e.pointerType)) return;
    e.preventDefault();
    e.stopPropagation();
    if (tap.up(e.pointerId, e.clientX, e.clientY, e.timeStamp)) fn();
  });
  btn.addEventListener("pointercancel", (e) => tap.cancel(e.pointerId));
}

type FormatScope = "cell" | "row" | "col";
/** Biçim çubuğunda son seçilen kapsam (oturum boyunca hatırlanır; varsayılan Hücre). */
let lastFormatScope: FormatScope = "cell";

// Hizalama simgeleri: üç yatay çizgi (sabit metin, kullanıcı verisi içermez).
const ALIGN_ICONS: Record<Align, string> = {
  left: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5h12M2 8h8M2 12.5h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>',
  center:
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5h12M4 8h8M3 12.5h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>',
  right:
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5h12M6 8h8M4 12.5h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>',
};

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
  const block = tableBlockFrom(view.state, headerFrom);
  if (!block) return;
  const range = fullBlockRange(view.state, block); // not satırının da altı
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
function openCellEditor(
  view: EditorView,
  cellEl: HTMLElement,
  opts: { viaTouch?: boolean; caretEnd?: boolean } = {}
): void {
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
  // Biçim tıklamasından sonra yeniden açılınca metin seçili kalmasın (sonraki tuş silerdi).
  if (opts.caretEnd) input.setSelectionRange(input.value.length, input.value.length);
  else input.select();

  // Formül öneri listesi (LOM-88): "=" ve harf yazınca fonksiyon ve sütun harfi önerir.
  const suggest = document.createElement("div");
  suggest.className = "cm-table-suggest";
  suggest.setAttribute("role", "listbox");
  suggest.setAttribute("aria-label", i18n.t("tableFormula.suggestLabel"));
  suggest.hidden = true;
  document.body.appendChild(suggest);
  const headerTexts = (): string[] => {
    const wrap = cellEl.closest(".cm-tablewrap");
    if (!wrap) return [];
    const out: string[] = [];
    wrap.querySelectorAll<HTMLElement>('[data-row="-1"]').forEach((h) => {
      const c = Number(h.dataset.col);
      if (Number.isFinite(c) && c >= 0) out[c] = h.dataset.raw ?? "";
    });
    return Array.from(out, (t) => t ?? "");
  };
  const header = headerTexts();
  // Formül yazarken (= ile başlayınca) tabloda sütun harfi ve satır numarası görünür (LOM-99).
  const coordsWrap = cellEl.closest<HTMLElement>(".cm-tablewrap");
  const syncCoords = () => coordsWrap?.classList.toggle("is-formula", input.value.trimStart().startsWith("="));
  syncCoords();

  // Kutunun altında tek yüzen şerit (.cm-table-strip): üstte her hücre için biçim satırı
  // (LOM-98), başlık hücresinde altta para birimi satırı (LOM-89). İkisi aynı kapsayıcıda
  // alt alta durur, birbirinin üstüne binmez.
  const strip = document.createElement("div");
  strip.className = "cm-table-strip";
  const placeStrip = () => {
    const box = input.getBoundingClientRect();
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const w = strip.offsetWidth;
    strip.style.left = `${Math.max(4, Math.min(box.left, vw - w - 4))}px`;
    const h = strip.offsetHeight; // sola yerleşince ölç (sarma yüksekliği değişebilir)
    // Alta sığmazsa (hücre ekranın altında) kutunun üstüne açılır.
    const below = box.bottom + 2;
    strip.style.top = `${below + h > vh - 4 && box.top - h - 2 >= 4 ? box.top - h - 2 : below}px`;
  };
  // Biçim seçilince: hücre metni kaydedilir, biçim yazılır, aynı hücre yeniden açılır
  // (dispatch sonrası widget DOM'u yenilenir; hücre bir sonraki karede yeniden sorgulanır).
  const reopenSame = () => {
    requestAnimationFrame(() => {
      if (!isLive(view)) return;
      const sel = `.cm-tablewrap[data-table-from="${headerFrom}"] [data-row="${row}"][data-col="${col}"]`;
      const el = view.dom.querySelector<HTMLElement>(sel);
      if (el) openCellEditor(view, el, { viaTouch: opts.viaTouch, caretEnd: true });
      else view.focus();
    });
  };

  // Biçim satırı (LOM-98): kapsam (Hücre/Satır/Sütun) + sola/ortaya/sağa + kalın + italik.
  const format = document.createElement("div");
  format.className = "cm-table-format";
  format.setAttribute("role", "toolbar");
  format.setAttribute("aria-label", i18n.t("tableFormat.label"));
  const targetOf = (scope: FormatScope): StyleTarget =>
    scope === "col" ? { kind: "col", col } : scope === "row" ? { kind: "row", row } : { kind: "cell", row, col };
  const scopeBtns: { scope: FormatScope; btn: HTMLButtonElement }[] = [];
  const actionBtns: { action: FormatAction; btn: HTMLButtonElement }[] = [];
  // Düğmelerin basılı durumu: seçili kapsamdaki hedefin, tıklamanın değiştireceği değeri
  // (applyFormat ile aynı anlam). Hiza: sütunda ayraç satırı, satır/hücrede kendi ayarı.
  // Kalın/italik: hücrede kalıtılan dahil etkin değer, satır/sütunda kendi ayarı.
  const refreshFormat = () => {
    const block = tableBlockFrom(view.state, headerFrom);
    const meta = block?.meta ?? null;
    const colAlign = block?.align ?? [];
    const target = targetOf(lastFormatScope);
    const own = meta?.style?.[styleKey(target)];
    const eff = effectiveCellStyle(colAlign, meta, row, col);
    for (const { scope, btn } of scopeBtns) {
      const on = scope === lastFormatScope;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
    }
    for (const { action, btn } of actionBtns) {
      let on: boolean;
      if (action.type === "align") {
        on = (target.kind === "col" ? colAlign[col] ?? null : own?.align ?? null) === action.align;
      } else {
        const prop = action.type === "bold" ? "bold" : "italic";
        on = target.kind === "cell" ? eff[prop] : own?.[prop] ?? false;
      }
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
    }
  };
  const scopes: { scope: FormatScope; key: string }[] = [
    { scope: "cell", key: "tableFormat.scopeCell" },
    { scope: "row", key: "tableFormat.scopeRow" },
    { scope: "col", key: "tableFormat.scopeColumn" },
  ];
  for (const sc of scopes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cm-table-format__scope";
    btn.textContent = i18n.t(sc.key);
    btn.title = `${i18n.t("tableFormat.scopeLabel")}: ${i18n.t(sc.key)}`;
    onStripPress(btn, () => {
      lastFormatScope = sc.scope;
      refreshFormat();
    });
    scopeBtns.push({ scope: sc.scope, btn });
    format.appendChild(btn);
  }
  const sep = document.createElement("span");
  sep.className = "cm-table-format__sep";
  sep.setAttribute("aria-hidden", "true");
  format.appendChild(sep);
  const actions: { action: FormatAction; title: string; html?: string; text?: string }[] = [
    { action: { type: "align", align: "left" }, title: i18n.t("tableFormat.alignLeft"), html: ALIGN_ICONS.left },
    { action: { type: "align", align: "center" }, title: i18n.t("tableFormat.alignCenter"), html: ALIGN_ICONS.center },
    { action: { type: "align", align: "right" }, title: i18n.t("tableFormat.alignRight"), html: ALIGN_ICONS.right },
    { action: { type: "bold" }, title: i18n.t("tableFormat.bold"), text: i18n.t("tableFormat.boldShort") },
    {
      action: { type: "italic" },
      title: i18n.t("tableFormat.italic"),
      text: i18n.t("tableFormat.italicShort"),
    },
  ];
  for (const a of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cm-table-format__btn";
    if (a.html) btn.innerHTML = a.html;
    else btn.textContent = a.text ?? "";
    // Düğmenin kendisi ne yaptığını göstersin: K kalın, İ italik.
    if (a.action.type === "bold") btn.style.fontWeight = "700";
    if (a.action.type === "italic") btn.style.fontStyle = "italic";
    btn.title = a.title;
    btn.setAttribute("aria-label", a.title);
    onStripPress(btn, () => {
      const target = targetOf(lastFormatScope);
      finish(true, false);
      writeTableFormat(view, headerFrom, target, a.action);
      reopenSame();
    });
    actionBtns.push({ action: a.action, btn });
    format.appendChild(btn);
  }
  refreshFormat();
  strip.appendChild(format);

  // Başlık hücresinde: para birimi satırı (LOM-89). Seçim not satırına yazılır.
  if (row === -1) {
    const curRaw = cellEl.dataset.currency ?? "";
    const cur: CurrencyCode | null = isCurrencyCode(curRaw) ? curRaw : null;
    const currency = document.createElement("div");
    currency.className = "cm-table-currency";
    currency.setAttribute("role", "group");
    currency.setAttribute("aria-label", i18n.t("tableCurrency.label"));
    const label = document.createElement("span");
    label.className = "cm-table-currency__label";
    label.textContent = i18n.t("tableCurrency.label");
    currency.appendChild(label);
    const options: { code: CurrencyCode | null; text: string; title: string }[] = [
      { code: null, text: i18n.t("tableCurrency.none"), title: i18n.t("tableCurrency.noneTitle") },
      ...CURRENCIES.map((c) => ({ code: c.code, text: c.symbol, title: i18n.t(`tableCurrency.${c.code}`) })),
    ];
    for (const o of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cm-table-currency__opt" + (o.code === cur ? " is-active" : "");
      btn.textContent = o.text;
      btn.title = o.title;
      btn.setAttribute("aria-label", o.title);
      btn.setAttribute("aria-pressed", String(o.code === cur));
      // Seçince başlık metni kaydedilir, sonra not satırı yazılır.
      onStripPress(btn, () => {
        finish(true);
        if (o.code !== cur) writeTableMeta(view, headerFrom, col, o.code);
      });
      currency.appendChild(btn);
    }
    strip.appendChild(currency);
  }
  document.body.appendChild(strip);
  placeStrip();

  let current: FormulaSuggestResult | null = null;
  let active = 0;
  // Esc ile kapatılan metin: aynı metinde liste yeniden açılmaz, yeni harf yazılınca açılır.
  let dismissedText: string | null = null;
  const suggestOpen = () => !suggest.hidden && current !== null && current.items.length > 0;
  const hideSuggest = () => {
    suggest.hidden = true;
    strip.style.display = "";
    placeStrip();
    current = null;
    input.removeAttribute("aria-activedescendant");
  };
  const placeSuggest = () => {
    const box = input.getBoundingClientRect();
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const width = Math.min(Math.max(box.width, 280), vw - 8);
    suggest.style.width = `${width}px`;
    suggest.style.left = `${Math.max(4, Math.min(box.left, vw - width - 4))}px`;
    if (vh - box.bottom < 200 && box.top > vh - box.bottom) {
      suggest.style.top = "";
      suggest.style.bottom = `${window.innerHeight - box.top + 2}px`;
      suggest.style.maxHeight = `${Math.max(80, Math.min(220, box.top - 8))}px`;
    } else {
      suggest.style.bottom = "";
      suggest.style.top = `${box.bottom + 2}px`;
      suggest.style.maxHeight = `${Math.max(80, Math.min(220, vh - box.bottom - 8))}px`;
    }
  };
  const setActive = (i: number) => {
    const items = suggest.querySelectorAll<HTMLElement>(".cm-table-suggest__item");
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((el, k) => {
      el.classList.toggle("is-active", k === active);
      el.setAttribute("aria-selected", String(k === active));
    });
    const el = items[active];
    input.setAttribute("aria-activedescendant", el.id);
    // scrollIntoView yerine elle: sayfa kaymasın (kayma kutuyu kapatırdı).
    if (el.offsetTop < suggest.scrollTop) suggest.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > suggest.scrollTop + suggest.clientHeight)
      suggest.scrollTop = el.offsetTop + el.offsetHeight - suggest.clientHeight;
  };
  // Aktif öneri metni değiştirir mi? Kelime zaten öneriyle aynıysa Enter kaydetmeye bırakılır.
  const activeChanges = () => {
    const it = current?.items[active];
    if (!current || !it) return false;
    // Büyük/küçük harf farkı (=b → B) değişiklik sayılmaz; motor ikisini de okur.
    return input.value.slice(current.replaceFrom, current.replaceTo).toUpperCase() !== it.insert.toUpperCase();
  };
  const applyActive = () => {
    if (!current) return;
    const it = current.items[active];
    if (!it) return;
    const res = applySuggestion(input.value, current.replaceFrom, current.replaceTo, it.insert);
    input.value = res.text;
    input.setSelectionRange(res.caret, res.caret);
    fitHeight();
    refreshSuggest();
  };
  // Excel'deki otomatik toplam gibi (LOM-99): aktif öğe toplu fonksiyonsa ve hücrenin
  // üstünde/solunda sayı dizisi varsa "TOPLA(B2:B5)" yazar. Uygulandıysa true.
  const applyAutoRange = (): boolean => {
    const it = current?.items[active];
    if (!current || !it || it.kind !== "fn" || !it.aggregate) return false;
    if (!isLive(view)) return false;
    const block = tableBlockFrom(view.state, headerFrom);
    if (!block) return false;
    const ref = autoRangeRef(block.rows, row, col);
    if (!ref) return false;
    const res = applySuggestion(input.value, current.replaceFrom, current.replaceTo, autoFunctionInsert(it.label, ref));
    input.value = res.text;
    input.setSelectionRange(res.caret, res.caret);
    fitHeight();
    refreshSuggest();
    syncCoords();
    return true;
  };
  function refreshSuggest(): void {
    if (dismissedText !== null) {
      if (input.value === dismissedText) {
        hideSuggest();
        return;
      }
      dismissedText = null;
    }
    const res = suggestFormula(input.value, input.selectionStart ?? input.value.length, header, i18n.language);
    if (!res) {
      hideSuggest();
      return;
    }
    current = res;
    suggest.replaceChildren();
    res.items.forEach((it, k) => {
      const item = document.createElement("div");
      item.className = "cm-table-suggest__item";
      item.id = `cm-table-suggest-${k}`;
      item.setAttribute("role", "option");
      const name = document.createElement("span");
      name.className = "cm-table-suggest__name";
      name.textContent = it.label;
      if (it.alias) {
        const alias = document.createElement("small");
        alias.className = "cm-table-suggest__alias";
        alias.textContent = ` ${it.alias}`;
        name.appendChild(alias);
      }
      // Sütunda harfin yanında başlık adı: "B · Tutar" (LOM-88).
      if (it.kind === "column" && it.name) {
        const colname = document.createElement("span");
        colname.className = "cm-table-suggest__colname";
        colname.textContent = it.name;
        name.append(" · ", colname);
      }
      const desc = document.createElement("span");
      desc.className = "cm-table-suggest__desc";
      desc.textContent = i18n.t(it.descKey, { name: it.descParam });
      const ex = document.createElement("span");
      ex.className = "cm-table-suggest__example";
      ex.textContent = it.example;
      item.append(name, desc, ex);
      // Dokunma/tıklama odağı textarea'dan almasın (blur → finish kapatırdı): pointerdown'da
      // preventDefault. Fare basıldığı anda seçer; dokunmatikte listeyi kaydırmak öneriyi
      // seçmesin diye yalnız kısa ve yerinde dokunuşta, parmak kalkınca seçer (LOM-35 kalıbı).
      const tap = createTapTracker();
      item.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isTapInput(e.pointerType)) {
          active = k;
          applyActive();
          return;
        }
        tap.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
      });
      item.addEventListener("mousedown", (e) => e.preventDefault());
      item.addEventListener("pointermove", (e) => {
        if (isTapInput(e.pointerType)) tap.move(e.pointerId, e.clientX, e.clientY);
      });
      item.addEventListener("pointerup", (e) => {
        if (!isTapInput(e.pointerType)) return;
        e.preventDefault();
        if (tap.up(e.pointerId, e.clientX, e.clientY, e.timeStamp)) {
          active = k;
          applyActive();
        }
      });
      // Tarayıcı kaydırmayı devraldı: bu bir dokunuş değil.
      item.addEventListener("pointercancel", (e) => tap.cancel(e.pointerId));
      suggest.appendChild(item);
    });
    suggest.hidden = false;
    // Öneri listesi kutunun altındaki şeridin yerini kullanır: liste açıkken şerit gizlenir.
    strip.style.display = "none";
    placeSuggest();
    setActive(0);
  }

  let done = false;
  // Kaydırma/yeniden boyutlandırmada yüzen input yanlış yerde kalmasın: kaydet ve kapat.
  // Öneri listesinin kendi içindeki kaydırma sayılmaz.
  const onScroll = (e?: Event) => {
    if (e && e.target instanceof Node && suggest.contains(e.target)) return;
    finish(true, false);
  };
  let bindTimer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    if (bindTimer !== undefined) clearTimeout(bindTimer);
    view.scrollDOM.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    window.removeEventListener("scroll", onScroll, true);
    suggest.remove();
    strip.remove();
    coordsWrap?.classList.remove("is-formula");
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

  // Öneri listesi açıkken tuşları önce bu dinleyici alır; kapalıyken hiçbir şey yapmaz.
  input.addEventListener("keydown", (e) => {
    if (!suggestOpen() || e.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      setActive(active + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Tab" && !e.shiftKey && applyAutoRange()) {
      // Toplu fonksiyon + Tab: üstteki (yoksa soldaki) sayı aralığı kendiliğinden (LOM-99).
    } else if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
      if (!activeChanges()) return;
      applyActive();
    } else if (e.key === "Escape") {
      dismissedText = input.value;
      hideSuggest();
    } else {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  });
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
      // Öneri açıksa satır sonu kaydetmez, seçili öneriyi uygular (LOM-88).
      if (suggestOpen()) {
        const keep = active;
        const at = input.value.search(/\r?\n/);
        input.value = input.value.replace(/\r?\n/g, "");
        input.setSelectionRange(at, at);
        refreshSuggest();
        if (suggestOpen()) {
          if (current && keep < current.items.length) setActive(keep);
        }
        if (suggestOpen() && activeChanges()) {
          applyActive();
          return;
        }
      }
      input.value = input.value.replace(/\r?\n/g, " ");
      finish(true);
      return;
    }
    fitHeight();
    refreshSuggest();
    syncCoords();
    placeStrip();
  });
  input.addEventListener("click", () => refreshSuggest());
  // Ok/Home/End ile imleç kayınca liste imlecin yeni yerine göre yenilensin.
  input.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") refreshSuggest();
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
  // Hücrede zaten formül varsa bir kez dene (tümü seçiliyken liste açılmaz, seçim korunur).
  // Biçim düğmesinden sonra yeniden açılışta liste açılmaz: şerit görünür kalsın, üst üste biçim uygulanabilsin.
  if (orig.trim().startsWith("=") && !opts.caretEnd) refreshSuggest();
}

/** Sürüklemenin başlaması için gereken en az kayma (px); altı tıklama sayılır. */
const DRAG_THRESHOLD_PX = 4;

const DROP_CLASSES = ["is-drag-source", "is-drop-before", "is-drop-after"];

class TableWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly header: string[],
    readonly rows: string[][],
    /** Tablonun not satırı (para birimi, LOM-89); yoksa null. */
    readonly meta: TableMeta | null = null,
    /** Sütun hizaları ayraç satırından (LOM-98); eq'te karşılaştırılır ki yalnız ayraç değişince de yenilensin. */
    readonly align: (Align | null)[] = []
  ) {
    super();
  }

  eq(o: TableWidget): boolean {
    return (
      o.from === this.from &&
      JSON.stringify(o.header) === JSON.stringify(this.header) &&
      JSON.stringify(o.rows) === JSON.stringify(this.rows) &&
      JSON.stringify(o.meta) === JSON.stringify(this.meta) &&
      JSON.stringify(o.align) === JSON.stringify(this.align)
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
    const changes: { from: number; to: number; insert: string }[] = [{ from: range.from, to: range.to, insert: newText }];
    if (axis === "col") {
      // Saklı sütun genişlikleri taşınan sütunla birlikte yer değiştirir.
      const arr = colWidths.get(this.from);
      if (arr) {
        const full = this.header.map((_, i) => arr[i] ?? 0);
        colWidths.set(this.from, moveItem(full, from, to));
      }
    }
    // Para birimi (LOM-89) ve biçim (LOM-98) taşınan sütun/satırla gider: not satırı aynı
    // dispatch'te yazılır. Sütun hizası ayraç satırında olduğu için moveTableColumn ile zaten gider.
    const block = tableBlockFrom(view.state, this.from);
    if (block && block.metaLine != null) {
      const metaLine = view.state.doc.line(block.metaLine + 1);
      const moved =
        axis === "col"
          ? moveMetaColumn(block.meta, from, to, block.header.length)
          : moveMetaRow(block.meta, from, to, block.rows.length);
      const text = serializeTableMeta(moved);
      if (text !== null && text !== metaLine.text) changes.push({ from: metaLine.from, to: metaLine.to, insert: text });
    }
    view.dispatch({ changes });
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
    // Formül hücreleri (LOM-79): ekranda sonuç, düzenleme kutusunda (dataset.raw) formül.
    // Widget her belge değişiminde yeniden kurulduğu için sonuç kendiliğinden güncellenir.
    const results = evaluateTable(this.header, this.rows);
    const mkCell = (tag: "th" | "td", text: string, row: number, col: number, result?: CellResult): HTMLElement => {
      const el = document.createElement(tag);
      el.textContent = text;
      el.dataset.col = String(col);
      el.dataset.row = String(row);
      el.dataset.raw = text;
      // Formül yazarken görünen koordinatlar (LOM-99): başlıkta harf, ilk sütunda satır no.
      if (row === -1) el.dataset.letter = colLetter(col);
      if (col === 0) el.dataset.rowno = String(row + 2);
      // Biçim (LOM-98): hücre > satır > sütun; metin ve formül değişmez, yalnız sınıf eklenir.
      const fmt = styleClasses(effectiveCellStyle(this.align, this.meta, row, col));
      if (fmt.length) el.classList.add(...fmt);
      // Para birimli sütun (LOM-89): ekranda "212.500 ₺"; kaynak (dataset.raw) aynen kalır.
      const cur = columnCurrency(this.meta, col);
      if (result?.formula) {
        el.classList.add("cm-table__formula");
        if (result.error) {
          el.classList.add("is-error");
          el.textContent = i18n.t("tableFormula.errorLabel");
          el.title = `${result.formula} — ${i18n.t(`tableFormula.${result.error}`)}`;
        } else {
          el.textContent = cur
            ? formatCurrency(result.value ?? 0, cur, i18n.language)
            : formatFormulaResult(result.value ?? 0, i18n.language);
          if (cur) el.classList.add("cm-table__currency");
          el.title = result.formula;
        }
      } else if (tag === "td") {
        // Sayı olmayan hücre (metin, boş) olduğu gibi kalır.
        const shown = formatCellDisplay(text, cur, i18n.language);
        if (shown !== null) {
          el.textContent = shown;
          el.classList.add("cm-table__currency");
        }
      } else if (cur) {
        // Başlıkta seçili para biriminin simgesi; başlık kutusu seçimi buradan okur.
        el.dataset.currency = cur;
        const badge = document.createElement("span");
        badge.className = "cm-table__curbadge";
        badge.textContent = currencySymbol(cur);
        badge.title = i18n.t(`tableCurrency.${cur}`);
        el.appendChild(badge);
      }
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
        const td = mkCell("td", r[i] ?? "", ri, i, results[ri]?.[i]);
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
    // Not satırı (LOM-89) da gizlenir: dekorasyon `metaLine ?? endLine` satırının sonuna kadar.
    const to = state.doc.line((block.metaLine ?? block.endLine) + 1).to;
    builder.add(
      from,
      to,
      Decoration.replace({ widget: new TableWidget(from, block.header, block.rows, block.meta, block.align), block: true })
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
      // Tablonun son satırı not satırı olabilir (LOM-89): metaLine ?? endLine.
      const block = findTables(docLines(view.state)).find((t) => (t.metaLine ?? t.endLine) === prev.number - 1);
      if (!block) return false;
      // Silmeden önce tabloyu (not satırı dahil) seç — ikinci Backspace bilinçli olarak siler.
      const range = fullBlockRange(view.state, block);
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
      const range = fullBlockRange(view.state, block);
      view.dispatch({ selection: { anchor: range.from, head: range.to } });
      return true;
    },
  },
];

export const tableKeymap: Extension = Prec.high(keymap.of(tableGuards));

import { useEffect, useRef } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAppStore } from "../../store/useAppStore";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers as lineNumbersExt, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as tg } from "@lezer/highlight";
import { livePreview } from "./livePreview";
import { clearTableColWidths, tableField, tableKeymap } from "./tableWidget";
import { ensureTrailingBlankLine, needsTrailingBlankLine } from "./tableModel";

interface Props {
  value: string;
  onChange: (text: string) => void;
  lineNumbers: boolean;
  onView?: (v: EditorView | null) => void;
  onContextMenu?: (x: number, y: number) => void;
  /** Açılışta imlecin gideceği konum (günlük notta "Ephemeral Notlar" bölümü). */
  initialCaret?: number;
}

// Token'larımıza dayalı sözdizimi vurgusu (light/dark otomatik — var() kullanır).
const mdHighlight = HighlightStyle.define([
  { tag: tg.heading, color: "var(--accent)", fontWeight: "700" },
  { tag: tg.strong, fontWeight: "700", color: "var(--fg1)" },
  { tag: tg.emphasis, fontStyle: "italic" },
  { tag: tg.link, color: "var(--accent)" },
  { tag: tg.url, color: "var(--accent)" },
  { tag: tg.monospace, color: "var(--accent-2)" },
  { tag: tg.quote, color: "var(--fg3)", fontStyle: "italic" },
  { tag: tg.list, color: "var(--fg2)" },
  { tag: tg.contentSeparator, color: "var(--fg3)" },
]);

const cmTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--fg1)", fontSize: "15px", height: "100%" },
  ".cm-scroller": { fontFamily: "var(--font-sans)", lineHeight: "1.7", overflow: "auto" },
  ".cm-content": { caretColor: "var(--accent)", padding: "22px 0 200px", maxWidth: "760px" },
  // Canlı önizleme — başlık boyutları + bölümler arası boşluk/solan ayraç + wiki-link
  // NOT: CodeMirror satır ölçümünü bozduğu için .cm-line'da margin KULLANMA — yalnız padding.
  // (margin satır kutusu dışındadır, CM hesaba katamaz → fare/imleç isabeti kayar.)
  ".cm-h1": { fontSize: "1.9em", fontWeight: "700", lineHeight: "1.3", paddingBottom: "18px" },
  ".cm-h2": {
    fontSize: "1.5em",
    fontWeight: "700",
    lineHeight: "1.3",
    paddingTop: "32px",
    position: "relative",
  },
  ".cm-h2::before": {
    content: '""',
    position: "absolute",
    top: "16px",
    left: "0",
    right: "0",
    height: "2px",
    borderRadius: "2px",
    background: "linear-gradient(to right, transparent, var(--line) 14%, var(--line) 86%, transparent)",
  },
  ".cm-h3": {
    fontSize: "1.25em",
    fontWeight: "700",
    lineHeight: "1.35",
    paddingTop: "24px",
    position: "relative",
  },
  ".cm-h3::before": {
    content: '""',
    position: "absolute",
    top: "12px",
    left: "0",
    right: "0",
    height: "1px",
    background: "linear-gradient(to right, transparent, var(--line-soft) 18%, var(--line-soft) 82%, transparent)",
  },
  ".cm-h4": { fontSize: "1.13em", fontWeight: "700", paddingTop: "14px" },
  ".cm-h5": { fontSize: "1.02em", fontWeight: "700", paddingTop: "10px" },
  ".cm-h6": { fontSize: "1em", fontWeight: "700", color: "var(--fg2)", paddingTop: "8px" },
  ".cm-wikilink": { color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "2px" },
  // Canlı önizleme tablo widget'ı
  // NOT: margin YOK — CM satır yüksekliğini ölçemez, tıklama/imleç isabeti kayar (bkz yukarı).
  ".cm-tablewrap": { padding: "6px 0 18px", overflowX: "auto", cursor: "text" },
  ".cm-tablegrid": { display: "inline-grid", gridTemplateColumns: "auto auto", gap: "4px", alignItems: "stretch" },
  ".cm-table": { gridColumn: "1", gridRow: "1", borderCollapse: "collapse", fontSize: "14.5px", lineHeight: "1.5" },
  ".cm-table__add": {
    border: "1px dashed var(--line)",
    borderRadius: "6px",
    background: "transparent",
    color: "var(--fg3)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    fontSize: "16px",
    lineHeight: "1",
    padding: "0",
    fontFamily: "var(--font-sans)",
  },
  ".cm-table__add:hover": { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)" },
  ".cm-table__add--col": { gridColumn: "2", gridRow: "1", width: "24px" },
  ".cm-table__add--row": { gridColumn: "1", gridRow: "2", height: "24px" },
  ".cm-table th, .cm-table td": {
    border: "1px solid var(--line)",
    padding: "8px 14px",
    height: "38px",
    minWidth: "100px",
    boxSizing: "border-box",
    textAlign: "start",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    color: "var(--fg1)",
    cursor: "text",
    position: "relative",
  },
  // Sütun genişliği sürükleme tutamacı (başlık hücrelerinin sağ kenarı).
  // touchAction: none — parmakla sürüklerken tarayıcı bunu kaydırma sayıp gesture'ı almasın.
  ".cm-table__resize": {
    position: "absolute",
    top: "0",
    right: "-3px",
    width: "7px",
    height: "100%",
    cursor: "col-resize",
    touchAction: "none",
    zIndex: "2",
  },
  ".cm-table__resize:hover": { background: "var(--accent-soft)" },
  ".cm-table th": { background: "var(--bg-sunken)", fontWeight: "600", color: "var(--fg2)" },
  ".cm-table tbody tr:nth-child(even) td": { background: "var(--line-soft)" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--fg3)", border: "none" },
  ".cm-activeLine": { backgroundColor: "var(--line-soft)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--fg2)" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--accent-soft)",
  },
});

/**
 * Belge bir blok widget'ıyla (tablo / ses / resim embed'i) bitiyorsa sonuna boş bir satır
 * ekler. Widget belgenin son satırıysa altında gidilecek konum kalmıyor; alt boşluğa
 * tıklayınca imleç gizlenen kaynağın içine düşüp kayboluyordu.
 *
 * transactionFilter çıktısı yeniden filtrelenmediği için döngüye girmez.
 */
const trailingBlankLine = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  const doc = tr.newDoc;
  const last = doc.line(doc.lines);
  const t = last.text.trim();
  // Ucuz ön eleme — yalnız tablo satırı ya da embed görünümlü son satırda tam kontrol.
  if (t === "" || (!t.includes("|") && !t.startsWith("!["))) return tr;
  if (!needsTrailingBlankLine(doc.toString().split("\n"))) return tr;
  return [tr, { changes: { from: doc.length, insert: "\n" }, sequential: true }];
});
/** Dokunmatikte bağlam menüsünü açan basma süresi (ms) ve basmayı iptal eden parmak kayması (px). */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

export function CodeMirrorEditor({ value, onChange, lineNumbers, onView, onContextMenu, initialCaret }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const platformMobile = useAppStore((s) => s.platformMobile);
  const isMobile = useIsMobile() || platformMobile;
  // Editör bir kez kurulur (bağımlılık dizisi boş); mobil olup olmadığını ref'ten okuyoruz.
  const mobileRef = useRef(isMobile);
  mobileRef.current = isMobile;
  // Stale closure olmasın diye callback'leri ref'te tut.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCtxRef = useRef(onContextMenu);
  onCtxRef.current = onContextMenu;
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  useEffect(() => {
    if (!ref.current) return;
    // Sütun genişlikleri tablo pozisyonuna göre saklanıyor — notlar arasında çakışmasın.
    clearTableColWidths();

    // Dokunmatik uzun basma → zengin bağlam menüsü. WebView'da uzun basma `contextmenu` olayı
    // ÜRETMEZ; menü yalnız sağ tıkla açıldığı için telefonda biçimlendirme/ekle menüsüne
    // hiç ulaşılamıyordu. Parmak kayarsa (kaydırma ya da metin seçme) basma iptal edilir.
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let pressAt: { x: number; y: number } | null = null;
    const cancelPress = () => {
      if (pressTimer != null) clearTimeout(pressTimer);
      pressTimer = null;
      pressAt = null;
    };

    const exts = [
      history(),
      drawSelection(),
      tableKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      syntaxHighlighting(mdHighlight),
      livePreview,
      tableField,
      trailingBlankLine,
      EditorView.lineWrapping,
      cmTheme,
      EditorView.domEventHandlers({
        contextmenu: (e) => {
          if (!onCtxRef.current) return false;
          e.preventDefault();
          onCtxRef.current(e.clientX, e.clientY);
          return true;
        },
        pointerdown: (e) => {
          if (e.pointerType === "mouse" || !onCtxRef.current) return false;
          cancelPress();
          const { clientX: x, clientY: y } = e;
          pressAt = { x, y };
          pressTimer = setTimeout(() => {
            pressTimer = null;
            onCtxRef.current?.(x, y);
          }, LONG_PRESS_MS);
          return false; // CodeMirror imleci normal şekilde yerleştirsin
        },
        pointermove: (e) => {
          if (!pressAt) return false;
          if (Math.abs(e.clientX - pressAt.x) > LONG_PRESS_SLOP || Math.abs(e.clientY - pressAt.y) > LONG_PRESS_SLOP) {
            cancelPress();
          }
          return false;
        },
        pointerup: () => {
          cancelPress();
          return false;
        },
        pointercancel: () => {
          cancelPress();
          return false;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current(u.state.doc.toString());
      }),
    ];
    if (lineNumbers) exts.push(lineNumbersExt());

    // Açılışta da alt satır garantisi (onChange tetiklenmez — sırf açmak notu kirletmesin).
    const doc = ensureTrailingBlankLine(value);
    // Günlük notta imleç "Ephemeral Notlar" bölümüne; verilmezse CM varsayılanı (metin başı).
    const caret = initialCaret == null ? undefined : Math.max(0, Math.min(initialCaret, doc.length));

    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: exts,
        ...(caret == null ? {} : { selection: { anchor: caret } }),
      }),
      parent: ref.current,
    });
    // Mobilde otomatik odaklanma YOK: her not açılışında klavye fırlıyor, ekranın yarısını
    // kaplıyor ve yalnız okumak isteyen kullanıcı her notta klavyeyi kapatmak zorunda kalıyordu.
    // Yazmak için nota dokunmak yeterli.
    if (!mobileRef.current) view.focus();
    if (caret != null) view.dispatch({ effects: EditorView.scrollIntoView(caret, { y: "center" }) });
    onViewRef.current?.(view);
    return () => {
      cancelPress();
      onViewRef.current?.(null);
      view.destroy();
    };
    // value/lineNumbers değişince EditorScreen key ile yeniden oluşturur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="lo-cm lo-scroll" />;
}

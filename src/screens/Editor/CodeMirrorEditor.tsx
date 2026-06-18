import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers as lineNumbersExt, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as tg } from "@lezer/highlight";
import { livePreview } from "./livePreview";

interface Props {
  value: string;
  onChange: (text: string) => void;
  lineNumbers: boolean;
  onView?: (v: EditorView | null) => void;
  onContextMenu?: (x: number, y: number) => void;
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
  ".cm-h1": { fontSize: "1.9em", fontWeight: "700", lineHeight: "1.3", marginBottom: "30px" },
  ".cm-h2": {
    fontSize: "1.5em",
    fontWeight: "700",
    lineHeight: "1.3",
    marginTop: "46px",
    paddingTop: "34px",
    position: "relative",
  },
  ".cm-h2::before": {
    content: '""',
    position: "absolute",
    top: "0",
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
    marginTop: "30px",
    paddingTop: "22px",
    position: "relative",
  },
  ".cm-h3::before": {
    content: '""',
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    height: "1px",
    background: "linear-gradient(to right, transparent, var(--line-soft) 18%, var(--line-soft) 82%, transparent)",
  },
  ".cm-h4": { fontSize: "1.13em", fontWeight: "700", marginTop: "14px" },
  ".cm-h5": { fontSize: "1.02em", fontWeight: "700", marginTop: "10px" },
  ".cm-h6": { fontSize: "1em", fontWeight: "700", color: "var(--fg2)", marginTop: "8px" },
  ".cm-wikilink": { color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "2px" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--fg3)", border: "none" },
  ".cm-activeLine": { backgroundColor: "var(--line-soft)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--fg2)" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--accent-soft)",
  },
});

export function CodeMirrorEditor({ value, onChange, lineNumbers, onView, onContextMenu }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Stale closure olmasın diye callback'leri ref'te tut.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCtxRef = useRef(onContextMenu);
  onCtxRef.current = onContextMenu;
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  useEffect(() => {
    if (!ref.current) return;
    const exts = [
      history(),
      drawSelection(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      syntaxHighlighting(mdHighlight),
      livePreview,
      EditorView.lineWrapping,
      cmTheme,
      EditorView.domEventHandlers({
        contextmenu: (e) => {
          if (!onCtxRef.current) return false;
          e.preventDefault();
          onCtxRef.current(e.clientX, e.clientY);
          return true;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current(u.state.doc.toString());
      }),
    ];
    if (lineNumbers) exts.push(lineNumbersExt());

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions: exts }),
      parent: ref.current,
    });
    view.focus();
    onViewRef.current?.(view);
    return () => {
      onViewRef.current?.(null);
      view.destroy();
    };
    // value/lineNumbers değişince EditorScreen key ile yeniden oluşturur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="lo-cm lo-scroll" />;
}

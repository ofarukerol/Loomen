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
  ".cm-content": { caretColor: "var(--accent)", padding: "4px 0 200px", maxWidth: "760px" },
  // Canlı önizleme — başlık boyutları + wiki-link
  ".cm-h1": { fontSize: "1.9em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-h2": { fontSize: "1.55em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-h3": { fontSize: "1.3em", fontWeight: "700", lineHeight: "1.35" },
  ".cm-h4": { fontSize: "1.13em", fontWeight: "700" },
  ".cm-h5": { fontSize: "1.02em", fontWeight: "700" },
  ".cm-h6": { fontSize: "1em", fontWeight: "700", color: "var(--fg2)" },
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

export function CodeMirrorEditor({ value, onChange, lineNumbers }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Stale closure olmasın diye onChange'i ref'te tut.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
    return () => view.destroy();
    // value/lineNumbers değişince EditorScreen key ile yeniden oluşturur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="lo-cm lo-scroll" />;
}

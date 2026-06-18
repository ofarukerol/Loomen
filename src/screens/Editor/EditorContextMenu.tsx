import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Link2,
  ExternalLink,
  Paintbrush,
  Pilcrow,
  ListPlus,
  Bold,
  Italic,
  Strikethrough,
  Highlighter,
  Code,
  Code2,
  Eraser,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  AlignLeft,
  Table,
  Minus,
  MessageSquareQuote,
  Scissors,
  Copy,
  ClipboardPaste,
  TextSelect,
  ChevronRight,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
} from "lucide-react";
import type { EditorView } from "@codemirror/view";
import * as cmd from "./editorCommands";

interface Item {
  id: string;
  label?: string;
  icon?: ReactNode;
  run?: (v: EditorView) => void;
  sub?: Item[];
  sep?: boolean;
}

const HEAD_ICONS = [Heading1, Heading2, Heading3, Heading4, Heading5, Heading6];

export function EditorContextMenu({
  x,
  y,
  getView,
  onClose,
}: {
  x: number;
  y: number;
  getView: () => EditorView | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [openSub, setOpenSub] = useState<string | null>(null);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const act = (fn?: (v: EditorView) => void) => {
    const v = getView();
    if (v && fn) fn(v);
    onClose();
  };

  const ic = (Node: typeof Bold, c?: string) => <Node size={14} strokeWidth={1.9} color={c} />;

  const items: Item[] = [
    { id: "wlink", label: t("ctx.addLink"), icon: ic(Link2), run: cmd.wikilink },
    { id: "elink", label: t("ctx.addExternal"), icon: ic(ExternalLink), run: cmd.externalLink },
    { id: "s1", sep: true },
    {
      id: "fmt",
      label: t("ctx.format"),
      icon: ic(Paintbrush),
      sub: [
        { id: "b", label: t("fmt.bold"), icon: ic(Bold), run: cmd.bold },
        { id: "i", label: t("fmt.italic"), icon: ic(Italic), run: cmd.italic },
        { id: "st", label: t("fmt.strike"), icon: ic(Strikethrough), run: cmd.strike },
        { id: "hl", label: t("fmt.highlight"), icon: ic(Highlighter), run: cmd.highlight },
        { id: "sf1", sep: true },
        { id: "code", label: t("fmt.code"), icon: ic(Code), run: cmd.inlineCode },
        { id: "sf2", sep: true },
        { id: "clr", label: t("ctx.clearFormat"), icon: ic(Eraser), run: cmd.clearFormat },
      ],
    },
    {
      id: "para",
      label: t("ctx.paragraph"),
      icon: ic(Pilcrow),
      sub: [
        { id: "ul", label: t("ctx.bulletList"), icon: ic(List), run: cmd.bulletList },
        { id: "ol", label: t("ctx.numberedList"), icon: ic(ListOrdered), run: cmd.numberedList },
        { id: "cl", label: t("ctx.checklist"), icon: ic(ListChecks), run: cmd.checklist },
        { id: "sp1", sep: true },
        ...[1, 2, 3, 4, 5, 6].map((l) => ({
          id: "h" + l,
          label: t("ctx.heading", { n: l }),
          icon: ic(HEAD_ICONS[l - 1]),
          run: (v: EditorView) => cmd.heading(v, l),
        })),
        { id: "h0", label: t("ctx.noHeading"), icon: ic(AlignLeft), run: (v: EditorView) => cmd.heading(v, 0) },
        { id: "sp2", sep: true },
        { id: "q", label: t("fmt.quote"), icon: ic(Quote), run: cmd.quote },
      ],
    },
    {
      id: "ins",
      label: t("ctx.insert"),
      icon: ic(ListPlus),
      sub: [
        { id: "tbl", label: t("ctx.table"), icon: ic(Table), run: cmd.table },
        { id: "cal", label: t("ctx.callout"), icon: ic(MessageSquareQuote), run: cmd.callout },
        { id: "hr", label: t("ctx.hr"), icon: ic(Minus), run: cmd.hr },
        { id: "si", sep: true },
        { id: "cb", label: t("ctx.codeBlock"), icon: ic(Code2), run: cmd.codeBlock },
      ],
    },
    { id: "s2", sep: true },
    { id: "cut", label: t("ctx.cut"), icon: ic(Scissors), run: cmd.cut },
    { id: "copy", label: t("ctx.copy"), icon: ic(Copy), run: cmd.copy },
    { id: "paste", label: t("ctx.paste"), icon: ic(ClipboardPaste), run: cmd.paste },
    { id: "selall", label: t("ctx.selectAll"), icon: ic(TextSelect), run: cmd.selectAll },
  ];

  return (
    <div
      className="lo-ctxmenu lo-ctxmenu--editor"
      style={{ left: Math.min(x, window.innerWidth - 250), top: Math.min(y, window.innerHeight - 360) }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((it) =>
        it.sep ? (
          <div key={it.id} className="lo-ctxmenu__sep" />
        ) : it.sub ? (
          <div
            key={it.id}
            className="lo-ctxmenu__group"
            onMouseEnter={() => setOpenSub(it.id)}
            onMouseLeave={() => setOpenSub(null)}
          >
            <button className="lo-ctxmenu__item">
              <span className="lo-ctxmenu__ic">{it.icon}</span>
              {it.label}
              <ChevronRight size={13} strokeWidth={2} className="lo-ctxmenu__arrow" />
            </button>
            {openSub === it.id && (
              <div className="lo-ctxmenu lo-ctxmenu--sub">
                {it.sub.map((s) =>
                  s.sep ? (
                    <div key={s.id} className="lo-ctxmenu__sep" />
                  ) : (
                    <button key={s.id} className="lo-ctxmenu__item" onClick={() => act(s.run)}>
                      <span className="lo-ctxmenu__ic">{s.icon}</span>
                      {s.label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ) : (
          <button key={it.id} className="lo-ctxmenu__item" onClick={() => act(it.run)}>
            <span className="lo-ctxmenu__ic">{it.icon}</span>
            {it.label}
          </button>
        )
      )}
    </div>
  );
}

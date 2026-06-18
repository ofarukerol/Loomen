import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Bold,
  Italic,
  Strikethrough,
  Highlighter,
  Code,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Link2,
  Minus,
} from "lucide-react";
import type { EditorView } from "@codemirror/view";
import * as cmd from "./editorCommands";

/** Üst biçimlendirme araç çubuğu — seçime markdown uygular (formatı bozmaz). */
export function EditorToolbar({ getView }: { getView: () => EditorView | null }) {
  const { t } = useTranslation();
  const run = (fn: (v: EditorView) => void) => {
    const v = getView();
    if (v) fn(v);
  };
  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) => (
    <button className="lo-fmt__btn" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );

  return (
    <div className="lo-fmt">
      <Btn title={t("fmt.bold")} onClick={() => run(cmd.bold)}>
        <Bold size={15} strokeWidth={2.2} />
      </Btn>
      <Btn title={t("fmt.italic")} onClick={() => run(cmd.italic)}>
        <Italic size={15} strokeWidth={2.2} />
      </Btn>
      <Btn title={t("fmt.strike")} onClick={() => run(cmd.strike)}>
        <Strikethrough size={15} strokeWidth={2.2} />
      </Btn>
      <Btn title={t("fmt.highlight")} onClick={() => run(cmd.highlight)}>
        <Highlighter size={15} strokeWidth={2} />
      </Btn>
      <Btn title={t("fmt.code")} onClick={() => run(cmd.inlineCode)}>
        <Code size={16} strokeWidth={2} />
      </Btn>
      <span className="lo-fmt__sep" />
      <Btn title="H1" onClick={() => run((v) => cmd.heading(v, 1))}>
        <Heading1 size={17} strokeWidth={2} />
      </Btn>
      <Btn title="H2" onClick={() => run((v) => cmd.heading(v, 2))}>
        <Heading2 size={17} strokeWidth={2} />
      </Btn>
      <span className="lo-fmt__sep" />
      <Btn title={t("fmt.bullet")} onClick={() => run(cmd.bulletList)}>
        <List size={16} strokeWidth={2} />
      </Btn>
      <Btn title={t("fmt.numbered")} onClick={() => run(cmd.numberedList)}>
        <ListOrdered size={16} strokeWidth={2} />
      </Btn>
      <Btn title={t("fmt.checklist")} onClick={() => run(cmd.checklist)}>
        <ListChecks size={16} strokeWidth={2} />
      </Btn>
      <Btn title={t("fmt.quote")} onClick={() => run(cmd.quote)}>
        <Quote size={15} strokeWidth={2} />
      </Btn>
      <span className="lo-fmt__sep" />
      <Btn title={t("fmt.link")} onClick={() => run(cmd.wikilink)}>
        <Link2 size={15} strokeWidth={2} />
      </Btn>
      <Btn title={t("fmt.hr")} onClick={() => run(cmd.hr)}>
        <Minus size={17} strokeWidth={2} />
      </Btn>
    </div>
  );
}

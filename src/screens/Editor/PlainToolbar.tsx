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
import { applyFormat, type FmtKind } from "./plainFormat";

/** Düz metin (textarea) editörü için biçimlendirme araç çubuğu — seçime markdown uygular.
 *  CodeMirror'lu EditorToolbar'ın textarea karşılığı; aynı görünüm (lo-fmt). */
export function PlainToolbar({
  getEl,
  onChange,
}: {
  getEl: () => HTMLTextAreaElement | null;
  onChange: (text: string) => void;
}) {
  const { t } = useTranslation();

  const run = (kind: FmtKind) => {
    const el = getEl();
    if (!el) return;
    const { value, selStart, selEnd } = applyFormat(el, kind);
    onChange(value);
    // Kontrollü textarea: value draft'tan güncellenir; seçimi bir sonraki frame'de geri kur.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  const Btn = ({ title, kind, children }: { title: string; kind: FmtKind; children: ReactNode }) => (
    <button className="lo-fmt__btn" title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => run(kind)}>
      {children}
    </button>
  );

  return (
    <div className="lo-fmt">
      <Btn title={t("fmt.bold")} kind="bold">
        <Bold size={15} strokeWidth={2.2} />
      </Btn>
      <Btn title={t("fmt.italic")} kind="italic">
        <Italic size={15} strokeWidth={2.2} />
      </Btn>
      <Btn title={t("fmt.strike")} kind="strike">
        <Strikethrough size={15} strokeWidth={2.2} />
      </Btn>
      <Btn title={t("fmt.highlight")} kind="highlight">
        <Highlighter size={15} strokeWidth={2} />
      </Btn>
      <Btn title={t("fmt.code")} kind="code">
        <Code size={16} strokeWidth={2} />
      </Btn>
      <span className="lo-fmt__sep" />
      <Btn title="H1" kind="h1">
        <Heading1 size={17} strokeWidth={2} />
      </Btn>
      <Btn title="H2" kind="h2">
        <Heading2 size={17} strokeWidth={2} />
      </Btn>
      <span className="lo-fmt__sep" />
      <Btn title={t("fmt.bullet")} kind="bullet">
        <List size={16} strokeWidth={2} />
      </Btn>
      <Btn title={t("fmt.numbered")} kind="numbered">
        <ListOrdered size={16} strokeWidth={2} />
      </Btn>
      <Btn title={t("fmt.checklist")} kind="checklist">
        <ListChecks size={16} strokeWidth={2} />
      </Btn>
      <Btn title={t("fmt.quote")} kind="quote">
        <Quote size={15} strokeWidth={2} />
      </Btn>
      <span className="lo-fmt__sep" />
      <Btn title={t("fmt.link")} kind="link">
        <Link2 size={15} strokeWidth={2} />
      </Btn>
      <Btn title={t("fmt.hr")} kind="hr">
        <Minus size={17} strokeWidth={2} />
      </Btn>
    </div>
  );
}

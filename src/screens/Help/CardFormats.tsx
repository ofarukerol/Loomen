import { Fragment } from "react";
import { ArrowRight } from "lucide-react";

export interface FormatCard {
  kind?: string;
  label?: string;
  front: string;
  back?: string;
}
export interface CardFormat {
  name: string;
  desc: string;
  write: string;
  file?: string;
  cards: FormatCard[];
}
export interface CardFormatsText {
  labels: { write: string; card: string; front: string; back: string; read: string };
  formats: CardFormat[];
}

/** `[…]` boşluk kutusu olarak çizilir. */
function Marked({ text }: { text: string }) {
  const parts = text.split(/(\[…\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p === "[…]") return <span key={i} className="lo-help__blank" aria-hidden>…</span>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

function FlashCard({ card, labels }: { card: FormatCard; labels: CardFormatsText["labels"] }) {
  const isRead = card.kind === "read";
  return (
    <div className="lo-help__fcard">
      {card.label && <span className="lo-help__fcardtag">{card.label}</span>}
      <div className="lo-help__fside">
        <span className="lo-help__fsidelabel">{labels.front}</span>
        <div className="lo-help__fsidetext"><Marked text={card.front} /></div>
      </div>
      {isRead ? (
        <span className="lo-help__fread">{labels.read}</span>
      ) : (
        <div className="lo-help__fside lo-help__fside--back">
          <span className="lo-help__fsidelabel">{labels.back}</span>
          <div className="lo-help__fsidetext"><Marked text={card.back ?? ""} /></div>
        </div>
      )}
    </div>
  );
}

/** "Kart nasıl yazılır": beş biçimin her biri için not satırı ve ortaya çıkan kartlar. */
export function CardFormats({ data }: { data: CardFormatsText }) {
  const { labels, formats } = data;
  return (
    <div className="lo-help__fmts">
      {formats.map((f, i) => (
        <div className="lo-help__fmt" key={i}>
          <div className="lo-help__fmthead">
            <span className="lo-help__fmtnum">{i + 1}</span>
            <span className="lo-help__fmtname">{f.name}</span>
          </div>
          <p className="lo-help__fmtdesc">{f.desc}</p>
          <div className="lo-help__fmtrow">
            <div className="lo-help__write">
              <span className="lo-help__writelabel">{labels.write}</span>
              {f.file && <span className="lo-help__writefile" dir="ltr">{f.file}</span>}
              <div className="lo-help__writecode">
                {f.write.split("\n").map((line, j) => (
                  <div key={j} dir="auto" className="lo-help__writeline">{line || " "}</div>
                ))}
              </div>
            </div>
            <ArrowRight size={18} strokeWidth={2} className="lo-help__fmtarrow" aria-hidden="true" />
            <div className="lo-help__fcards">
              {f.cards.map((c, j) => (
                <FlashCard key={j} card={c} labels={labels} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Snowflake, Clock, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { humanInterval, schedule, type Grade } from "../../core/srs";
import { Markdown } from "../Editor/Markdown";

const GRADES: Grade[] = [1, 2, 3, 4];

/** Bir tekrar oturumu: kart yüzü → cevap → dört düğme. */
export function ReviewSession() {
  const { t } = useTranslation();
  const queue = useAppStore((s) => s.srsQueue);
  const index = useAppStore((s) => s.srsIndex);
  const show = useAppStore((s) => s.srsShow);
  const states = useAppStore((s) => s.srsStates);
  const cfg = useAppStore((s) => s.srsSettings);
  const answered = useAppStore((s) => s.srsAnswered);
  const reveal = useAppStore((s) => s.srsReveal);
  const answer = useAppStore((s) => s.srsAnswer);
  const freeze = useAppStore((s) => s.srsFreeze);
  const postpone = useAppStore((s) => s.srsPostpone);
  const end = useAppStore((s) => s.srsEndSession);
  const openNote = useAppStore((s) => s.openNote);

  const item = queue[index];
  const state = item ? states[item.card.id] ?? item.state : null;

  // Her düğmenin altında "buna basarsan ne olur" yazar — Anki'deki en faydalı ayrıntı.
  const previews = useMemo(() => {
    if (!state) return null;
    const now = new Date();
    return GRADES.map((g) => humanInterval(schedule(state, g, cfg, now).minutes));
  }, [state, cfg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!item) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (show) void answer(3);
        else reveal();
      } else if (show && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void answer(Number(e.key) as Grade);
      } else if (e.key.toLowerCase() === "e") {
        openNote(item.card.file);
      } else if (e.key === "Escape") {
        end();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, show, answer, reveal, openNote, end]);

  if (!item || !state) {
    return (
      <div className="lo-rev__done">
        <div className="lo-rev__donenum">{answered}</div>
        <div className="lo-rev__donetitle">{t("review.sessionDone")}</div>
        <div className="lo-rev__donesub">{t("review.sessionDoneSub")}</div>
        <button className="lo-btn lo-btn--primary" onClick={end}>
          {t("review.backToStart")}
        </button>
      </div>
    );
  }

  const total = queue.length;
  const pct = Math.round((index / Math.max(1, total)) * 100);
  const isNote = item.card.kind === "note";

  return (
    <div className="lo-rev__session">
      <div className="lo-rev__top">
        <div className="lo-rev__bar">
          <div className="lo-rev__barfill" style={{ width: `${pct}%` }} />
        </div>
        <div className="lo-rev__count">
          {index + 1} / {total}
        </div>
        <button className="lo-rev__iconbtn" title={t("review.close")} onClick={end}>
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="lo-rev__cardwrap lo-scroll">
        <div className={"lo-rev__card" + (isNote ? " is-note" : "")}>
          <div className="lo-rev__face">
            {isNote ? (
              <>
                <div className="lo-rev__notetitle">{item.card.question}</div>
                <div className="lo-rev__notebody">
                  <Markdown content={item.card.answer} onLink={() => {}} onToggleTask={() => {}} />
                </div>
              </>
            ) : (
              <Markdown content={item.card.question} onLink={() => {}} onToggleTask={() => {}} />
            )}
          </div>

          {show && !isNote && (
            <>
              <div className="lo-rev__sep" />
              <div className="lo-rev__face lo-rev__face--answer">
                <Markdown content={item.card.answer} onLink={() => {}} onToggleTask={() => {}} />
              </div>
            </>
          )}
        </div>

        <div className="lo-rev__meta">
          <button className="lo-rev__metabtn" onClick={() => openNote(item.card.file)} title={t("review.openNote")}>
            <FileText size={13} strokeWidth={2} />
            {item.card.file.replace(/\.md$/i, "")}
          </button>
          <button className="lo-rev__metabtn" onClick={() => void postpone(item.card.id)}>
            <Clock size={13} strokeWidth={2} />
            {t("review.postpone")}
          </button>
          <button className="lo-rev__metabtn" onClick={() => void freeze(item.card.id)}>
            <Snowflake size={13} strokeWidth={2} />
            {t("review.freeze")}
          </button>
          {state.leech && <span className="lo-rev__leech">{t("review.leech")}</span>}
        </div>
      </div>

      <div className="lo-rev__actions">
        {!show ? (
          <button className="lo-rev__reveal" onClick={reveal}>
            {isNote ? t("review.readDone") : t("review.reveal")}
            <span className="lo-rev__key">{t("review.spaceKey")}</span>
          </button>
        ) : (
          <div className="lo-rev__grades">
            {GRADES.map((g, i) => (
              <button key={g} className={`lo-rev__grade is-g${g}`} onClick={() => void answer(g)}>
                <span className="lo-rev__gradelabel">{t(`review.grade${g}`)}</span>
                <span className="lo-rev__gradeivl">{previews?.[i]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

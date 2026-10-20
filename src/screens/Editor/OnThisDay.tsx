import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { History, ChevronDown, Check } from "lucide-react";
import { format } from "date-fns";
import { tr, enUS, ar } from "date-fns/locale";
import { useAppStore } from "../../store/useAppStore";
import { findOnThisDay, summarizeDay } from "../../core/vault/onThisDay";
import { noteDateOf } from "../../core/vault/planDate";

const LOCALES: Record<string, typeof tr> = { tr, en: enUS, ar };

/**
 * "Geçmiş yıllarda bugün" (LOM-52): açık günlük notun önceki yıllardaki aynı gün notları, yeniden
 * eskiye zaman çizelgesi. YALNIZ OKUR — hiçbir notu yazmaz; tıklayınca notu açar.
 */
export function OnThisDay({ noteName }: { noteName: string }) {
  const { t, i18n } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const contents = useAppStore((s) => s.noteContents);
  const activeNote = useAppStore((s) => s.activeNote);
  const collapsed = useAppStore((s) => s.onThisDayCollapsed);
  const toggle = useAppStore((s) => s.toggleOnThisDay);
  const openNote = useAppStore((s) => s.openNote);

  const items = useMemo(() => {
    if (!activeNote || !noteDateOf(activeNote)) return [];
    return findOnThisDay(
      notes.map((n) => n.path),
      activeNote
    ).map((e) => ({ ...e, summary: summarizeDay(contents[e.path] ?? "") }));
  }, [notes, contents, activeNote]);

  if (!noteDateOf(noteName + ".md") || items.length === 0) return null;
  const locale = LOCALES[i18n.language] ?? tr;
  const dayLabel = (iso: string) =>
    format(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))), "EEEE", { locale });
  const go = (path: string) => void openNote(path);
  const onKey = (e: KeyboardEvent, path: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go(path);
    }
  };

  return (
    <section className={"lo-otd" + (collapsed ? " is-collapsed" : "")} aria-label={t("otd.title")}>
      <div className="lo-otd__head">
        <button type="button" className="lo-otd__toggle" onClick={toggle} aria-expanded={!collapsed}>
          <History size={15} strokeWidth={2.2} className="lo-otd__icon" />
          <span className="lo-otd__title">{t("otd.title")}</span>
        </button>
        <div className="lo-otd__chips">
          {items.map((it) => (
            <button
              key={it.path}
              type="button"
              className="lo-otd__chip"
              title={t("otd.openNote", { date: it.iso })}
              onClick={() => go(it.path)}
            >
              {it.year}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="lo-otd__chev"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={t("otd.title")}
        >
          <ChevronDown size={16} strokeWidth={2.2} />
        </button>
      </div>

      <div className="lo-otd__panel" aria-hidden={collapsed}>
        <div className="lo-otd__panelin">
          <ol className="lo-otd__list lo-scroll">
            {items.map((it, i) => {
              const s = it.summary;
              return (
                <li key={it.path} className={"lo-otd__item" + (i === 0 ? " is-newest" : "")}>
                  <span className="lo-otd__dot" aria-hidden />
                  <div
                    className="lo-otd__card"
                    role="link"
                    tabIndex={collapsed ? -1 : 0}
                    aria-label={t("otd.openNote", { date: it.iso })}
                    onClick={() => go(it.path)}
                    onKeyDown={(e) => onKey(e, it.path)}
                  >
                    <div className="lo-otd__when">
                      <span className="lo-otd__ago">{t("otd.yearsAgo", { count: it.yearsAgo })}</span>
                      <span className="lo-otd__sep">·</span>
                      <span className="lo-otd__date">
                        {it.year}, {dayLabel(it.iso)}
                      </span>
                    </div>
                    {s.empty && <div className="lo-otd__empty">{t("otd.empty")}</div>}
                    {s.sections.map((sec, k) => (
                      <div key={k} className="lo-otd__sec">
                        <div className="lo-otd__sechead">
                          {sec.emoji && <span className="lo-otd__emoji">{sec.emoji}</span>}
                          <span>{sec.title || t("otd.notes")}</span>
                        </div>
                        {sec.lines.map((l, j) => (
                          <div key={j} className="lo-otd__line">
                            {l}
                          </div>
                        ))}
                        {sec.more > 0 && <div className="lo-otd__more">{t("otd.more", { count: sec.more })}</div>}
                      </div>
                    ))}
                    {s.done.length > 0 && (
                      <ul className="lo-otd__done">
                        {s.done.map((d, j) => (
                          <li key={j}>
                            <Check size={13} strokeWidth={2.6} />
                            <span>{d}</span>
                          </li>
                        ))}
                        {s.doneMore > 0 && <li className="lo-otd__more">{t("otd.more", { count: s.doneMore })}</li>}
                      </ul>
                    )}
                    {s.openCount > 0 && <span className="lo-otd__open">{t("otd.open", { count: s.openCount })}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

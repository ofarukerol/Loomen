import { useTranslation } from "react-i18next";
import { Pencil, FilePlus } from "lucide-react";
import { format, getISOWeek } from "date-fns";
import { tr } from "date-fns/locale";
import { useAppStore } from "../../store/useAppStore";
import { todayDailyPath } from "../../core/vault";
import { Markdown } from "../Editor/Markdown";

interface Section {
  title: string;
  body: string;
}

/** Günlük notu bölümlere ayır (## başlıklar); başlık/çizgi/footer atlanır. */
function parseJournal(content: string): Section[] {
  const out: Section[] = [];
  let cur: { title: string; body: string[] } | null = null;
  for (const line of content.split("\n")) {
    if (/^#\s/.test(line)) continue;
    if (/^---\s*$/.test(line)) continue;
    if (/#günlük/.test(line)) continue;
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      if (cur) out.push({ title: cur.title, body: cur.body.join("\n").trim() });
      cur = { title: h[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) out.push({ title: cur.title, body: cur.body.join("\n").trim() });
  return out;
}

const hasContent = (s: string) => s.replace(/[-*\s]/g, "") !== "";

/** Orta gövde varsayılanı — günün planı/notu (journal, görevsiz). Minimal & modern. */
export function DailyPlanView() {
  const { t } = useTranslation();
  const openNote = useAppStore((s) => s.openNote);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const createTodayNote = useAppStore((s) => s.createTodayNote);
  const path = todayDailyPath();
  const content = useAppStore((s) => s.noteContents[path]);

  const now = new Date();
  const weekday = format(now, "EEEE", { locale: tr });
  const dateStr = format(now, "d MMMM yyyy", { locale: tr });
  const week = getISOWeek(now);
  const sections = content != null ? parseJournal(content) : [];

  return (
    <div className="lo-planner__center">
      <div className="lo-dayplan__toolbar">
        <div style={{ flex: 1 }} />
        {content != null && (
          <button className="lo-focusx__close" onClick={() => openNote(path, true)}>
            <Pencil size={14} strokeWidth={2} />
            {t("editor.edit")}
          </button>
        )}
      </div>

      <div className="lo-dayplan__body lo-scroll">
        {content == null ? (
          <div className="lo-dayplan__empty">
            <p>{t("planner.noDayNote")}</p>
            <button className="lo-dayplan__create" onClick={() => void createTodayNote()}>
              <FilePlus size={15} strokeWidth={2} />
              {t("planner.createDayNote")}
            </button>
          </div>
        ) : (
          <div className="lo-dn">
            <header className="lo-dn__header">
              <div className="lo-dn__weekday">{weekday}</div>
              <div className="lo-dn__date">
                {dateStr} · {t("planner.week", { n: week })}
              </div>
            </header>

            {sections.map((s) => (
              <section className="lo-dn__section" key={s.title}>
                <h2 className="lo-dn__sectitle">{s.title}</h2>
                {hasContent(s.body) ? (
                  <Markdown
                    content={s.body}
                    onLink={(name) => openNote(name)}
                    onToggleTask={(line) => void toggleTask(`${path}:${line}`)}
                  />
                ) : (
                  <div className="lo-dn__empty">—</div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

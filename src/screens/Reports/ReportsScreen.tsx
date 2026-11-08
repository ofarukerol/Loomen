import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Timer, Flame, CalendarDays, Hourglass, BookOpen, BookCheck, Clock } from "lucide-react";
import { format, subDays, startOfWeek, parseISO } from "date-fns";
import { tr, enUS, ar } from "date-fns/locale";
import { useAppStore } from "../../store/useAppStore";
import { summarizeStats } from "../../core/library/stats";
import { dayKey } from "../../core/habit";

const DAYS = 7;

const LOCALES: Record<string, typeof tr> = { tr, en: enUS, ar };

/** Saniyeyi "1s 5dk" / "12dk" yazısına çevir (dakikaya yuvarlanır). */
function useDuration() {
  const { t } = useTranslation();
  return (seconds: number) => {
    const m = Math.round(seconds / 60);
    return m >= 60 ? t("reports.hoursMinutes", { h: Math.floor(m / 60), m: m % 60 }) : t("reports.minutes", { m });
  };
}

/**
 * Okuma bölümü (LOM-87): okuyucuda bugün ilk kez okunan sayfalar ve aktif okuma süresi (bu cihaz),
 * biten kitap sayısı (kasadaki kayıtlardan). Kütüphane kapalıysa çizilmez.
 */
function ReadingSection() {
  const { t, i18n } = useTranslation();
  const locale = LOCALES[i18n.language] ?? tr;
  const stats = useAppStore((s) => s.readingStats);
  const books = useAppStore((s) => s.books);
  const loaded = useAppStore((s) => s.booksLoaded);
  const load = useAppStore((s) => s.libraryLoad);
  const duration = useDuration();

  useEffect(() => {
    if (!loaded) void load().catch((e) => console.error("[reports] kütüphane okunamadı:", e));
  }, [loaded, load]);

  const sum = useMemo(() => summarizeStats(stats, books, dayKey(new Date())), [stats, books]);
  const peak = Math.max(1, ...sum.last7.map((d) => d.pages));

  const cards = [
    { icon: <BookOpen size={16} strokeWidth={2} />, val: sum.today.pages, label: t("reports.reading.pagesToday"), accent: true },
    { icon: <CalendarDays size={16} strokeWidth={2} />, val: sum.week.pages, label: t("reports.reading.pagesWeek") },
    { icon: <Clock size={16} strokeWidth={2} />, val: duration(sum.week.seconds), label: t("reports.reading.timeWeek") },
    { icon: <Hourglass size={16} strokeWidth={2} />, val: duration(sum.total.seconds), label: t("reports.reading.timeTotal") },
    { icon: <BookCheck size={16} strokeWidth={2} />, val: sum.finishedBooks, label: t("reports.reading.finished") },
  ];

  return (
    <>
      <div className="lo-reports__section">{t("reports.reading.title")}</div>
      <div className="lo-reports__stats lo-reports__stats--reading">
        {cards.map((s) => (
          <div className="lo-card lo-rstat" key={s.label}>
            <div className={"lo-rstat__icon" + (s.accent ? " is-accent" : "")}>{s.icon}</div>
            <div className="lo-rstat__val">{s.val}</div>
            <div className="lo-rstat__label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="lo-card lo-rchart">
        <div className="lo-rchart__head">{t("reports.reading.last7")}</div>
        {sum.empty ? (
          <div className="lo-rchart__empty">{t("reports.reading.empty")}</div>
        ) : (
          <div className="lo-rchart__bars">
            {sum.last7.map((d) => (
              <div
                className="lo-rbar"
                key={d.day}
                title={t("reports.reading.dayTip", { pages: d.pages, time: duration(d.seconds) })}
              >
                <div className="lo-rbar__count">{d.pages || ""}</div>
                <div className="lo-rbar__track">
                  <div className="lo-rbar__fill" style={{ height: `${(d.pages / peak) * 100}%` }} />
                </div>
                <div className="lo-rbar__label">{format(parseISO(d.day), "EEEEEE", { locale })}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const locale = LOCALES[i18n.language] ?? tr;
  const history = useAppStore((s) => s.pomoHistory);
  const focusMin = useAppStore((s) => s.pomo.focusMin);
  const libraryOn = useAppStore((s) => s.features.library);

  const { todayCount, weekCount, total, last7 } = useMemo(() => {
    const now = new Date();
    const todayKey = format(now, "yyyy-MM-dd");
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });

    let total = 0;
    let weekCount = 0;
    for (const [day, n] of Object.entries(history)) {
      total += n;
      if (parseISO(day) >= weekStart) weekCount += n;
    }

    const last7 = Array.from({ length: DAYS }, (_, i) => {
      const d = subDays(now, DAYS - 1 - i);
      const key = format(d, "yyyy-MM-dd");
      return { key, label: format(d, "EEEEEE", { locale }), count: history[key] ?? 0 };
    });

    return { todayCount: history[todayKey] ?? 0, weekCount, total, last7 };
  }, [history, locale]);

  const peak = Math.max(1, ...last7.map((d) => d.count));
  const totalMin = total * focusMin;
  const focusHours =
    totalMin >= 60
      ? t("reports.hoursMinutes", { h: Math.floor(totalMin / 60), m: totalMin % 60 })
      : t("reports.minutes", { m: totalMin });

  const stats = [
    { icon: <Flame size={16} strokeWidth={2} />, val: todayCount, label: t("reports.today"), accent: true },
    { icon: <CalendarDays size={16} strokeWidth={2} />, val: weekCount, label: t("reports.thisWeek") },
    { icon: <Timer size={16} strokeWidth={2} />, val: total, label: t("reports.total") },
    { icon: <Hourglass size={16} strokeWidth={2} />, val: focusHours, label: t("reports.focusTime") },
  ];

  return (
    <div className="lo-reports lo-scroll">
      <div className="lo-reports__inner">
        <h1 className="lo-set__title">{t("reports.title")}</h1>

        <div className="lo-reports__section">{t("reports.pomodoro")}</div>

        <div className="lo-reports__stats">
          {stats.map((s) => (
            <div className="lo-card lo-rstat" key={s.label}>
              <div className={"lo-rstat__icon" + (s.accent ? " is-accent" : "")}>{s.icon}</div>
              <div className="lo-rstat__val">{s.val}</div>
              <div className="lo-rstat__label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="lo-card lo-rchart">
          <div className="lo-rchart__head">{t("reports.last7")}</div>
          {total === 0 ? (
            <div className="lo-rchart__empty">{t("reports.empty")}</div>
          ) : (
            <div className="lo-rchart__bars">
              {last7.map((d) => (
                <div className="lo-rbar" key={d.key}>
                  <div className="lo-rbar__count">{d.count || ""}</div>
                  <div className="lo-rbar__track">
                    <div
                      className="lo-rbar__fill"
                      style={{ height: `${(d.count / peak) * 100}%` }}
                    />
                  </div>
                  <div className="lo-rbar__label">{d.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {libraryOn && <ReadingSection />}
      </div>
    </div>
  );
}

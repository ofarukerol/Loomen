import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Timer, Flame, CalendarDays, Hourglass } from "lucide-react";
import { format, subDays, startOfWeek, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { useAppStore } from "../../store/useAppStore";

const DAYS = 7;

export function ReportsScreen() {
  const { t } = useTranslation();
  const history = useAppStore((s) => s.pomoHistory);
  const focusMin = useAppStore((s) => s.pomo.focusMin);

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
      return { key, label: format(d, "EEEEEE", { locale: tr }), count: history[key] ?? 0 };
    });

    return { todayCount: history[todayKey] ?? 0, weekCount, total, last7 };
  }, [history]);

  const peak = Math.max(1, ...last7.map((d) => d.count));
  const totalMin = total * focusMin;
  const focusHours = totalMin >= 60 ? `${Math.floor(totalMin / 60)}s ${totalMin % 60}dk` : `${totalMin}dk`;

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
      </div>
    </div>
  );
}

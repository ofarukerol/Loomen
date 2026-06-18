import { useTranslation } from "react-i18next";
import { CalendarDays, Hash } from "lucide-react";
import { format, getISOWeek } from "date-fns";
import { tr, enUS, ar } from "date-fns/locale";

const LOCALES: Record<string, typeof tr> = { tr, en: enUS, ar };

/** Günlük not için modern başlık — dosya adından türetilir (gün + tarih + hafta). */
export function DailyHeader({ noteName }: { noteName: string }) {
  const { t, i18n } = useTranslation();
  const m = noteName.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return null;

  const locale = LOCALES[i18n.language] ?? tr;
  const day = format(date, "EEEE", { locale });
  const dateStr = format(date, "d MMMM yyyy", { locale });
  const week = getISOWeek(date);

  return (
    <div className="lo-dayhdr">
      <div className="lo-dayhdr__day">{day}</div>
      <div className="lo-dayhdr__meta">
        <span className="lo-dayhdr__chip">
          <CalendarDays size={14} strokeWidth={2} />
          {dateStr}
        </span>
        <span className="lo-dayhdr__chip">
          <Hash size={13} strokeWidth={2.2} />
          {t("planner.week", { n: week })}
        </span>
      </div>
    </div>
  );
}

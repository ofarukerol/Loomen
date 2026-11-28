import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight, Hash } from "lucide-react";
import { format, getISOWeek } from "date-fns";
import { tr, enUS, ar } from "date-fns/locale";
import { useAppStore } from "../../store/useAppStore";
import { localISO } from "../../core/vault/dayNav";

const LOCALES: Record<string, typeof tr> = { tr, en: enUS, ar };

const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/** Günlük not için modern başlık — dosya adından türetilir (gün + tarih + hafta) ve gün gün gezdirir. */
export function DailyHeader({ noteName }: { noteName: string }) {
  const { t, i18n } = useTranslation();
  const stepDay = useAppStore((s) => s.stepDay);
  const replaceWithDay = useAppStore((s) => s.replaceWithDay);
  const m = noteName.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  const valid = !!date && !Number.isNaN(date.getTime());
  const rtl = i18n.dir(i18n.language) === "rtl";

  // Ctrl/⌘+Alt+←/→: önceki/sonraki gün. Alt+ok editörde kelime/satır taşıma olduğu için Mod+Alt
  // seçildi; editör tuşu işlediyse (defaultPrevented) ya da yazı alanındaysak karışmaz.
  useEffect(() => {
    if (!valid) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || !e.altKey || e.shiftKey) return;
      if (!(isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      e.preventDefault();
      // RTL'de görsel "sol" sonraki gündür: ok yönü ekrandaki chevron ile eşleşir.
      const back = (e.key === "ArrowLeft") !== rtl;
      void stepDay(back ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [valid, rtl, stepDay]);

  if (!valid || !date) return null;

  const locale = LOCALES[i18n.language] ?? tr;
  const day = format(date, "EEEE", { locale });
  const dateStr = format(date, "d MMMM yyyy", { locale });
  const week = getISOWeek(date);
  const isToday = localISO(date) === localISO(new Date());

  const mod = isMac ? "⌘⌥" : "Ctrl+Alt+";
  const prevKey = `${mod}${rtl ? "→" : "←"}`;
  const nextKey = `${mod}${rtl ? "←" : "→"}`;
  const prevTip = t("editor.prevDay", { key: prevKey });
  const nextTip = t("editor.nextDay", { key: nextKey });

  return (
    <div className="lo-dayhdr">
      <div className="lo-dayhdr__day">{day}</div>
      <div className="lo-dayhdr__meta">
        <div className="lo-dayhdr__nav" role="group" aria-label={t("editor.dayNav")}>
          <button type="button" className="lo-dayhdr__navbtn" onClick={() => void stepDay(-1)} title={prevTip} aria-label={prevTip}>
            <ChevronLeft size={16} strokeWidth={2.2} />
          </button>
          <span className="lo-dayhdr__chip lo-dayhdr__date" aria-live="polite">
            <CalendarDays size={14} strokeWidth={2} />
            {dateStr}
          </span>
          <button type="button" className="lo-dayhdr__navbtn" onClick={() => void stepDay(1)} title={nextTip} aria-label={nextTip}>
            <ChevronRight size={16} strokeWidth={2.2} />
          </button>
        </div>
        <span className="lo-dayhdr__chip">
          <Hash size={13} strokeWidth={2.2} />
          {t("planner.week", { n: week })}
        </span>
        {!isToday && (
          <button
            type="button"
            className="lo-dayhdr__today"
            onClick={() => void replaceWithDay(new Date())}
            title={t("editor.backToToday")}
            aria-label={t("editor.backToToday")}
          >
            {t("planner.today")}
          </button>
        )}
      </div>
    </div>
  );
}

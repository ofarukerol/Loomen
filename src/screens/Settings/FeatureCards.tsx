// Ayarlar üstündeki özellik kartları (LOM-82): Yedekleme, Takvim, Tekrar, Asistan, Alışkanlık Takibi,
// Kütüphane (LOM-83).
//
// Her kartta ad, kısa açıklama, durum ve açma/kapama düğmesi. Kapalı özelliğin ayar bölümü
// aşağıda çizilmez; kapatmak bağlantıyı, hesabı ya da kasa dosyalarını silmez.
// Tekrar ayarı okunmadan (yükleniyor/okunamadı) düğme kilitli: kişinin ayar dosyası ezilmesin (LOM-71).
import { useTranslation } from "react-i18next";
import { BookMarked, CalendarDays, Github, Repeat2, Sparkles, Sprout, type LucideIcon } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { isTauri } from "../../core/vault";
import { activeHabits } from "../../core/habit";
import { FEATURE_IDS, isFeatureOn, type FeatureId } from "../../core/settings/features";
import { useToday } from "../Habits/habitUi";

const ICONS: Record<FeatureId, LucideIcon> = {
  github: Github,
  calendar: CalendarDays,
  review: Repeat2,
  assistant: Sparkles,
  habits: Sprout,
  library: BookMarked,
};

export function FeatureCards() {
  const { t } = useTranslation();
  const features = useAppStore((s) => s.features);
  const srsEnabled = useAppStore((s) => s.srsSettings.enabled);
  const srsStatus = useAppStore((s) => s.srsSettingsStatus);
  const srsRetry = useAppStore((s) => s.srsRetrySettings);
  const srsCards = useAppStore((s) => s.srsCards.length);
  const aiEnabled = useAppStore((s) => s.aiEnabled);
  const aiProviders = useAppStore((s) => s.aiProviders.length);
  const ghToken = useAppStore((s) => s.ghToken);
  const ghUser = useAppStore((s) => s.ghUser);
  const gcalTokens = useAppStore((s) => s.gcalTokens);
  const gcalUser = useAppStore((s) => s.gcalUser);
  const gcalCalendarName = useAppStore((s) => s.gcalCalendarName);
  const habits = useAppStore((s) => s.habits);
  const habitsLoaded = useAppStore((s) => s.habitsLoaded);
  const books = useAppStore((s) => s.books.length);
  const booksLoaded = useAppStore((s) => s.booksLoaded);
  const setOn = useAppStore((s) => s.setFeatureOn);
  const today = useToday();

  const status = (id: FeatureId): string => {
    switch (id) {
      case "github":
        return ghToken
          ? ghUser
            ? t("settings.features.connectedAs", { name: "@" + ghUser.login })
            : t("settings.features.connected")
          : t("settings.features.notConnected");
      case "calendar":
        if (!gcalTokens) return t("settings.features.notConnected");
        return t("settings.features.connectedAs", {
          name: gcalUser?.email || (gcalCalendarName && gcalCalendarName !== "primary" ? gcalCalendarName : "Google"),
        });
      case "review":
        if (srsStatus === "loading") return t("settings.features.loading");
        if (srsStatus === "error") return t("settings.features.readError");
        return t("settings.features.cards", { n: srsCards });
      case "assistant":
        return isTauri() ? t("settings.features.providers", { n: aiProviders }) : t("settings.features.appOnly");
      case "habits":
        return t("settings.features.habitsCount", { n: habitsLoaded ? activeHabits(habits, today).length : 0 });
      case "library":
        return t("settings.features.booksCount", { n: booksLoaded ? books : 0 });
    }
  };

  return (
    <>
      <div className="lo-set__section">{t("settings.features.title")}</div>
      <div className="lo-set__featsub">{t("settings.features.sub")}</div>
      <div className="lo-set__feats">
        {FEATURE_IDS.map((id) => {
          const Icon = ICONS[id];
          const on = isFeatureOn(id, { features, srsEnabled, aiEnabled });
          // Tekrar ayarı okunmadıysa açık/kapalı bilinmiyor: düğme kilitli, durum gösterilir (LOM-71).
          const locked = id === "review" && srsStatus !== "ready";
          const name = t(`settings.features.${id}.name`);
          return (
            <div
              key={id}
              className={"lo-card lo-feat" + (on && !locked ? "" : " is-off")}
              data-feature={id}
            >
              <div className="lo-feat__top">
                <span className="lo-feat__icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                <button
                  type="button"
                  className={"lo-switch" + (on && !locked ? " is-on" : "")}
                  role="switch"
                  aria-checked={on && !locked}
                  aria-label={name}
                  title={locked ? undefined : on ? t("settings.features.on") : t("settings.features.off")}
                  disabled={locked}
                  onClick={() => setOn(id, !on)}
                >
                  <span className="lo-switch__knob" />
                </button>
              </div>
              <div className="lo-feat__name">{name}</div>
              <div className="lo-feat__desc">{t(`settings.features.${id}.desc`)}</div>
              <div className={"lo-feat__status" + (locked && srsStatus === "error" ? " is-err" : "")}>
                <span className="lo-feat__dot" />
                <span>{status(id)}</span>
                {locked && srsStatus === "error" && (
                  <button type="button" className="lo-feat__retry" onClick={() => void srsRetry()}>
                    {t("settings.features.retry")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

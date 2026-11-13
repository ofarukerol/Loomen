// Modüller sayfasının ortak arayüz bilgisi (LOM-112). Eski Ayarlar özellik kartlarındaki (LOM-82)
// simge eşlemesi ve durum metni buraya taşındı; metinler `settings.features.*` anahtarlarından okunur.
//
// Tekrar ayarı okunmadan (yükleniyor/okunamadı) modül kilitli: kişinin ayar dosyası ezilmesin (LOM-71).
import { useTranslation } from "react-i18next";
import { BookMarked, CalendarDays, Github, Repeat2, Sparkles, Sprout, type LucideIcon } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { isTauri } from "../../core/vault";
import { activeHabits } from "../../core/habit";
import { isFeatureOn, type FeatureId } from "../../core/settings/features";
import { isModuleInstalled, moduleCta, type ModuleCta } from "../../core/settings/modules";
import { useToday } from "../Habits/habitUi";

export const MODULE_ICONS: Record<FeatureId, LucideIcon> = {
  github: Github,
  calendar: CalendarDays,
  review: Repeat2,
  assistant: Sparkles,
  habits: Sprout,
  library: BookMarked,
};

/** Her modülün sabit rengi: kartlar birbirinden ayrışsın (CSS `data-tone`). */
export const MODULE_TONES: Record<FeatureId, string> = {
  github: "charcoal",
  calendar: "teal",
  review: "purple",
  assistant: "amber",
  habits: "green",
  library: "terra",
};

export interface ModuleInfo {
  id: FeatureId;
  name: string;
  desc: string;
  status: string;
  on: boolean;
  installed: boolean;
  locked: boolean;
  /** Tekrar ayarı okunamadı: Yeniden dene gösterilir. */
  error: boolean;
  cta: ModuleCta;
  /** Kartın durumu: Aktif / Pasif / Kurulmadı / Kilitli. */
  state: "active" | "passive" | "notInstalled" | "locked";
}

/** Bütün modüllerin güncel bilgisi ve eylemleri. */
export function useModuleInfo() {
  const { t } = useTranslation();
  const features = useAppStore((s) => s.features);
  const installedMap = useAppStore((s) => s.modulesInstalled);
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
  const install = useAppStore((s) => s.installModule);
  const openDetail = useAppStore((s) => s.moduleOpenDetail);
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

  const info = (id: FeatureId): ModuleInfo => {
    const locked = id === "review" && srsStatus !== "ready";
    const on = !locked && isFeatureOn(id, { features, srsEnabled, aiEnabled });
    const installed = isModuleInstalled(id, installedMap, on);
    const cta = moduleCta(id, { installed: installedMap, on, locked });
    return {
      id,
      name: t(`settings.features.${id}.name`),
      desc: t(`settings.features.${id}.desc`),
      status: status(id),
      on,
      installed,
      locked,
      error: locked && srsStatus === "error",
      cta,
      state: locked ? "locked" : on ? "active" : installed ? "passive" : "notInstalled",
    };
  };

  return { info, setOn, install, openDetail, retry: () => void srsRetry() };
}

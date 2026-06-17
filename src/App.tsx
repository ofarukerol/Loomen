import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "./store/useAppStore";
import { applyDir } from "./i18n";
import { Ribbon } from "./components/Ribbon";
import { Explorer } from "./components/Explorer";
import { PlannerScreen } from "./screens/Planner/PlannerScreen";

/** Henüz tam yapılmamış ekranlar için geçici yer tutucu. */
function Placeholder({ title }: { title: string }) {
  return (
    <div className="lo-placeholder">
      <h2>{title}</h2>
      <p>Bu ekran yakında — şu an Planlayıcı odaklı geliştiriliyor.</p>
    </div>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const screen = useAppStore((s) => s.screen);
  const lang = useAppStore((s) => s.lang);

  // Dil değişince i18next + <html dir> güncelle (RTL).
  useEffect(() => {
    i18n.changeLanguage(lang);
    applyDir(lang);
  }, [lang, i18n]);

  const showExplorer = ["planner", "editor", "graph"].includes(screen);

  return (
    <div className="lo-app" data-theme={theme}>
      <Ribbon />
      {showExplorer && <Explorer />}
      <div className="lo-main">
        {screen === "planner" && <PlannerScreen />}
        {screen === "editor" && <Placeholder title={t("ribbon.notes")} />}
        {screen === "graph" && <Placeholder title={t("ribbon.graph")} />}
        {screen === "settings" && <Placeholder title={t("ribbon.settings")} />}
        {screen === "mobile" && <Placeholder title={t("ribbon.mobile")} />}
        {screen === "rtl" && <Placeholder title="عربي / RTL" />}
      </div>
    </div>
  );
}

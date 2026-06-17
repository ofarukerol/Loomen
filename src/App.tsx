import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, ACCENTS } from "./store/useAppStore";
import { applyDir } from "./i18n";
import { Ribbon } from "./components/Ribbon";
import { Explorer } from "./components/Explorer";
import { PlannerScreen } from "./screens/Planner/PlannerScreen";
import { EditorScreen } from "./screens/Editor/EditorScreen";
import { GraphScreen } from "./screens/Graph/GraphScreen";
import { SettingsScreen } from "./screens/Settings/SettingsScreen";

export default function App() {
  const { i18n } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const screen = useAppStore((s) => s.screen);
  const lang = useAppStore((s) => s.lang);
  const accent = useAppStore((s) => s.accent);

  // Dil değişince i18next + <html dir> güncelle (RTL).
  useEffect(() => {
    i18n.changeLanguage(lang);
    applyDir(lang);
  }, [lang, i18n]);

  const showExplorer = ["planner", "editor", "graph"].includes(screen);

  // Vurgu rengini kök seviyede override et (varsayılan dışı seçilirse).
  const accentVars =
    accent === ACCENTS[0]
      ? undefined
      : ({ "--accent": accent, "--accent-soft": accent + "22" } as React.CSSProperties);

  return (
    <div className="lo-app" data-theme={theme} style={accentVars}>
      <Ribbon />
      {showExplorer && <Explorer />}
      <div className="lo-main">
        {screen === "planner" && <PlannerScreen />}
        {screen === "editor" && <EditorScreen />}
        {screen === "graph" && <GraphScreen />}
        {screen === "settings" && <SettingsScreen />}
      </div>
    </div>
  );
}

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, ACCENTS } from "./store/useAppStore";
import { applyDir } from "./i18n";
import { Ribbon } from "./components/Ribbon";
import { TopBar } from "./components/TopBar";
import { Explorer } from "./components/Explorer";
import { RightPanel } from "./components/RightPanel";
import { PlannerScreen } from "./screens/Planner/PlannerScreen";
import { EditorScreen } from "./screens/Editor/EditorScreen";
import { GraphScreen } from "./screens/Graph/GraphScreen";
import { ReportsScreen } from "./screens/Reports/ReportsScreen";
import { DrawScreen } from "./screens/Draw/DrawScreen";
import { SettingsScreen } from "./screens/Settings/SettingsScreen";
import { TaskDetail } from "./screens/Planner/TaskDetail";
import { GitHubDeviceModal } from "./screens/Settings/GitHubSync";

export default function App() {
  const { i18n } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const screen = useAppStore((s) => s.screen);
  const lang = useAppStore((s) => s.lang);
  const accent = useAppStore((s) => s.accent);
  const leftCollapsed = useAppStore((s) => s.leftCollapsed);
  const rightCollapsed = useAppStore((s) => s.rightCollapsed);

  const bootstrap = useAppStore((s) => s.bootstrap);
  const ghAutoSync = useAppStore((s) => s.ghAutoSync);
  const ghToken = useAppStore((s) => s.ghToken);
  const ghRepo = useAppStore((s) => s.ghRepo);
  const ghSync = useAppStore((s) => s.ghSync);

  // İlk açılışta kasayı yükle (sample veya kayıtlı Tauri kasası).
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Otomatik senkron: bağlıyken ve açıkken periyodik push/pull (3 dk).
  useEffect(() => {
    if (!ghAutoSync || !ghToken || !ghRepo) return;
    const id = setInterval(() => void ghSync(), 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [ghAutoSync, ghToken, ghRepo, ghSync]);

  // Dil değişince i18next + <html dir> güncelle (RTL).
  useEffect(() => {
    i18n.changeLanguage(lang);
    applyDir(lang);
  }, [lang, i18n]);

  const explorerEligible = ["planner", "editor", "graph", "reports", "draw"].includes(screen);
  const showExplorer = explorerEligible && !leftCollapsed;
  const rightEligible = ["planner", "editor", "graph", "draw"].includes(screen);
  const showRight = rightEligible && !rightCollapsed;

  // Vurgu rengini kök seviyede override et (varsayılan dışı seçilirse).
  const accentVars =
    accent === ACCENTS[0]
      ? undefined
      : ({ "--accent": accent, "--accent-soft": accent + "22" } as React.CSSProperties);

  return (
    <div className="lo-app" data-theme={theme} style={accentVars}>
      <Ribbon />
      <div className="lo-workspace">
        <TopBar />
        <div className="lo-body">
          {showExplorer && <Explorer />}
          <div className="lo-main">
            {screen === "planner" && <PlannerScreen />}
            {screen === "editor" && <EditorScreen />}
            {screen === "graph" && <GraphScreen />}
            {screen === "draw" && <DrawScreen />}
            {screen === "reports" && <ReportsScreen />}
            {screen === "settings" && <SettingsScreen />}
          </div>
          {showRight && <RightPanel />}
        </div>
      </div>
      {/* Görev detay modalı — global */}
      <TaskDetail />
      {/* GitHub bağlan (device flow) modalı — global */}
      <GitHubDeviceModal />
    </div>
  );
}

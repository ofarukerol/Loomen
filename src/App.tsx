import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, ACCENTS } from "./store/useAppStore";
import { applyDir } from "./i18n";
import { useIsMobile } from "./hooks/useIsMobile";
import { Ribbon } from "./components/Ribbon";
import { TopBar } from "./components/TopBar";
import { Explorer } from "./components/Explorer";
import { RightPanel } from "./components/RightPanel";
import { MobileBar } from "./components/MobileBar";
import { MobileTopBar } from "./components/MobileTopBar";
import { MobileDrawer, MobileTabsSheet } from "./components/MobileDrawer";
import { PlannerScreen } from "./screens/Planner/PlannerScreen";
import { EditorScreen } from "./screens/Editor/EditorScreen";
import { GraphScreen } from "./screens/Graph/GraphScreen";
import { ReportsScreen } from "./screens/Reports/ReportsScreen";
import { DrawScreen } from "./screens/Draw/DrawScreen";
import { NewTabScreen } from "./screens/NewTab/NewTabScreen";
import { SettingsScreen } from "./screens/Settings/SettingsScreen";
import { HelpScreen } from "./screens/Help/HelpScreen";
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
  const activeNote = useAppStore((s) => s.activeNote);
  const activeDraw = useAppStore((s) => s.activeDraw);

  // Mobil (dar ekran / iOS-Android): sol/sağ panel + üst sekme şeridi yerine alt bar + drawer.
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tabsOpen, setTabsOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);

  const bootstrap = useAppStore((s) => s.bootstrap);
  const newNote = useAppStore((s) => s.newNote);
  const newTab = useAppStore((s) => s.newTab);
  const ghAutoSync = useAppStore((s) => s.ghAutoSync);
  const ghToken = useAppStore((s) => s.ghToken);
  const ghRepo = useAppStore((s) => s.ghRepo);
  const ghSync = useAppStore((s) => s.ghSync);
  const gcalAutoSync = useAppStore((s) => s.gcalAutoSync);
  const gcalTokens = useAppStore((s) => s.gcalTokens);
  const gcalSync = useAppStore((s) => s.gcalSync);
  const pomoRunning = useAppStore((s) => s.pomoRunning);
  const tickPomo = useAppStore((s) => s.tickPomo);
  const pomoBreakRunning = useAppStore((s) => s.pomoBreakRunning);
  const tickBreak = useAppStore((s) => s.tickBreak);

  // İlk açılışta kasayı yükle (sample veya kayıtlı Tauri kasası).
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Pomodoro sayacı — App seviyesinde sürer; hangi ekranda olursak olalım durmaz
  // (önceden PomodoroCard'daydı, planner'dan çıkınca kart unmount olup sayaç duruyordu).
  useEffect(() => {
    if (!pomoRunning) return;
    const id = setInterval(() => tickPomo(), 1000);
    return () => clearInterval(id);
  }, [pomoRunning, tickPomo]);

  // Mola sayacı — odaktan bağımsız sürer (başlatılınca).
  useEffect(() => {
    if (!pomoBreakRunning) return;
    const id = setInterval(() => tickBreak(), 1000);
    return () => clearInterval(id);
  }, [pomoBreakRunning, tickBreak]);

  // Otomatik senkron: bağlıyken ve açıkken periyodik push/pull (3 dk).
  useEffect(() => {
    if (!ghAutoSync || !ghToken || !ghRepo) return;
    const id = setInterval(() => void ghSync(), 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [ghAutoSync, ghToken, ghRepo, ghSync]);

  // Google Takvim otomatik senkron: bağlıyken açılışta hemen bir kez, sonra her 5 dk push/pull.
  useEffect(() => {
    if (!gcalAutoSync || !gcalTokens) return;
    void gcalSync();
    const id = setInterval(() => void gcalSync(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [gcalAutoSync, gcalTokens, gcalSync]);

  // Dil değişince i18next + <html dir> güncelle (RTL).
  useEffect(() => {
    i18n.changeLanguage(lang);
    applyDir(lang);
  }, [lang, i18n]);

  // Klavye kısayolları: ⌘N yeni not, ⌘O dosyaya git (arama).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        void newNote();
      } else if (k === "o") {
        e.preventDefault();
        newTab();
        setTimeout(() => document.querySelector<HTMLInputElement>(".lo-search input")?.focus(), 50);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newNote, newTab]);

  // Mobilde gezinince (ekran/aktif not değişince) drawer ve sekme sheet'i otomatik kapan.
  useEffect(() => {
    setDrawerOpen(false);
    setTabsOpen(false);
  }, [screen, activeNote, activeDraw]);

  const explorerEligible = ["planner", "editor", "graph", "reports", "draw", "newtab"].includes(screen);
  const showExplorer = explorerEligible && !leftCollapsed;
  const rightEligible = ["planner", "editor", "graph", "draw"].includes(screen);
  const showRight = rightEligible && !rightCollapsed;

  // Vurgu rengini kök seviyede override et (varsayılan dışı seçilirse).
  const accentVars =
    accent === ACCENTS[0]
      ? undefined
      : ({ "--accent": accent, "--accent-soft": accent + "22" } as React.CSSProperties);

  return (
    <div className={"lo-app" + (isMobile ? " is-mobile" : "")} data-theme={theme} style={accentVars}>
      {/* Masaüstü sol menü — mobilde gizli (yerine alt bar + drawer). */}
      {!isMobile && <Ribbon />}
      {!isMobile && showExplorer && <Explorer />}
      {/* Ana sütun: sekme çubuğu (masaüstü) + ekran */}
      <div className="lo-maincol">
        {!isMobile && <TopBar />}
        {isMobile && (
          <MobileTopBar
            onMenu={() => {
              setFocusSearch(false);
              setDrawerOpen(true);
            }}
          />
        )}
        <div className="lo-main">
          {screen === "planner" && <PlannerScreen />}
          {screen === "editor" && <EditorScreen />}
          {screen === "graph" && <GraphScreen />}
          {screen === "draw" && <DrawScreen />}
          {screen === "newtab" && <NewTabScreen />}
          {screen === "reports" && <ReportsScreen />}
          {screen === "settings" && <SettingsScreen />}
          {screen === "help" && <HelpScreen />}
        </div>
      </div>
      {!isMobile && showRight && <RightPanel />}

      {/* Mobil: alt toolbar + sol drawer + sekme sheet */}
      {isMobile && (
        <>
          <MobileBar
            onSearch={() => {
              setFocusSearch(true);
              setDrawerOpen(true);
            }}
            onTabs={() => setTabsOpen(true)}
            onMenu={() => {
              setFocusSearch(false);
              setDrawerOpen(true);
            }}
          />
          <MobileDrawer open={drawerOpen} focusSearch={focusSearch} onClose={() => setDrawerOpen(false)} />
          <MobileTabsSheet open={tabsOpen} onClose={() => setTabsOpen(false)} />
        </>
      )}

      {/* Görev detay modalı — global */}
      <TaskDetail />
      {/* GitHub bağlan (device flow) modalı — global */}
      <GitHubDeviceModal />
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { NotebookPen, Share2, BarChart3, Settings, Sun, Moon } from "lucide-react";
import { useAppStore, type Screen } from "../store/useAppStore";

const ICON = 21;
const SW = 1.8;

export function Ribbon() {
  const { t } = useTranslation();
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const goToDayNote = useAppStore((s) => s.goToDayNote);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const btn = (target: Screen, title: string, node: React.ReactNode) => (
    <button
      className={"lo-ribbon__btn" + (screen === target ? " is-active" : "")}
      title={title}
      onClick={() => setScreen(target)}
    >
      {node}
    </button>
  );

  return (
    <div className="lo-ribbon">
      <div className="lo-ribbon__logo">L</div>

      <button
        className={"lo-ribbon__btn" + (screen === "planner" ? " is-active" : "")}
        title={t("ribbon.dayNote")}
        onClick={() => void goToDayNote()}
      >
        <NotebookPen size={ICON} strokeWidth={SW} />
      </button>
      {btn("graph", t("ribbon.graph"), <Share2 size={ICON} strokeWidth={SW} />)}
      {btn("reports", t("ribbon.reports"), <BarChart3 size={ICON} strokeWidth={SW} />)}

      <div className="lo-ribbon__spacer" />

      {btn("settings", t("ribbon.settings"), <Settings size={ICON} strokeWidth={SW} />)}
      <button
        className="lo-ribbon__btn"
        title={t("ribbon.theme")}
        onClick={toggleTheme}
        style={{ marginTop: 2 }}
      >
        {theme === "light" ? <Sun size={20} strokeWidth={SW} /> : <Moon size={20} strokeWidth={SW} />}
      </button>
    </div>
  );
}

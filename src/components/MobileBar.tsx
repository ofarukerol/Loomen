import { useTranslation } from "react-i18next";
import { Home, NotebookPen, Search, Plus, Menu } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

const ICON = 22;
const SW = 1.9;

type Props = {
  onSearch: () => void;
  onTabs: () => void;
  onMenu: () => void;
};

/**
 * Mobil alt toolbar (Obsidian mobil tarzı): ana sayfa · ara · yeni · sekmeler · menü.
 * Sol menü mobilde kaldırıldı; onun yerine bu bar + "menü" ile açılan drawer var.
 */
export function MobileBar({ onSearch, onTabs, onMenu }: Props) {
  const { t } = useTranslation();
  const newNote = useAppStore((s) => s.newNote);
  const openTabs = useAppStore((s) => s.openTabs);
  const tabCount = Math.max(openTabs.length, 1);
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const activeNote = useAppStore((s) => s.activeNote);
  const todayNotePath = useAppStore((s) => s.todayNotePath);
  const goToDayNote = useAppStore((s) => s.goToDayNote);
  const isHome = screen === "planner";
  const isDayNote = screen === "editor" && activeNote === todayNotePath();

  return (
    <nav className="lo-mbar">
      <button
        className={"lo-mbar__btn" + (isHome ? " is-active" : "")}
        onClick={() => setScreen("planner")}
        title={t("mobile.home")}
      >
        <Home size={ICON} strokeWidth={SW} />
      </button>
      <button
        className={"lo-mbar__btn" + (isDayNote ? " is-active" : "")}
        onClick={() => void goToDayNote()}
        title={t("ribbon.dayNote")}
      >
        <NotebookPen size={ICON} strokeWidth={SW} />
      </button>
      <button className="lo-mbar__btn" onClick={onSearch} title={t("mobile.search")}>
        <Search size={ICON - 1} strokeWidth={SW} />
      </button>
      <button className="lo-mbar__btn" onClick={() => void newNote()} title={t("mobile.newNote")}>
        <Plus size={ICON} strokeWidth={SW} />
      </button>
      <button className="lo-mbar__btn lo-mbar__tabs" onClick={onTabs} title={t("mobile.tabs")}>
        <span className="lo-mbar__count">{tabCount}</span>
      </button>
      <button className="lo-mbar__btn" onClick={onMenu} title={t("mobile.menu")}>
        <Menu size={ICON} strokeWidth={SW} />
      </button>
    </nav>
  );
}

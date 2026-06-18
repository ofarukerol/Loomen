import { useTranslation } from "react-i18next";
import { FilePlus, Search, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

/** Obsidian tarzı boş "Yeni sekme" — dosya oluştur / dosyaya git / kapat. */
export function NewTabScreen() {
  const { t } = useTranslation();
  const newNote = useAppStore((s) => s.newNote);
  const setScreen = useAppStore((s) => s.setScreen);

  const goToFile = () => {
    const el = document.querySelector<HTMLInputElement>(".lo-search input");
    el?.focus();
  };

  return (
    <div className="lo-newtab">
      <div className="lo-newtab__opts">
        <button className="lo-newtab__opt" onClick={() => void newNote()}>
          <FilePlus size={16} strokeWidth={2} />
          {t("tabs.newFile")}
          <kbd>⌘N</kbd>
        </button>
        <button className="lo-newtab__opt" onClick={goToFile}>
          <Search size={16} strokeWidth={2} />
          {t("tabs.goToFile")}
          <kbd>⌘O</kbd>
        </button>
        <button className="lo-newtab__opt" onClick={() => setScreen("planner")}>
          <X size={16} strokeWidth={2} />
          {t("tabs.close")}
        </button>
      </div>
    </div>
  );
}

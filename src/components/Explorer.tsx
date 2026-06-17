import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Folder, FileText, Clock } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

interface FileItemProps {
  name: string;
  active?: boolean;
}

function FileItem({ name, active }: FileItemProps) {
  const setScreen = useAppStore((s) => s.setScreen);
  return (
    <button
      className={"lo-tree__file" + (active ? " is-active" : "")}
      onClick={() => setScreen("editor")}
    >
      <FileText size={14} strokeWidth={1.7} color={active ? "currentColor" : "var(--fg3)"} />
      {name}
    </button>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="lo-tree__group">
      <ChevronRight size={14} strokeWidth={2} />
      <Folder size={15} strokeWidth={1.8} color="var(--accent-2)" />
      {label}
    </div>
  );
}

export function Explorer() {
  const { t } = useTranslation();

  return (
    <div className="lo-explorer">
      <div className="lo-explorer__head">
        <span className="lo-explorer__title">{t("explorer.vault")}</span>
        <span className="lo-explorer__path">~/Loomen</span>
      </div>

      <div className="lo-explorer__searchwrap">
        <div className="lo-search">
          <Search size={15} strokeWidth={2} color="var(--fg3)" />
          <input placeholder={t("explorer.search")} />
          <kbd className="lo-kbd">⌘K</kbd>
        </div>
      </div>

      <div className="lo-tree lo-scroll">
        <GroupHeader label={t("explorer.notes")} />
        <FileItem name="Proje X" />
        <FileItem name="Fikirler" />
        <FileItem name="Toplantı Notları" />

        <GroupHeader label={t("explorer.daily")} />
        <FileItem name="2026-06-13-Cumartesi" active />
        <FileItem name="2026-06-12-Cuma" />

        <GroupHeader label={t("explorer.projects")} />
        <FileItem name="Loomen" />
        <FileItem name="Vize Başvurusu" />
      </div>

      <div className="lo-explorer__foot">
        <Clock size={13} strokeWidth={2} />
        {t("explorer.localNoSync")}
      </div>
    </div>
  );
}

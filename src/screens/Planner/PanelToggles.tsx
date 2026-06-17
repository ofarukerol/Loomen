import { useTranslation } from "react-i18next";
import { PanelLeft, PanelRight } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

/** Sol/sağ panel aç-kapa düğmeleri (her iki modda da kullanılır). */
export function PanelToggles() {
  const { t } = useTranslation();
  const leftCollapsed = useAppStore((s) => s.leftCollapsed);
  const rightCollapsed = useAppStore((s) => s.rightCollapsed);
  const toggleLeft = useAppStore((s) => s.toggleLeft);
  const toggleRight = useAppStore((s) => s.toggleRight);

  return (
    <div className="lo-paneltoggles">
      <button
        className={"lo-paneltoggle" + (leftCollapsed ? "" : " is-active")}
        onClick={toggleLeft}
        title={t("planner.toggleLeft")}
      >
        <PanelLeft size={16} strokeWidth={1.9} />
      </button>
      <button
        className={"lo-paneltoggle" + (rightCollapsed ? "" : " is-active")}
        onClick={toggleRight}
        title={t("planner.toggleRight")}
      >
        <PanelRight size={16} strokeWidth={1.9} />
      </button>
    </div>
  );
}

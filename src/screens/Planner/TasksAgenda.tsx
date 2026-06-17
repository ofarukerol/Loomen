import { useTranslation } from "react-i18next";
import { List, Columns3, Minimize2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { StatCards } from "./StatCards";
import { QuickAdd } from "./QuickAdd";
import { Timeline } from "./Timeline";
import { Board } from "./Board";

/** Görevlerin ayrı sayfası — orta gövdede geniş açılan tam ajanda. */
export function TasksAgenda() {
  const { t } = useTranslation();
  const layout = useAppStore((s) => s.layout);
  const setLayout = useAppStore((s) => s.setLayout);
  const setFocusExpanded = useAppStore((s) => s.setFocusExpanded);

  return (
    <div className="lo-planner__center">
      <div className="lo-planner__head">
        <div>
          <div className="lo-year">2026</div>
          <div className="lo-planner__titlerow">
            <h1 className="lo-planner__title">{t("planner.focusToday")}</h1>
          </div>
        </div>
        <div className="lo-planner__tools">
          <div className="lo-segment">
            <button
              className={"lo-segment__btn" + (layout === "timeline" ? " is-active" : "")}
              onClick={() => setLayout("timeline")}
            >
              <List size={15} strokeWidth={2} />
              {t("planner.timeline")}
            </button>
            <button
              className={"lo-segment__btn" + (layout === "board" ? " is-active" : "")}
              onClick={() => setLayout("board")}
            >
              <Columns3 size={15} strokeWidth={2} />
              {t("planner.board")}
            </button>
          </div>
          <button className="lo-focusx__close" onClick={() => setFocusExpanded(false)}>
            <Minimize2 size={15} strokeWidth={2} />
            {t("planner.collapse")}
          </button>
        </div>
      </div>

      <StatCards />
      <QuickAdd />
      {layout === "timeline" ? <Timeline /> : <Board />}
    </div>
  );
}

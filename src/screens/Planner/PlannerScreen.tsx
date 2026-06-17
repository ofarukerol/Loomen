import { useTranslation } from "react-i18next";
import { List, Columns3 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { StatCards } from "./StatCards";
import { QuickAdd } from "./QuickAdd";
import { Timeline } from "./Timeline";
import { Board } from "./Board";
import { CalendarCard } from "./CalendarCard";
import { PomodoroCard } from "./PomodoroCard";

export function PlannerScreen() {
  const { t } = useTranslation();
  const layout = useAppStore((s) => s.layout);
  const setLayout = useAppStore((s) => s.setLayout);

  return (
    <div className="lo-planner">
      <div className="lo-planner__center">
        <div className="lo-planner__head">
          <div>
            <div className="lo-year">2026</div>
            <div className="lo-planner__titlerow">
              <h1 className="lo-planner__title">{t("planner.focusToday")}</h1>
              <span className="lo-planner__date">{t("planner.today")}</span>
            </div>
          </div>

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
        </div>

        <StatCards />
        <QuickAdd />
        {layout === "timeline" ? <Timeline /> : <Board />}
      </div>

      <div className="lo-side lo-scroll">
        <CalendarCard />
        <PomodoroCard />
      </div>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { List, Columns3, PanelLeft, PanelRight } from "lucide-react";
import { format } from "date-fns";
import { tr, ar, enUS } from "date-fns/locale";
import { useAppStore } from "../../store/useAppStore";
import { StatCards } from "./StatCards";
import { QuickAdd } from "./QuickAdd";
import { Timeline } from "./Timeline";
import { Board } from "./Board";
import { CalendarCard } from "./CalendarCard";
import { PomodoroCard } from "./PomodoroCard";
import { FocusTasksCard } from "./FocusTasksCard";
import { FocusExpanded } from "./FocusExpanded";

const LOCALES = { tr, ar, en: enUS } as const;

export function PlannerScreen() {
  const { t } = useTranslation();
  const layout = useAppStore((s) => s.layout);
  const setLayout = useAppStore((s) => s.setLayout);
  const lang = useAppStore((s) => s.lang);
  const leftCollapsed = useAppStore((s) => s.leftCollapsed);
  const rightCollapsed = useAppStore((s) => s.rightCollapsed);
  const focusExpanded = useAppStore((s) => s.focusExpanded);
  const toggleLeft = useAppStore((s) => s.toggleLeft);
  const toggleRight = useAppStore((s) => s.toggleRight);
  const todayLabel = format(new Date(), "EEEE, d MMMM", { locale: LOCALES[lang] });

  return (
    <div className="lo-planner">
      <div className="lo-planner__center">
        <div className="lo-planner__head">
          <div>
            <div className="lo-year">2026</div>
            <div className="lo-planner__titlerow">
              <h1 className="lo-planner__title">{t("planner.focusToday")}</h1>
              <span className="lo-planner__date">{todayLabel}</span>
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
          </div>
        </div>

        {focusExpanded ? (
          <FocusExpanded />
        ) : (
          <>
            <StatCards />
            <QuickAdd />
            {layout === "timeline" ? <Timeline /> : <Board />}
          </>
        )}
      </div>

      {!rightCollapsed && (
        <div className="lo-side lo-scroll">
          <CalendarCard />
          <FocusTasksCard />
          <PomodoroCard />
        </div>
      )}
    </div>
  );
}

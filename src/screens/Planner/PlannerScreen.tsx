import { useAppStore } from "../../store/useAppStore";
import { PomodoroCard } from "./PomodoroCard";
import { CalendarCard } from "./CalendarCard";
import { MiniAgenda } from "./MiniAgenda";
import { TasksAgenda } from "./TasksAgenda";
import { DailyPlanView } from "./DailyPlanView";

export function PlannerScreen() {
  const rightCollapsed = useAppStore((s) => s.rightCollapsed);
  const focusExpanded = useAppStore((s) => s.focusExpanded);

  return (
    <div className="lo-planner">
      {/* Orta gövde: varsayılan Günün Planı (görevsiz journal); genişletince Görev Ajandası */}
      {focusExpanded ? <TasksAgenda /> : <DailyPlanView />}

      {!rightCollapsed && (
        <div className="lo-side lo-scroll">
          <PomodoroCard />
          <CalendarCard />
          <MiniAgenda />
        </div>
      )}
    </div>
  );
}

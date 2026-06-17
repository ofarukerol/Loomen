import { useAppStore } from "../../store/useAppStore";
import { TasksAgenda } from "./TasksAgenda";
import { DailyPlanView } from "./DailyPlanView";

/** Planlayıcı orta gövdesi — varsayılan Günün Planı, genişletince Görev Ajandası.
 *  (Sağ blok artık global; App'te kalıcı olarak render edilir.) */
export function PlannerScreen() {
  const focusExpanded = useAppStore((s) => s.focusExpanded);
  return focusExpanded ? <TasksAgenda /> : <DailyPlanView />;
}

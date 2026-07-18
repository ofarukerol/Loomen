import { useAppStore } from "../../store/useAppStore";
import { useIsMobile } from "../../hooks/useIsMobile";
import { TasksAgenda } from "./TasksAgenda";
import { DailyPlanView } from "./DailyPlanView";
import { RightPanel } from "../../components/RightPanel";

/** Planlayıcı orta gövdesi — varsayılan Günün Planı, genişletince Görev Ajandası.
 *  Masaüstünde sağ blok (Pomodoro+Takvim+Ajanda) global; mobilde planner = yalnız o blok
 *  (takvim + yapılacaklar + pomodoro). Günlük nota üst bardaki 📖 ile geçilir. */
export function PlannerScreen() {
  const focusExpanded = useAppStore((s) => s.focusExpanded);
  const isMobile = useIsMobile();

  if (focusExpanded) return <TasksAgenda />;

  // Mobil: sadece takvim + pomodoro + bugünkü işler. Günlük journal burada gösterilmez (📖 ile açılır).
  if (isMobile) {
    return (
      <div className="lo-mplan lo-scroll">
        <RightPanel />
      </div>
    );
  }

  return <DailyPlanView />;
}

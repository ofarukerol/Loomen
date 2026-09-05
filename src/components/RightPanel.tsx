import { PomodoroCard } from "../screens/Planner/PomodoroCard";
import { CalendarCard } from "../screens/Planner/CalendarCard";
import { MiniAgenda } from "../screens/Planner/MiniAgenda";
import { ReviewCard } from "../screens/Review/ReviewCard";

/** Global sağ blok — her ekranda kalıcı (Pomodoro + Takvim + Tekrar + Bugüne Odaklan). */
export function RightPanel() {
  return (
    <div className="lo-side lo-scroll">
      <PomodoroCard />
      <CalendarCard />
      <ReviewCard />
      <MiniAgenda />
    </div>
  );
}

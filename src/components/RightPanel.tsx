import { PomodoroCard } from "../screens/Planner/PomodoroCard";
import { CalendarCard } from "../screens/Planner/CalendarCard";
import { MiniAgenda } from "../screens/Planner/MiniAgenda";

/** Global sağ blok — her ekranda kalıcı (Pomodoro + Takvim + Bugüne Odaklan). */
export function RightPanel() {
  return (
    <div className="lo-side lo-scroll">
      <PomodoroCard />
      <CalendarCard />
      <MiniAgenda />
    </div>
  );
}

import { PomodoroCard } from "../screens/Planner/PomodoroCard";
import { HabitsTodayCard } from "../screens/Planner/HabitsTodayCard";
import { CalendarCard } from "../screens/Planner/CalendarCard";
import { MiniAgenda } from "../screens/Planner/MiniAgenda";
import { ReviewCard } from "../screens/Review/ReviewCard";

/** Global sağ blok — her ekranda kalıcı (Pomodoro + Alışkanlıklar + Takvim + Tekrar + Bugüne Odaklan). */
export function RightPanel() {
  return (
    <div className="lo-side lo-scroll">
      <PomodoroCard />
      <HabitsTodayCard />
      <CalendarCard />
      <ReviewCard />
      <MiniAgenda />
    </div>
  );
}

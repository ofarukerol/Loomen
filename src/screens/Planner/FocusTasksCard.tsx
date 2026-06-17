import { useTranslation } from "react-i18next";
import { Maximize2, Circle } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

/** İnce odak kartı — bugünün ilk 5 açık görevi (takvim ile Pomodoro arasında). */
export function FocusTasksCard() {
  const { t } = useTranslation();
  const groups = useAppStore((s) => s.groups);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const expandToday = useAppStore((s) => s.expandToday);

  const todayOpen = groups
    .filter((g) => g.kind === "today")
    .flatMap((g) => g.tasks)
    .filter((tk) => !tk.done);
  const top5 = todayOpen.slice(0, 5);
  const more = todayOpen.length - top5.length;

  return (
    <div className="lo-card lo-focus">
      <div className="lo-focus__head">
        <span className="lo-focus__title">{t("planner.focusList")}</span>
        <button
          className="lo-focus__expand"
          onClick={() => void expandToday()}
          title={t("planner.expand")}
        >
          <Maximize2 size={13} strokeWidth={2} />
        </button>
      </div>

      {top5.length === 0 ? (
        <div className="lo-focus__empty">{t("planner.allClear")}</div>
      ) : (
        <div className="lo-focus__list">
          {top5.map((task) => (
            <div className="lo-focus__row" key={task.id}>
              <button
                className="lo-focus__check"
                onClick={() => void toggleTask(task.id)}
                aria-label={task.text}
              >
                <Circle size={15} strokeWidth={1.8} />
              </button>
              <span className="lo-focus__text">{task.text}</span>
            </div>
          ))}
          {more > 0 && <div className="lo-focus__more">{t("planner.moreTasks", { count: more })}</div>}
        </div>
      )}
    </div>
  );
}

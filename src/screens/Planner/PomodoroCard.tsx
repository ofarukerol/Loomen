import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Timer, Target, Play, Pause, RotateCcw } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

const R = 52;
const CIRC = 2 * Math.PI * R;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function PomodoroCard() {
  const { t } = useTranslation();
  const pomo = useAppStore((s) => s.pomo);
  const remaining = useAppStore((s) => s.pomoRemaining);
  const running = useAppStore((s) => s.pomoRunning);
  const phase = useAppStore((s) => s.pomoPhase);
  const completed = useAppStore((s) => s.pomoCompleted);
  const togglePomo = useAppStore((s) => s.togglePomo);
  const resetPomo = useAppStore((s) => s.resetPomo);
  const tickPomo = useAppStore((s) => s.tickPomo);

  // Geri sayım: çalışırken her saniye tick.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tickPomo(), 1000);
    return () => clearInterval(id);
  }, [running, tickPomo]);

  const phaseMin = phase === "work" ? pomo.focusMin : phase === "short" ? pomo.shortBreak : pomo.longBreak;
  const total = phaseMin * 60;
  const label = pad(Math.floor(remaining / 60)) + ":" + pad(remaining % 60);
  const offset = CIRC * (1 - remaining / total);
  const phaseLabel = phase === "work" ? t("pomodoro.focus") : t("pomodoro.break");

  return (
    <div className="lo-card lo-pomo">
      <div className="lo-pomo__title">
        <Timer size={14} strokeWidth={2} color="var(--accent)" />
        {t("pomodoro.title")}
      </div>

      <div className="lo-pomo__ringwrap">
        <svg width="148" height="148" viewBox="0 0 148 148">
          <circle cx="74" cy="74" r={R} fill="none" stroke="var(--bg-sunken)" strokeWidth="9" />
          <circle
            cx="74"
            cy="74"
            r={R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <div className="lo-pomo__center">
          <div className="lo-pomo__time">{label}</div>
          <div className="lo-pomo__sub">{phaseLabel}</div>
        </div>
      </div>

      <div className="lo-pomo__dots">
        {Array.from({ length: pomo.rounds }, (_, i) => (
          <span className={"lo-pomo__dot" + (i < completed ? " is-on" : "")} key={i} />
        ))}
      </div>

      <div className="lo-pomo__controls">
        <button className="lo-pomo__start" onClick={togglePomo}>
          {running ? (
            <>
              <Pause size={15} fill="currentColor" strokeWidth={0} />
              {t("pomodoro.pause")}
            </>
          ) : (
            <>
              <Play size={15} fill="currentColor" strokeWidth={0} />
              {t("pomodoro.start")}
            </>
          )}
        </button>
        <button className="lo-pomo__reset" onClick={resetPomo} aria-label="Sıfırla">
          <RotateCcw size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="lo-pomo__focus">
        <Target size={14} strokeWidth={2} color="var(--accent)" />
        <span className="lo-pomo__focus-label">{t("pomodoro.focusOn")}</span>
        <span className="lo-pomo__focus-name">{t("pomodoro.currentTask")}</span>
      </div>
    </div>
  );
}

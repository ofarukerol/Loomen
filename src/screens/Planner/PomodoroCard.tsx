import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Timer, Play, Pause, RotateCcw } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

const R = 18;
const CIRC = 2 * Math.PI * R;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Kompakt Pomodoro — takvimin üstünde, ince yatay kart. */
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
    <div className="lo-card lo-pomoc">
      <div className="lo-pomoc__ring">
        <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="22" cy="22" r={R} fill="none" stroke="var(--bg-sunken)" strokeWidth="4" />
          <circle
            cx="22" cy="22" r={R}
            fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <span className="lo-pomoc__ringicon">
          <Timer size={15} strokeWidth={2} />
        </span>
      </div>

      <div className="lo-pomoc__info">
        <div className="lo-pomoc__time">{label}</div>
        <div className="lo-pomoc__meta">
          <span className="lo-pomoc__phase">{phaseLabel}</span>
          <span className="lo-pomoc__dots">
            {Array.from({ length: pomo.rounds }, (_, i) => (
              <span className={"lo-pomoc__dot" + (i < completed ? " is-on" : "")} key={i} />
            ))}
          </span>
        </div>
      </div>

      <div className="lo-pomoc__controls">
        <button className="lo-pomoc__start" onClick={togglePomo} aria-label={running ? t("pomodoro.pause") : t("pomodoro.start")}>
          {running ? <Pause size={15} fill="currentColor" strokeWidth={0} /> : <Play size={15} fill="currentColor" strokeWidth={0} />}
        </button>
        <button className="lo-pomoc__reset" onClick={resetPomo} aria-label="Sıfırla">
          <RotateCcw size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { Timer, Play, Pause, RotateCcw, Coffee, SkipForward } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

const R = 18;
const CIRC = 2 * Math.PI * R;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function clock(sec: number) {
  return pad(Math.floor(sec / 60)) + ":" + pad(sec % 60);
}

/** Kompakt Pomodoro — takvimin üstünde, ince yatay kart. Ana sayaç hep odak;
 *  odak bitince altında ayrı (ufak) bir mola sayacı belirir, es geçilebilir. */
export function PomodoroCard() {
  const { t } = useTranslation();
  const pomo = useAppStore((s) => s.pomo);
  const remaining = useAppStore((s) => s.pomoRemaining);
  const running = useAppStore((s) => s.pomoRunning);
  const completed = useAppStore((s) => s.pomoCompleted);
  const togglePomo = useAppStore((s) => s.togglePomo);
  const resetPomo = useAppStore((s) => s.resetPomo);
  const breakActive = useAppStore((s) => s.pomoBreakActive);
  const breakRunning = useAppStore((s) => s.pomoBreakRunning);
  const breakRemaining = useAppStore((s) => s.pomoBreakRemaining);
  const toggleBreak = useAppStore((s) => s.toggleBreak);
  const skipBreak = useAppStore((s) => s.skipBreak);

  // Ana sayaç daima odak fazını gösterir.
  const total = pomo.focusMin * 60;
  const offset = CIRC * (1 - remaining / total);

  return (
    <div className="lo-card lo-pomoc">
      <div className="lo-pomoc__main">
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
          <div className="lo-pomoc__time">{clock(remaining)}</div>
          <div className="lo-pomoc__meta">
            <span className="lo-pomoc__phase">{t("pomodoro.focus")}</span>
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

      {breakActive && (
        <div className="lo-pomoc__break">
          <span className="lo-pomoc__break-icon">
            <Coffee size={13} strokeWidth={2} />
          </span>
          <span className="lo-pomoc__break-label">{t("pomodoro.break")}</span>
          <span className="lo-pomoc__break-time">{clock(breakRemaining)}</span>
          <div className="lo-pomoc__break-ctl">
            <button
              className="lo-pomoc__break-play"
              onClick={toggleBreak}
              aria-label={breakRunning ? t("pomodoro.pause") : t("pomodoro.start")}
            >
              {breakRunning ? <Pause size={12} fill="currentColor" strokeWidth={0} /> : <Play size={12} fill="currentColor" strokeWidth={0} />}
            </button>
            <button className="lo-pomoc__break-skip" onClick={skipBreak}>
              <SkipForward size={12} strokeWidth={2} />
              {t("pomodoro.skip")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Pomodoro için kısa, hoş zil sesleri — dosya gerektirmez (Web Audio ile üretilir).

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export type ChimeKind = "start" | "end" | "break-start" | "break-end";

/**
 * Zil tanımları. Odak ve mola sesleri kasıtlı olarak FARKLI:
 * - start       : odak başladı — parlak, yükselen iki nota (sine).
 * - end         : odak bitti — üç notalı inen bitiş ezgisi (sine).
 * - break-start : mola başladı — yumuşak, inen "dinlen" tonu (triangle, alçak register).
 * - break-end   : mola bitti — nazik, yükselen "odağa dön" tonu (triangle).
 */
const CHIMES: Record<ChimeKind, { notes: number[]; type: OscillatorType; peak: number; step: number; dur: number }> = {
  start: { notes: [523.25, 783.99], type: "sine", peak: 0.55, step: 0.16, dur: 0.38 },
  end: { notes: [783.99, 659.25, 523.25], type: "sine", peak: 0.55, step: 0.16, dur: 0.38 },
  "break-start": { notes: [440.0, 329.63], type: "triangle", peak: 0.5, step: 0.2, dur: 0.46 },
  "break-end": { notes: [392.0, 523.25, 659.25], type: "triangle", peak: 0.5, step: 0.14, dur: 0.34 },
};

/** Pomodoro zili çalar. Odak/mola için ayrı tını ve ezgiler. */
export function playChime(kind: ChimeKind): void {
  const ac = audioCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const cfg = CHIMES[kind];
  cfg.notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = cfg.type;
    osc.frequency.value = freq;
    const t = now + i * cfg.step;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(cfg.peak, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + cfg.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + cfg.dur + 0.04);
  });
}

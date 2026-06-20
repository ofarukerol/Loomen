// Pomodoro için kısa, hoş bir zil sesi — dosya gerektirmez (Web Audio ile üretilir).

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

/** Pomodoro zili: "start" = yükselen iki nota, "end" = üç notalı bitiş ezgisi. */
export function playChime(kind: "start" | "end"): void {
  const ac = audioCtx();
  if (!ac) return;
  const now = ac.currentTime;
  // Hoş notalar (C5/E5/G5/C6 civarı).
  const notes = kind === "start" ? [523.25, 783.99] : [783.99, 659.25, 523.25];
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = now + i * 0.16;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.42);
  });
}

/**
 * Dokunmatikte "kısa dokunuş" ile "kaydırma" hareketini ayıran saf sayaç (DOM'suz;
 * node testlerinden koşulabilir). Tablo hücresi dokunmatikte pointerdown'da değil, parmak
 * yerinde ve kısa sürede kalkınca açılır; böylece tablonun üstünden sayfa kaydırılabilir.
 */

/** Bu kadar pikselden fazla kayan parmak dokunuş değil kaydırma sayılır. */
export const TAP_SLOP_PX = 10;
/** Bundan uzun basılı tutma dokunuş sayılmaz. */
export const TAP_MAX_MS = 500;

/** Fare dışındaki her girdi (touch, pen, boş değer) dokunuş akışıyla ele alınır. */
export function isTapInput(pointerType: string | undefined | null): boolean {
  return pointerType !== "mouse";
}

export interface TapTracker {
  down(id: number, x: number, y: number, t: number): void;
  move(id: number, x: number, y: number): void;
  /** Kısa ve yerinde bir dokunuşsa true döner; her durumda sayacı sıfırlar. */
  up(id: number, x: number, y: number, t: number): boolean;
  cancel(id?: number): void;
}

export function createTapTracker(opts: { slopPx?: number; maxMs?: number } = {}): TapTracker {
  const slop = opts.slopPx ?? TAP_SLOP_PX;
  const maxMs = opts.maxMs ?? TAP_MAX_MS;
  let active: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;

  const far = (x: number, y: number) => !!active && Math.hypot(x - active.x, y - active.y) > slop;

  return {
    down(id, x, y, t) {
      // Başka bir parmak araya girdiyse (iki parmak) bu bir dokunuş değil.
      if (active && active.id !== id) {
        active.moved = true;
        return;
      }
      active = { id, x, y, t, moved: false };
    },
    move(id, x, y) {
      if (!active || active.id !== id) return;
      // Eşik bir kez aşılınca geri dönse de dokunuş sayılmaz.
      if (far(x, y)) active.moved = true;
    },
    up(id, x, y, t) {
      const a = active;
      if (!a || a.id !== id) return false;
      const ok = !a.moved && !far(x, y) && t - a.t <= maxMs;
      active = null;
      return ok;
    },
    cancel(id) {
      if (id === undefined || (active && active.id === id)) active = null;
    },
  };
}

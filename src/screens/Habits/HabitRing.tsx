import type { ReactNode } from "react";

/**
 * İlerleme halkası — Pomodoro halkasının dili: çökük zemin üstünde alışkanlık renginde yuvarlak
 * uçlu yay, ortada küçük içerik. `value` 0-1. Renk ebeveyndeki `--hab-c` değişkeninden gelir.
 */
export function HabitRing({
  value,
  size = 52,
  stroke = 4.5,
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  label?: string;
}) {
  const r = (size - stroke) / 2 - 0.5;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const c = size / 2;
  return (
    <div
      className={"lo-hab-ring" + (v >= 1 ? " is-full" : "")}
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="lo-hab-ring__svg">
        <circle cx={c} cy={c} r={r} fill="none" className="lo-hab-ring__track" strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          className="lo-hab-ring__bar"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v)}
          // Boş halkada yuvarlak uç bir nokta gibi görünmesin.
          opacity={v > 0 ? 1 : 0}
        />
        {/* Boş halkada saat 12'de başlangıç noktası (svg -90° döndüğü için x ekseninde). */}
        <circle cx={c + r} cy={c} r={stroke / 2} className="lo-hab-ring__start" opacity={v > 0 ? 0 : 1} />
      </svg>
      {children != null && <span className="lo-hab-ring__inner">{children}</span>}
    </div>
  );
}

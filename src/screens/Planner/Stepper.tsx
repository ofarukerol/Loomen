import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";

/** Modern sayı artır/azalt kontrolü (native number spinner yerine). */
export function Stepper({
  value,
  min = 1,
  max = 99,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation();
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="lo-stepper">
      <button
        className="lo-stepper__btn"
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label={t("a11y.decrease")}
      >
        <Minus size={14} strokeWidth={2.6} />
      </button>
      <input
        className="lo-stepper__val"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          if (e.target.value === "" ) return;
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
      />
      <button
        className="lo-stepper__btn"
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label={t("a11y.increase")}
      >
        <Plus size={14} strokeWidth={2.6} />
      </button>
    </div>
  );
}

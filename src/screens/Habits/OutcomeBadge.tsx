import { useTranslation } from "react-i18next";
import type { Outcome } from "../../core/habit";

/** Sonuç rozeti: Tamamlandı / Bitti · 17/21 / Bırakıldı. */
export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation();
  const text =
    outcome.kind === "completed"
      ? t("habit.outcome.completed")
      : outcome.kind === "quit"
        ? t("habit.outcome.quit")
        : t("habit.outcome.ended", { done: outcome.done, total: outcome.total });
  return <span className={`lo-hab-badge is-${outcome.kind}`}>{text}</span>;
}

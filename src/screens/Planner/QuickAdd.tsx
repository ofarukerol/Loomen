import { useTranslation } from "react-i18next";
import { Inbox, CornerDownLeft } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useIsMobile } from "../../hooks/useIsMobile";

export function QuickAdd({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const quickText = useAppStore((s) => s.quickText);
  const setQuick = useAppStore((s) => s.setQuick);
  const addTask = useAppStore((s) => s.addTask);

  return (
    <div className={"lo-quickwrap" + (compact ? " lo-quickwrap--compact" : "")}>
      <div className={"lo-quick" + (compact ? " lo-quick--compact" : "")}>
        <Inbox size={19} strokeWidth={1.8} color="var(--accent)" />
        <input
          value={quickText}
          placeholder={t("planner.quickAdd")}
          onChange={(e) => setQuick(e.target.value)}
          enterKeyHint="done"
          onKeyDown={(e) => {
            // IME (Türkçe/Arapça klavye, mobil öneri çubuğu) yazarken Enter görev eklemesin.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            // Mobilde Enter yalnız klavyeyi yönetsin; görev "+" düğmesiyle eklenir.
            if (e.key === "Enter" && !isMobile) addTask();
          }}
        />
        <button className="lo-quick__btn" onClick={addTask} aria-label={t("planner.addTask")}>
          <CornerDownLeft size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

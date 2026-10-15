import { useTranslation } from "react-i18next";
import { Inbox, CornerDownLeft } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { isQuickAddSubmitKey } from "./quickAddKeys";

export function QuickAdd({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
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
          enterKeyHint="send"
          onKeyDown={(e) => {
            // Enter (mobilde ekran klavyesinin onay tuşu da) görevi ekler; IME yazımı sürerken eklemez.
            // Kutu boşalır, odak kutuda kalır, klavye kapanmaz: art arda görev girilebilir.
            if (!isQuickAddSubmitKey({ key: e.key, keyCode: e.keyCode, isComposing: e.nativeEvent.isComposing })) return;
            e.preventDefault();
            addTask();
          }}
        />
        <button className="lo-quick__btn" onClick={addTask} aria-label={t("planner.addTask")}>
          <CornerDownLeft size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { RefreshCw, Cloud, AlertTriangle, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { tr, enUS, ar } from "date-fns/locale";
import { useAppStore } from "../store/useAppStore";

const KNOWN_STATUS = new Set(["pushed", "pulledPushed", "needVault"]);
const LOCALES: Record<string, Locale> = { tr, en: enUS, ar };
type Locale = typeof tr;

/** Obsidian tarzı senkron göstergesi — sağ altta yüzen pill. */
export function SyncStatus() {
  const { t, i18n } = useTranslation();
  const token = useAppStore((s) => s.ghToken);
  const repo = useAppStore((s) => s.ghRepo);
  const syncing = useAppStore((s) => s.ghSyncing);
  const lastSync = useAppStore((s) => s.ghLastSync);
  const status = useAppStore((s) => s.ghStatus);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const sync = useAppStore((s) => s.ghSync);

  if (!token) return null; // bağlı değilken gösterme (footer "Yerel" gösterir)

  const isError = !!status && !KNOWN_STATUS.has(status);
  const locale = LOCALES[i18n.language] ?? tr;

  let icon: React.ReactNode;
  let text: string;
  let tone: string;
  let title: string;

  if (syncing) {
    icon = <RefreshCw size={14} strokeWidth={2} className="lo-spin" />;
    text = t("github.syncing");
    tone = "busy";
    title = repo?.full_name ?? "";
  } else if (isError) {
    icon = <AlertTriangle size={14} strokeWidth={2} />;
    text = t("syncStatus.error");
    tone = "error";
    title = status!;
  } else if (!repo) {
    icon = <Cloud size={14} strokeWidth={2} />;
    text = t("github.selectRepo");
    tone = "idle";
    title = t("github.selectRepoSub");
  } else if (lastSync) {
    icon = <Check size={14} strokeWidth={2} />;
    text = formatDistanceToNow(new Date(lastSync), { addSuffix: true, locale });
    tone = "ok";
    title = `${repo.full_name} · ${new Date(lastSync).toLocaleString(i18n.language)}`;
  } else {
    icon = <Cloud size={14} strokeWidth={2} />;
    text = t("github.syncNow");
    tone = "idle";
    title = repo.full_name;
  }

  const clickable = !!repo && !!vaultPath && !syncing;

  return (
    <button
      className={"lo-syncpill lo-syncpill--" + tone}
      title={title}
      disabled={!clickable}
      onClick={() => void sync()}
    >
      {icon}
      <span>{text}</span>
    </button>
  );
}

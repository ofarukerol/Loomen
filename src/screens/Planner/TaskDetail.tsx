import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  FileText,
  CheckCircle2,
  Circle,
  Calendar,
  Repeat,
  Flag,
  Minus,
  ChevronsUp,
  ChevronUp,
  Equal,
  ChevronDown,
  ChevronsDown,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

type RecurKey = "none" | "daily" | "weekly" | "monthly" | "yearly";
const RECUR_TEXT: Record<RecurKey, string | null> = {
  none: null,
  daily: "every day",
  weekly: "every week",
  monthly: "every month",
  yearly: "every year",
};
function recurToKey(r?: string): RecurKey {
  if (!r) return "none";
  const s = r.toLowerCase();
  if (s.includes("year")) return "yearly";
  if (s.includes("month")) return "monthly";
  if (s.includes("week")) return "weekly";
  if (s.includes("day")) return "daily";
  return "none";
}

function noteName(file: string) {
  return (file.split("/").pop() ?? file).replace(/\.md$/i, "");
}

/** Görev detay/düzenleme modalı — başlık, tek tarih, tekrar, öncelik, kaynak not. */
export function TaskDetail() {
  const { t } = useTranslation();
  const id = useAppStore((s) => s.selectedTask);
  const tasks = useAppStore((s) => s.parsedTasks);
  const selectTask = useAppStore((s) => s.selectTask);
  const updateTask = useAppStore((s) => s.updateTask);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const openNote = useAppStore((s) => s.openNote);

  const task = useMemo(() => {
    if (!id) return null;
    const sep = id.lastIndexOf(":");
    const file = id.slice(0, sep);
    const line = Number(id.slice(sep + 1));
    return tasks.find((p) => p.file === file && p.line === line) ?? null;
  }, [id, tasks]);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [recur, setRecur] = useState<RecurKey>("none");
  const [priority, setPriority] = useState("");

  // Modal açıldığında alanları seçili görevden doldur.
  useEffect(() => {
    if (!task) return;
    setTitle(task.description);
    setDate(task.due ?? task.scheduled ?? "");
    setRecur(recurToKey(task.recurrence));
    setPriority(task.priority ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id || !task) return null;

  const close = () => selectTask(null);
  const save = async () => {
    await updateTask(id, {
      description: title,
      due: date || null,
      priority: priority || null,
      recurrence: RECUR_TEXT[recur],
    });
    close();
  };

  const PRIO_OPTS: { v: string; Icon: typeof Minus; label: string; color: string }[] = [
    { v: "", Icon: Minus, label: t("taskDetail.prioNone"), color: "var(--fg3)" },
    { v: "🔺", Icon: ChevronsUp, label: t("taskDetail.prioHighest"), color: "var(--danger)" },
    { v: "⏫", Icon: ChevronUp, label: t("taskDetail.prioHigh"), color: "var(--accent)" },
    { v: "🔼", Icon: Equal, label: t("taskDetail.prioMedium"), color: "var(--accent-2)" },
    { v: "🔽", Icon: ChevronDown, label: t("taskDetail.prioLow"), color: "#6E8FB8" },
    { v: "⏬", Icon: ChevronsDown, label: t("taskDetail.prioLowest"), color: "var(--fg3)" },
  ];

  const RECUR_OPTS: { k: RecurKey; label: string }[] = [
    { k: "none", label: t("taskDetail.recurNone") },
    { k: "daily", label: t("taskDetail.recurDaily") },
    { k: "weekly", label: t("taskDetail.recurWeekly") },
    { k: "monthly", label: t("taskDetail.recurMonthly") },
    { k: "yearly", label: t("taskDetail.recurYearly") },
  ];

  return (
    <div className="lo-modal" onClick={close}>
      <div className="lo-tdetail" onClick={(e) => e.stopPropagation()}>
        <div className="lo-tdetail__head">
          <button
            className="lo-tdetail__status"
            onClick={() => void toggleTask(id)}
            style={{ color: task.done ? "var(--success)" : "var(--fg3)" }}
          >
            {task.done ? (
              <CheckCircle2 size={20} strokeWidth={1.9} fill="var(--success)" color="#fff" />
            ) : (
              <Circle size={20} strokeWidth={1.7} />
            )}
          </button>
          <span className="lo-tdetail__title">{t("taskDetail.title")}</span>
          <button className="lo-tdetail__close" onClick={close} aria-label={t("taskDetail.close")}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Başlık (görev metni) — düzenlenebilir */}
        <input
          className="lo-tdetail__name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("taskDetail.titleField")}
          autoFocus
        />

        {/* Tek tarih */}
        <label className="lo-tdetail__field">
          <span className="lo-tdetail__label">
            <Calendar size={13} strokeWidth={2} /> {t("taskDetail.date")}
          </span>
          <input type="date" className="lo-tdetail__date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        {/* Tekrar */}
        <div className="lo-tdetail__field">
          <span className="lo-tdetail__label">
            <Repeat size={13} strokeWidth={2} /> {t("taskDetail.recurrence")}
          </span>
          <div className="lo-seg">
            {RECUR_OPTS.map((o) => (
              <button
                key={o.k}
                className={"lo-seg__btn" + (recur === o.k ? " is-active" : "")}
                onClick={() => setRecur(o.k)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Öncelik — ikon segmented */}
        <div className="lo-tdetail__field">
          <span className="lo-tdetail__label">
            <Flag size={13} strokeWidth={2} /> {t("taskDetail.priority")}
          </span>
          <div className="lo-prio">
            {PRIO_OPTS.map((o) => {
              const active = priority === o.v;
              return (
                <button
                  key={o.label}
                  className={"lo-prio__btn" + (active ? " is-active" : "")}
                  title={o.label}
                  onClick={() => setPriority(o.v)}
                  style={active ? { color: o.color, borderColor: o.color } : undefined}
                >
                  <o.Icon size={17} strokeWidth={2.1} color={active ? o.color : "var(--fg3)"} />
                </button>
              );
            })}
          </div>
        </div>

        {(task.tags.length > 0 || task.pomos > 0) && (
          <div className="lo-tdetail__chips">
            {task.tags.map((tag) => (
              <span className="lo-chip lo-chip--tag" key={tag}>
                #{tag}
              </span>
            ))}
            {task.pomos > 0 && <span className="lo-chip lo-chip--pomo">🍅 ×{task.pomos}</span>}
          </div>
        )}

        <div className="lo-tdetail__foot">
          <button
            className="lo-tdetail__source"
            onClick={() => {
              openNote(task.file);
              close();
            }}
          >
            <FileText size={13} strokeWidth={1.9} />
            {noteName(task.file)}
          </button>
          <button className="lo-tdetail__save" onClick={() => void save()}>
            {t("taskDetail.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

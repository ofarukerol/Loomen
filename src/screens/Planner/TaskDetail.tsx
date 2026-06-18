import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, FileText, CheckCircle2, Circle, CalendarClock, Calendar, Plane, Flag } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

const PRIORITIES = [
  { v: "", label: "—" },
  { v: "🔺", label: "🔺 En yüksek" },
  { v: "⏫", label: "⏫ Yüksek" },
  { v: "🔼", label: "🔼 Orta" },
  { v: "🔽", label: "🔽 Düşük" },
  { v: "⏬", label: "⏬ En düşük" },
];

function noteName(file: string) {
  return (file.split("/").pop() ?? file).replace(/\.md$/i, "");
}

/** Görev detay/düzenleme modalı — açıklama, tarihler, öncelik, kaynak not. */
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

  const [desc, setDesc] = useState("");
  const [due, setDue] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [start, setStart] = useState("");
  const [priority, setPriority] = useState("");

  // Modal açıldığında alanları seçili görevden doldur.
  useEffect(() => {
    if (!task) return;
    setDesc(task.description);
    setDue(task.due ?? "");
    setScheduled(task.scheduled ?? "");
    setStart(task.start ?? "");
    setPriority(task.priority ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id || !task) return null;

  const close = () => selectTask(null);
  const save = async () => {
    await updateTask(id, {
      description: desc,
      due: due || null,
      scheduled: scheduled || null,
      start: start || null,
      priority: priority || null,
    });
    close();
  };

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

        <label className="lo-tdetail__field">
          <span className="lo-tdetail__label">{t("taskDetail.description")}</span>
          <textarea
            className="lo-tdetail__textarea"
            value={desc}
            rows={2}
            onChange={(e) => setDesc(e.target.value)}
            autoFocus
          />
        </label>

        <div className="lo-tdetail__grid">
          <label className="lo-tdetail__field">
            <span className="lo-tdetail__label">
              <Calendar size={13} strokeWidth={2} /> {t("taskDetail.due")}
            </span>
            <input type="date" className="lo-tdetail__date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="lo-tdetail__field">
            <span className="lo-tdetail__label">
              <CalendarClock size={13} strokeWidth={2} /> {t("taskDetail.scheduled")}
            </span>
            <input
              type="date"
              className="lo-tdetail__date"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
            />
          </label>
          <label className="lo-tdetail__field">
            <span className="lo-tdetail__label">
              <Plane size={13} strokeWidth={2} /> {t("taskDetail.start")}
            </span>
            <input type="date" className="lo-tdetail__date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="lo-tdetail__field">
            <span className="lo-tdetail__label">
              <Flag size={13} strokeWidth={2} /> {t("taskDetail.priority")}
            </span>
            <select
              className="lo-tdetail__select"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITIES.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
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

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  FileText,
  Check,
  CheckCircle2,
  Circle,
  Calendar,
  Clock,
  Repeat,
  Flag,
  Minus,
  ChevronsUp,
  ChevronUp,
  Equal,
  ChevronDown,
  ChevronsDown,
  AlignLeft,
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  List,
  ListTodo,
  Plus,
  Trash2,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { getTaskNotes, getSubtasks } from "../../core/markdown/taskParser";
import { DatePicker } from "./DatePicker";
import { Stepper } from "./Stepper";

type RecurKey = "none" | "daily" | "weekly" | "monthly" | "yearly";

const WD_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WD_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function recurToKey(r?: string): RecurKey {
  if (!r) return "none";
  const s = r.toLowerCase();
  if (s.includes("year")) return "yearly";
  if (s.includes("month")) return "monthly";
  if (s.includes("week")) return "weekly";
  if (s.includes("day")) return "daily";
  return "none";
}

/** Tekrar kontrollerinden Obsidian Tasks uyumlu metin üret. */
function buildRecur(type: RecurKey, interval: number, weekday: number, dom: number): string | null {
  if (type === "none") return null;
  const n = Math.max(1, interval || 1);
  const unit = type === "daily" ? "day" : type === "weekly" ? "week" : type === "monthly" ? "month" : "year";
  const every = n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
  if (type === "weekly") return `${every} on ${WD_EN[weekday] ?? "Monday"}`;
  if (type === "monthly") return `${every} on the ${ordinal(dom || 1)}`;
  return every;
}

/** Mevcut tekrar metninden kontrol değerlerini çöz. */
function parseRecur(text?: string) {
  const type = recurToKey(text);
  let interval = 1;
  let weekday = 0;
  let dom = 1;
  if (text) {
    const mi = text.match(/every\s+(\d+)/i);
    if (mi) interval = Number(mi[1]);
    const mw = text.match(/on\s+([A-Za-z]+)/i);
    if (mw) {
      const idx = WD_EN.findIndex((w) => w.toLowerCase() === mw[1].toLowerCase());
      if (idx >= 0) weekday = idx;
    }
    const md = text.match(/on the\s+(\d+)/i);
    if (md) dom = Number(md[1]);
  }
  return { type, interval, weekday, dom };
}

function noteName(file: string) {
  return (file.split("/").pop() ?? file).replace(/\.md$/i, "");
}

/** Görev detay/düzenleme modalı — modern takvim, saat, tekrar, öncelik, notlar. */
export function TaskDetail() {
  const { t } = useTranslation();
  const id = useAppStore((s) => s.selectedTask);
  const tasks = useAppStore((s) => s.parsedTasks);
  const contents = useAppStore((s) => s.noteContents);
  const selectTask = useAppStore((s) => s.selectTask);
  const saveTask = useAppStore((s) => s.saveTask);
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
  const [time, setTime] = useState("");
  const [recur, setRecur] = useState<RecurKey>("none");
  const [interval, setInterval] = useState(1);
  const [weekday, setWeekday] = useState(0);
  const [dom, setDom] = useState(1);
  const [priority, setPriority] = useState("");
  const [notes, setNotes] = useState("");
  const [subtasks, setSubtasks] = useState<{ text: string; done: boolean }[]>([]);
  const [newSub, setNewSub] = useState("");
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Esc → modalı kapat.
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") selectTask(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, selectTask]);

  useEffect(() => {
    if (!task || !id) return;
    setTitle(task.description);
    setDate(task.due ?? task.scheduled ?? "");
    setTime(task.time ?? "");
    const r = parseRecur(task.recurrence);
    setRecur(r.type);
    setInterval(r.interval);
    setWeekday(r.weekday);
    setDom(r.dom || (task.due ? Number(task.due.slice(8, 10)) : 1));
    setPriority(task.priority ?? "");
    const sep = id.lastIndexOf(":");
    const file = id.slice(0, sep);
    const line = Number(id.slice(sep + 1));
    setNotes(getTaskNotes(contents[file] ?? "", line));
    setSubtasks(getSubtasks(contents[file] ?? "", line).map((sub) => ({ text: sub.text, done: sub.done })));
    setNewSub("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id || !task) return null;

  const close = () => selectTask(null);
  const save = async () => {
    // Yazılmamış (henüz Enter'lanmamış) alt görev metnini de dahil et.
    const allSubs = newSub.trim() ? [...subtasks, { text: newSub.trim(), done: false }] : subtasks;
    await saveTask(
      id,
      {
        description: title,
        due: date || null,
        time: time || null,
        priority: priority || null,
        recurrence: buildRecur(recur, interval, weekday, dom),
      },
      notes,
      allSubs
    );
    close();
  };

  // Alt görev işlemleri (yerel — Kaydet'te dosyaya yazılır).
  const toggleSub = (i: number) =>
    setSubtasks(subtasks.map((sub, j) => (j === i ? { ...sub, done: !sub.done } : sub)));
  const editSub = (i: number, text: string) =>
    setSubtasks(subtasks.map((sub, j) => (j === i ? { ...sub, text } : sub)));
  const removeSub = (i: number) => setSubtasks(subtasks.filter((_, j) => j !== i));
  const commitNewSub = () => {
    const v = newSub.trim();
    if (!v) return;
    setSubtasks([...subtasks, { text: v, done: false }]);
    setNewSub("");
  };
  const subDone = subtasks.filter((sub) => sub.done).length;

  const PRIO_OPTS: { v: string; Icon: typeof Minus; label: string; color: string }[] = [
    { v: "", Icon: Minus, label: t("taskDetail.prioNone"), color: "var(--fg3)" },
    { v: "🔺", Icon: ChevronsUp, label: t("taskDetail.prioHighest"), color: "var(--danger)" },
    { v: "⏫", Icon: ChevronUp, label: t("taskDetail.prioHigh"), color: "var(--accent)" },
    { v: "🔼", Icon: Equal, label: t("taskDetail.prioMedium"), color: "var(--accent-2)" },
    { v: "🔽", Icon: ChevronDown, label: t("taskDetail.prioLow"), color: "#6E8FB8" },
    { v: "⏬", Icon: ChevronsDown, label: t("taskDetail.prioLowest"), color: "var(--fg3)" },
  ];
  const activePrio = PRIO_OPTS.find((o) => o.v === priority) ?? PRIO_OPTS[0];

  // Notlar biçimlendirme: seçili metni markdown ile sar / satır başına ön ek koy.
  const wrapNotes = (before: string, after = before) => {
    const ta = notesRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    setNotes(notes.slice(0, s) + before + notes.slice(s, e) + after + notes.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, e + before.length);
    });
  };
  const prefixNotesLine = (prefix: string) => {
    const ta = notesRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const ls = notes.lastIndexOf("\n", s - 1) + 1;
    setNotes(notes.slice(0, ls) + prefix + notes.slice(ls));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  };
  const fmtBtns: { Icon: typeof Bold; title: string; run: () => void }[] = [
    { Icon: Bold, title: t("taskDetail.bold"), run: () => wrapNotes("**") },
    { Icon: Italic, title: t("taskDetail.italic"), run: () => wrapNotes("*") },
    { Icon: Strikethrough, title: t("taskDetail.strike"), run: () => wrapNotes("~~") },
    { Icon: Heading2, title: t("taskDetail.heading"), run: () => prefixNotesLine("## ") },
    { Icon: List, title: t("taskDetail.list"), run: () => prefixNotesLine("- ") },
  ];

  const RECUR_OPTS: { k: RecurKey; label: string }[] = [
    { k: "none", label: t("taskDetail.recurNone") },
    { k: "daily", label: t("taskDetail.recurDaily") },
    { k: "weekly", label: t("taskDetail.recurWeekly") },
    { k: "monthly", label: t("taskDetail.recurMonthly") },
    { k: "yearly", label: t("taskDetail.recurYearly") },
  ];
  const unitLabel: Record<RecurKey, string> = {
    none: "",
    daily: t("taskDetail.unitDay"),
    weekly: t("taskDetail.unitWeek"),
    monthly: t("taskDetail.unitMonth"),
    yearly: t("taskDetail.unitYear"),
  };

  return (
    <div className="lo-modal" onClick={close}>
      <div className="lo-tdetail" onClick={(e) => e.stopPropagation()}>
        <div className="lo-tdetail__head">
          <span className="lo-tdetail__title">{t("taskDetail.title")}</span>
          <button className="lo-tdetail__close" onClick={close} aria-label={t("taskDetail.close")}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="lo-tdetail__body lo-scroll">
          {/* Başlık + Tamamla */}
          <input
            className="lo-tdetail__name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("taskDetail.titleField")}
            autoFocus
          />
          <button
            className={"lo-tdetail__complete" + (task.done ? " is-done" : "")}
            onClick={() => void toggleTask(id)}
          >
            {task.done ? <CheckCircle2 size={16} strokeWidth={2.2} /> : <Circle size={16} strokeWidth={2} />}
            {task.done ? t("taskDetail.undo") : t("taskDetail.complete")}
          </button>

          <div className="lo-tdetail__cols">
          <div className="lo-tdetail__col">
          {/* Tarih + saat */}
          <div className="lo-tdetail__field">
            <span className="lo-tdetail__label">
              <Calendar size={13} strokeWidth={2} /> {t("taskDetail.date")}
            </span>
            <DatePicker value={date} onChange={setDate} />
            <div className="lo-tdetail__timerow">
              <span className="lo-tdetail__timelabel">
                <Clock size={13} strokeWidth={2} /> {t("taskDetail.time")}
              </span>
              <input
                type="time"
                className="lo-tdetail__time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              {time && (
                <button className="lo-tdetail__timeclear" onClick={() => setTime("")}>
                  {t("taskDetail.clear")}
                </button>
              )}
              {date && (
                <button className="lo-tdetail__timeclear" onClick={() => setDate("")}>
                  {t("taskDetail.clearDate")}
                </button>
              )}
            </div>
          </div>
          </div>

          <div className="lo-tdetail__col">
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

            {recur !== "none" && (
              <div className="lo-recur">
                {/* Aralık (her N) */}
                <div className="lo-recur__row">
                  <span className="lo-recur__lbl">{t("taskDetail.every")}</span>
                  <Stepper value={interval} min={1} max={99} onChange={setInterval} />
                  <span className="lo-recur__lbl">{unitLabel[recur]}</span>
                </div>

                {/* Haftalık → gün seçimi */}
                {recur === "weekly" && (
                  <div className="lo-recur__row">
                    <span className="lo-recur__lbl">{t("taskDetail.onDay")}</span>
                    <div className="lo-recur__days">
                      {WD_TR.map((w, i) => (
                        <button
                          key={w}
                          className={"lo-recur__day" + (weekday === i ? " is-active" : "")}
                          onClick={() => setWeekday(i)}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Aylık → ayın günü */}
                {recur === "monthly" && (
                  <div className="lo-recur__row">
                    <span className="lo-recur__lbl">{t("taskDetail.monthDayPre")}</span>
                    <Stepper value={dom} min={1} max={31} onChange={setDom} />
                    <span className="lo-recur__lbl">{t("taskDetail.monthDayPost")}</span>
                  </div>
                )}

                {/* Yıllık → tarih bazlı */}
                {recur === "yearly" && <div className="lo-recur__hint">{t("taskDetail.yearlyHint")}</div>}

                {/* Günlük → saatten yararlan ipucu */}
                {recur === "daily" && time && (
                  <div className="lo-recur__hint">{t("taskDetail.dailyTimeHint", { time })}</div>
                )}
              </div>
            )}
          </div>

          {/* Öncelik + seçili etiket */}
          <div className="lo-tdetail__field">
            <span className="lo-tdetail__label">
              <Flag size={13} strokeWidth={2} /> {t("taskDetail.priority")}
              <span className="lo-tdetail__priolabel" style={{ color: activePrio.color }}>
                {activePrio.label}
              </span>
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
          </div>
          </div>

          {/* Alt görevler */}
          <div className="lo-tdetail__field">
            <span className="lo-tdetail__label">
              <ListTodo size={13} strokeWidth={2} /> {t("taskDetail.subtasks")}
              {subtasks.length > 0 && (
                <span className="lo-tdetail__subcount">
                  {subDone}/{subtasks.length}
                </span>
              )}
            </span>
            <div className="lo-subtasks">
              {subtasks.map((sub, i) => (
                <div className="lo-subtask" key={i}>
                  <button
                    className={"lo-subtask__check" + (sub.done ? " is-done" : "")}
                    onClick={() => toggleSub(i)}
                    aria-label={sub.done ? t("taskDetail.undo") : t("taskDetail.complete")}
                  >
                    {sub.done ? <CheckCircle2 size={16} strokeWidth={2.2} /> : <Circle size={16} strokeWidth={2} />}
                  </button>
                  <input
                    className={"lo-subtask__text" + (sub.done ? " is-done" : "")}
                    value={sub.text}
                    onChange={(e) => editSub(i, e.target.value)}
                    placeholder={t("taskDetail.subtaskNew")}
                  />
                  <button
                    className="lo-subtask__del"
                    onClick={() => removeSub(i)}
                    aria-label={t("taskDetail.clear")}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
              <div className="lo-subtask lo-subtask--add">
                <Plus size={15} strokeWidth={2.2} className="lo-subtask__addicon" />
                <input
                  className="lo-subtask__text"
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitNewSub();
                    }
                  }}
                  onBlur={commitNewSub}
                  placeholder={t("taskDetail.addSubtask")}
                />
              </div>
            </div>
          </div>

          {/* Notlar — basit biçimlendirme araç çubuğu + alan */}
          <div className="lo-tdetail__field">
            <span className="lo-tdetail__label">
              <AlignLeft size={13} strokeWidth={2} /> {t("taskDetail.notes")}
            </span>
            <div className="lo-noteed">
              <div className="lo-noteed__bar">
                {fmtBtns.map((f, i) => (
                  <button
                    key={i}
                    className="lo-noteed__btn"
                    title={f.title}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={f.run}
                  >
                    <f.Icon size={14} strokeWidth={2.3} />
                  </button>
                ))}
              </div>
              <textarea
                ref={notesRef}
                className="lo-tdetail__notes lo-scroll"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("taskDetail.notesPlaceholder")}
                rows={4}
              />
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
        </div>

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
            <Check size={15} strokeWidth={2.4} />
            {t("taskDetail.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

import { differenceInCalendarDays, parseISO, format } from "date-fns";
import { tr } from "date-fns/locale";
import { relativeLabel } from "../../lib/relativeDate";
import type { Task, TaskGroup, GroupKind } from "../../data/sampleVault";
import type { ParsedTask } from "./types";

/** Bir görevin planlama tarihi: due > scheduled. Yoksa undefined (Planlanmamış). */
function planDate(t: ParsedTask): string | undefined {
  return t.due ?? t.scheduled;
}

function noteName(file: string): string {
  const base = file.split("/").pop() ?? file;
  return base.replace(/\.md$/i, "");
}

/** ParsedTask → UI Task. */
function toUiTask(t: ParsedTask, todayISO: string, kind: GroupKind): Task {
  const date = planDate(t)!;
  return {
    id: `${t.file}:${t.line}`,
    text: t.description,
    done: t.done,
    overdue: kind === "overdue" && !t.done,
    rel: relativeLabel(date, todayISO),
    source: noteName(t.file),
    tag: t.tags[0] ?? "",
    pomos: t.pomos,
  };
}

function kindOf(dateISO: string, todayISO: string): GroupKind {
  const d = differenceInCalendarDays(parseISO(dateISO), parseISO(todayISO));
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  return "upcoming";
}

const SUB: Record<GroupKind, string> = { today: "Bugün", overdue: "Geciken", upcoming: "Yaklaşan" };
const PRIO_RANK: Record<string, number> = { "🔺": 0, "⏫": 1, "🔼": 2, "🔽": 4, "⏬": 5 };

export interface GroupedTasks {
  groups: TaskGroup[];
  /** Planlanmamış (tarihsiz, açık) görev sayısı. */
  unplanned: number;
}

/** Görevleri tarihe göre grupla — timeline için (docs 06 §3). */
export function groupTasks(tasks: ParsedTask[], todayISO: string): GroupedTasks {
  const dated = tasks.filter((t) => planDate(t));
  const unplanned = tasks.filter((t) => !planDate(t) && !t.done).length;

  const byDate = new Map<string, ParsedTask[]>();
  for (const t of dated) {
    const d = planDate(t)!;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(t);
  }

  const groups: TaskGroup[] = Array.from(byDate.keys())
    .sort()
    .map((dateISO) => {
      const kind = kindOf(dateISO, todayISO);
      const date = parseISO(dateISO);
      const tasksOfDay = byDate
        .get(dateISO)!
        .sort((a, b) => (PRIO_RANK[a.priority ?? ""] ?? 3) - (PRIO_RANK[b.priority ?? ""] ?? 3))
        .map((t) => toUiTask(t, todayISO, kind));
      return {
        id: dateISO,
        label: format(date, "EEEE, d MMM", { locale: tr }),
        sub: SUB[kind],
        kind,
        tasks: tasksOfDay,
      };
    });

  return { groups, unplanned };
}

/** "Bugüne Odaklan" sayaçları (docs 06 §4). */
export function focusCounts(tasks: ParsedTask[], todayISO: string) {
  const open = tasks.filter((t) => !t.done);
  const yapilacak = open.filter((t) => {
    const d = planDate(t);
    return d && differenceInCalendarDays(parseISO(d), parseISO(todayISO)) >= 0;
  }).length;
  const geciken = open.filter((t) => {
    const d = planDate(t);
    return d && differenceInCalendarDays(parseISO(d), parseISO(todayISO)) < 0;
  }).length;
  const planlanmamis = open.filter((t) => !planDate(t)).length;
  return { yapilacak, geciken, planlanmamis };
}

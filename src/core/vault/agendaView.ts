// Planner liste görünümlerinin süzgeçleri (LOM-63) — mini ajanda ve Pano aynı kuralı paylaşır.
// Saf fonksiyonlar: gün grupları (groupTasks çıktısı) alır, React/i18n istemez.
import type { GroupKind, Task, TaskGroup } from "../../data/sampleVault";

/** Bugüne Odaklan sayaç/süzgeç anahtarı. */
export type AgendaFilter = "yapilacak" | "geciken" | "planlanmamis";

/** Yalnız açık (tamamlanmamış) görevler. */
export function openTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.done);
}

/** Mini ajandada bir başlık ve altındaki satırlar. */
export interface AgendaSection {
  key: string;
  /** Gün grubu türü; planlanmamışta kaynak not başlığı ("source"). */
  kind: GroupKind | "source";
  label: string;
  tasks: Task[];
}

/** Süzgecin gösterdiği gün türleri. Gecikenler yalnız "geciken" süzgecinde görünür (LOM-74). */
const FILTER_KINDS: Record<Exclude<AgendaFilter, "planlanmamis">, GroupKind[]> = {
  yapilacak: ["today", "upcoming"],
  geciken: ["overdue"],
};

/**
 * Mini ajandanın bölümleri, gün gruplarının tarih sırasında. "yapilacak" bugünle başlar,
 * yaklaşanlar altında. Yalnız tamamlanmış görevi olan gün bölüm üretmez.
 */
export function miniAgendaSections(
  groups: TaskGroup[],
  unplannedTasks: Task[],
  filter: AgendaFilter
): AgendaSection[] {
  if (filter === "planlanmamis") {
    const bySource = new Map<string, Task[]>();
    for (const tk of openTasks(unplannedTasks)) {
      if (!bySource.has(tk.source)) bySource.set(tk.source, []);
      bySource.get(tk.source)!.push(tk);
    }
    return Array.from(bySource, ([src, tasks]) => ({ key: "s" + src, kind: "source" as const, label: src, tasks }));
  }
  const wanted = FILTER_KINDS[filter];
  const sections: AgendaSection[] = [];
  for (const g of groups) {
    if (!wanted.includes(g.kind)) continue;
    const open = openTasks(g.tasks);
    if (open.length === 0) continue;
    sections.push({ key: "d" + g.id, kind: g.kind, label: g.label, tasks: open });
  }
  return sections;
}

/** Pano sütunları: yalnız açık görevler. Tamamlanan görev hiçbir sütunda yer almaz. */
export function boardColumns(groups: TaskGroup[]): Record<GroupKind, Task[]> {
  const cols: Record<GroupKind, Task[]> = { overdue: [], today: [], upcoming: [] };
  for (const g of groups) cols[g.kind].push(...openTasks(g.tasks));
  return cols;
}

/** Gün gruplarındaki açık geciken görev sayısı — Geciken sayacıyla aynı olmalı. */
export function overdueOpenCount(groups: TaskGroup[]): number {
  return groups.reduce((n, g) => (g.kind === "overdue" ? n + openTasks(g.tasks).length : n), 0);
}

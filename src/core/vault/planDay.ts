// "Günü planla" (LOM-40) — geciken görevleri seçip bugüne çekmenin saf mantığı.
// UI ve mağaza bu iki fonksiyonu kullanır; dosya yazımı taskParser.rescheduleTasksInContent'te.

import type { ParsedTask } from "./types";

/** Planlama tarihi: due > scheduled (grouping.ts ile aynı kural). */
const planDate = (t: ParsedTask) => t.due ?? t.scheduled;

/**
 * Geciken açık görevler — `focusCounts().geciken` ile aynı küme: tamamlanmamış, üst düzey
 * (alt görev değil), planlama tarihi bugünden önce. Sıra: tarih (eski önce) → dosya → satır.
 * ISO tarihler (YYYY-MM-DD) metin olarak karşılaştırılınca takvim sırasını verir.
 */
export function overdueOpenTasks(tasks: ParsedTask[], todayISO: string): ParsedTask[] {
  return tasks
    .filter((t) => {
      const d = planDate(t);
      return !t.done && (t.indent ?? 0) === 0 && !!d && d < todayISO;
    })
    .sort(
      (a, b) =>
        planDate(a)!.localeCompare(planDate(b)!) ||
        (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
        a.line - b.line,
    );
}

/**
 * Seçilen görev kimliklerini (`dosya:satır`) dosya başına gruplar: her dosya bir kez okunup
 * bir kez yazılsın. Bilinmeyen ya da tekrarlanan kimlik atlanır; satırlar artan sırada.
 */
export function planRescheduleBatches(
  ids: string[],
  tasks: ParsedTask[],
): Map<string, { line: number; raw: string }[]> {
  const byId = new Map(tasks.map((t) => [`${t.file}:${t.line}`, t]));
  const seen = new Set<string>();
  const out = new Map<string, { line: number; raw: string }[]>();
  for (const id of ids) {
    const t = byId.get(id);
    if (!t || seen.has(id)) continue;
    seen.add(id);
    if (!out.has(t.file)) out.set(t.file, []);
    out.get(t.file)!.push({ line: t.line, raw: t.raw });
  }
  for (const items of out.values()) items.sort((a, b) => a.line - b.line);
  return out;
}

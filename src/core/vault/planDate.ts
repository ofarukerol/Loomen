// Görevin planlama tarihi (LOM-47) — grouping, "Günü planla" ve sürükle-bırak aynı kuralı kullanır.
// Saf modül: i18n/date-fns içermez, node testinde koşar.

import type { ParsedTask } from "./types";

const DAILY_NAME = /^(\d{4})-(\d{2})-(\d{2})(?:-[^/\\]*)?\.md$/i;

/**
 * Günlük not adındaki tarih: `2026-10-16-Cuma.md` → `2026-10-16`. Adı geçerli bir ISO tarihle
 * başlamayan notta undefined. Klasöre bakılmaz — eski kasalarda günlük notlar `Daily/` altında.
 */
export function noteDateOf(file: string): string | undefined {
  const base = file.split(/[/\\]/).pop() ?? file;
  const m = DAILY_NAME.exec(base);
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : undefined;
}

/**
 * Planlama tarihi: due > scheduled > günlük notun tarihi. Günlük nota tarihsiz yazılan görev o
 * günündür (LOM-47); dosyaya yazılmaz, yalnız görünümde kullanılır. Hiçbiri yoksa Planlanmamış.
 */
export function planDate(t: Pick<ParsedTask, "due" | "scheduled" | "file">): string | undefined {
  return t.due ?? t.scheduled ?? noteDateOf(t.file);
}

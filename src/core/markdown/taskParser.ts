// Markdown görev parser/serializer — Obsidian Tasks uyumlu.
// İlke (docs 03 §3.3): round-trip kayıpsız. Bilinmeyen token'lar korunur;
// sadece amaçlanan değişiklik (tamamla / pomodoro / ekle) yazılır.

import type { ParsedTask } from "../vault/types";

const TASK_RE = /^(\s*)- \[([ xX])\]\s+(.*)$/;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";

const EMOJI = {
  due: "📅",
  scheduled: "⏳",
  start: "🛫",
  done: "✅",
} as const;

const PRIORITIES = ["🔺", "⏫", "🔼", "🔽", "⏬"];

function matchDate(text: string, emoji: string): string | undefined {
  const m = text.match(new RegExp(emoji + "\\s*" + DATE));
  return m ? m[1] : undefined;
}

/** Tek bir görev satırını parse et (eşleşmezse null). */
export function parseTaskLine(file: string, line: number, raw: string): ParsedTask | null {
  const m = raw.match(TASK_RE);
  if (!m) return null;
  const body = m[3];

  const tags = Array.from(body.matchAll(/#([\p{L}\d_/-]+)/gu)).map((x) => x[1]);
  const pomoMatch = body.match(/🍅\s*[×x]\s*(\d+)/);
  const priority = PRIORITIES.find((p) => body.includes(p));

  // Açıklama: tüm meta token'ları çıkar, kalan metni temizle.
  let description = body
    .replace(new RegExp(`[${EMOJI.due}${EMOJI.scheduled}${EMOJI.start}${EMOJI.done}]\\s*${DATE}`, "gu"), "")
    .replace(/🍅\s*[×x]\s*\d+/g, "")
    .replace(/🔁[^📅⏳🛫✅🔺⏫🔼🔽⏬#]*/g, "")
    .replace(/#[\p{L}\d_/-]+/gu, "");
  for (const p of PRIORITIES) description = description.split(p).join("");
  description = description.replace(/\s+/g, " ").trim();

  return {
    file,
    line,
    raw,
    done: m[2].toLowerCase() === "x",
    description,
    due: matchDate(body, EMOJI.due),
    scheduled: matchDate(body, EMOJI.scheduled),
    start: matchDate(body, EMOJI.start),
    doneDate: matchDate(body, EMOJI.done),
    tags,
    pomos: pomoMatch ? Number(pomoMatch[1]) : 0,
    priority,
  };
}

/** Bir dosyanın tüm görevlerini parse et. */
export function parseTasks(file: string, content: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  content.split("\n").forEach((raw, i) => {
    const t = parseTaskLine(file, i, raw);
    if (t) tasks.push(t);
  });
  return tasks;
}

/** Bir satırın tamamlanma durumunu değiştir (✅ tarihini ekle/çıkar). Yeni satırı döndürür. */
export function toggleDoneLine(raw: string, todayISO: string): string {
  const m = raw.match(TASK_RE);
  if (!m) return raw;
  const becomingDone = m[2] === " ";
  let out = becomingDone ? raw.replace("- [ ]", "- [x]") : raw.replace(/- \[[xX]\]/, "- [ ]");
  if (becomingDone) {
    if (!new RegExp(EMOJI.done).test(out)) out = out.replace(/\s*$/, "") + ` ${EMOJI.done} ${todayISO}`;
  } else {
    out = out.replace(new RegExp(`\\s*${EMOJI.done}\\s*${DATE}`, "u"), "");
  }
  return out;
}

/** Dosya içeriğindeki belirli satırın görev durumunu değiştir. */
export function toggleTaskInContent(content: string, line: number, todayISO: string): string {
  const lines = content.split("\n");
  if (line < 0 || line >= lines.length) return content;
  lines[line] = toggleDoneLine(lines[line], todayISO);
  return lines.join("\n");
}

/** Bir görevde düzenlenebilir alanlar. null = ilgili token'ı kaldır. */
export interface TaskPatch {
  description?: string;
  due?: string | null;
  scheduled?: string | null;
  start?: string | null;
  priority?: string | null;
}

function pick<T>(patch: T | null | undefined, cur: T | undefined): T | undefined {
  if (patch === null) return undefined; // kaldır
  if (patch === undefined) return cur; // değiştirme
  return patch;
}

/**
 * Görevi kanonik biçimde yeniden serileştir (Obsidian Tasks token sırası).
 * Bilinen token'lar korunur; not: tanınmayan token'lar (🔁, ➕, 🆔…) düşer.
 */
export function serializeTaskLine(t: ParsedTask, patch: TaskPatch = {}): string {
  const indent = t.raw.match(/^(\s*)/)?.[1] ?? "";
  const description = (patch.description ?? t.description).trim();
  const priority = pick(patch.priority, t.priority);
  const start = pick(patch.start, t.start);
  const scheduled = pick(patch.scheduled, t.scheduled);
  const due = pick(patch.due, t.due);

  const parts: string[] = [`${indent}- [${t.done ? "x" : " "}] ${description}`.trimEnd()];
  if (priority) parts.push(priority);
  for (const tag of t.tags) parts.push(`#${tag}`);
  if (t.pomos > 0) parts.push(`🍅 ×${t.pomos}`);
  if (start) parts.push(`${EMOJI.start} ${start}`);
  if (scheduled) parts.push(`${EMOJI.scheduled} ${scheduled}`);
  if (due) parts.push(`${EMOJI.due} ${due}`);
  if (t.done && t.doneDate) parts.push(`${EMOJI.done} ${t.doneDate}`);
  return parts.join(" ");
}

/** İçerikteki belirli satırı, görev yamasıyla güncelle. */
export function applyTaskPatch(content: string, line: number, t: ParsedTask, patch: TaskPatch): string {
  const lines = content.split("\n");
  if (line < 0 || line >= lines.length) return content;
  lines[line] = serializeTaskLine(t, patch);
  return lines.join("\n");
}

/** Hızlı-ekle: tek satır metinden görev satırı üret (📅 bugün ekler). */
export function buildTaskLine(text: string, dueISO?: string): string {
  let line = `- [ ] ${text.trim()}`;
  if (dueISO && !new RegExp(EMOJI.due).test(line)) line += ` ${EMOJI.due} ${dueISO}`;
  return line;
}

/** İçeriğin sonuna yeni görev satırı ekle (boş satır yönetimiyle). */
export function appendTaskToContent(content: string, taskLine: string): string {
  const trimmed = content.replace(/\s*$/, "");
  return (trimmed ? trimmed + "\n" : "") + taskLine + "\n";
}

/** Görevi belirli bir başlığın hemen altına ekle; başlık yoksa sona ekle. */
export function insertTaskUnderHeading(content: string, headingRe: RegExp, taskLine: string): string {
  const lines = content.split("\n");
  const idx = lines.findIndex((l) => headingRe.test(l));
  if (idx === -1) return appendTaskToContent(content, taskLine);
  let at = idx + 1;
  while (at < lines.length && lines[at].trim() === "") at++; // başlık sonrası boş satırları atla
  lines.splice(at, 0, taskLine);
  return lines.join("\n");
}

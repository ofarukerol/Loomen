// Markdown görev parser/serializer — Obsidian Tasks uyumlu.
// İlke (docs 03 §3.3): round-trip kayıpsız. Bilinmeyen token'lar korunur;
// sadece amaçlanan değişiklik (tamamla / pomodoro / ekle) yazılır.

import type { ParsedTask } from "../vault/types";
import { matchTags, stripTags } from "./links";

const TASK_RE = /^(\s*)- \[([ xX])\]\s+(.*)$/;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";

const EMOJI = {
  due: "📅",
  scheduled: "⏳",
  start: "🛫",
  done: "✅",
} as const;

const PRIORITIES = ["🔺", "⏫", "🔼", "🔽", "⏬"];

// — Satır sonu yönetimi —
// Windows'ta yazılmış vault'lar CRLF kullanır. `\r` bir satır sonlandırıcı olduğundan
// regex'teki `.` onu eşleştirmez; içerik yalnız "\n" ile bölünürse her satırın sonunda
// kalan `\r` TASK_RE'yi bozar ve dosyadaki TÜM görevler kaybolur. Bu yüzden bölme her
// üç biçimi de tanır, birleştirme dosyanın kendi satır sonunu korur.
const EOL_RE = /\r\n|\r|\n/;

function splitLines(content: string): string[] {
  return content.split(EOL_RE);
}

function eolOf(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

const joinLines = (lines: string[], eol: string) => lines.join(eol);

/**
 * Takvimde gerçekten var olan bir gün mü?
 * `\d{4}-\d{2}-\d{2}` deseni "2026-13-45" gibi imkansız tarihleri de geçirir; bunlar
 * `parseISO` → Invalid Date üretip tarih biçimlendiren her yerde (gruplama, ajanda)
 * RangeError ile patlar. Geçersiz tarih tarihsiz sayılır — görev kaybolmaz, kasa açılır.
 */
function isValidISODate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function matchDate(text: string, emoji: string): string | undefined {
  const m = text.match(new RegExp(emoji + "\\s*" + DATE));
  return m && isValidISODate(m[1]) ? m[1] : undefined;
}

/** Tek bir görev satırını parse et (eşleşmezse null). */
export function parseTaskLine(file: string, line: number, raw: string): ParsedTask | null {
  // Çağıran ham bir CRLF satırı verdiyse sondaki `\r`'ı at; yoksa TASK_RE eşleşmez.
  const m = raw.replace(/\r$/, "").match(TASK_RE);
  if (!m) return null;
  const body = m[3];

  const tags = matchTags(body);
  const pomoMatch = body.match(/🍅\s*[×x]\s*(\d+)/);
  const priority = PRIORITIES.find((p) => body.includes(p));
  const recMatch = body.match(/🔁\s*([^📅⏳🛫✅🔺⏫🔼🔽⏬#🍅⏰]+)/u);
  const recurrence = recMatch ? recMatch[1].trim() : undefined;
  const timeMatch = body.match(/⏰\s*(\d{1,2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] : undefined;

  // Açıklama: tüm meta token'ları çıkar, kalan metni temizle.
  // Geçersiz tarih token'ı bilerek bırakılır: alan olarak okunmadığı için sökülseydi
  // yeniden serileştirmede tamamen kaybolurdu.
  let description = body
    .replace(
      new RegExp(`[${EMOJI.due}${EMOJI.scheduled}${EMOJI.start}${EMOJI.done}]\\s*${DATE}`, "gu"),
      (whole, d: string) => (isValidISODate(d) ? "" : whole)
    )
    .replace(/🍅\s*[×x]\s*\d+/g, "")
    .replace(/⏰\s*\d{1,2}:\d{2}/g, "")
    .replace(/🔁[^📅⏳🛫✅🔺⏫🔼🔽⏬#⏰]*/g, "");
  description = stripTags(description);
  for (const p of PRIORITIES) description = description.split(p).join("");
  description = description.replace(/\s+/g, " ").trim();

  return {
    file,
    line,
    raw,
    indent: m[1].length,
    done: m[2].toLowerCase() === "x",
    description,
    due: matchDate(body, EMOJI.due),
    scheduled: matchDate(body, EMOJI.scheduled),
    start: matchDate(body, EMOJI.start),
    doneDate: matchDate(body, EMOJI.done),
    tags,
    pomos: pomoMatch ? Number(pomoMatch[1]) : 0,
    priority,
    recurrence,
    time,
  };
}

/** Bir dosyanın tüm görevlerini parse et. */
export function parseTasks(file: string, content: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  splitLines(content).forEach((raw, i) => {
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

/**
 * Dosya içeriğindeki belirli satırın görev durumunu değiştir.
 *
 * `expectedRaw` verilirse aynı güvenlik kilidi `applyTaskPatch`teki gibi uygulanır: görev
 * ayrıştırıldıktan sonra dosya dışarıdan değişmişse (senkron, başka pencere, kullanıcının
 * kendi editörü) `line` artık başka bir satırı gösterir ve kullanıcı A görevini işaretlerken
 * B görevi işaretlenirdi. Satır beklenenle birebir tutmuyorsa içerik olduğu gibi döner.
 */
export function toggleTaskInContent(
  content: string,
  line: number,
  todayISO: string,
  expectedRaw?: string,
): string {
  const lines = splitLines(content);
  if (line < 0 || line >= lines.length) return content;
  if (expectedRaw !== undefined && lines[line].replace(/\r$/, "") !== expectedRaw.replace(/\r$/, "")) {
    return content; // satır kaymış — yanlış görevi işaretlemektense hiç işaretleme
  }
  lines[line] = toggleDoneLine(lines[line], todayISO);
  return joinLines(lines, eolOf(content));
}

/** Bir görevde düzenlenebilir alanlar. null = ilgili token'ı kaldır. */
export interface TaskPatch {
  description?: string;
  due?: string | null;
  scheduled?: string | null;
  start?: string | null;
  priority?: string | null;
  recurrence?: string | null;
  time?: string | null;
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
  const recurrence = pick(patch.recurrence, t.recurrence);
  const start = pick(patch.start, t.start);
  const scheduled = pick(patch.scheduled, t.scheduled);
  const due = pick(patch.due, t.due);
  const time = pick(patch.time, t.time);

  const parts: string[] = [`${indent}- [${t.done ? "x" : " "}] ${description}`.trimEnd()];
  if (priority) parts.push(priority);
  for (const tag of t.tags) parts.push(`#${tag}`);
  if (t.pomos > 0) parts.push(`🍅 ×${t.pomos}`);
  if (recurrence) parts.push(`🔁 ${recurrence}`);
  if (time) parts.push(`⏰ ${time}`);
  if (start) parts.push(`${EMOJI.start} ${start}`);
  if (scheduled) parts.push(`${EMOJI.scheduled} ${scheduled}`);
  if (due) parts.push(`${EMOJI.due} ${due}`);
  if (t.done && t.doneDate) parts.push(`${EMOJI.done} ${t.doneDate}`);
  return parts.join(" ");
}

/**
 * İçerikteki belirli satırı, görev yamasıyla güncelle.
 *
 * Güvenlik kilidi: görev parse edildikten sonra dosya dışarıdan değişmiş olabilir
 * (senkron istemci, başka bir pencere, kullanıcının kendi editörü). O durumda `line`
 * artık başka bir satırı gösterir ve yama masum bir satırın üzerine yazar. `t.raw`
 * beklenen satırla birebir tutmuyorsa yama reddedilir ve içerik olduğu gibi döner —
 * kayıp bir düzenleme, kaybolmuş bir satırdan iyidir.
 */
/**
 * O satırda hâlâ AYNI görev mi duruyor?
 *
 * Dosya dışarıdan değiştiyse (senkron, ikinci pencere) satır numarası kayar ve
 * orada başka bir görev bulunur. Yazmadan önce bunu sormak şart: yalnız
 * "bu satır bir görev mi" diye bakmak, kullanıcının alt görev/not bloğunu
 * masum bir görevin altına yazıp onunkileri silmeye yetiyor.
 */
export function taskLineMatches(content: string, line: number, raw: string): boolean {
  const lines = splitLines(content);
  if (line < 0 || line >= lines.length) return false;
  return lines[line].replace(/\r$/, "") === raw.replace(/\r$/, "");
}

export function applyTaskPatch(content: string, line: number, t: ParsedTask, patch: TaskPatch): string {
  const lines = splitLines(content);
  if (!taskLineMatches(content, line, t.raw)) return content; // satır kaymış
  lines[line] = serializeTaskLine(t, patch);
  return joinLines(lines, eolOf(content));
}

const CHILD_INDENT = "    "; // 4 boşluk — alt görev / not bir seviye girinti

const leadWs = (l: string) => l.match(/^(\s*)/)?.[1] ?? "";

/**
 * Üst görevin altındaki "çocuk bloğu"nun [start, end) satır aralığı:
 * üst görevden daha derin girintili, ardışık, boş olmayan satırlar.
 * Blok hem alt görev (girintili `- [ ]`) hem düz not satırlarını içerir.
 */
function childBlockRange(lines: string[], line: number): [number, number] {
  const parentIndent = leadWs(lines[line] ?? "").length;
  let end = line + 1;
  while (end < lines.length) {
    const l = lines[end];
    if (l.trim() === "" || leadWs(l).length <= parentIndent) break;
    end++;
  }
  return [line + 1, end];
}

/** Bir alt görev (üst görevin çocuk bloğundaki girintili görev satırı). */
export interface SubtaskItem {
  text: string;
  done: boolean;
  line: number; // dosyadaki mutlak satır indeksi
}

/** Bir görev satırından sonraki alt görevleri oku. */
export function getSubtasks(content: string, line: number): SubtaskItem[] {
  const lines = splitLines(content);
  if (line < 0 || line >= lines.length) return [];
  const [s, e] = childBlockRange(lines, line);
  const out: SubtaskItem[] = [];
  for (let i = s; i < e; i++) {
    const p = parseTaskLine("", i, lines[i]);
    if (p) out.push({ text: p.description, done: p.done, line: i });
  }
  return out;
}

/** Görev satırından sonraki girintili not bloğunu düz metin olarak oku (alt görev satırları hariç). */
export function getTaskNotes(content: string, line: number): string {
  const lines = splitLines(content);
  if (line < 0 || line >= lines.length) return "";
  const [s, e] = childBlockRange(lines, line);
  const out: string[] = [];
  for (let i = s; i < e; i++) {
    if (TASK_RE.test(lines[i])) continue; // alt görev → not değil
    out.push(lines[i].replace(/^(?:\t|[ ]{1,4})/, "")); // yalnız satır başındaki bir seviye girinti
  }
  return out.join("\n");
}

/** Üst görevin çocuk bloğunu yeniden yaz: önce alt görevler, sonra notlar. */
export function setTaskChildren(
  content: string,
  line: number,
  subtasks: { text: string; done: boolean }[],
  notes: string
): string {
  const lines = splitLines(content);
  if (line < 0 || line >= lines.length) return content;
  // Hedef satır gerçekten bir görev değilse dosya kaymış demektir; bu blok yazımı
  // başka bir paragrafın altındaki satırları silerdi (bkz applyTaskPatch kilidi).
  if (!TASK_RE.test(lines[line])) return content;
  const childIndent = leadWs(lines[line]) + CHILD_INDENT;
  const [s, e] = childBlockRange(lines, line);
  const subLines = subtasks
    .filter((st) => st.text.trim())
    .map((st) => `${childIndent}- [${st.done ? "x" : " "}] ${st.text.trim()}`);
  const noteLines = notes.trim() ? splitLines(notes.trim()).map((l) => childIndent + l) : [];
  lines.splice(s, e - s, ...subLines, ...noteLines);
  return joinLines(lines, eolOf(content));
}

/** Görev satırının altındaki not bloğunu değiştir (alt görevleri korur). */
export function setTaskNotes(content: string, line: number, notes: string): string {
  const subs = getSubtasks(content, line).map((x) => ({ text: x.text, done: x.done }));
  return setTaskChildren(content, line, subs, notes);
}

/** Görev satırının altındaki alt görevleri değiştir (notları korur). */
export function setSubtasks(content: string, line: number, subtasks: { text: string; done: boolean }[]): string {
  return setTaskChildren(content, line, subtasks, getTaskNotes(content, line));
}

/** Bir görev satırını dosya içinde başka bir satıra taşı (sürükle-bırak sıralama). */
export function moveTaskLine(content: string, from: number, to: number): string {
  const lines = splitLines(content);
  if (from < 0 || from >= lines.length || to < 0 || to >= lines.length || from === to) return content;
  const [moved] = lines.splice(from, 1);
  lines.splice(to, 0, moved);
  return joinLines(lines, eolOf(content));
}

/** Hızlı-ekle: tek satır metinden görev satırı üret (📅 bugün ekler). */
export function buildTaskLine(text: string, dueISO?: string): string {
  let line = `- [ ] ${text.trim()}`;
  if (dueISO && !new RegExp(EMOJI.due).test(line)) line += ` ${EMOJI.due} ${dueISO}`;
  return line;
}

/** İçeriğin sonuna yeni görev satırı ekle (boş satır yönetimiyle). */
export function appendTaskToContent(content: string, taskLine: string): string {
  const eol = eolOf(content);
  const trimmed = content.replace(/\s*$/, "");
  return (trimmed ? trimmed + eol : "") + taskLine + eol;
}

/** Görevi belirli bir başlığın hemen altına ekle; başlık yoksa sona ekle. */
export function insertTaskUnderHeading(content: string, headingRe: RegExp, taskLine: string): string {
  const lines = splitLines(content);
  const idx = lines.findIndex((l) => headingRe.test(l));
  if (idx === -1) return appendTaskToContent(content, taskLine);
  let at = idx + 1;
  while (at < lines.length && lines[at].trim() === "") at++; // başlık sonrası boş satırları atla
  lines.splice(at, 0, taskLine);
  return joinLines(lines, eolOf(content));
}

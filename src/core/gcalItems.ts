// Google Takvim etkinlik açıklamasındaki `[ ]` maddeleri — saf yardımcılar (React/i18n yok).
//
// Etkinlik açıklamasına yazılan "- [ ] iş" / "[ ] iş" satırları o günün Yapılacaklar listesine
// sanal görev olarak gelir. Loomen'de işaretleme ya da metin düzenleme, açıklamanın yalnız o
// satırını değiştirerek Google'a geri yazılır (açıklama baştan üretilmez).
//
// Google web arayüzü açıklamayı HTML saklar (<br>, <p>, <li>, &nbsp;); masaüstü/mobil uygulamalar
// düz metin. İkisi de aynı bölme kuralıyla satır parçalarına ayrılır.
import type { GEvent } from "./google";
import type { ParsedTask } from "./vault/types";

export const GCAL_FILE_PREFIX = "gcal://";

/** Görev dosya yolu bir takvim maddesini mi gösteriyor? */
export function isGcalTaskFile(file: string): boolean {
  return file.startsWith(GCAL_FILE_PREFIX);
}

/** `gcal://<eventId>` → eventId (takvim maddesi değilse null). */
export function gcalEventIdOf(file: string): string | null {
  return isGcalTaskFile(file) ? file.slice(GCAL_FILE_PREFIX.length) : null;
}

/** Takvim maddesinin kalıcı kimliği: `gcal://<eventId>:<index>`. */
export function gcalTaskId(eventId: string, index: number): string {
  return `${GCAL_FILE_PREFIX}${eventId}:${index}`;
}

export interface DescItem {
  /** Açıklamadaki maddeler arasındaki sıra (0-tabanlı). */
  index: number;
  text: string;
  done: boolean;
}

/** Satır sınırları: yeni satır ve satır kıran HTML etiketleri (ayraç olarak korunur). */
const SPLIT_RE = /(\r\n|\n|\r|<br\s*\/?>|<\/p>|<\/div>|<\/li>)/i;
/** Düz satırda madde: isteğe bağlı liste imi + [ ] / [x] + metin. Satır ortasındaki [ ] madde değildir. */
const ITEM_RE = /^\s*(?:[-*+]\s+)?\[( |x|X)\]\s+(.+)$/;
/** Ham parçadaki işaret (&nbsp; ve bölünmez boşluk dahil). */
const RAW_MARK_RE = /\[(?: |&nbsp;|\u00a0|x|X)\]/i;
/** Parçanın sonundaki kapanış etiketleri. */
const TRAILING_CLOSE_RE = /(?:<\/[a-z][a-z0-9]*>\s*)*$/i;
/** İşaretten sonra metinden önce gelen boşluk / açılış etiketleri. */
const LEADING_RE = /^(?:\s|&nbsp;|<[a-z][^>]*>)*/i;
/**
 * Google açıklamalarında görülen HTML etiketleri. Yalnız bunlar sökülür; düz metindeki
 * "<tamam>" gibi yazılar etiket sayılmaz.
 */
const TAG_RE =
  /<\/?(?:a|b|i|u|s|p|br|hr|div|span|ul|ol|li|strong|em|font|code|pre|del|strike|sub|sup|h[1-6]|html-blob)\b[^>]*>/gi;
const HTML_HINT_RE =
  /<\/?(?:a|b|i|u|s|p|br|hr|div|span|ul|ol|li|strong|em|font|code|pre|del|strike|sub|sup|h[1-6]|html-blob)\b[^>]*>|&(?:nbsp|amp|lt|gt|quot|#39);/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, "&");
}

/** Ham parça → düz metin (etiketler sökülür, varlıklar çözülür, bölünmez boşluk → boşluk). */
function plainOf(seg: string): string {
  return decodeEntities(seg.replace(TAG_RE, "")).replace(/\u00a0/g, " ");
}

/** Ham açıklama → [parçalar ve ayraçlar] (çift indeksler parça, tekler ayraç). */
function splitRaw(desc: string): string[] {
  return desc.split(SPLIT_RE);
}

interface Located extends DescItem {
  /** splitRaw dizisindeki parça indeksi. */
  part: number;
}

function locateItems(parts: string[]): Located[] {
  const out: Located[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const m = ITEM_RE.exec(plainOf(parts[i]));
    if (!m) continue;
    const text = m[2].trim();
    if (!text) continue;
    out.push({ index: out.length, text, done: m[1] !== " ", part: i });
  }
  return out;
}

/** Açıklamadaki `[ ]` / `[x]` maddelerini sırayla çıkar. */
export function parseDescriptionItems(desc: string | null | undefined): DescItem[] {
  if (!desc) return [];
  return locateItems(splitRaw(desc)).map(({ index, text, done }) => ({ index, text, done }));
}

/** `closing` içinden, `removed` metninde açılışı olan etiketlerin kapanışlarını çıkar. */
function dropClosersOf(closing: string, removed: string): string {
  const open = new Map<string, number>();
  for (const m of removed.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    const name = m[1].toLowerCase();
    if (name === "br" || name === "hr") continue;
    open.set(name, (open.get(name) ?? 0) + 1);
  }
  for (const m of removed.matchAll(/<\/([a-z][a-z0-9-]*)\s*>/gi)) {
    const name = m[1].toLowerCase();
    const n = open.get(name) ?? 0;
    if (n > 0) open.set(name, n - 1);
  }
  return closing.replace(/<\/([a-z][a-z0-9-]*)>\s*/gi, (tag, name: string) => {
    const n = open.get(name.toLowerCase()) ?? 0;
    if (n === 0) return tag;
    open.set(name.toLowerCase(), n - 1);
    return "";
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Açıklamadaki `index`. maddenin işaretini ve/veya metnini değiştir; geri kalan ham metin
 * bayt bayt aynı kalır. Madde yoksa ya da `expected` (Loomen'in gördüğü hal) Google'daki
 * güncel halle uyuşmuyorsa null döner — bayat veriyle yanlış satıra yazılmaz.
 */
export function patchDescriptionItem(
  desc: string,
  index: number,
  patch: { done?: boolean; text?: string },
  expected?: { text: string; done: boolean }
): string | null {
  const parts = splitRaw(desc);
  const item = locateItems(parts).find((it) => it.index === index);
  if (!item) return null;
  if (expected && (expected.text !== item.text || expected.done !== item.done)) return null;

  let seg = parts[item.part];
  const mark = RAW_MARK_RE.exec(seg);
  if (!mark) return null;
  const markStart = mark.index;
  let markEnd = markStart + mark[0].length;

  if (patch.done !== undefined && patch.done !== item.done) {
    const next = patch.done ? "[x]" : "[ ]";
    seg = seg.slice(0, markStart) + next + seg.slice(markEnd);
    markEnd = markStart + next.length;
  }

  if (patch.text !== undefined) {
    const text = patch.text.replace(/\s*[\r\n]+\s*/g, " ").trim();
    if (!text) return null;
    if (text !== item.text) {
      const rest = seg.slice(markEnd);
      const closingAll = TRAILING_CLOSE_RE.exec(rest)?.[0] ?? "";
      const body = rest.slice(0, rest.length - closingAll.length);
      let lead = LEADING_RE.exec(body)?.[0] ?? "";
      // Metinle birlikte silinen açılış etiketlerinin kapanışları da gider (başıboş </b> kalmasın).
      const closing = dropClosersOf(closingAll, body.slice(lead.length));
      if (!/^(?:\s|&nbsp;)/i.test(lead)) lead = " " + lead;
      const out = HTML_HINT_RE.test(desc) ? escapeHtml(text) : text;
      seg = seg.slice(0, markEnd) + lead + out + closing;
    }
  }

  parts[item.part] = seg;
  return parts.join("");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Etkinliğin yerel takvim günü (yyyy-mm-dd). Tüm-gün → başlangıç tarihi; saatli → yerel gün. */
export function eventDateISO(ev: GEvent): string | null {
  if (ev.all_day) return /^\d{4}-\d{2}-\d{2}/.test(ev.start) ? ev.start.slice(0, 10) : null;
  const d = new Date(ev.start);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Saatli etkinliğin yerel başlangıç saati (HH:MM); tüm-gün ya da bozuk tarihte undefined. */
export function eventTimeHHMM(ev: GEvent): string | undefined {
  if (ev.all_day) return undefined;
  const d = new Date(ev.start);
  if (isNaN(d.getTime())) return undefined;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Etkinlik açıklamalarındaki maddeleri sanal görevlere çevir. Loomen'in kendi gönderdiği
 * etkinlikler ve maddesiz etkinlikler atlanır.
 */
export function gcalEventTasks(events: GEvent[]): ParsedTask[] {
  const out: ParsedTask[] = [];
  for (const ev of events) {
    if (ev.loomen || !ev.id) continue;
    const items = parseDescriptionItems(ev.description);
    if (items.length === 0) continue;
    const due = eventDateISO(ev) ?? undefined;
    const time = eventTimeHHMM(ev);
    for (const it of items) {
      out.push({
        file: GCAL_FILE_PREFIX + ev.id,
        line: it.index,
        raw: `- [${it.done ? "x" : " "}] ${it.text}`,
        indent: 0,
        done: it.done,
        description: it.text,
        due,
        time,
        tags: [],
        pomos: 0,
        external: { kind: "gcal", eventId: ev.id, summary: ev.summary, link: ev.html_link },
      });
    }
  }
  return out;
}

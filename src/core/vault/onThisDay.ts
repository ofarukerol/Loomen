// "Geçmiş yıllarda bugün" (LOM-52) — açık günlük notun önceki yıllardaki aynı gün notları ve
// kısa özetleri. Saf ve YALNIZ OKUR: hiçbir notu yazmaz. i18n/React içermez, node testinde koşar.

import { parseTaskLine } from "../markdown/taskParser";
import { noteDateOf } from "./planDate";

export interface OnThisDayEntry {
  path: string;
  iso: string;
  year: number;
  yearsAgo: number;
}

/** Günlük klasörü: yolun herhangi bir derinliğinde `Günlük/` ya da `Daily/` dizini var mı. */
// macOS/senkron yolları NFD gelebilir ("Gu\u0308nlu\u0308k"); harf büyüklüğü de fark etmesin.
const folderKey = (d: string) => d.normalize("NFC").toLocaleLowerCase("tr");
const isDailyDir = (d: string) => {
  const k = folderKey(d);
  return k === "günlük" || k === "daily";
};
function inDailyFolder(p: string): boolean {
  return p.split(/[/\\]/).slice(0, -1).some(isDailyDir);
}
const rootIsGunluk = (p: string) => folderKey(p.split(/[/\\]/)[0]) === "günlük";

/**
 * Aynı ay-gün, daha eski yıl, yılda bir not; yeniden eskiye. 29 Şubat yalnız 29 Şubat ile eşleşir.
 * Hem açık not hem adaylar günlük klasöründe (`Günlük/` ya da `Daily/`, her derinlikte) olmalı.
 */
export function findOnThisDay(paths: string[], currentPath: string): OnThisDayEntry[] {
  if (!inDailyFolder(currentPath)) return [];
  const cur = noteDateOf(currentPath);
  if (!cur) return [];
  const curYear = Number(cur.slice(0, 4));
  const md = cur.slice(5);
  const byYear = new Map<number, OnThisDayEntry>();
  for (const p of paths) {
    if (p === currentPath || !inDailyFolder(p)) continue;
    const iso = noteDateOf(p);
    if (!iso || iso.slice(5) !== md) continue;
    const year = Number(iso.slice(0, 4));
    if (year >= curYear) continue;
    const prev = byYear.get(year);
    // Aynı yılda birden fazla not varsa kökü Günlük/ olanı, eşitse yolu alfabetik öndekini seç.
    const better = (a: string, b: string) => {
      const ag = rootIsGunluk(a);
      const bg = rootIsGunluk(b);
      if (ag !== bg) return ag;
      return a < b;
    };
    if (!prev || better(p, prev.path)) byYear.set(year, { path: p, iso, year, yearsAgo: curYear - year });
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

export interface DaySection {
  title: string;
  emoji?: string;
  lines: string[];
  more: number;
}

export interface DaySummary {
  sections: DaySection[];
  done: string[];
  doneMore: number;
  openCount: number;
  empty: boolean;
}

const MAX_LINES = 3;
const MAX_LEN = 140;
const MAX_DONE = 5;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const EMOJI_LEAD = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;

function truncate(s: string): string {
  const chars = [...s];
  return chars.length > MAX_LEN ? chars.slice(0, MAX_LEN - 1).join("").trimEnd() + "…" : s;
}

function cleanInline(s: string): string {
  return s
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/(^|[^\p{L}\p{N}_])_([^_]+?)_(?![\p{L}\p{N}_])/gu, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(raw: string): { title: string; emoji?: string } {
  let t = cleanInline(raw);
  const m = EMOJI_LEAD.exec(t);
  let emoji: string | undefined;
  if (m) {
    emoji = m[1];
    t = t.slice(m[0].length);
  }
  t = t.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return emoji ? { title: t, emoji } : { title: t };
}

/** Günlük notun kısa özeti: bölüm başına en çok 3 anlamlı satır, tamamlanan görevler, açık görev sayısı. */
export function summarizeDay(content: string): DaySummary {
  const sections: DaySection[] = [];
  const done: string[] = [];
  let doneTotal = 0;
  let openCount = 0;

  let cur: { title: string; emoji?: string; all: string[] } = { title: "", all: [] };
  const flush = () => {
    if (cur.all.length > 0) {
      const sec: DaySection = {
        title: cur.title,
        lines: cur.all.slice(0, MAX_LINES).map(truncate),
        more: Math.max(0, cur.all.length - MAX_LINES),
      };
      if (cur.emoji) sec.emoji = cur.emoji;
      sections.push(sec);
    }
  };

  let fence: string | null = null;
  const lines = content.split(/\r?\n/);
  // Frontmatter yalnız ilk satır `---` ve ilk ~40 satırda kapanış `---` varsa sayılır.
  let frontEnd = -1;
  if (lines[0]?.trim() === "---") {
    for (let k = 1; k < Math.min(lines.length, 40); k++) {
      if (lines[k].trim() === "---") {
        frontEnd = k;
        break;
      }
    }
  }
  let inComment = false;
  lines.forEach((raw, i) => {
    if (i <= frontEnd) return;
    if (inComment) {
      if (raw.includes("-->")) {
        inComment = false;
        raw = raw.slice(raw.indexOf("-->") + 3);
        if (!raw.trim()) return;
      } else return;
    }
    // Kod bloğu içindeki "<!--" yorum açmaz (HTML örneği olabilir).
    if (fence === null) raw = raw.replace(/<!--.*?-->/g, "");
    const open = fence === null ? raw.indexOf("<!--") : -1;
    if (open >= 0) {
      inComment = true;
      raw = raw.slice(0, open);
      if (!raw.trim()) return;
    }
    const fm = /^\s*(```+|~~~+)/.exec(raw);
    if (fm && !raw.slice(fm[0].length).includes(fm[1])) {
      if (fence === null) fence = fm[1][0];
      else if (fm[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;

    const h = HEADING.exec(raw);
    if (h) {
      flush();
      cur = { ...cleanTitle(h[1]), all: [] };
      return;
    }
    if (/^\s*\|.*\|\s*$/.test(raw)) return; // tablo satırı
    const task = parseTaskLine("", i, raw.replace(/^(\s*)[*+](\s+\[)/, "$1-$2"));
    if (task) {
      if (task.done) {
        doneTotal++;
        if (done.length < MAX_DONE && task.description) done.push(truncate(cleanInline(task.description)));
      } else openCount++;
      return;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(raw) || /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(raw)) return;
    const text = cleanInline(raw.replace(/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+/, "").replace(/^\s*>\s*/, ""));
    if (text) cur.all.push(text);
  });
  flush();

  return {
    sections,
    done,
    doneMore: Math.max(0, doneTotal - done.length),
    openCount,
    empty: sections.length === 0 && doneTotal === 0 && openCount === 0,
  };
}

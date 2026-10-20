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

/** Aynı ay-gün, daha eski yıl, yılda bir not; yeniden eskiye. 29 Şubat yalnız 29 Şubat ile eşleşir. */
export function findOnThisDay(paths: string[], currentPath: string): OnThisDayEntry[] {
  const cur = noteDateOf(currentPath);
  if (!cur) return [];
  const curYear = Number(cur.slice(0, 4));
  const md = cur.slice(5);
  const byYear = new Map<number, OnThisDayEntry>();
  for (const p of paths) {
    if (p === currentPath) continue;
    const iso = noteDateOf(p);
    if (!iso || iso.slice(5) !== md) continue;
    const year = Number(iso.slice(0, 4));
    if (year >= curYear) continue;
    const prev = byYear.get(year);
    // Aynı yılda birden fazla not varsa Günlük/ altındakini, sonra yolu kısa olanı seç.
    const better = (a: string, b: string) => {
      const ag = /^Günlük\//.test(a);
      const bg = /^Günlük\//.test(b);
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
    .replace(/(\*|_)(.+?)\1/g, "$2")
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
  let inFront = false;
  const lines = content.split(/\r?\n/);
  lines.forEach((raw, i) => {
    if (i === 0 && raw.trim() === "---") {
      inFront = true;
      return;
    }
    if (inFront) {
      if (raw.trim() === "---") inFront = false;
      return;
    }
    const fm = /^\s*(```+|~~~+)/.exec(raw);
    if (fm) {
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
    const task = parseTaskLine("", i, raw);
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

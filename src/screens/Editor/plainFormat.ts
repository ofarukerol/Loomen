// Yerel <textarea> için markdown biçimlendirme — CodeMirror'a bağlı editorCommands'ın
// düz-metin karşılığı. Her işlem yeni değeri + yeni seçim aralığını döndürür; çağıran
// setDraft ile uygular ve seçimi geri kurar (kontrollü textarea).

export type FmtKind =
  | "bold"
  | "italic"
  | "strike"
  | "highlight"
  | "code"
  | "h1"
  | "h2"
  | "bullet"
  | "numbered"
  | "checklist"
  | "quote"
  | "link"
  | "hr";

export interface FmtResult {
  value: string;
  selStart: number;
  selEnd: number;
}

/** Seçimi before/after ile sarar; seçim boşsa imleci işaretlerin arasına koyar. */
function wrap(v: string, s: number, e: number, before: string, after = before): FmtResult {
  const sel = v.slice(s, e);
  const value = v.slice(0, s) + before + sel + after + v.slice(e);
  return { value, selStart: s + before.length, selEnd: e + before.length };
}

/** Seçili satır(lar)ın başına makePrefix uygular (başlık/liste/alıntı). */
function linePrefix(
  v: string,
  s: number,
  e: number,
  makePrefix: (line: string, i: number) => string,
): FmtResult {
  const lineStart = v.lastIndexOf("\n", s - 1) + 1;
  let lineEnd = v.indexOf("\n", e);
  if (lineEnd < 0) lineEnd = v.length;
  const block = v.slice(lineStart, lineEnd);
  const newBlock = block.split("\n").map(makePrefix).join("\n");
  const value = v.slice(0, lineStart) + newBlock + v.slice(lineEnd);
  return { value, selStart: lineStart, selEnd: lineStart + newBlock.length };
}

/** Satır başındaki verilen ön eki aç/kapat (varsa kaldır, yoksa ekle). */
function togglePrefix(line: string, prefix: string): string {
  return line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line;
}

export function applyFormat(el: HTMLTextAreaElement, kind: FmtKind): FmtResult {
  const v = el.value;
  const s = el.selectionStart;
  const e = el.selectionEnd;
  switch (kind) {
    case "bold":
      return wrap(v, s, e, "**");
    case "italic":
      return wrap(v, s, e, "*");
    case "strike":
      return wrap(v, s, e, "~~");
    case "highlight":
      return wrap(v, s, e, "==");
    case "code":
      return wrap(v, s, e, "`");
    case "link":
      return wrap(v, s, e, "[[", "]]");
    case "h1":
      return linePrefix(v, s, e, (l) => togglePrefix(l.replace(/^#{1,6}\s+/, ""), "# "));
    case "h2":
      return linePrefix(v, s, e, (l) => togglePrefix(l.replace(/^#{1,6}\s+/, ""), "## "));
    case "bullet":
      return linePrefix(v, s, e, (l) => togglePrefix(l, "- "));
    case "numbered":
      return linePrefix(v, s, e, (l, i) => `${i + 1}. ${l.replace(/^\d+\.\s+/, "")}`);
    case "checklist":
      return linePrefix(v, s, e, (l) => togglePrefix(l, "- [ ] "));
    case "quote":
      return linePrefix(v, s, e, (l) => togglePrefix(l, "> "));
    case "hr": {
      // İmleç satırının sonuna kendi satırında yatay çizgi ekle.
      const pre = v.slice(0, e);
      const needsNl = pre.length > 0 && !pre.endsWith("\n");
      const insert = `${needsNl ? "\n" : ""}---\n`;
      const value = pre + insert + v.slice(e);
      const pos = (pre + insert).length;
      return { value, selStart: pos, selEnd: pos };
    }
  }
}

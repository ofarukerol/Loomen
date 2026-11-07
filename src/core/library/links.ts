// Kitap bağlantıları — `loomen://book/<id>?hl=<hlId>` (LOM-83).
//
// Not içinde düz Markdown bağlantısı olarak durur: `[s. 12](loomen://book/<id>?hl=<hlId>)`.
// Başka bir Markdown uygulamasında açılınca da okunur kalır. Okuma ve düzenleme modu bu
// modüldeki bulucuyla bağlantıyı tanır ve tıklanınca kitabı o çizimde açar (K4).

import { BOOK_ID_RE, HIGHLIGHT_ID_RE } from "./codec";
import type { BookLink } from "./types";

export const BOOK_LINK_SCHEME = "loomen://book/";

/** Bağlantı metni üret. */
export function bookLink(link: BookLink): string {
  if (!BOOK_ID_RE.test(link.bookId)) throw new Error(`Geçersiz kitap kimliği: ${link.bookId}`);
  const q: string[] = [];
  if (link.highlightId) {
    if (!HIGHLIGHT_ID_RE.test(link.highlightId)) throw new Error(`Geçersiz çizim kimliği: ${link.highlightId}`);
    q.push(`hl=${link.highlightId}`);
  }
  if (link.page !== undefined && Number.isInteger(link.page) && link.page > 0) q.push(`page=${link.page}`);
  return `${BOOK_LINK_SCHEME}${link.bookId}${q.length ? "?" + q.join("&") : ""}`;
}

/** Bağlantıyı çöz; kitap bağlantısı değilse ya da bozuksa null. */
export function parseBookLink(href: string): BookLink | null {
  const s = href.trim();
  if (!s.toLowerCase().startsWith(BOOK_LINK_SCHEME)) return null;
  const rest = s.slice(BOOK_LINK_SCHEME.length);
  const [pathPart, query = ""] = rest.split("?", 2);
  const bookId = pathPart.replace(/\/+$/, "").split("#")[0];
  if (!BOOK_ID_RE.test(bookId)) return null;
  const out: BookLink = { bookId };
  for (const pair of query.split("#")[0].split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq < 0 ? pair : pair.slice(0, eq);
    const v = eq < 0 ? "" : pair.slice(eq + 1);
    if (k === "hl" && HIGHLIGHT_ID_RE.test(v)) out.highlightId = v;
    else if (k === "page" && /^\d{1,6}$/.test(v) && Number(v) > 0) out.page = Number(v);
  }
  return out;
}

/** Satır içindeki bir kitap bağlantısı: `[etiket](loomen://book/…)`. Konumlar satıra göre. */
export interface BookLinkMatch {
  from: number;
  to: number;
  label: string;
  href: string;
  link: BookLink;
}

// Etikette köşeli parantez yalnız kaçışlı (`\[`, `\]`) olur (not eşitlemesi böyle yazar);
// bağlantı boşluk ve kapanış parantezi içermez. `label` kaçışsız hâldir.
const LINK_RE = /\[((?:\\.|[^\]\\\n])*)\]\((loomen:\/\/book\/[^\s)]+)\)/gi;

function unescapeLabel(s: string): string {
  return s.replace(/\\([[\]\\])/g, "$1");
}

/** Metindeki kitap bağlantılarını bul (bozuk olanlar atlanır). */
export function findBookLinks(text: string): BookLinkMatch[] {
  const out: BookLinkMatch[] = [];
  LINK_RE.lastIndex = 0;
  for (let m = LINK_RE.exec(text); m; m = LINK_RE.exec(text)) {
    const link = parseBookLink(m[2]);
    if (!link) continue;
    out.push({ from: m.index, to: m.index + m[0].length, label: unescapeLabel(m[1]), href: m[2], link });
  }
  return out;
}

/** Not içindeki çizim işaretleri (`<!-- loomen:hl … -->`) okuma modunda gizlenir. */
export const HL_MARKER_LINE_RE = /^\s*<!--\s*\/?loomen:hl\s+[A-Za-z0-9_-]+\s*-->\s*$/;

export function isHighlightMarkerLine(line: string): boolean {
  return HL_MARKER_LINE_RE.test(line);
}

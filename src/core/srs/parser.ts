// Notlardan kart çıkarma.
//
// NOTE_SAFETY: bu dosya not içeriğini yalnızca OKUR. Hiçbir koşulda nota yazmaz,
// yeniden serileştirmez. Kartların durumu ayrı dosyada (Tekrar/durum.json) durur.
//
// Desteklenen işaretlemeler:
//   Başkent neresi :: Ankara          → tek yönlü kart
//   Elma ::: apple                    → çift yönlü (iki kart)
//   çok satırlı blok, arada tek `?`   → uzun soru/cevap
//   Türkiye'nin başkenti ==Ankara==   → gizlenen kelime (cloze)
//   notta #tekrar etiketi             → notun tamamı okuma kartı olur

import type { SrsCard, SrsSyntax } from "./types";

/** Kısa, hızlı, çakışması pratikte imkânsız kimlik (64 bit, 16 hex).
 *  Satır numarası kullanılmaz — satırlar kayar, kimlik kaymamalı. */
export function cardId(file: string, key: string): string {
  const s = `${file}#${key}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c) >>> 0;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/** Soru metnini kimlik için sadeleştir — küçük biçim değişiklikleri kimliği bozmasın. */
export function normalizeKey(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[*_`~]/g, "")
    .trim()
    .toLocaleLowerCase("tr");
}

const CLOZE_RE = /==([^=]+)==/g;
const TAG_RE = /(^|\s)#tekrar(\/[\p{L}\d_-]+)?(?=\s|$)/u;

/** Notta #tekrar etiketi var mı (notun tamamı tekrar edilsin mi). */
export function hasNoteTag(content: string): boolean {
  return TAG_RE.test(content);
}

/** Kod bloğu satırlarını işaretle — içindeki `::` kart sayılmasın. */
function fenceMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      mask[i] = true;
      continue;
    }
    mask[i] = inFence;
  }
  return mask;
}

/** Bir notun içindeki tüm kartları çıkar. */
export function parseCards(file: string, content: string, syntax: SrsSyntax): SrsCard[] {
  const out: SrsCard[] = [];
  const lines = content.split("\n");
  const fenced = fenceMask(lines);
  const seen = new Set<string>();

  const push = (c: Omit<SrsCard, "id" | "key">) => {
    const key = normalizeKey(c.question) + (c.kind === "reverse" ? "|ters" : "");
    const id = cardId(file, key);
    if (seen.has(id)) return; // aynı notta birebir aynı soru iki kez → tek kart
    seen.add(id);
    out.push({ ...c, id, key });
  };

  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const line = lines[i];
    const body = line.replace(/^\s*[-*+]\s+/, "").trim(); // liste maddesi de kart olabilir
    if (!body) continue;

    // — Soru ::: Cevap (çift yönlü) — üç iki nokta önce denenmeli
    const rev = body.split(":::");
    if (syntax.reverse && rev.length === 2 && rev[0].trim() && rev[1].trim()) {
      const q = rev[0].trim();
      const a = rev[1].trim();
      push({ file, kind: "basic", question: q, answer: a, line: i });
      push({ file, kind: "reverse", question: a, answer: q, line: i });
      continue;
    }

    // — Soru :: Cevap
    if (syntax.basic && !body.includes(":::")) {
      const idx = body.indexOf("::");
      if (idx > 0 && idx < body.length - 2) {
        const q = body.slice(0, idx).trim();
        const a = body.slice(idx + 2).trim();
        if (q && a) {
          push({ file, kind: "basic", question: q, answer: a, line: i });
          continue;
        }
      }
    }

    // — ==gizlenmiş== kelime: her gizli bölüm ayrı kart
    if (syntax.cloze && body.includes("==")) {
      const hits = Array.from(body.matchAll(CLOZE_RE));
      if (hits.length > 0) {
        hits.forEach((m, n) => {
          const shown = body.replace(CLOZE_RE, (_, inner: string, off: number) =>
            off === m.index ? "[…]" : inner,
          );
          const q = shown + (hits.length > 1 ? ` (${n + 1}/${hits.length})` : "");
          push({ file, kind: "cloze", question: q, answer: body.replace(CLOZE_RE, "$1"), line: i });
        });
        continue;
      }
    }
  }

  // — Çok satırlı blok: soru satırları, tek başına `?`, cevap satırları, boş satırla biter
  if (syntax.block) {
    for (let i = 0; i < lines.length; i++) {
      if (fenced[i] || lines[i].trim() !== "?") continue;
      let a = i - 1;
      while (a >= 0 && lines[a].trim() && !fenced[a]) a--;
      let b = i + 1;
      while (b < lines.length && lines[b].trim() && !fenced[b]) b++;
      const q = lines.slice(a + 1, i).join("\n").trim();
      const ans = lines.slice(i + 1, b).join("\n").trim();
      if (q && ans) push({ file, kind: "block", question: q, answer: ans, line: a + 1 });
    }
  }

  return out;
}

/** #tekrar etiketli not için tek bir "notu oku" kartı üret. */
export function noteCard(file: string, content: string): SrsCard {
  const title = file.split("/").pop()?.replace(/\.md$/i, "") ?? file;
  return {
    id: cardId(file, "@not"),
    file,
    key: "@not",
    kind: "note",
    question: title,
    answer: content,
    line: 0,
  };
}

/** Bir kasadaki tüm kartları topla. */
export function collectCards(
  contents: Record<string, string>,
  syntax: SrsSyntax,
  excluded: string[],
): SrsCard[] {
  const out: SrsCard[] = [];
  for (const [file, content] of Object.entries(contents)) {
    if (!file.toLowerCase().endsWith(".md")) continue;
    if (excluded.some((d) => d && (file === d || file.startsWith(d + "/")))) continue;
    out.push(...parseCards(file, content, syntax));
    if (syntax.note && hasNoteTag(content)) out.push(noteCard(file, content));
  }
  return out;
}

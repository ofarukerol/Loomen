import type { VaultNote } from "../vault/types";

export interface SearchHit {
  path: string;
  name: string;
  /** Eşleşen ilk satırın kısa alıntısı. */
  snippet: string;
  /** Başlıkta mı eşleşti? */
  inTitle: boolean;
  /** Eşleşme puanı; büyük olan daha iyi eşleşmedir. */
  score: number;
}

/**
 * Türkçe harf katlama — karşılaştırma öncesi metni tek biçime indirger.
 * Arama, bağlantı çözümleme ve ad eşleştirmenin ortak temeli.
 *
 * İki iş yapar:
 *  1) NFC: "İ" hem U+0130 hem "I + birleşen nokta" (U+0049 U+0307) olarak yazılabilir;
 *     ayrıştırılmış biçimler birleştirilmezse eşit metinler eşit görünmez.
 *  2) i/I ailesini tek harfe katlar. `toLocaleLowerCase("tr")` I→ı, İ→i verir; bu yüzden
 *     "Istanbul" → "ıstanbul" ile "İstanbul" → "istanbul" hiç eşleşmez. Kullanıcı hangi
 *     "i"yi yazdığını bilmediğinden dördü de "i" sayılır.
 */
export function foldTr(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[İIıi]/g, "i")
    .toLocaleLowerCase("tr");
}

/**
 * Arama için daha geniş katlama: foldTr'nin üstüne aksanları da atar (ç→c, ğ→g, ö→o, ş→s,
 * ü→u, â→a). Yalnız arama içindir; bağlantı ve graf eşleştirmesi foldTr ile birebir kalır.
 */
export function foldSearch(s: string): string {
  return foldTr(s).normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

/** Metni arama kelimelerine böler; tire, boşluk ve noktalama ayraç sayılır. */
export function tokenizeSearch(s: string): string[] {
  return foldSearch(s).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Kelimelerin aralıksız birleşimi: "E-Dönüştür" → "edonustur". */
export function compact(s: string): string {
  return tokenizeSearch(s).join("");
}

interface IndexedLine {
  raw: string;
  compact: string;
  words: string[];
}

interface IndexedNote {
  note: VaultNote;
  titleCompact: string;
  titleWords: Set<string>;
  lines: IndexedLine[];
}

export interface SearchIndex {
  notes: IndexedNote[];
  /** Kasa geneli sözlük: kelime → o kelimeyi içeren notların sırası (notes dizisindeki). */
  dict: Map<string, Set<number>>;
}

/** Notları bir kez dizinler; aramalar bu dizini kullanır. */
export function buildSearchIndex(notes: VaultNote[], contents: Record<string, string>): SearchIndex {
  const dict = new Map<string, Set<number>>();
  const add = (w: string, i: number) => {
    let set = dict.get(w);
    if (!set) dict.set(w, (set = new Set()));
    set.add(i);
  };
  const indexed = notes.map((note, i): IndexedNote => {
    const titleTokens = tokenizeSearch(note.name);
    titleTokens.forEach((w) => add(w, i));
    const lines: IndexedLine[] = [];
    for (const raw of (contents[note.path] ?? "").split(/\r\n|\r|\n/)) {
      if (raw.trim() === "") continue;
      const words = tokenizeSearch(raw);
      if (words.length === 0) continue;
      words.forEach((w) => add(w, i));
      lines.push({ raw, compact: words.join(""), words });
    }
    return { note, titleCompact: titleTokens.join(""), titleWords: new Set(titleTokens), lines };
  });
  return { notes: indexed, dict };
}

/** Levenshtein uzaklığı; `max`'ı aşınca erken çıkar (max + 1 döner). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Yaklaşık eşleşmede izin verilen hata sayısı (kısa kelimede yok). */
function fuzzyLimit(word: string): number {
  if (word.length < 4) return 0;
  return word.length >= 8 ? 2 : 1;
}

// Puan katmanları: birleşik > dağınık > yaklaşık; başlıkta eşleşme ek puan alır.
const SCORE_COMPACT = 300;
const SCORE_SCATTERED = 200;
const SCORE_FUZZY = 100;
const TITLE_BONUS = 50;

// Dizin, contents nesnesine bağlı önbellekte tutulur; contents ya da not listesi değişince yeniden kurulur.
const indexCache = new WeakMap<Record<string, string>, { notes: VaultNote[]; index: SearchIndex }>();

function getIndex(notes: VaultNote[], contents: Record<string, string>): SearchIndex {
  const cached = indexCache.get(contents);
  if (cached && cached.notes === notes) return cached.index;
  const index = buildSearchIndex(notes, contents);
  indexCache.set(contents, { notes, index });
  return index;
}

function cleanSnippet(line: string): string {
  return line.replace(/^[#>\s*-]+/, "").trim().slice(0, 80);
}

/**
 * Vault içinde tam metin arama (başlık + içerik). Yazım farklarına dayanıklı:
 *  1) Birleşik: tire/boşluk/noktalama/aksan yok sayılır ("E dönüştür" = "e-donustur" = "E-Dönüştür").
 *  2) Dağınık: sorgunun kelimeleri notta ayrı yerlerde olabilir (kelime başı eşleşmesi yeter).
 *  3) Yaklaşık: 4+ harfli kelimede küçük yazım hatası ("donustir") tolere edilir.
 * En iyi eşleşme en üstte.
 */
export function searchNotes(
  notes: VaultNote[],
  contents: Record<string, string>,
  query: string,
  limit = 50
): SearchHit[] {
  const qWords = tokenizeSearch(query);
  if (qWords.length === 0) return [];
  const qCompact = qWords.join("");
  const index = getIndex(notes, contents);

  // Her sorgu kelimesi için: birebir/önek eşleşen sözlük kelimeleri ve yaklaşık eşleşenler.
  const exactWords: Set<string>[] = qWords.map(() => new Set());
  const fuzzyWords: Set<string>[] = qWords.map(() => new Set());
  for (const w of index.dict.keys()) {
    qWords.forEach((q, k) => {
      if (w.startsWith(q)) exactWords[k].add(w);
      else {
        const max = fuzzyLimit(q);
        if (max > 0 && editDistance(q, w, max) <= max) fuzzyWords[k].add(w);
      }
    });
  }
  const notesOf = (words: Set<string>): Set<number> => {
    const out = new Set<number>();
    for (const w of words) index.dict.get(w)?.forEach((i) => out.add(i));
    return out;
  };
  const exactNotes = exactWords.map(notesOf);
  const fuzzyNotes = fuzzyWords.map(notesOf);

  const hits: SearchHit[] = [];
  index.notes.forEach((entry, i) => {
    const { note, titleCompact, titleWords, lines } = entry;
    let score = 0;
    let inTitle = false;
    let snippetLine: string | undefined;

    // 1) Birleşik eşleşme
    const titleCompactHit = titleCompact.includes(qCompact);
    const compactLine = lines.find((l) => l.compact.includes(qCompact));
    if (titleCompactHit || compactLine) {
      score = SCORE_COMPACT + (titleCompactHit ? TITLE_BONUS : 0);
      inTitle = titleCompactHit;
      snippetLine = compactLine?.raw;
    } else {
      // 2) Dağınık  3) Yaklaşık — her sorgu kelimesi notta bir yolla bulunmalı.
      const allExact = qWords.every((_, k) => exactNotes[k].has(i));
      const allAny = allExact || qWords.every((_, k) => exactNotes[k].has(i) || fuzzyNotes[k].has(i));
      if (!allAny) return;
      const matched = new Set<string>();
      qWords.forEach((_, k) => {
        exactWords[k].forEach((w) => matched.add(w));
        if (!allExact) fuzzyWords[k].forEach((w) => matched.add(w));
      });
      const titleAll = qWords.every((_, k) =>
        [...titleWords].some((w) => exactWords[k].has(w) || (!allExact && fuzzyWords[k].has(w)))
      );
      inTitle = titleAll || [...titleWords].some((w) => matched.has(w));
      score = (allExact ? SCORE_SCATTERED : SCORE_FUZZY) + (titleAll ? TITLE_BONUS : 0);
      snippetLine = lines.find((l) => l.words.some((w) => matched.has(w)))?.raw;
    }
    hits.push({ path: note.path, name: note.name, snippet: cleanSnippet(snippetLine ?? ""), inTitle, score });
  });

  hits.sort(
    (a, b) => b.score - a.score || Number(b.inTitle) - Number(a.inTitle) || a.name.localeCompare(b.name, "tr")
  );
  return hits.slice(0, limit);
}

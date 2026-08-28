// Notu asistanın sindirebileceği küçük parçalara böler.
//
// İki kural bölmeyi yönetir:
//  1. Başlık hiyerarşisi korunur — her parça hangi başlığın altında olduğunu bilir, böylece
//     asistan "Bu bölüm neyle ilgili?" sorusuna doğru cevap verir ve alıntı anlamlı olur.
//  2. Kod bloğu ve tablo asla ortadan bölünmez — yarım kod/tablo parçası hem aramayı hem
//     cevabı bozar.
//
// Not diske hiç dokunulmaz; girdi zaten bellekteki içeriktir (store.noteContents).

export interface Chunk {
  /** Kaynak not yolu — alıntıda bu yol açılır. */
  path: string;
  /** Not adı (uzantısız dosya adı). */
  title: string;
  /** Başlık zinciri, ör. "Kurulum > Sunucu". Başlıksız girişte boş. */
  heading: string;
  /** Parçanın metni. */
  text: string;
  /** Not içindeki sıra (0'dan) — kararlı kimlik için. */
  index: number;
}

export interface ChunkOptions {
  /** Hedef parça uzunluğu (karakter). */
  maxChars?: number;
  /** Ardışık parçalar arasındaki örtüşme (karakter) — bağlam kopmasın diye. */
  overlap?: number;
}

const MAX_CHARS = 800;
const OVERLAP = 120;

/** "klasor/Not.md" → "Not" */
export function noteTitle(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** YAML frontmatter'ı atla (ilk satır "---" ise kapanışına kadar). */
function stripFrontmatter(lines: string[]): string[] {
  if (lines[0]?.trim() !== "---") return lines;
  let j = 1;
  while (j < lines.length && lines[j].trim() !== "---") j++;
  return lines.slice(j + 1);
}

interface Block {
  text: string;
  /** Bölünemez blok (kod bloğu, tablo) — uzun olsa bile ortadan kesilmez. */
  atomic: boolean;
}

/** Başlık altındaki metni paragraf / kod bloğu / tablo bloklarına ayırır. */
function blocksOf(lines: string[]): Block[] {
  const out: Block[] = [];
  let buf: string[] = [];
  const flush = (atomic = false) => {
    const text = buf.join("\n").trim();
    if (text) out.push({ text, atomic });
    buf = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.trim().match(/^(```|~~~)/);
    if (fence) {
      flush();
      const marker = fence[1];
      buf.push(line);
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) buf.push(lines[i]); // kapanış satırı
      i++;
      flush(true);
      continue;
    }
    // Tablo: ardışık "|" ile başlayan satırlar tek blok
    if (line.trim().startsWith("|")) {
      flush();
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        buf.push(lines[i]);
        i++;
      }
      flush(true);
      continue;
    }
    if (line.trim() === "") {
      flush();
      i++;
      continue;
    }
    buf.push(line);
    i++;
  }
  flush();
  return out;
}

/** Örtüşme için önceki parçanın kuyruğunu al — kelime ortasından kesme. */
function tailOf(text: string, n: number): string {
  if (text.length <= n) return text;
  const cut = text.slice(text.length - n);
  const sp = cut.search(/\s/);
  return sp >= 0 ? cut.slice(sp + 1) : cut;
}

/** Tek başına çok uzun bölünebilir bloğu satır/cümle sınırından böl. */
function hardSplit(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    // Sırayla: satır sonu → cümle sonu → boşluk → çaresiz kalırsak tam kes
    let cut = window.lastIndexOf("\n");
    if (cut < maxChars * 0.5) cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
    if (cut < maxChars * 0.5) cut = window.lastIndexOf(" ");
    if (cut < maxChars * 0.5) cut = maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Bir başlık bölümünün bloklarını hedef uzunlukta parçalara paketle. */
function packSection(blocks: Block[], maxChars: number, overlap: number): string[] {
  const pieces: string[] = [];
  let cur = "";
  const push = () => {
    const t = cur.trim();
    if (t) pieces.push(t);
    cur = "";
  };

  for (const b of blocks) {
    if (b.atomic && b.text.length > maxChars) {
      push();
      pieces.push(b.text); // kod/tablo bütün kalır
      continue;
    }
    if (!b.atomic && b.text.length > maxChars) {
      push();
      pieces.push(...hardSplit(b.text, maxChars));
      continue;
    }
    if (cur && cur.length + b.text.length + 2 > maxChars) push();
    cur = cur ? cur + "\n\n" + b.text : b.text;
  }
  push();

  if (overlap <= 0 || pieces.length < 2) return pieces;
  // Örtüşme: her parçanın başına bir öncekinin kuyruğunu ekle (kod/tablo hariç).
  return pieces.map((p, i) => {
    if (i === 0 || p.startsWith("```") || p.startsWith("~~~") || p.startsWith("|")) return p;
    const t = tailOf(pieces[i - 1], overlap);
    return t ? t + "\n\n" + p : p;
  });
}

/** Tek notu parçalara böl. İçerik boşsa boş dizi döner. */
export function chunkNote(path: string, content: string, opts: ChunkOptions = {}): Chunk[] {
  const maxChars = opts.maxChars ?? MAX_CHARS;
  const overlap = opts.overlap ?? OVERLAP;
  const title = noteTitle(path);
  const lines = stripFrontmatter(content.split("\n"));

  const out: Chunk[] = [];
  let stack: { level: number; text: string }[] = [];
  let section: string[] = [];
  let inFence = false;
  let fenceMarker = "";

  const headingPath = () => stack.map((h) => h.text).join(" > ");

  const flushSection = (heading: string) => {
    const blocks = blocksOf(section);
    section = [];
    if (blocks.length === 0) return;
    for (const text of packSection(blocks, maxChars, overlap)) {
      out.push({ path, title, heading, text, index: out.length });
    }
  };

  for (const line of lines) {
    const t = line.trim();
    // Kod bloğu içindeki "#" satırı başlık DEĞİLDİR.
    const fence = t.match(/^(```|~~~)/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (t.startsWith(fenceMarker)) {
        inFence = false;
      }
      section.push(line);
      continue;
    }
    const h = !inFence && t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushSection(headingPath());
      const level = h[1].length;
      const text = h[2].replace(/#+\s*$/, "").trim();
      stack = stack.filter((x) => x.level < level);
      stack.push({ level, text });
      continue;
    }
    section.push(line);
  }
  flushSection(headingPath());

  return out;
}

/** Birden çok notu tek seferde böl (dışlanan yollar çağıran tarafından ayıklanır). */
export function chunkNotes(contents: Record<string, string>, opts: ChunkOptions = {}): Chunk[] {
  const out: Chunk[] = [];
  for (const [path, text] of Object.entries(contents)) out.push(...chunkNote(path, text, opts));
  return out;
}

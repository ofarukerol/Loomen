// Getirme (retrieval) — soruya en yakın not parçalarını bulur.
//
// Parçalar not başına önbelleklenir: içerik metni (string) değişmediyse yeniden bölünmez.
// Böylece her soruda tüm kasa yeniden işlenmez; yalnızca kaydedilen not yeniden bölünür.
//
// Birden fazla arama yolu (şimdilik BM25, ileride yerel gömme) RRF ile birleştirilir:
// her listedeki SIRA'ya bakılır, skorlara değil. Skorlar farklı ölçeklerde olduğu için
// bu birleştirme normalizasyon gerektirmez ve pratikte şaşırtıcı derecede sağlamdır.

import { chunkNote, type Chunk } from "./chunk";
import { buildBm25, bm25Search, type Bm25Index, type ScoredIndex } from "./bm25";

export interface Retrieved {
  chunk: Chunk;
  /** RRF birleşim skoru — mutlak değeri anlamlı değildir, yalnız sıralama için. */
  score: number;
}

/** Yol, dışlanan klasörlerden birinin altında mı? */
export function isExcluded(path: string, excluded: string[]): boolean {
  if (excluded.length === 0) return false;
  const p = path.replace(/^\/+/, "");
  return excluded.some((raw) => {
    const dir = raw.replace(/^\/+|\/+$/g, "");
    return dir !== "" && (p === dir || p.startsWith(dir + "/"));
  });
}

// ---------------------------------------------------------------- önbellek

interface NoteCache {
  src: string;
  chunks: Chunk[];
}

const noteCache = new Map<string, NoteCache>();

let bmIndex: Bm25Index | null = null;
/** Önbelleğin hangi girdiyle kurulduğunu tanımlayan imza — değişince indeks yenilenir. */
let bmSignature = "";

/** Tüm önbelleği düşür (kasa değişince). */
export function resetIndex(): void {
  noteCache.clear();
  bmIndex = null;
  bmSignature = "";
}

function chunksFor(path: string, src: string): Chunk[] {
  const hit = noteCache.get(path);
  if (hit && hit.src === src) return hit.chunks;
  const chunks = chunkNote(path, src);
  noteCache.set(path, { src, chunks });
  return chunks;
}

/**
 * Kasanın arama indeksini hazırla. Değişmeyen notlar yeniden bölünmez; indeks yalnızca
 * parça kümesi gerçekten değiştiyse yeniden kurulur.
 */
export function ensureIndex(contents: Record<string, string>, excluded: string[] = []): Bm25Index {
  const paths = Object.keys(contents)
    .filter((p) => !isExcluded(p, excluded))
    .sort();

  const all: Chunk[] = [];
  // İmza: yol + içerik uzunluğu + parça sayısı. İçeriğin tamamını hash'lemeye gerek yok;
  // parçalar zaten not başına içerik kimliğiyle önbellekli, imza sadece küme değişimini yakalar.
  const sig: string[] = [];
  for (const p of paths) {
    const cs = chunksFor(p, contents[p]);
    all.push(...cs);
    sig.push(`${p}:${contents[p].length}:${cs.length}`);
  }
  const signature = sig.join("|");

  if (!bmIndex || signature !== bmSignature) {
    bmIndex = buildBm25(all);
    bmSignature = signature;
  }
  // Artık kasada olmayan notların önbelleğini bırak (bellek sızmasın).
  if (noteCache.size > paths.length) {
    const live = new Set(paths);
    for (const key of [...noteCache.keys()]) if (!live.has(key)) noteCache.delete(key);
  }
  return bmIndex;
}

// ---------------------------------------------------------------- RRF

const RRF_K = 60;

/**
 * Reciprocal Rank Fusion: birden çok sıralı listeyi tek sıralamaya indirger.
 * Her liste, sıraya göre 1/(k + sıra) katkısı verir. `weights` verilirse liste ağırlıklanır.
 */
export function rrfFuse(lists: ScoredIndex[][], weights?: number[]): ScoredIndex[] {
  const acc = new Map<number, number>();
  lists.forEach((list, li) => {
    const w = weights?.[li] ?? 1;
    list.forEach((item, rank) => {
      acc.set(item.i, (acc.get(item.i) ?? 0) + w / (RRF_K + rank + 1));
    });
  });
  return [...acc.entries()]
    .map(([i, score]) => ({ i, score }))
    .sort((a, b) => b.score - a.score);
}

export interface RetrieveOptions {
  /** Kaç parça döndürülecek. */
  k?: number;
  /** AI'dan hariç tutulan klasörler. */
  excluded?: string[];
  /**
   * Anlamsal arama sonuçları (yerel gömme) — hazır olduğunda verilir; verilmezse
   * yalnızca BM25 kullanılır. Sıralı liste beklenir.
   */
  semantic?: ScoredIndex[];
}

/** Soruya en yakın parçaları getir. */
export function retrieve(
  contents: Record<string, string>,
  query: string,
  opts: RetrieveOptions = {}
): Retrieved[] {
  const k = opts.k ?? 6;
  const index = ensureIndex(contents, opts.excluded ?? []);
  const lexical = bm25Search(index, query, Math.max(k * 4, 20));
  if (lexical.length === 0 && !opts.semantic?.length) return [];

  const fused = opts.semantic?.length ? rrfFuse([lexical, opts.semantic]) : lexical;
  return fused.slice(0, k).map((x) => ({ chunk: index.chunks[x.i], score: x.score }));
}

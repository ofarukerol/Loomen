// BM25 — sözcük tabanlı arama. Model yok, indirme yok, tamamen yerel ve anlık.
//
// Bu, asistanın "hangi notlarda cevap var?" sorusuna verdiği ilk cevaptır. Anlamsal
// (gömme tabanlı) arama bunun yerini almaz, yanına gelir: biri kelimeyi tutar, öbürü
// anlamı. İkisi retrieve.ts'te RRF ile birleştirilir.
//
// Türkçe notu: küçültme `toLocaleLowerCase("tr")` ile yapılır (I/İ sorunu), mevcut
// search/search.ts ile aynı yaklaşım.

import type { Chunk } from "./chunk";

const K1 = 1.2;
const B = 0.75;

const lower = (s: string) => s.toLocaleLowerCase("tr");

/** Çok sık geçtiği için ayırt edici olmayan sözcükler (tr + en). */
const STOP = new Set(
  (
    "ve veya ile ama fakat ancak çünkü ki de da bu şu o bir bu şey için gibi kadar daha en çok az " +
    "olarak olan olduğu var yok ise ne nasıl neden hangi kim her hep hiç sonra önce üzere göre " +
    "the a an and or but if then of to in on at by for with from as is are was were be been it this " +
    "that these those not no do does did can could will would should"
  ).split(/\s+/)
);

/**
 * Metni sözcüklere ayır. Unicode harf/rakam dizileri; tek harfli ve durak sözcükler atılır.
 * Markdown işaretleri (\*, #, [[ ]]) doğal olarak ayraç sayılır.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of lower(text).matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = m[0];
    if (w.length < 2 || STOP.has(w)) continue;
    out.push(w);
  }
  return out;
}

/** Kök yaklaşımı için sabit önek uzunluğu. */
const STEM_LEN = 5;

/**
 * Türkçe eklemeli bir dildir: "toplantı", "toplantıyı", "toplantıda", "toplantılarımız"
 * hep aynı şeydir ama harfi harfine eşleşmez. Tam bir çekim çözümleyicisi yazmak yerine
 * sözcüğün ilk 5 harfi kök yerine kullanılır — Türkçe bilgi erişiminde uzun süredir
 * bilinen, ucuz ve şaşırtıcı ölçüde iyi çalışan bir yaklaşımdır.
 *
 * Sözcük indekse HEM tam hâliyle HEM köküyle girer. Böylece tam eşleşme iki kez puan
 * alır ve doğal olarak yalnız kökü tutan sonucun üstüne çıkar — ayrıca bir ağırlık
 * mekanizması gerekmez.
 */
export function expand(word: string): string[] {
  return word.length > STEM_LEN ? [word, word.slice(0, STEM_LEN)] : [word];
}

export interface Bm25Index {
  /** Parçalar — sonuçlar bu diziye indeksle döner. */
  chunks: Chunk[];
  /** sözcük → [parça indeksi, o parçadaki geçiş sayısı][] */
  postings: Map<string, [number, number][]>;
  /** Parça uzunlukları (sözcük sayısı). */
  lengths: number[];
  avgLen: number;
}

export function buildBm25(chunks: Chunk[]): Bm25Index {
  const postings = new Map<string, [number, number][]>();
  const lengths: number[] = [];
  let total = 0;

  chunks.forEach((c, i) => {
    // Başlık ve not adı da aranabilir olsun — parça metnine ek olarak sayılır.
    const tokens = tokenize(`${c.title} ${c.heading} ${c.text}`);
    // Uzunluk normalizasyonu yüzey sözcük sayısıyla yapılır; kökler parçayı "uzatmasın".
    lengths.push(tokens.length);
    total += tokens.length;

    const tf = new Map<string, number>();
    for (const w of tokens) for (const form of expand(w)) tf.set(form, (tf.get(form) ?? 0) + 1);
    for (const [w, n] of tf) {
      const p = postings.get(w);
      if (p) p.push([i, n]);
      else postings.set(w, [[i, n]]);
    }
  });

  return { chunks, postings, lengths, avgLen: chunks.length ? total / chunks.length : 0 };
}

export interface ScoredIndex {
  /** `index.chunks` içindeki konum. */
  i: number;
  score: number;
}

/** BM25 skoruna göre en iyi `k` parçayı döner (skoru 0 olanlar elenir). */
export function bm25Search(index: Bm25Index, query: string, k = 20): ScoredIndex[] {
  const terms = tokenize(query);
  if (terms.length === 0 || index.chunks.length === 0) return [];

  const N = index.chunks.length;
  const scores = new Map<number, number>();

  // Aynı terim sorguda birden çok geçerse bir kez işlenir (skoru şişirmesin).
  for (const term of new Set(terms.flatMap(expand))) {
    const posting = index.postings.get(term);
    if (!posting) continue;
    const df = posting.length;
    // Robertson/Sparck-Jones IDF; tüm parçalarda geçen terim ~0 katkı verir.
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    for (const [i, tf] of posting) {
      const norm = 1 - B + (B * index.lengths[i]) / (index.avgLen || 1);
      const add = (idf * (tf * (K1 + 1))) / (tf + K1 * norm);
      scores.set(i, (scores.get(i) ?? 0) + add);
    }
  }

  return [...scores.entries()]
    .map(([i, score]) => ({ i, score }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

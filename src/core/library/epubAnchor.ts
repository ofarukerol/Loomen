// EPUB çizim yeri ↔ metin düğümleri (LOM-83, EPUB parçası). Saf: DOM istemez.
//
// Çizim yeri, bölümün (temizlenmiş) gövdesindeki BÜTÜN metin düğümleri art arda eklendiğinde
// oluşan düz metinde [start, end) karakter aralığıdır. Yazı boyutu, tema ve ekran genişliği bu
// metni değiştirmez; bu yüzden çizim yerinde kalır (K5). <mark> ile sarmak da metni değiştirmez
// (yalnız düğümleri böler), konumlar sarmadan sonra da geçerlidir.
//
// Görüntüleyici metin düğümlerinin uzunluklarını verir; bu dosya konum hesaplarını yapar.

import { cleanQuote } from "./model";

/** Düğüm başlangıçları: starts[i] = i. düğümün düz metindeki başı; son eleman toplam uzunluk. */
export function prefixOffsets(lengths: readonly number[]): number[] {
  const out = new Array<number>(lengths.length + 1);
  out[0] = 0;
  for (let i = 0; i < lengths.length; i++) out[i + 1] = out[i] + lengths[i];
  return out;
}

export interface NodePoint {
  node: number;
  offset: number;
}

/**
 * Düz metindeki konumu düğüm + düğüm içi ofsete çevir. İki düğümün sınırındaki konum için
 * `bias = "start"` sonraki düğümün başını, `"end"` önceki düğümün sonunu seçer (aralığın başı ve
 * sonu boş düğüme taşmasın). Düğüm yoksa null.
 */
export function locateOffset(starts: readonly number[], pos: number, bias: "start" | "end" = "start"): NodePoint | null {
  const count = starts.length - 1;
  if (count <= 0) return null;
  const total = starts[count];
  const p = Math.max(0, Math.min(total, Math.round(pos)));
  let i: number;
  if (bias === "start") {
    // starts[i] <= p olan en büyük i: p < toplam ise bu düğüm boş olamaz (p'yi içerir).
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= p) lo = mid;
      else hi = mid - 1;
    }
    i = lo;
    // Metnin sonu: sondaki boş düğümlerden metni olan son düğüme dön.
    while (i > 0 && starts[i + 1] === starts[i]) i--;
  } else {
    // starts[i+1] >= p olan en küçük i: p > 0 ise bu düğüm p'nin hemen önüne kadar metin taşır.
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid + 1] >= p) hi = mid;
      else lo = mid + 1;
    }
    i = lo;
    // Metnin başı: baştaki boş düğümlerden metni olan ilk düğüme geç.
    while (i < count - 1 && starts[i + 1] === starts[i]) i++;
  }
  return { node: i, offset: Math.max(0, Math.min(starts[i + 1] - starts[i], p - starts[i])) };
}

export interface PaintRange {
  id: string;
  start: number;
  end: number;
}

/** Bir düğümün boyanacak parçası; `ids` o parçayı kaplayan çizimler (eklenme sırasıyla). */
export interface PaintSegment {
  node: number;
  from: number;
  to: number;
  ids: string[];
}

/**
 * Çizim aralıklarını düğüm parçalarına böl. Çakışan çizimler aynı parçada birlikte listelenir;
 * görüntüleyici en sondakini (en üstteki) rengiyle gösterir. Boş/dışarı taşan aralık atlanır.
 * Parçalar düğüm ve ofset sırasıyladır.
 */
export function paintSegments(lengths: readonly number[], ranges: readonly PaintRange[]): PaintSegment[] {
  const starts = prefixOffsets(lengths);
  const total = starts[starts.length - 1];
  const valid = ranges
    .map((r) => ({ id: r.id, start: Math.max(0, r.start), end: Math.min(total, r.end) }))
    .filter((r) => r.end > r.start);
  if (!valid.length) return [];
  const out: PaintSegment[] = [];
  for (let n = 0; n < lengths.length; n++) {
    const a = starts[n];
    const b = starts[n + 1];
    if (b <= a) continue;
    const hits = valid.filter((r) => r.start < b && r.end > a);
    if (!hits.length) continue;
    // Bu düğümdeki kesim noktaları.
    const cuts = new Set<number>([0, b - a]);
    for (const r of hits) {
      cuts.add(Math.max(0, r.start - a));
      cuts.add(Math.min(b - a, r.end - a));
    }
    const sorted = [...cuts].sort((x, y) => x - y);
    for (let k = 0; k + 1 < sorted.length; k++) {
      const from = sorted[k];
      const to = sorted[k + 1];
      const ids = hits.filter((r) => r.start < a + to && r.end > a + from).map((r) => r.id);
      if (ids.length) out.push({ node: n, from, to, ids });
    }
  }
  return out;
}

/** Boşluk mu (yumuşak tire dahil)? */
const isSpace = (c: string) => /\s/.test(c) || c === "­";

/** Seçimin başındaki ve sonundaki boşlukları kırp. Geriye bir şey kalmazsa null. */
export function trimRange(text: string, start: number, end: number): [number, number] | null {
  let s = Math.max(0, Math.min(start, end));
  let e = Math.min(text.length, Math.max(start, end));
  while (s < e && isSpace(text[s])) s++;
  while (e > s && isSpace(text[e - 1])) e--;
  return e > s ? [s, e] : null;
}

/**
 * Boşlukları tek boşluğa indirip yumuşak tireleri atan metin + her karakterin ham metindeki yeri.
 * map[i] = norm[i]'nin ham konumu; map[norm.length] = ham uzunluk.
 */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let prevSpace = true; // baştaki boşluk atılır
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "­") continue;
    if (/\s/.test(c)) {
      if (prevSpace) continue;
      norm += " ";
      map.push(i);
      prevSpace = true;
    } else {
      norm += c;
      map.push(i);
      prevSpace = false;
    }
  }
  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  map.push(text.length);
  return { norm, map };
}

/**
 * Kayıtlı aralığı bölüm metnine karşı doğrula. Aralıktaki metin alıntıyla uyuşuyorsa aynen döner.
 * Uyuşmuyorsa (kitap dosyası farklı baskı, temizleme kuralı değişti) alıntı metinde aranır ve
 * eski başlangıca en yakın eşleşme seçilir. Bulunamazsa null — çizim boyanmaz ama listede kalır.
 */
export function relocateRange(text: string, start: number, end: number, quote: string): [number, number] | null {
  const want = cleanQuote(quote);
  if (!want) return null;
  if (start >= 0 && end <= text.length && end > start && cleanQuote(text.slice(start, end)) === want) return [start, end];
  const { norm, map } = normalizeWithMap(text);
  let best: number | null = null;
  for (let at = norm.indexOf(want); at >= 0; at = norm.indexOf(want, at + 1)) {
    if (best === null || Math.abs(map[at] - start) < Math.abs(map[best] - start)) best = at;
  }
  if (best === null) return null;
  const s = map[best];
  const lastChar = best + want.length - 1;
  const e = map[lastChar] + 1;
  return [s, e];
}

/** Bölüm içindeki kesir (0..1) → yaklaşık karakter konumu ve tersi; kalınan yer için yardımcı. */
export function clampOffset(offset: number, total: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(total, Math.round(offset)));
}

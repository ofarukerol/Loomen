// Tekrar listeleri (LOM-66): ekranın kullandığı saf yardımcılar — ilerleme sayıları, arama,
// satır ekleme/düzenleme/silme. Dosyaya yazmaz; kaydetme store'daki srsListSave ile yapılır.
//
// Satır işlemleri listeyi yerinde değiştirmez, her zaman yeni nesne döner (React durumu için).

import { listCards, normalizeRow, type ListRow, type ReviewList } from "./lists";
import { normalizeKey } from "./parser";
import { isoDay } from "./queue";
import type { SrsState } from "./types";

/** Yeni liste penceresindeki simgeler (bayrak yok: bazı sistemlerde harf çifti görünür). */
export const LIST_EMOJIS = ["📚", "🔤", "🗣️", "🧠", "🧪", "📐", "🌍", "🎓", "💊", "⚖️", "🎵", "✈️"] as const;

export interface ListProgress {
  /** Listenin kart sayısı (iki yönlü listede satır başına iki kart). */
  total: number;
  /** Yerleşmiş tekrar evresindeki kartlar. */
  learned: number;
  /** Öğrenme ya da yeniden öğrenme evresindeki kartlar. */
  learning: number;
  /** Hiç sorulmamış kartlar (durumu yok ya da "new"). */
  fresh: number;
  /** Bugün sorulacak (yeni olmayan, dondurulmamış, bugünlük ertelenmemiş) kartlar. */
  due: number;
  /** Çok unutulan kartlar. */
  leech: number;
  /** Öğrenilenin tüm kartlara oranı (0–100, yuvarlanmış). */
  percent: number;
}

/** Liste kartının sayıları. Dondurulmuş kart evresine göre sayılır ama "bugün"e girmez. */
export function listProgress(list: ReviewList, states: Record<string, SrsState>, now = new Date()): ListProgress {
  const cards = listCards(list);
  const today = isoDay(now);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  const out: ListProgress = { total: cards.length, learned: 0, learning: 0, fresh: 0, due: 0, leech: 0, percent: 0 };
  for (const c of cards) {
    const st = states[c.id];
    if (!st || st.phase === "new") {
      out.fresh++;
      continue;
    }
    if (st.phase === "review") out.learned++;
    else out.learning++;
    if (st.leech) out.leech++;
    if (st.frozen || (st.postponed && st.postponed >= today)) continue;
    // buildQueue ile aynı kural: öğrenme adımı vakti gelince, tekrar gün içinde vadesi gelince.
    const limit = st.phase === "review" ? endOfDay : now.getTime();
    if (new Date(st.due).getTime() <= limit) out.due++;
  }
  out.percent = out.total ? Math.round((out.learned / out.total) * 100) : 0;
  return out;
}

/** Sorguyla eşleşen satırların indeksleri (ön, arka ya da notta; büyük/küçük harf duyarsız). */
export function searchRows(rows: ListRow[], query: string): number[] {
  const q = normalizeKey(query);
  const out: number[] = [];
  rows.forEach((r, i) => {
    if (!q || normalizeKey(r.front).includes(q) || normalizeKey(r.back).includes(q) || normalizeKey(r.note ?? "").includes(q)) {
      out.push(i);
    }
  });
  return out;
}

export interface AddResult {
  list: ReviewList;
  /** Eklenen satır sayısı. */
  added: number;
  /** Ön yüzü listede ya da aynı eklemede zaten olduğu için atlanan satır sayısı. */
  duplicates: number;
}

/**
 * Satırları listenin sonuna ekle. Ön ya da arkası boş satır sessizce düşer.
 * `skipExisting` kapalıysa listede olan satırlar da eklenir (aynı eklemedeki tekrar yine atlanır;
 * kart kimliği ön yüzden üretildiği için listede aynı ön yüz iki kart vermez).
 */
export function addRows(list: ReviewList, rows: ListRow[], skipExisting = true): AddResult {
  const seen = new Set(skipExisting ? list.rows.map((r) => normalizeKey(r.front)) : []);
  const fresh: ListRow[] = [];
  let duplicates = 0;
  for (const r of rows) {
    const n = normalizeRow(r);
    if (!n.front || !n.back) continue;
    const k = normalizeKey(n.front);
    if (seen.has(k)) {
      duplicates++;
      continue;
    }
    seen.add(k);
    fresh.push(n);
  }
  if (!fresh.length) return { list, added: 0, duplicates };
  return { list: { ...list, rows: [...list.rows, ...fresh] }, added: fresh.length, duplicates };
}

/** Ön yüzü başka bir satırda olan satır (j hariç) — tek satır ekleme/düzenleme uyarısı için. */
export function rowExists(rows: ListRow[], front: string, except = -1): boolean {
  const k = normalizeKey(front);
  return !!k && rows.some((r, j) => j !== except && normalizeKey(r.front) === k);
}

/**
 * i. satırı değiştir. Geçersiz indeks, ön/arkası boş satır ya da ön yüzü başka satırla aynı
 * düzenlemede aynı liste döner (aynı ön yüz tek kart verir; ikinci satır hiç sorulmazdı).
 */
export function updateRow(list: ReviewList, i: number, row: ListRow): ReviewList {
  if (!Number.isInteger(i) || i < 0 || i >= list.rows.length) return list;
  const n = normalizeRow(row);
  if (!n.front || !n.back || rowExists(list.rows, n.front, i)) return list;
  const rows = list.rows.slice();
  rows[i] = n;
  return { ...list, rows };
}

/** i. satırı sil. Geçersiz indekste aynı liste döner. */
export function removeRow(list: ReviewList, i: number): ReviewList {
  if (!Number.isInteger(i) || i < 0 || i >= list.rows.length) return list;
  return { ...list, rows: list.rows.filter((_, j) => j !== i) };
}

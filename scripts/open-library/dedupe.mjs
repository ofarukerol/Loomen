// Açık kitaplık: tekrar ayıklama. Saf modül.
// Yalnız dosya özeti (SHA-256) aynı olanlar tekrardır. Başlık, yazar ya da metin benzerliği eleme sebebi olmaz.
import { createHash } from 'node:crypto';

const sha = (data) => createHash('sha256').update(data).digest('hex');
/** Yalnız dosya baytları birebir aynıysa tekrar: metin sadeleştirmesiyle birleştirme yok. */
export function contentKey(bytes) {
  return `file:${sha(bytes)}`;
}

/**
 * items: { key, source, id, decision, sha256, contentKey }. Kazanan: açık aday > kapalı, sonra kaynak sırası, sonra kimlik.
 * @returns {{ kept: object[], dropped: { item: object, keptBy: object, reason: string }[] }}
 */
export function groupDuplicates(items, order) {
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const seen = new Map();
  items.forEach((item, i) => {
    for (const k of [`sha:${item.sha256}`, `content:${item.contentKey}`]) {
      if (seen.has(k)) parent[find(i)] = find(seen.get(k)); else seen.set(k, i);
    }
  });
  const rank = (item) => [item.decision === 'public' ? 0 : 1, order.indexOf(item.source), item.id];
  const compare = (a, b) => {
    const x = rank(a), y = rank(b);
    return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
  };
  const groups = new Map();
  items.forEach((item, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(item); });
  const kept = [], dropped = [];
  for (const group of groups.values()) {
    group.sort(compare);
    const [winner, ...rest] = group;
    kept.push(winner);
    for (const item of rest) {
      dropped.push({ item, keptBy: winner, reason: 'Dosya birebir aynı.' });
    }
  }
  const index = (x) => `${order.indexOf(x.source)}:${x.id}`;
  kept.sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  dropped.sort((a, b) => (index(a.item) < index(b.item) ? -1 : 1));
  return { kept, dropped };
}

const titleKey = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Aynı başlık+yazar, farklı içerik: yalnız raporlanır, hiçbiri elenmez. items: { key, title, author }. */
export function editionGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const t = titleKey(item.title);
    if (!t) continue;
    const k = `${t}|${titleKey(item.author)}`;
    if (!groups.has(k)) groups.set(k, { title: item.title, author: item.author ?? '', books: [] });
    groups.get(k).books.push(item.key);
  }
  return [...groups.values()].filter(g => g.books.length > 1).map(g => ({ ...g, books: g.books.sort() }))
    .sort((a, b) => (a.books[0] < b.books[0] ? -1 : 1));
}

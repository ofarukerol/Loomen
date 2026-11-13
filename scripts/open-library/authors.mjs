// Açık kitaplık 3/4: yazar adlarını birleştirir. Saf işlev; dosya ve ağ erişimi yok.
//
// Kesin birleşme yalnız iki yolla olur: (1) authorKey birebir aynı, (2) eş ad tablosunda aynı
// kayda yazılmış yazımlar. Benzeyen ama emin olunmayan adlar BİRLEŞTİRİLMEZ, `review` listesine düşer.
import { createHash } from 'node:crypto';

const fail = (message) => { throw new Error(message); };
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha12 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

/**
 * Güvenli sadeleştirme. Arapçada yalnız hareke, şedde, tatvil ve elif biçimleri sadeleşir;
 * ى/ي ve ة/ه birleştirilmez. Boş sonuç '' (yazar yok) demektir.
 */
export function authorKey(name) {
  if (typeof name !== 'string') return '';
  let s = name.normalize('NFKD').trim();
  s = s.replace(/[ـً-ٰٟۖ-ۭ]/g, ''); // tatvil, hareke, şedde, küçük işaretler
  s = s.replace(/[̀-ͯ]/g, ''); // Latin aksanları
  s = s.replace(/[أإآٱ]/g, 'ا'); // أ إ آ ٱ → ا
  s = s.replace(/[İIı]/g, 'i').toLowerCase();
  const parts = s.split(/[,،]/);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) s = `${parts[1]} ${parts[0]}`; // Soyad, Ad → ad soyad
  return s.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

const foldArabic = (k) => k.replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const PREFIX_WORDS = new Set(['el', 'al', 'ibn', 'bin', 'ابن', 'بن']);
const stripPrefixes = (tokens) => tokens
  .filter(t => !PREFIX_WORDS.has(t))
  .map(t => (t.startsWith('ال') && t.length > 3 ? t.slice(2) : t));
const DATE_MARKERS = new Set(['d', 'o', 'm', 'h', 'ms', 'hs', 'vefat', 'ت', 'توفي']);
function stripDate(tokens) {
  const i = tokens.findIndex(t => /^\d+$/.test(t));
  if (i < 0) return tokens;
  return tokens.slice(0, i > 0 && DATE_MARKERS.has(tokens[i - 1]) ? i - 1 : i);
}
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      low = Math.min(low, cur[j]);
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** İki farklı anahtar için "emin olunmadı" gerekçeleri. */
function doubts(ka, kb) {
  const reasons = [];
  const ta = ka.split(' '), tb = kb.split(' ');
  if (ka.length >= 3 && kb.length >= 3 && editDistance(ka, kb, 2) <= 2) reasons.push('Yazımlar bir iki harf farklı.');
  if (ta.length === tb.length && ta.length >= 2) {
    let initial = false;
    const ok = ta.every((x, i) => {
      const y = tb[i];
      if (x === y) return true;
      if ((x.length === 1 && y.startsWith(x)) || (y.length === 1 && x.startsWith(y))) { initial = true; return true; }
      return false;
    });
    if (ok && initial) reasons.push('Biri baş harf kısaltması gibi görünüyor.');
  }
  const pa = stripPrefixes(ta), pb = stripPrefixes(tb);
  if (pa.length && sameList(pa, pb)) reasons.push('Yalnız el-/al-/ibn/bin öneki farklı.');
  if (foldArabic(ka) === foldArabic(kb)) reasons.push('Arapça ى/ي ya da ة/ه harfi farklı.');
  const sa = new Set(ta), sb = new Set(tb);
  const subset = (x, y) => x.size < y.size && [...x].every(t => y.has(t));
  if (subset(sa, sb) || subset(sb, sa)) reasons.push('Birinin sözcükleri ötekinin içinde geçiyor.');
  const da = stripDate(ta), db = stripDate(tb);
  if (da.length && sameList(da, db)) reasons.push('Yalnız vefat tarihi eki farklı.');
  return reasons;
}

const MULTI = /;|&|\sve\s|\sand\s/i;
const SPLIT = /\s*(?:;|&|\sve\s|\sand\s)\s*/i;

/**
 * @param {{ key: string, author?: string|null }[]} books
 * @param {{ id: string, name: string, variants?: string[] }[]} aliases  eş ad tablosu
 * @param {[string, string][]} separate  "ayrı kişi" çiftleri (yazım, yazım)
 */
export function mergeAuthors(books, aliases = [], separate = []) {
  const keyToAlias = new Map(), aliasById = new Map();
  for (const a of aliases) {
    if (!a || typeof a.id !== 'string' || !a.id || typeof a.name !== 'string') fail('Eş ad tablosunda id ve name olmayan satır var.');
    if (aliasById.has(a.id)) fail(`Eş ad tablosunda aynı id iki kez yazılmış: ${a.id}`);
    aliasById.set(a.id, a);
    for (const spelling of [a.name, ...(a.variants ?? [])]) {
      const k = authorKey(spelling);
      if (!k) fail(`Eş ad tablosunda boş yazım var (${a.id}).`);
      const other = keyToAlias.get(k);
      if (other && other !== a.id) fail(`"${spelling}" yazımı eş ad tablosunda iki ayrı kayda yazılmış (${other}, ${a.id}).`);
      keyToAlias.set(k, a.id);
    }
  }
  const clusters = new Map(), bookAuthor = {}, unknown = [];
  for (const book of [...books].sort((x, y) => byId(x.key, y.key))) {
    const spelling = typeof book.author === 'string' ? book.author.trim().replace(/\s+/g, ' ') : '';
    const key = authorKey(spelling);
    if (!key) { bookAuthor[book.key] = null; unknown.push(book.key); continue; }
    const aliasId = keyToAlias.get(key) ?? null;
    const id = aliasId ?? sha12(key);
    if (!aliasId && aliasById.has(id)) fail(`Yazar kimliği tablodaki bir kimlikle çakıştı: ${id}`);
    let c = clusters.get(id);
    if (!c) { c = { id, alias: aliasId ? aliasById.get(aliasId) : null, keys: new Set(), spellings: new Map(), books: [] }; clusters.set(id, c); }
    c.keys.add(key);
    c.spellings.set(spelling, (c.spellings.get(spelling) ?? 0) + 1);
    c.books.push(book.key);
    bookAuthor[book.key] = id;
  }
  const list = [...clusters.values()].map(c => {
    const variants = [...c.spellings.keys()].sort(byId);
    const common = variants.reduce((best, v) => (c.spellings.get(v) > c.spellings.get(best) ? v : best), variants[0]);
    return { id: c.id, name: c.alias ? c.alias.name : common, variants, books: c.books.sort(byId), keys: [...c.keys].sort(byId) };
  }).sort((x, y) => byId(x.name, y.name) || byId(x.id, y.id));

  // Emin olunmayan eşleşmeler: birleştirilmez, listeye yazılır.
  const apart = new Set();
  for (const pair of separate) {
    if (!Array.isArray(pair) || pair.length !== 2) fail('"separate" satırı iki yazımdan oluşmalı.');
    const [x, y] = pair.map(authorKey);
    apart.add(`${x}\u0000${y}`); apart.add(`${y}\u0000${x}`);
  }
  const rows = [];
  const row = (a, b, reason) => rows.push({ aId: a.id, aName: a.name, bId: b ? b.id : null, bName: b ? b.name : null, reason });
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], found = new Set();
      for (const ka of a.keys) for (const kb of b.keys) {
        if (apart.has(`${ka}\u0000${kb}`)) continue;
        for (const r of doubts(ka, kb)) found.add(r);
      }
      if (found.size) { const [lo, hi] = a.id < b.id ? [a, b] : [b, a]; row(lo, hi, [...found].join(' ')); }
    }
  }
  const byKey = new Map();
  for (const a of list) for (const k of a.keys) byKey.set(k, a);
  for (const a of list) {
    const multi = a.variants.find(v => MULTI.test(v));
    if (!multi) continue;
    const matched = new Set(multi.split(SPLIT).map(authorKey).map(k => byKey.get(k)).filter(m => m && m !== a));
    const reason = 'Birden çok yazar gibi görünüyor; tek kayıt olarak bırakıldı.';
    if (matched.size) for (const m of matched) row(a, m, reason); else row(a, null, reason);
  }
  rows.sort((x, y) => byId(x.aId, y.aId) || byId(x.bId ?? '', y.bId ?? ''));

  return { authors: list.map(({ keys, ...rest }) => rest), bookAuthor, unknown, review: rows };
}

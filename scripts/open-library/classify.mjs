// Açık kitaplık 3/4: kitapları Türkçe kategori ağacına yerleştirir. Saf işlev; dosya ve ağ erişimi yok.
// Tahmin, benzerlik ya da başlıktan çıkarım YOKTUR; eşleşmeyen kitap kategorisiz kalır.
const fail = (message) => { throw new Error(message); };
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const NODE_FIELDS = new Set(['id', 'ad', 'shamela', 'children']);

/** Arapça başlık sadeleştirme: hareke, tatvil, elif biçimleri, boşluk. ى/ي ve ة/ه korunur. */
export function shamelaKey(text) {
  if (typeof text !== 'string') return '';
  return text.normalize('NFKD')
    .replace(/[ـً-ٰٟۖ-ۭ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/\s+/g, ' ').trim();
}
/** Konu sadeleştirme: Türkçe duyarlı küçük harf, aksansız, noktalamasız. */
export function subjectKey(text) {
  if (typeof text !== 'string') return '';
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[İIı]/g, 'i').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

const indexes = new WeakMap();
/** Ağacı denetler; tekrar eden id, boş ad, bilinmeyen alan reddedilir. Dizin döner. */
export function validateTree(tree) {
  if (!Array.isArray(tree) || !tree.length) fail('Kategori ağacı boş ya da dizi değil.');
  if (indexes.has(tree)) return indexes.get(tree);
  const nodes = new Map(), shamela = new Map(), order = [];
  const walk = (list, parent) => {
    if (!Array.isArray(list)) fail('Kategori düğümünün "children" alanı dizi olmalı.');
    for (const node of list) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) fail('Kategori düğümü nesne olmalı.');
      for (const k of Object.keys(node)) if (!NODE_FIELDS.has(k)) fail(`Kategori düğümünde bilinmeyen alan: ${k}`);
      if (typeof node.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(node.id)) fail(`Kategori kimliği ASCII olmalı: ${JSON.stringify(node.id)}`);
      if (nodes.has(node.id)) fail(`Kategori kimliği tekrar ediyor: ${node.id}`);
      if (typeof node.ad !== 'string' || !node.ad.trim()) fail(`Kategori adı boş: ${node.id}`);
      nodes.set(node.id, { node, parent });
      order.push(node.id);
      if (node.shamela !== undefined) {
        if (typeof node.shamela !== 'string' || !shamelaKey(node.shamela)) fail(`Şamile başlığı boş: ${node.id}`);
        const heads = new Set([shamelaKey(node.shamela), ...node.shamela.split('/').map(shamelaKey).filter(Boolean)]);
        for (const h of heads) {
          if (shamela.has(h) && shamela.get(h) !== node.id) fail(`Şamile başlığı iki kategoride: ${h}`);
          shamela.set(h, node.id);
        }
      }
      if (node.children !== undefined) walk(node.children, node.id);
    }
  };
  walk(tree, null);
  const index = { nodes, shamela, order };
  indexes.set(tree, index);
  return index;
}

/** Ayarı ağaca göre denetler; kimliği ağaçta olmayan kategori hata verir. */
export function validateConfig(config, tree) {
  const { nodes } = validateTree(tree);
  if (!config || typeof config !== 'object' || config.version !== 1) fail('Katalog ayarında "version": 1 olmalı.');
  const check = (id, where) => { if (!nodes.has(id)) fail(`Ağaçta olmayan kategori (${where}): ${JSON.stringify(id)}`); };
  if (config.authorAliases !== undefined && !Array.isArray(config.authorAliases)) fail('"authorAliases" dizi olmalı.');
  if (config.separate !== undefined && !Array.isArray(config.separate)) fail('"separate" dizi olmalı.');
  for (const [source, rules] of Object.entries(config.subjectRules ?? {}))
    for (const [subject, id] of Object.entries(rules ?? {})) check(id, `subjectRules.${source}.${subject}`);
  for (const [key, id] of Object.entries(config.overrides ?? {})) check(id, `overrides.${key}`);
}

/** Öncelik: elle atama → Şamile başlığı → konu kuralı. Eşleşmezse { category: null, by: null }. */
export function classify(book, hint, config, tree) {
  const { nodes, shamela } = validateTree(tree);
  const has = (id, where) => { if (!nodes.has(id)) fail(`Ağaçta olmayan kategori (${where}): ${JSON.stringify(id)}`); return id; };
  const manual = config.overrides?.[book.key];
  if (manual !== undefined) return { category: has(manual, `overrides.${book.key}`), by: 'elle' };
  const heading = shamelaKey(hint?.sourceCategory);
  if (heading && shamela.has(heading)) return { category: shamela.get(heading), by: 'şamile' };
  const rules = config.subjectRules?.[book.source];
  if (rules && Array.isArray(hint?.subjects)) {
    const table = new Map(Object.entries(rules).map(([s, id]) => [subjectKey(s), id]));
    for (const subject of hint.subjects) {
      const id = table.get(subjectKey(subject));
      if (id !== undefined) return { category: has(id, `subjectRules.${book.source}`), by: 'kural' };
    }
  }
  return { category: null, by: null };
}

/**
 * Yapay zekâ önerileri + onaylar. Onaysız öneri `pending` olur, kategori yazılmaz.
 * @param {{ key: string }[]} unmatched kuralla yerleşmemiş kitaplar
 * @param {{ key, category, by, note? }[]} suggestions
 * @param {{ key, category, approvedBy }[]} approvals
 * @param {object[]} tree
 * @param {Set<string>} [knownKeys] bütün kitap anahtarları (yoksa yalnız `unmatched`)
 * @returns {{ placed: Map<string, {category, by}>, pending: object[], warnings: string[] }}
 */
export function applyDecisions(unmatched, suggestions, approvals, tree, knownKeys) {
  const { nodes } = validateTree(tree);
  const open = new Set(unmatched.map(b => b.key));
  const known = knownKeys ?? open;
  const warnings = [];
  const inTree = (id, where) => { if (!nodes.has(id)) fail(`${where}: ağaçta olmayan kategori ${JSON.stringify(id)}.`); };
  const target = (key, where) => {
    if (typeof key !== 'string' || !known.has(key)) fail(`${where}: bilinmeyen kitap anahtarı ${JSON.stringify(key)}.`);
    if (!open.has(key)) { warnings.push(`${where}: ${key} zaten kuralla yerleşmiş, satır yok sayıldı.`); return false; }
    return true;
  };
  const approved = new Map();
  for (const a of approvals) {
    const where = `Onay (${a?.key})`;
    if (!target(a?.key, where)) continue;
    inTree(a.category, where);
    if (typeof a.approvedBy !== 'string' || !a.approvedBy.trim()) fail(`${where}: onaylayan (approvedBy) yazılmamış.`);
    if (approved.has(a.key)) fail(`${where}: aynı kitaba iki onay verilmiş.`);
    approved.set(a.key, { category: a.category, by: 'onay' });
  }
  const seen = new Set(), pending = [];
  for (const s of suggestions) {
    const where = `Öneri (${s?.key})`;
    if (!target(s?.key, where)) continue;
    inTree(s.category, where);
    if (seen.has(s.key)) fail(`${where}: aynı kitaba iki öneri yazılmış.`);
    seen.add(s.key);
    if (!approved.has(s.key)) pending.push({ key: s.key, category: s.category, by: typeof s.by === 'string' ? s.by : null, note: typeof s.note === 'string' ? s.note : null });
  }
  pending.sort((a, b) => byId(a.key, b.key));
  return { placed: approved, pending, warnings };
}

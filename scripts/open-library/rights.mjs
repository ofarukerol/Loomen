// Açık kitaplık: kitabın lisansına göre bölüm kararı. Saf modül; dosya ve ağ erişimi yok.
// Tablo bir izin listesidir: tanınmayan, boş ya da kanıtsız her lisans bekletilir.
// Bu karar yayın kararı değildir; yalnız açık aday, kapalı arşiv ve bekleyen ayrımıdır.

const fail = (message) => { throw new Error(message); };
// prepare.mjs ile aynı kurallar (kaynak adı ve dosya adı); orada dışa aktarılmadığı için burada tekrarlanır.
export const segment = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(s) && s !== '..';
export const fileName = (s) => typeof s === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]*$/u.test(s);

/** Lisans adını sadeleştirir: küçük harf, baştaki/sondaki boşluk yok, boşluk/tire/alt çizgi tek tire. */
export function normalizeLicense(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

const RULE_KEYS = new Set(['version', 'order', 'sources', 'licenses']);
const SOURCE_KEYS = new Set(['delayMs', 'requiresVerified', 'forcePrivate', 'localOnly']);
const LICENSE_KEYS = new Set(['open', 'restricted']);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateRules(rules) {
  if (!isObject(rules)) fail('Kaynak kuralları geçersiz.');
  for (const key of Object.keys(rules)) if (!RULE_KEYS.has(key)) fail(`Kaynak kurallarında bilinmeyen alan: ${key}`);
  if (rules.version !== 1) fail('Kaynak kuralları sürümü desteklenmiyor.');
  const { order, sources, licenses } = rules;
  if (!Array.isArray(order) || !order.length) fail('Kaynak sırası boş.');
  for (const name of order) if (!segment(name)) fail(`Geçersiz kaynak adı: ${JSON.stringify(name)}`);
  if (new Set(order).size !== order.length) fail('Kaynak sırasında aynı kaynak iki kez geçiyor.');
  if (!isObject(sources)) fail('Kaynak ayarları geçersiz.');
  for (const name of Object.keys(sources)) if (!order.includes(name)) fail(`Sırada olmayan kaynak ayarı: ${name}`);
  for (const name of order) {
    const cfg = sources[name];
    if (!isObject(cfg)) fail(`Kaynak ayarı eksik: ${name}`);
    for (const key of Object.keys(cfg)) if (!SOURCE_KEYS.has(key)) fail(`Kaynak ayarında bilinmeyen alan: ${name}.${key}`);
    for (const key of ['requiresVerified', 'forcePrivate', 'localOnly'])
      if (key in cfg && typeof cfg[key] !== 'boolean') fail(`Kaynak ayarı geçersiz: ${name}.${key}`);
    if ('delayMs' in cfg && (!Number.isSafeInteger(cfg.delayMs) || cfg.delayMs < 0)) fail(`Bekleme süresi geçersiz: ${name}`);
  }
  if (!isObject(licenses)) fail('Lisans tablosu geçersiz.');
  for (const key of Object.keys(licenses)) if (!LICENSE_KEYS.has(key)) fail(`Lisans tablosunda bilinmeyen alan: ${key}`);
  const seen = new Set();
  for (const key of LICENSE_KEYS) {
    if (!Array.isArray(licenses[key])) fail(`Lisans listesi eksik: ${key}`);
    for (const name of licenses[key]) {
      const n = normalizeLicense(name);
      if (!n || n !== name) fail(`Lisans adı sade biçimde yazılmalı: ${JSON.stringify(name)}`);
      if (seen.has(n)) fail(`Lisans iki kez geçiyor: ${n}`);
      seen.add(n);
    }
  }
  return rules;
}

const hasEvidence = (url) => {
  if (typeof url !== 'string') return false;
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
};

/**
 * Kitabın bölümünü verir. İndirmeden önce çağrılır.
 * @returns {{ decision: 'public' | 'private' | 'held', license: string, reason: string }}
 */
export function decide(item, source, rules) {
  const cfg = rules.sources?.[source];
  if (!cfg) fail(`Sırada olmayan kaynak: ${source}`);
  const license = normalizeLicense(item.license);
  if (cfg.forcePrivate) return { decision: 'private', license, reason: 'Bu kaynağın kitapları her zaman kapalı arşive gider.' };
  if (!license) return { decision: 'held', license, reason: 'Lisans yazılmamış.' };
  if (!hasEvidence(item.evidenceUrl)) return { decision: 'held', license, reason: 'Lisans kanıtı yok ya da geçersiz.' };
  if (cfg.requiresVerified && item.verified !== true) return { decision: 'held', license, reason: 'Lisans kanıtı doğrulanmamış.' };
  if (rules.licenses.open.includes(license)) return { decision: 'public', license, reason: 'Lisans açık listede.' };
  if (rules.licenses.restricted.includes(license)) return { decision: 'private', license, reason: 'Lisans kısıtlı listede.' };
  return { decision: 'held', license, reason: 'Lisans tabloda yok.' };
}

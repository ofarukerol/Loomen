// Açık kitaplık 4/4: kaynak bazında sonuç raporu. Saf modül; dosya ve ağ erişimi yok.
// Sayım kitap kayıtlarından (books) yapılır; kapak dosyaları kitap sayılmaz.
// Rapor iki sabit bölüm taşır: "Örnek deneme" ve "Gerçek toplu işlem". Çalışan kip kendi bölümünü
// doldurur, öteki bölüm "henüz çalıştırılmadı" kalır.

const fail = (message) => { throw new Error(message); };
export const MODES = ['sample', 'full'];
export const SAMPLE_WARNING = 'Bu bir örnek denemedir; tam koleksiyonun sonucu değildir.';
export const NOT_RUN = 'henüz çalıştırılmadı';
const TITLES = { sample: 'Örnek deneme', full: 'Gerçek toplu işlem' };

const sourceOf = (key) => String(key).split(':')[0];
const sortedCounts = (map) => Object.fromEntries([...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const ratio = (part, total) => (total ? Math.round((part / total) * 1000) / 1000 : null);

function coverage(rows, decision) {
  const own = rows.filter(r => r.decision === decision);
  const withAuthor = own.filter(r => r.authorId != null).length;
  const withCategory = own.filter(r => r.category != null).length;
  return {
    books: own.length, withAuthor, withCategory,
    authorRatio: ratio(withAuthor, own.length), categoryRatio: ratio(withCategory, own.length),
  };
}

/**
 * @param {{ mode: 'sample'|'full', order: string[], records: object[], books: object[], broken: object[],
 *   duplicates: object[], editions: object[], catalog: { books: object[] }, authors?: object,
 *   pending?: object[], readerCheck?: object|null }} input
 */
export function buildReport({ mode, order, records, books, broken, duplicates, editions, catalog, authors, pending = [], readerCheck = null }) {
  if (!MODES.includes(mode)) fail("Kip 'sample' ya da 'full' olmalı; varsayılanı yok.");
  const sourceNames = [...order];
  for (const key of [...records.map(r => r.key), ...books.map(b => b.key)]) if (!sourceNames.includes(sourceOf(key))) sourceNames.push(sourceOf(key));

  const sources = sourceNames.map((source) => {
    const own = records.filter(r => r.source === source || sourceOf(r.key) === source);
    const held = new Map(), brokenBy = new Map();
    for (const r of own) if (r.decision === 'held') bump(held, r.reason || 'Gerekçe yazılmamış');
    const brokenOwn = broken.filter(b => sourceOf(b.key) === source);
    for (const b of brokenOwn) bump(brokenBy, b.reason);
    const packaged = books.filter(b => b.source === source);
    return {
      source,
      incoming: own.length,
      public: own.filter(r => r.decision === 'public').length,
      private: own.filter(r => r.decision === 'private').length,
      held: own.filter(r => r.decision === 'held').length,
      heldReasons: sortedCounts(held),
      broken: brokenOwn.length,
      brokenReasons: sortedCounts(brokenBy),
      duplicates: duplicates.filter(d => sourceOf(d.dropped) === source).length,
      packaged: packaged.length,
      packagedPublic: packaged.filter(b => b.decision === 'public').length,
      packagedPrivate: packaged.filter(b => b.decision === 'private').length,
    };
  }).filter(s => s.incoming || s.packaged || s.broken || s.duplicates);

  const sum = (field) => sources.reduce((n, s) => n + s[field], 0);
  const rows = catalog.books;
  const section = {
    sources,
    totals: {
      incoming: sum('incoming'), public: sum('public'), private: sum('private'), held: sum('held'),
      broken: sum('broken'), duplicates: sum('duplicates'),
      packaged: books.length, packagedPublic: sum('packagedPublic'), packagedPrivate: sum('packagedPrivate'),
    },
    coverage: { public: coverage(rows, 'public'), private: coverage(rows, 'private') },
    // Onaysız öneri kategori sayılmaz: kategorisi boş kalan kitaplar arasında onay bekleyenler de var.
    pendingSuggestions: pending.length,
    uncategorized: rows.filter(r => r.category == null).length,
    unknownAuthor: rows.filter(r => r.authorId == null).length,
    editionGroups: editions.length,
    authorCount: authors?.authors?.length ?? null,
    readerCheck,
  };
  return {
    version: 1, mode,
    warning: mode === 'sample' ? SAMPLE_WARNING : null,
    sample: mode === 'sample' ? section : null,
    full: mode === 'full' ? section : null,
  };
}

const pct = (v) => (v === null ? '—' : `%${Math.round(v * 1000) / 10}`);
const list = (counts) => Object.entries(counts).map(([k, n]) => `${k} (${n})`).join('; ');

function renderReaderCheck(rc) {
  if (!rc) return ['Okuyucu kontrolü yapılmadı.'];
  const out = [];
  if (rc.fewerThanRequested) out.push(`**Pakette ${rc.requested} kitaptan az kitap var; ${rc.tried} kitabın hepsi denendi. Bu, ${rc.requested} kitap kontrolü sayılmaz.**`);
  else out.push(`Rastgele seçilen ${rc.tried} kitap denendi (tohum: \`${rc.seed}\`).`);
  if (rc.fewerThanRequested) out.push(`Tohum: \`${rc.seed}\`.`);
  out.push(`Okuyucuda açılan: **${rc.opened}** · açılmayan: **${rc.failed.length}**.`);
  if (rc.unsupportedInPackage) out.push(`Pakette okuyucunun açmadığı biçimde ${rc.unsupportedInPackage} kitap var (düz metin gibi).`);
  for (const f of rc.failed) out.push(`- Açılmadı: \`${f.key}\` — ${f.reason}`);
  return out;
}

function renderSection(section) {
  if (!section) return [NOT_RUN];
  const t = section.totals, out = [];
  out.push(`Gelen kitap: **${t.incoming}** · pakete giren: **${t.packaged}** (açık ${t.packagedPublic}, kapalı ${t.packagedPrivate}).`, '');
  out.push('| Kaynak | Gelen | Açık | Kapalı | Bekleyen | Bozuk | Tekrar | Pakette |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of section.sources) out.push(`| ${s.source} | ${s.incoming} | ${s.public} | ${s.private} | ${s.held} | ${s.broken} | ${s.duplicates} | ${s.packaged} |`);
  out.push(`| **Toplam** | ${t.incoming} | ${t.public} | ${t.private} | ${t.held} | ${t.broken} | ${t.duplicates} | ${t.packaged} |`, '');
  out.push('**Elenenlerin nedeni**');
  let any = false;
  for (const s of section.sources) {
    if (s.held) { out.push(`- ${s.source}, bekleyen: ${list(s.heldReasons)}`); any = true; }
    if (s.broken) { out.push(`- ${s.source}, bozuk: ${list(s.brokenReasons)}`); any = true; }
    if (s.duplicates) { out.push(`- ${s.source}, tekrar: ${s.duplicates} kitap başka kayıtla birebir aynı`); any = true; }
  }
  if (!any) out.push('- Elenen kitap yok.');
  out.push('', '**Yazar ve kategori kapsamı** (açık ve kapalı ayrı)', '', '| | Kitap | Yazarı belli | Kategorisi belli |', '| --- | --- | --- | --- |');
  for (const [name, key] of [['Açık', 'public'], ['Kapalı', 'private']]) {
    const c = section.coverage[key];
    out.push(`| ${name} | ${c.books} | ${c.withAuthor} (${pct(c.authorRatio)}) | ${c.withCategory} (${pct(c.categoryRatio)}) |`);
  }
  out.push('', `Onay bekleyen öneri: **${section.pendingSuggestions}** (sayıma girmedi) · kategorisi boş kitap: **${section.uncategorized}** · yazarı bilinmeyen kitap: **${section.unknownAuthor}**.`);
  out.push(`Aynı adlı farklı baskı grubu: ${section.editionGroups}.`, '', '**Okuyucu kontrolü**', '', ...renderReaderCheck(section.readerCheck));
  return out;
}

/** Aynı veriyi sade Türkçe Markdown olarak döndürür. */
export function renderReport(report) {
  const out = ['# Açık Kitaplık yükleme raporu', ''];
  if (report.warning) out.push(`> **${report.warning}**`, '');
  if (report.mode === 'sample' && report.sample) out.push(`Bu örnekte ${report.sample.totals.incoming} kitap işlendi.`, '');
  for (const mode of MODES) out.push(`## ${TITLES[mode]}`, '', ...renderSection(report[mode]), '');
  out.push('Hiçbir yere yükleme yapılmadı.', '');
  return out.join('\n');
}

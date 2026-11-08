// Salt okunur SQLite dosya çözücü — saf, bağımlılıksız (LOM-95).
//
// Kobo çizimleri cihazdaki `.kobo/KoboReader.sqlite` veritabanında durur. Bu modül dosyanın
// baytlarını doğrudan okur: SQL ÇALIŞTIRMAZ, dosyaya YAZMAZ, yalnız tablo B-ağaçlarını gezer.
// Biçim: https://www.sqlite.org/fileformat2.html
//
// Desteklenen:
//  - Başlık ("SQLite format 3\0"), sayfa boyutu (512..65536), sayfa sonundaki ayrılmış bayt.
//  - Yalnız UTF-8 metin kodlaması (başkası hata).
//  - Tablo B-ağacı sayfaları (0x0D yaprak, 0x05 iç), taşma (overflow) sayfa zinciri.
//  - Kayıt başlığı ve bütün seri tipler (NULL, 1-8 bayt tamsayı, 8 bayt ondalık, 0/1 sabitleri,
//    blob, metin). Şemadan kısa kayıt (sonradan eklenen sütun) eksik sütunları null alır.
//  - INTEGER PRIMARY KEY sütunu rowid'den doldurulur.
//
// Desteklenmeyen (sınır): WITHOUT ROWID ve sanal tablolar (hata), UTF-16 veritabanı (hata),
// yanındaki -wal dosyası (okunmaz; henüz ana dosyaya işlenmemiş son değişiklikler görünmez).
//
// Bozuk dosyaya karşı: sınır dışı sayfa/işaretçi, döngü (aynı sayfaya ikinci kez gelme), tablo
// ağacında yanlış sayfa türü ve kesik kayıt "bozuk dosya" hatası fırlatır; sonsuz döngü olmaz.

export type SqlValue = null | number | string | Uint8Array;
export type SqlRow = Record<string, SqlValue>;

export interface SqliteDb {
  /** Kullanıcı tabloları (sqlite_master'daki `table` türü, kök sayfası olanlar), dosya sırasıyla. */
  tables(): string[];
  /** Tablonun bütün satırları rowid sırasıyla; tablo adı büyük/küçük harfe duyarsız. Yoksa hata. */
  rows(table: string): SqlRow[];
}

export class SqliteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqliteError";
  }
}

const corrupt = (why: string): never => {
  throw new SqliteError(`bozuk dosya: ${why}`);
};

const MAGIC = "SQLite format 3\0";
const PAGE_LEAF_TABLE = 0x0d;
const PAGE_INTERIOR_TABLE = 0x05;
const utf8 = new TextDecoder("utf-8");

/** Satırdaki sütunu büyük/küçük harfe duyarsız bul; yoksa undefined. */
export function sqlCol(row: SqlRow, name: string): SqlValue | undefined {
  if (name in row) return row[name];
  const lower = name.toLowerCase();
  for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
  return undefined;
}

interface Schema {
  type: string;
  name: string;
  rootpage: number;
  sql: string;
}

interface TableInfo {
  columns: string[];
  /** INTEGER PRIMARY KEY sütununun sırası (rowid takma adı); yoksa -1. */
  rowidAlias: number;
}

// ─── CREATE TABLE ayrıştırma ──────────────────────────────────────────────────────

/** Üst seviyede (parantez ve tırnak dışı) virgülle böl. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === quote) {
        if (s[i + 1] === quote && quote !== "]") {
          cur += s[++i];
        } else quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "[") quote = "]";
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Baştaki tanımlayıcıyı (tırnaklı ya da çıplak) ve kalanını ver. */
function leadingIdent(s: string): { name: string; rest: string } | null {
  const t = s.trimStart();
  const open = t[0];
  const close = open === "[" ? "]" : open === '"' || open === "`" || open === "'" ? open : null;
  if (close) {
    let name = "";
    for (let i = 1; i < t.length; i++) {
      if (t[i] === close) {
        if (close !== "]" && t[i + 1] === close) {
          name += close;
          i++;
          continue;
        }
        return { name, rest: t.slice(i + 1) };
      }
      name += t[i];
    }
    return null;
  }
  const m = /^[^\s(),]+/.exec(t);
  return m ? { name: m[0], rest: t.slice(m[0].length) } : null;
}

const TABLE_CONSTRAINT_RE = /^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\b/i;

/** CREATE TABLE metninden sütun adları ve rowid takma adı. */
export function parseCreateTable(sql: string): TableInfo {
  const body = (() => {
    const start = sql.indexOf("(");
    if (start < 0) return corrupt("tablo tanımı okunamadı");
    let depth = 0;
    let quote: string | null = null;
    for (let i = start; i < sql.length; i++) {
      const c = sql[i];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "[") quote = "]";
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) {
        if (/^\s*WITHOUT\s+ROWID\b/i.test(sql.slice(i + 1))) throw new SqliteError("WITHOUT ROWID tablo desteklenmiyor");
        return sql.slice(start + 1, i);
      }
    }
    return corrupt("tablo tanımı kapanmıyor");
  })();
  const columns: string[] = [];
  const types: string[] = [];
  let rowidAlias = -1;
  let tablePk: string[] | null = null;
  for (const part of splitTopLevel(body)) {
    const p = part.trim();
    if (!p) continue;
    if (TABLE_CONSTRAINT_RE.test(p)) {
      const m = /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(p);
      if (m) tablePk = splitTopLevel(m[1]).map((x) => leadingIdent(x)?.name ?? "");
      continue;
    }
    const id = leadingIdent(p);
    if (!id) continue;
    const rest = id.rest.trim();
    const type = /^[A-Za-z]+/.exec(rest)?.[0]?.toUpperCase() ?? "";
    // "INTEGER" türü tek başına (INT, BIGINT değil) + PRIMARY KEY (DESC değil) → rowid takma adı.
    if (rowidAlias < 0 && type === "INTEGER" && /\bPRIMARY\s+KEY\b(?!\s+DESC)/i.test(rest)) rowidAlias = columns.length;
    columns.push(id.name);
    types.push(type);
  }
  if (rowidAlias < 0 && tablePk && tablePk.length === 1) {
    const i = columns.findIndex((c) => c.toLowerCase() === tablePk![0].toLowerCase());
    if (i >= 0 && types[i] === "INTEGER") rowidAlias = i;
  }
  if (!columns.length) corrupt("tabloda sütun yok");
  return { columns, rowidAlias };
}

// ─── Dosya okuma ──────────────────────────────────────────────────────────────────

/** SQLite dosyasını aç (baytlar kopyalanmaz, değiştirilmez). SQLite değilse ya da bozuksa hata. */
export function openSqlite(bytes: Uint8Array): SqliteDb {
  if (bytes.length < 100) throw new SqliteError("SQLite dosyası değil");
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) throw new SqliteError("SQLite dosyası değil");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawSize = view.getUint16(16);
  const pageSize = rawSize === 1 ? 65536 : rawSize;
  if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0) corrupt("sayfa boyutu geçersiz");
  const reserved = bytes[20];
  const usable = pageSize - reserved;
  if (usable < 480) corrupt("ayrılmış alan geçersiz");
  const encoding = view.getUint32(56);
  if (encoding !== 0 && encoding !== 1) throw new SqliteError("yalnız UTF-8 veritabanı desteklenir");
  const pageCount = Math.floor(bytes.length / pageSize);
  if (pageCount < 1) corrupt("sayfa yok");

  const pageOffset = (n: number): number => {
    if (!Number.isInteger(n) || n < 1 || n > pageCount) corrupt(`sayfa ${n} dosyanın dışında`);
    return (n - 1) * pageSize;
  };

  /** Varint oku: [değer, yeni ofset]. `end` aşılırsa bozuk. */
  const varint = (pos: number, end: number): [number, number] => {
    let v = 0;
    for (let i = 0; i < 9; i++) {
      if (pos >= end) corrupt("kesik sayı");
      const b = bytes[pos++];
      if (i === 8) return [v * 256 + b, pos];
      v = v * 128 + (b & 0x7f);
      if (b < 0x80) return [v, pos];
    }
    return [v, pos];
  };

  /** Hücrenin yükü (payload) — taşma zinciri dahil, tam boyutta. */
  const payloadOf = (pos: number, pageEnd: number, size: number): Uint8Array => {
    const maxLocal = usable - 35;
    let local: number;
    if (size <= maxLocal) local = size;
    else {
      const minLocal = Math.floor(((usable - 12) * 32) / 255) - 23;
      const k = minLocal + ((size - minLocal) % (usable - 4));
      local = k <= maxLocal ? k : minLocal;
    }
    if (pos + local > pageEnd) corrupt("hücre sayfadan taşıyor");
    if (local === size) return bytes.subarray(pos, pos + size);
    const out = new Uint8Array(size);
    out.set(bytes.subarray(pos, pos + local), 0);
    let filled = local;
    if (pos + local + 4 > pageEnd) corrupt("taşma işaretçisi kesik");
    let next = view.getUint32(pos + local);
    const seen = new Set<number>();
    while (filled < size) {
      if (next === 0 || seen.has(next)) corrupt("taşma zinciri kopuk");
      seen.add(next);
      const off = pageOffset(next);
      const take = Math.min(usable - 4, size - filled);
      out.set(bytes.subarray(off + 4, off + 4 + take), filled);
      filled += take;
      next = view.getUint32(off);
    }
    return out;
  };

  /** Kayıt (record) çöz: sütun değerleri sırayla. */
  const decodeRecord = (p: Uint8Array): SqlValue[] => {
    const local = new DataView(p.buffer, p.byteOffset, p.byteLength);
    const varintP = (pos: number, end: number): [number, number] => {
      let v = 0;
      for (let i = 0; i < 9; i++) {
        if (pos >= end) corrupt("kesik kayıt başlığı");
        const b = p[pos++];
        if (i === 8) return [v * 256 + b, pos];
        v = v * 128 + (b & 0x7f);
        if (b < 0x80) return [v, pos];
      }
      return [v, pos];
    };
    const [hdrSize, start] = varintP(0, p.length);
    if (hdrSize > p.length || hdrSize < start) corrupt("kayıt başlığı geçersiz");
    const types: number[] = [];
    let pos = start;
    while (pos < hdrSize) {
      const [t, np] = varintP(pos, hdrSize);
      types.push(t);
      pos = np;
    }
    const out: SqlValue[] = [];
    let body = hdrSize;
    const need = (n: number) => {
      if (body + n > p.length) corrupt("kesik kayıt");
    };
    for (const t of types) {
      if (t === 0) out.push(null);
      else if (t >= 1 && t <= 6) {
        const n = [0, 1, 2, 3, 4, 6, 8][t];
        need(n);
        if (n === 8) out.push(Number(local.getBigInt64(body)));
        else {
          let v = 0;
          for (let i = 0; i < n; i++) v = v * 256 + p[body + i];
          if (p[body] & 0x80) v -= 256 ** n;
          out.push(v);
        }
        body += n;
      } else if (t === 7) {
        need(8);
        out.push(local.getFloat64(body));
        body += 8;
      } else if (t === 8) out.push(0);
      else if (t === 9) out.push(1);
      else if (t === 10 || t === 11) corrupt("ayrılmış seri tip");
      else {
        const n = t % 2 === 0 ? (t - 12) / 2 : (t - 13) / 2;
        need(n);
        const slice = p.subarray(body, body + n);
        out.push(t % 2 === 0 ? slice.slice() : utf8.decode(slice));
        body += n;
      }
    }
    return out;
  };

  /** Tablo B-ağacını rowid sırasıyla gez: her satır için (rowid, değerler). */
  const walkTable = (root: number, visit: (rowid: number, values: SqlValue[]) => void): void => {
    const seen = new Set<number>();
    const stack: number[] = [root];
    // Sıra: iç sayfada sol çocuklar soldan sağa, en son sağ işaretçi. Yığına ters sırayla konur.
    while (stack.length) {
      const pageNo = stack.pop()!;
      if (seen.has(pageNo)) corrupt("sayfa döngüsü");
      seen.add(pageNo);
      const base = pageOffset(pageNo);
      const hdr = pageNo === 1 ? base + 100 : base;
      const pageEnd = base + usable;
      const type = bytes[hdr];
      if (type !== PAGE_LEAF_TABLE && type !== PAGE_INTERIOR_TABLE) corrupt("tablo ağacında beklenmeyen sayfa türü");
      const cells = view.getUint16(hdr + 3);
      const interior = type === PAGE_INTERIOR_TABLE;
      const ptrStart = hdr + (interior ? 12 : 8);
      if (ptrStart + cells * 2 > pageEnd) corrupt("hücre dizisi sayfadan taşıyor");
      const ptr = (i: number) => {
        const off = view.getUint16(ptrStart + i * 2);
        if (off < ptrStart - base || off >= usable) corrupt("hücre işaretçisi sınır dışı");
        return base + off;
      };
      if (interior) {
        stack.push(view.getUint32(hdr + 8));
        for (let i = cells - 1; i >= 0; i--) {
          const c = ptr(i);
          if (c + 4 > pageEnd) corrupt("hücre kesik");
          stack.push(view.getUint32(c));
        }
        continue;
      }
      for (let i = 0; i < cells; i++) {
        let pos = ptr(i);
        const [size, p1] = varint(pos, pageEnd);
        const [rowid, p2] = varint(p1, pageEnd);
        pos = p2;
        visit(rowid, decodeRecord(payloadOf(pos, pageEnd, size)));
      }
    }
  };

  // sqlite_master (sayfa 1): type, name, tbl_name, rootpage, sql
  const schema: Schema[] = [];
  walkTable(1, (_rowid, v) => {
    schema.push({
      type: typeof v[0] === "string" ? v[0] : "",
      name: typeof v[1] === "string" ? v[1] : "",
      rootpage: typeof v[3] === "number" ? v[3] : 0,
      sql: typeof v[4] === "string" ? v[4] : "",
    });
  });
  const tableList = schema.filter((s) => s.type === "table" && s.name);
  const infoCache = new Map<string, TableInfo>();

  return {
    tables: () => tableList.filter((s) => s.rootpage > 0).map((s) => s.name),
    rows(table: string): SqlRow[] {
      const lower = table.toLowerCase();
      const s = tableList.find((x) => x.name.toLowerCase() === lower);
      if (!s) throw new SqliteError(`tablo yok: ${table}`);
      if (s.rootpage <= 0 || /^\s*CREATE\s+VIRTUAL\b/i.test(s.sql)) throw new SqliteError(`sanal tablo okunamaz: ${table}`);
      let info = infoCache.get(s.name);
      if (!info) {
        info = parseCreateTable(s.sql);
        infoCache.set(s.name, info);
      }
      const { columns, rowidAlias } = info;
      const out: SqlRow[] = [];
      walkTable(s.rootpage, (rowid, values) => {
        const row: SqlRow = {};
        for (let i = 0; i < columns.length; i++) row[columns[i]] = i < values.length ? values[i] : null;
        if (rowidAlias >= 0 && row[columns[rowidAlias]] === null) row[columns[rowidAlias]] = rowid;
        out.push(row);
      });
      return out;
    },
  };
}

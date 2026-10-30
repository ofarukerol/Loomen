// Tekrar listeleri (LOM-65): kişinin kendi kart listesi (ör. 1000 İngilizce kelime).
//
// Yer: <kasa>/Tekrar/Listeler/<id>.txt — her liste ayrı düz metin dosyası, GitHub senkronuna
// dahil; dosya ağacı yalnız .md/.excalidraw listelediği için kullanıcıya görünmez.
//
// Biçim (deterministik — aynı liste hep aynı metni üretir, değişmeyen dosya yeniden yazılmaz):
//   ---
//   surum: 1
//   ad: İngilizce kelimeler
//   simge: 📚
//   renk: teal
//   yon: iki
//   gunluk: 15
//   olusturma: 1767225600000
//   ---
//   apple :: elma
//   book :: kitap :: I read a book.
//
// Kartlar notlardaki "Soru :: Cevap" ile aynı kimlik kuralıyla üretilir: kimlik dosya yolu +
// sadeleştirilmiş ön yüz; satır numarası kullanılmaz. Böylece satır kayınca geçmiş kaybolmaz,
// küçük düzenlemede matchStates geçmişi taşır.
//
// NOTE_SAFETY: not dosyalarına hiç dokunulmaz; yalnız Tekrar/Listeler/ altındaki .txt yazılır.
// Okunamayan dosya "broken" listesine girer ve ASLA üstüne yazılmaz.

import { newId } from "../habit/model";
import { HABIT_COLORS, type HabitColor } from "../habit/types";
import type { VaultBackend } from "../vault/types";
import { cardId, normalizeKey } from "./parser";
import type { DayCount } from "./store";
import { SRS_DIR, type SrsCard, type SrsSettings, type SrsState } from "./types";

export const LISTS_DIR = `${SRS_DIR}/Listeler`;
/** Dosya biçiminin sürümü — bilinmeyen sürüm okunmaz, ezilmez. */
export const LIST_FILE_VERSION = 1;
/** Dosya adı olarak güvenli kimlik: yalnız küçük harf, rakam, - ve _. */
export const LIST_ID_RE = /^[a-z0-9_-]{1,64}$/;
/** Renkler alışkanlık paletiyle aynı (tema tokenlarına eşlenir). */
export const LIST_COLORS = HABIT_COLORS;
export type ListColor = HabitColor;
export const DEFAULT_LIST_COLOR: ListColor = "teal";
export const DEFAULT_LIST_EMOJI = "📚";

/** ön→arka, arka→ön ya da iki yönlü. */
export type ListDirection = "front" | "back" | "both";

export interface ListRow {
  front: string;
  back: string;
  /** İsteğe bağlı örnek cümle / not — cevapla birlikte gösterilir. */
  note?: string;
}

export interface ReviewList {
  /** Dosya adı da budur: `Tekrar/Listeler/<id>.txt`. */
  id: string;
  name: string;
  emoji: string;
  color: ListColor;
  direction: ListDirection;
  /** Listenin günlük yeni kart sayısı; null = genel sınır. */
  newPerDay: number | null;
  /** Oluşturulma anı (ms). */
  createdAt: number;
  rows: ListRow[];
}

export const listPath = (id: string) => `${LISTS_DIR}/${id}.txt`;
const TXT_EXT = /\.txt$/; // yalnız küçük harf: kayıt hep "<id>.txt" yazar
export const isListFile = (file: string) => file.startsWith(LISTS_DIR + "/") && TXT_EXT.test(file);
/** Liste dosyasının kimliği; liste dosyası değilse null. */
export function listIdOf(file: string): string | null {
  if (!isListFile(file)) return null;
  const id = file.slice(LISTS_DIR.length + 1).replace(TXT_EXT, "");
  return LIST_ID_RE.test(id) ? id : null;
}

/** Dosya adına uygun yeni kimlik — alışkanlık kimliğiyle aynı üretim (yalnız [a-z0-9]). */
export const newListId = newId;

// ——— Dosya biçimi ———

const DIR_TO_FILE: Record<ListDirection, string> = { front: "ileri", back: "geri", both: "iki" };
const FILE_TO_DIR: Record<string, ListDirection> = { ileri: "front", geri: "back", iki: "both" };

/** Tek satırlık alan: satır sonu boşluğa, ayıraç olan "::" ": :" biçimine çevrilir. */
function clean(text: string): string {
  let s = text.replace(/\s*[\r\n]+\s*/g, " ");
  while (s.includes("::")) s = s.replace(/::/g, ": :");
  return s.trim();
}

/** Satır parçalarını dosyaya yazılabilir hâle getir. */
export function normalizeRow(row: ListRow): ListRow {
  const out: ListRow = { front: clean(row.front), back: clean(row.back) };
  const note = row.note ? clean(row.note) : "";
  if (note) out.note = note;
  return out;
}

const validCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 9999;

/** Listeyi dosya metnine çevir. Ön ya da arkası boş satır yazılmaz. */
export function encodeList(list: ReviewList): string {
  const head = [
    "---",
    `surum: ${LIST_FILE_VERSION}`,
    `ad: ${clean(list.name)}`,
    `simge: ${clean(list.emoji)}`,
    `renk: ${list.color}`,
    `yon: ${DIR_TO_FILE[list.direction]}`,
    `gunluk: ${validCount(list.newPerDay) ? list.newPerDay : "genel"}`,
    `olusturma: ${Math.max(0, Math.floor(list.createdAt || 0))}`,
    "---",
  ];
  const rows: string[] = [];
  for (const r of list.rows) {
    const n = normalizeRow(r);
    if (!n.front || !n.back) continue;
    rows.push(n.note ? `${n.front} :: ${n.back} :: ${n.note}` : `${n.front} :: ${n.back}`);
  }
  return [...head, ...rows].join("\n") + "\n";
}

/** Dosya metnini listeye çevir; başlık bloğu yoksa ya da sürüm bilinmiyorsa null. */
export function decodeList(id: string, raw: string): ReviewList | null {
  if (!LIST_ID_RE.test(id)) return null;
  const lines = raw.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) return null;

  const head: Record<string, string> = {};
  for (const l of lines.slice(1, end)) {
    const i = l.indexOf(":");
    if (i <= 0) continue;
    head[l.slice(0, i).trim().toLocaleLowerCase("tr")] = l.slice(i + 1).trim();
  }
  if (head.surum !== undefined && Number(head.surum) !== LIST_FILE_VERSION) return null;

  const gunluk = head.gunluk !== undefined && /^\d+$/.test(head.gunluk) ? Number(head.gunluk) : null;
  const created = head.olusturma !== undefined && /^\d+$/.test(head.olusturma) ? Number(head.olusturma) : 0;
  const rows: ListRow[] = [];
  for (const l of lines.slice(end + 1)) {
    if (!l.includes("::")) continue;
    const parts = l.split("::");
    const front = parts[0].trim();
    const back = parts[1].trim();
    const note = parts.slice(2).join("::").trim();
    if (!front || !back) continue;
    rows.push(note ? { front, back, note } : { front, back });
  }
  return {
    id,
    name: head.ad || id,
    emoji: head.simge || DEFAULT_LIST_EMOJI,
    color: (LIST_COLORS as readonly string[]).includes(head.renk) ? (head.renk as ListColor) : DEFAULT_LIST_COLOR,
    direction: FILE_TO_DIR[head.yon] ?? "front",
    newPerDay: validCount(gunluk) ? gunluk : null,
    createdAt: Number.isFinite(created) ? created : 0,
    rows,
  };
}

// ——— Toplu yapıştırma ———

export interface PasteResult {
  rows: ListRow[];
  /** Yapıştırılan metinde aynı ön yüzle ikinci kez gelen (atlanan) satır sayısı. */
  duplicates: number;
  /** Ayıraç bulunamayan ya da ön/arkası boş satır sayısı. */
  skipped: number;
}

/** Ayıraçlar öncelik sırasıyla: satırda ilk bulunan kullanılır. */
const SEPARATORS: RegExp[] = [/\s*:{2,}\s*/, /\t+/, /\s+[-–—]\s+/, /\s+=\s+/, /\s*;\s*/];

/** CSV dosyasında virgül de ayıraçtır (en düşük öncelik); düz yapıştırmada değildir. */
const CSV_SEPARATORS: RegExp[] = [...SEPARATORS, /\s*,\s*/];
/** CSV alanının başındaki/sonundaki çift tırnağı sıyır; içteki "" tek tırnağa döner. */
const unquote = (s: string) => {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t;
};
const QUOTED_RE = /"(?:[^"]|"")*"/g;
const SLOT_RE = /\u0000(\d+)\u0000/g;

/** Yapıştırılan metni satırlara çevir (her satır bir kart). Üçüncü parça varsa not olur.
 *  `csv`: .csv dosyasından alınan metin — virgül de ayıraç sayılır, alanların tırnağı sıyrılır. */
export function parsePasted(text: string, opts: { csv?: boolean } = {}): PasteResult {
  const csv = opts.csv === true;
  const separators = csv ? CSV_SEPARATORS : SEPARATORS;
  const rows: ListRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // CSV'de tırnaklı alanlar yer tutucuyla saklanır: içlerindeki ayıraç satırı bölmez.
    const quoted: string[] = [];
    const body = csv
      ? trimmed.replace(QUOTED_RE, (m) => `\u0000${quoted.push(m) - 1}\u0000`)
      : trimmed;
    const sep = separators.find((re) => re.test(body));
    if (!sep) {
      skipped++;
      continue;
    }
    const split = body.split(new RegExp(sep.source, "g"));
    const parts = csv ? split.map((p) => unquote(p.replace(SLOT_RE, (_, i) => quoted[Number(i)]))) : split;
    const row = normalizeRow({ front: parts[0] ?? "", back: parts[1] ?? "", note: parts.slice(2).join(" ") });
    if (!row.front || !row.back) {
      skipped++;
      continue;
    }
    const k = normalizeKey(row.front);
    if (seen.has(k)) {
      duplicates++;
      continue;
    }
    seen.add(k);
    rows.push(row);
  }
  return { rows, duplicates, skipped };
}

/** Mevcut listede ön yüzü zaten bulunan satırlar (uyarı için). */
export function findDuplicates(rows: ListRow[], existing: ListRow[]): ListRow[] {
  const have = new Set(existing.map((r) => normalizeKey(r.front)));
  return rows.filter((r) => have.has(normalizeKey(r.front)));
}

// ——— Kartlar ———

const forwardKey = (r: ListRow) => normalizeKey(r.front);
const reverseKey = (r: ListRow) => normalizeKey(r.back) + "|ters"; // parser.ts ile aynı kural
const withNote = (text: string, note?: string) => (note ? `${text}\n\n${note}` : text);

/** Listenin kartları. Yön yalnız hangi kartların üretileceğini seçer; kimlikler yöne bağlı değildir. */
export function listCards(list: ReviewList): SrsCard[] {
  const file = listPath(list.id);
  const out: SrsCard[] = [];
  const seen = new Set<string>();
  const push = (c: Omit<SrsCard, "id">) => {
    const id = cardId(file, c.key);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ ...c, id });
  };
  list.rows.forEach((r, line) => {
    if (!r.front.trim() || !r.back.trim()) return;
    if (list.direction !== "back") {
      push({ file, key: forwardKey(r), kind: "basic", question: r.front, answer: withNote(r.back, r.note), line });
    }
    if (list.direction !== "front") {
      push({ file, key: reverseKey(r), kind: "reverse", question: r.back, answer: withNote(r.front, r.note), line });
    }
  });
  return out;
}

export function collectListCards(lists: ReviewList[]): SrsCard[] {
  return lists.flatMap(listCards);
}

/** Liste kartının ters yönlü eşinin kimliği (kart üretilmemiş olsa da); bulunamazsa null. */
export function twinId(card: SrsCard, list: ReviewList): string | null {
  const file = listPath(list.id);
  if (card.file !== file) return null;
  const forward = card.kind !== "reverse";
  const keyOf = forward ? forwardKey : reverseKey;
  const at = list.rows[card.line];
  const row = at && keyOf(at) === card.key ? at : list.rows.find((r) => keyOf(r) === card.key);
  if (!row) return null;
  return cardId(file, forward ? reverseKey(row) : forwardKey(row));
}

// ——— Kasada okuma/yazma ———

/** Yüklenen liste kasası; kaydetme ve silme bununla yapılır. */
export interface ListVault {
  /** id → diskte son görülen/yazılan metin. */
  raw: Record<string, string>;
  /** Okunamayan dosyaların adları (ör. "abc.txt"). */
  broken: string[];
}

export interface LoadedLists extends ListVault {
  lists: ReviewList[];
}

/** Bütün listeleri oku. Bozuk ya da adı geçersiz dosyalar atlanır, adları `broken`a yazılır. */
export async function loadLists(backend: VaultBackend): Promise<LoadedLists> {
  const out: LoadedLists = { raw: {}, broken: [], lists: [] };
  if (!backend.listDir) return out;
  const entries = await backend.listDir(LISTS_DIR);
  for (const e of entries) {
    if (e.isDirectory || !TXT_EXT.test(e.name)) continue;
    const id = e.name.replace(TXT_EXT, "");
    let text: string;
    try {
      text = await backend.readNote(`${LISTS_DIR}/${e.name}`);
    } catch {
      out.broken.push(e.name);
      continue;
    }
    const list = decodeList(id, text);
    if (!list) {
      out.broken.push(e.name);
      continue;
    }
    out.raw[id] = text;
    out.lists.push(list);
  }
  out.lists.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  out.broken.sort();
  return out;
}

const isBroken = (v: ListVault, id: string) => v.broken.includes(`${id}.txt`);

/**
 * Listeyi kaydet. Metin son okunan/yazılandan farklı değilse diske dokunmaz (false döner).
 * Bozuk dosyanın ya da yüklemede görülmemiş ama diskte duran bir dosyanın üstüne yazmaz.
 */
export async function saveList(backend: VaultBackend, list: ReviewList, v: ListVault): Promise<boolean> {
  if (!LIST_ID_RE.test(list.id)) throw new Error(`Geçersiz liste kimliği: ${list.id}`);
  if (isBroken(v, list.id)) throw new Error(`Okunamayan liste dosyasının üstüne yazılmaz: ${list.id}.txt`);
  const text = encodeList(list);
  const known = v.raw[list.id];
  if (known === text) return false;
  const path = listPath(list.id);
  if (known === undefined && (await backend.exists(path))) {
    throw new Error(`Yüklenmemiş liste dosyasının üstüne yazılmaz: ${list.id}.txt`);
  }
  await backend.ensureDir(LISTS_DIR);
  await backend.writeNote(path, text);
  v.raw[list.id] = text;
  return true;
}

/** Listeyi çöp kutusuna taşı (kalıcı silmez). */
export async function removeList(backend: VaultBackend, id: string, v: ListVault): Promise<void> {
  if (!LIST_ID_RE.test(id)) throw new Error(`Geçersiz liste kimliği: ${id}`);
  await backend.trashNote(listPath(id));
  delete v.raw[id];
  v.broken = v.broken.filter((f) => f !== `${id}.txt`);
}

/** Bir listenin bütün kart durumlarını at (liste silinince). */
export function dropListStates(states: Record<string, SrsState>, file: string): Record<string, SrsState> {
  const next: Record<string, SrsState> = {};
  for (const [id, st] of Object.entries(states)) if (st.file !== file) next[id] = st;
  return next;
}

/**
 * Liste kartlarının ilerlemesini koru. matchStates kartı olmayan durumu atar; ama
 *  - liste dosyası geçici olarak okunamadıysa (bozuk, senkron yarım) ilerleme silinmemeli,
 *  - listenin yönü değiştiyse öbür yönün kartları yalnız kuyruğa girmez, geçmişi durur.
 * Yüklenmemiş liste dosyalarının bütün durumları ve yüklü listelerin (her iki yöndeki)
 * satırlarına ait durumlar geri eklenir; listeden silinmiş satırın durumu eklenmez.
 */
export function keepListStates(
  next: Record<string, SrsState>,
  saved: Record<string, SrsState>,
  loaded: ReviewList[],
): Record<string, SrsState> {
  const files = new Set(loaded.map((l) => listPath(l.id)));
  const rowIds = new Set(loaded.flatMap((l) => listCards({ ...l, direction: "both" }).map((c) => c.id)));
  let out = next;
  for (const [id, st] of Object.entries(saved)) {
    if (out[id] || !isListFile(st.file)) continue;
    if (files.has(st.file) && !rowIds.has(id)) continue;
    if (out === next) out = { ...next };
    out[id] = st;
  }
  return out;
}

/**
 * Not kartı hiç yoksa (notlar henüz yüklenmedi ya da okunamadı) kayıtlı not kartı durumlarını
 * koru. Liste kartları kart sayısını sıfırdan çıkardığı için "kart yoksa yazma" koruması artık
 * tek başına yetmiyor; bu olmadan matchStates bütün not geçmişini yetim sayıp siler.
 */
export function keepNoteStatesWithoutNotes(
  next: Record<string, SrsState>,
  saved: Record<string, SrsState>,
  cards: SrsCard[],
): Record<string, SrsState> {
  if (cards.some((c) => !isListFile(c.file))) return next;
  let out = next;
  for (const [id, st] of Object.entries(saved)) {
    if (out[id] || isListFile(st.file)) continue;
    if (out === next) out = { ...next };
    out[id] = st;
  }
  return out;
}

/** Her listenin bugün kalan yeni kart hakkı: liste yolu → kalan (en az 0). */
export function listNewCaps(
  lists: ReviewList[],
  today: DayCount | undefined,
  cfg: Pick<SrsSettings, "newPerDay">,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lists) {
    const cap = Math.min(l.newPerDay ?? cfg.newPerDay, cfg.newPerDay);
    out[listPath(l.id)] = Math.max(0, cap - (today?.lists?.[l.id] ?? 0));
  }
  return out;
}

// Tekrar verisinin kasadaki kalıcı hâli.
//
// Yer: <kasa>/Tekrar/  — görünür klasör, yani GitHub senkronuna dahil olur;
// ama dosya ağacı yalnız .md ve .excalidraw listelediği için kullanıcıya görünmez.
//
// NOTE_SAFETY: not dosyalarına hiç dokunulmaz. Yalnız bu üç dosya yazılır.

import type { VaultBackend } from "../vault/types";
import { cardId } from "./parser";
import {
  DEFAULT_SETTINGS,
  LOG_FILE,
  SETTINGS_FILE,
  SRS_DIR,
  STATE_FILE,
  type SrsLog,
  type SrsSettings,
  type SrsState,
} from "./types";

/** durum.json'un dosya biçimi — ileride alan eklemek için sürüm numarası taşır. */
interface StateFile {
  v: 1;
  cards: SrsState[];
  /** Gün bazında yapılan iş: ISO gün → { yeni, tekrar, ms }. */
  daily: Record<string, DayCount>;
}

export interface DayCount {
  /** O gün gösterilen yeni kart sayısı. */
  n: number;
  /** O gün cevaplanan toplam kart (yeni dahil). */
  r: number;
  /** O gün harcanan süre (ms). */
  ms: number;
  /** Liste kimliği → o gün o listeden gösterilen yeni kart (LOM-65; eski dosyalarda yok). */
  lists?: Record<string, number>;
}

export interface SrsData {
  states: Record<string, SrsState>;
  daily: Record<string, DayCount>;
  settings: SrsSettings;
}

export const EMPTY_DATA: SrsData = { states: {}, daily: {}, settings: { ...DEFAULT_SETTINGS } };

async function readJson<T>(backend: VaultBackend, path: string): Promise<T | null> {
  try {
    if (!(await backend.exists(path))) return null;
    const raw = await backend.readNote(path);
    return raw.trim() ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Ayar dosyasını okumanın sonucu (LOM-71). "Dosya yok" ile "okunamadı" ayrıdır:
 *  yalnız dosya yokken varsayılan kullanılır; okunamayan dosya varsayılan sayılmaz. */
export type SettingsRead =
  | { kind: "ok"; settings: SrsSettings; raw: string }
  | { kind: "missing" }
  | { kind: "error"; detail: string };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Dosyadaki eksik alanları varsayılanla tamamla (ileri uyumluluk). */
export function normalizeSettings(raw: Partial<SrsSettings>): SrsSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    syntax: { ...DEFAULT_SETTINGS.syntax, ...(raw.syntax ?? {}) },
    weekLoad:
      Array.isArray(raw.weekLoad) && raw.weekLoad.length === 7
        ? raw.weekLoad
        : [...DEFAULT_SETTINGS.weekLoad],
    learnSteps: Array.isArray(raw.learnSteps) && raw.learnSteps.length ? raw.learnSteps : [...DEFAULT_SETTINGS.learnSteps],
    relearnSteps:
      Array.isArray(raw.relearnSteps) && raw.relearnSteps.length ? raw.relearnSteps : [...DEFAULT_SETTINGS.relearnSteps],
    desteler: Array.isArray(raw.desteler) ? raw.desteler : [],
    excluded: Array.isArray(raw.excluded) ? raw.excluded : [],
  };
}

/** Ayar dosyasını oku. Boş dosya da hata sayılır: senkronun yarım yazdığı ara hâl olabilir. */
export async function readSettings(backend: VaultBackend): Promise<SettingsRead> {
  let raw: string;
  try {
    if (!(await backend.exists(SETTINGS_FILE))) return { kind: "missing" };
    raw = await backend.readNote(SETTINGS_FILE);
  } catch (e) {
    return { kind: "error", detail: errText(e) };
  }
  if (!raw.trim()) return { kind: "error", detail: `${SETTINGS_FILE} boş` };
  let parsed: unknown;
  try {
    // Baştaki BOM'u (bazı Windows düzenleyicileri ekler) at; ham metin karşılaştırma için aynen kalır.
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (e) {
    return { kind: "error", detail: `${SETTINGS_FILE} bozuk: ${errText(e)}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "error", detail: `${SETTINGS_FILE} bozuk: nesne değil` };
  }
  return { kind: "ok", settings: normalizeSettings(parsed as Partial<SrsSettings>), raw };
}

/** Anahtarları sıralı, kararlı JSON metni: anahtar sırası farkı içerik farkı sayılmaz. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/**
 * İki ayar metni aynı içeriği mi taşıyor (LOM-73). Satır sonu (CRLF), boşluk, baştaki BOM ve
 * anahtar sırası farkı değişiklik sayılmaz; değer farkı sayılır. JSON olarak okunamayan metinde
 * satır sonu ve baş/son boşluk dışında birebir karşılaştırılır. `null` (dosya yok) yalnız `null`a eşittir.
 */
export function sameSettingsText(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  const parse = (t: string): { ok: true; v: unknown } | { ok: false } => {
    try {
      return { ok: true, v: JSON.parse(t.replace(/^\uFEFF/, "")) };
    } catch {
      return { ok: false };
    }
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.ok && pb.ok) return stableJson(pa.v) === stableJson(pb.v);
  const plain = (t: string) => t.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  return plain(a) === plain(b);
}

export type SettingsDecision =
  | { action: "keep" }
  | { action: "adopt"; settings: SrsSettings; raw: string | null }
  | { action: "error"; detail: string };

/**
 * Okuma sonucuna göre ne yapılacağı. `knownRaw`: bu kasada son okunan/yazılan metin;
 * `null` = dosya yok biliniyordu, `undefined` = bu kasa için hiç okunmadı.
 * Değişmeyen dosyaya dokunulmaz (yalnız biçim farkı — satır sonu, boşluk — değişiklik sayılmaz);
 * içeriği dışarıdan değişen benimsenir; hata belleği değiştirmez.
 */
export function resolveSettingsRead(read: SettingsRead, knownRaw: string | null | undefined): SettingsDecision {
  if (read.kind === "error") return { action: "error", detail: read.detail };
  if (read.kind === "missing") {
    return knownRaw === null ? { action: "keep" } : { action: "adopt", settings: { ...DEFAULT_SETTINGS }, raw: null };
  }
  if (knownRaw !== undefined && sameSettingsText(read.raw, knownRaw)) return { action: "keep" };
  return { action: "adopt", settings: read.settings, raw: read.raw };
}

/**
 * Ayarları kaydet. `knownRaw`: son okunan/yazılan metin (`null` = dosya yok biliniyordu).
 * İçerik aynıysa diske dokunmaz (null döner). Okunmamış bir dosyanın üstüne yazmaz: `knownRaw`
 * null iken dosya diskte varsa, ya da diskteki içerik `knownRaw`dan farklıysa fırlatır —
 * kişinin ayarları varsayılanla ya da eski hâliyle ezilmesin. Yalnız biçim farkı (satır sonu,
 * boşluk, BOM, anahtar sırası) dışarıdan değişiklik sayılmaz (LOM-73).
 * Başarılı yazımda yazılan metni döner.
 */
export async function saveSettings(
  backend: VaultBackend,
  s: SrsSettings,
  knownRaw: string | null,
): Promise<string | null> {
  const text = JSON.stringify(s, null, 2);
  if (sameSettingsText(text, knownRaw)) return null;
  if (await backend.exists(SETTINGS_FILE)) {
    if (knownRaw === null) throw new Error(`Okunmamış Tekrar ayar dosyasının üstüne yazılmaz: ${SETTINGS_FILE}`);
    // Son okumadan beri dışarıdan (senkron, başka cihaz) değiştiyse ya da bozulduysa ezme.
    if (!sameSettingsText(await backend.readNote(SETTINGS_FILE), knownRaw)) {
      throw new Error(`Tekrar ayar dosyası dışarıdan değişmiş, üstüne yazılmaz: ${SETTINGS_FILE}`);
    }
  }
  await backend.ensureDir(SRS_DIR);
  await backend.writeNote(SETTINGS_FILE, text);
  return text;
}

/** Kart durumlarını ve günlük sayaçları oku. */
export async function loadStates(
  backend: VaultBackend,
): Promise<{ states: Record<string, SrsState>; daily: Record<string, DayCount> }> {
  const raw = await readJson<StateFile>(backend, STATE_FILE);
  const states: Record<string, SrsState> = {};
  if (raw?.cards) for (const c of raw.cards) states[c.id] = c;
  return { states, daily: raw?.daily ?? {} };
}

export async function saveStates(
  backend: VaultBackend,
  states: Record<string, SrsState>,
  daily: Record<string, DayCount>,
): Promise<void> {
  await backend.ensureDir(SRS_DIR);
  const file: StateFile = { v: 1, cards: Object.values(states), daily };
  await backend.writeNote(STATE_FILE, JSON.stringify(file));
}

/** Cevap kaydını geçmişe ekle. Dosya yalnızca büyür — hiçbir satır silinmez/değişmez.
 *  Bu kayıt ileride "senin verine göre ayar öğrenme" için tek girdidir. */
export async function appendLog(backend: VaultBackend, entries: SrsLog[]): Promise<void> {
  if (!entries.length) return;
  await backend.ensureDir(SRS_DIR);
  let prev = "";
  try {
    if (await backend.exists(LOG_FILE)) prev = await backend.readNote(LOG_FILE);
  } catch {
    prev = "";
  }
  const add = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await backend.writeNote(LOG_FILE, prev.endsWith("\n") || !prev ? prev + add : prev + "\n" + add);
}

export async function loadLog(backend: VaultBackend): Promise<SrsLog[]> {
  try {
    if (!(await backend.exists(LOG_FILE))) return [];
    const raw = await backend.readNote(LOG_FILE);
    const out: SrsLog[] = [];
    for (const line of raw.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try {
        out.push(JSON.parse(s) as SrsLog);
      } catch {
        /* bozuk satırı atla — geri kalan kayıt kurtarılır */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Not yeniden adlandırılınca kart durumlarını yeni yola taşı.
 *  Kimlik dosya yolunu içerdiği için yeniden hesaplanır — geçmiş böylece korunur. */
export function migratePath(
  states: Record<string, SrsState>,
  from: string,
  to: string,
): Record<string, SrsState> {
  let hit = false;
  const next: Record<string, SrsState> = {};
  for (const st of Object.values(states)) {
    let file = st.file;
    if (st.file === from) file = to;
    else if (st.file.startsWith(from + "/")) file = to + st.file.slice(from.length);
    if (file === st.file) {
      next[st.id] = st;
      continue;
    }
    hit = true;
    const id = cardId(file, st.key);
    next[id] = { ...st, id, file };
  }
  return hit ? next : states;
}

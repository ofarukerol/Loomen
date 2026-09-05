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

/** Ayarları oku — dosyadaki eksik alanlar varsayılanla tamamlanır (ileri uyumluluk). */
export async function loadSettings(backend: VaultBackend): Promise<SrsSettings> {
  const raw = await readJson<Partial<SrsSettings>>(backend, SETTINGS_FILE);
  if (!raw) return { ...DEFAULT_SETTINGS };
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

export async function saveSettings(backend: VaultBackend, s: SrsSettings): Promise<void> {
  await backend.ensureDir(SRS_DIR);
  await backend.writeNote(SETTINGS_FILE, JSON.stringify(s, null, 2));
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

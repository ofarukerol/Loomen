// Alışkanlık verisinin kasadaki kalıcı hâli (LOM-54).
//
// Yer: <kasa>/Alışkanlık/<id>.json — görünür klasör, GitHub senkronuna dahil; dosya ağacı
// yalnız .md/.excalidraw listelediği için kullanıcıya görünmez. Emsal: srs/store.ts (Tekrar/).
//
// NOTE_SAFETY: not dosyalarına hiç dokunulmaz; yalnız Alışkanlık/ altındaki .json yazılır.
// Okunamayan (bozuk, bilinmeyen sürüm) dosya "broken" listesine girer ve ASLA üstüne yazılmaz —
// kullanıcının ya da başka bir cihazın verisi ezilmesin.

import type { VaultBackend } from "../vault/types";
import { HABIT_ID_RE, decodeHabit, encodeHabit } from "./codec";
import { HABIT_DIR, type Habit } from "./types";

/** Yüklenen kasa durumu; kaydetme ve silme bununla yapılır. */
export interface HabitVault {
  /** Diskteki klasör adı (macOS'ta NFD olabilir; yollar bununla kurulur). */
  dirName: string;
  /** id → diskte son görülen/yazılan metin (değişmeyen kaydı yeniden yazmamak için). */
  raw: Record<string, string>;
  /** Okunamayan dosyaların adları (ör. "abc123.json"). */
  broken: string[];
}

export interface LoadedHabits extends HabitVault {
  habits: Habit[];
}

const nfc = (s: string) => s.normalize("NFC");
// Yalnız küçük harfli uzantı: kayıt hep "<id>.json" yazar; "X.JSON" okunsaydı yanına ikinci dosya açılırdı.
const JSON_EXT = /\.json$/;
const pathOf = (v: HabitVault, id: string) => `${v.dirName}/${id}.json`;

/** Kökteki Alışkanlık klasörünün diskteki adı (NFC/NFD fark etmez); yoksa HABIT_DIR. */
export async function findHabitDir(backend: VaultBackend): Promise<string> {
  if (!backend.listDir) return HABIT_DIR;
  const want = nfc(HABIT_DIR);
  const hit = (await backend.listDir("")).find((e) => e.isDirectory && nfc(e.name) === want);
  return hit ? hit.name : HABIT_DIR;
}

/** Bütün turları oku. Bozuk dosyalar atlanır, adları `broken`a yazılır. */
export async function loadHabits(backend: VaultBackend): Promise<LoadedHabits> {
  const dirName = await findHabitDir(backend);
  const out: LoadedHabits = { dirName, raw: {}, broken: [], habits: [] };
  if (!backend.listDir) return out;
  const entries = await backend.listDir(dirName);
  for (const e of entries) {
    if (e.isDirectory || !JSON_EXT.test(e.name)) continue;
    const fileId = e.name.replace(JSON_EXT, "");
    let text: string;
    try {
      text = await backend.readNote(`${dirName}/${e.name}`);
    } catch {
      out.broken.push(e.name);
      continue;
    }
    const habit = decodeHabit(text);
    // Dosya adıyla içteki kimlik uyuşmuyorsa da bozuk say: yanlış dosyaya yazılmasın.
    if (!habit || habit.id !== fileId) {
      out.broken.push(e.name);
      continue;
    }
    out.raw[habit.id] = text;
    out.habits.push(habit);
  }
  out.habits.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  out.broken.sort();
  return out;
}

const isBroken = (v: HabitVault, id: string) => v.broken.some((f) => f.replace(JSON_EXT, "") === id);

/**
 * Turu kaydet. İçerik son okunan/yazılandan farklı değilse diske dokunmaz (false döner).
 * Bozuk dosyanın ya da yüklemede görülmemiş ama diskte duran bir dosyanın üstüne yazmaz.
 */
export async function saveHabit(backend: VaultBackend, habit: Habit, v: HabitVault): Promise<boolean> {
  if (!HABIT_ID_RE.test(habit.id)) throw new Error(`Geçersiz alışkanlık kimliği: ${habit.id}`);
  if (isBroken(v, habit.id)) throw new Error(`Okunamayan alışkanlık dosyasının üstüne yazılmaz: ${habit.id}.json`);
  const text = encodeHabit(habit);
  const known = v.raw[habit.id];
  if (known === text) return false;
  const path = pathOf(v, habit.id);
  if (known === undefined && (await backend.exists(path))) {
    throw new Error(`Yüklenmemiş alışkanlık dosyasının üstüne yazılmaz: ${habit.id}.json`);
  }
  await backend.ensureDir(v.dirName);
  await backend.writeNote(path, text);
  v.raw[habit.id] = text;
  return true;
}

/** Turu çöp kutusuna taşı (kalıcı silmez). */
export async function removeHabit(backend: VaultBackend, id: string, v: HabitVault): Promise<void> {
  if (!HABIT_ID_RE.test(id)) throw new Error(`Geçersiz alışkanlık kimliği: ${id}`);
  await backend.trashNote(pathOf(v, id));
  delete v.raw[id];
  v.broken = v.broken.filter((f) => f.replace(JSON_EXT, "") !== id);
}

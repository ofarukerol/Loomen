// Pomodoro dosyalarının kasada okunup yazılması (VaultBackend üzerinden; Tauri/mobil ortak yol).
// `.loomen` nokta klasörüdür: kasa tarayıcıları (listNotes/listDir) nokta girdilerini atlar,
// not sayılmaz. aktif.json yazımı backend.writeNote ile yan dosya + rename (atomik); rename
// yapamayan platformda atomicWrite doğrudan yazmaya düşer.

import type { VaultBackend } from "../vault/types";
import {
  ACTIVE_FILE, POMO_DIR, SESSIONS_FILE, needsLeadingNewline, parseActive, parseSessions, serializeActive,
  sessionLine, type PomoActive, type PomoSession,
} from "./pomoSync";

async function readOrEmpty(be: VaultBackend, path: string): Promise<string> {
  try {
    if (!(await be.exists(path))) return "";
    return await be.readNote(path);
  } catch {
    return "";
  }
}

export async function readActive(be: VaultBackend): Promise<PomoActive | null> {
  return parseActive(await readOrEmpty(be, ACTIVE_FILE));
}

export async function writeActive(be: VaultBackend, a: PomoActive): Promise<void> {
  await be.ensureDir(POMO_DIR);
  await be.writeNote(ACTIVE_FILE, serializeActive(a));
}

export async function readSessions(be: VaultBackend): Promise<PomoSession[]> {
  return parseSessions(await readOrEmpty(be, SESSIONS_FILE));
}

/** Oturum satırlarını ekle; dosya yarım satırla bitiyorsa önce satır sonu koy. */
export async function appendSessions(be: VaultBackend, list: PomoSession[]): Promise<void> {
  if (list.length === 0) return;
  await be.ensureDir(POMO_DIR);
  const existing = await readOrEmpty(be, SESSIONS_FILE);
  const text = (needsLeadingNewline(existing) ? "\n" : "") + list.map(sessionLine).join("");
  if (be.appendText) await be.appendText(SESSIONS_FILE, text);
  else await be.writeNote(SESSIONS_FILE, existing + text);
}

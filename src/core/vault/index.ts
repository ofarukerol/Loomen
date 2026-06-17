import { open } from "@tauri-apps/plugin-dialog";
import { watch } from "@tauri-apps/plugin-fs";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { parseTasks } from "../markdown/taskParser";
import { dailyNoteTemplate } from "./dailyTemplate";
import type { VaultBackend, VaultData } from "./types";

export { dailyNoteTemplate, dailyNoteTitle, TODO_HEADING } from "./dailyTemplate";

export { createSampleBackend } from "./sampleBackend";
export { createTauriBackend } from "./tauriBackend";

/** Tauri (masaüstü/mobil) içinde mi çalışıyoruz? Değilse tarayıcı/sample modu. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Klasör seçtir; iptal edilirse null. */
export async function pickVaultFolder(): Promise<string | null> {
  const sel = await open({ directory: true, multiple: false, title: "Kasa klasörü seç" });
  return typeof sel === "string" ? sel : null;
}

/** Backend'den tüm notları + görevleri + içerikleri yükle. */
export async function loadVaultData(backend: VaultBackend): Promise<VaultData> {
  const notes = await backend.listNotes();
  const raw = await Promise.all(notes.map((n) => backend.readNote(n.path)));
  const tasks = notes.flatMap((n, i) => parseTasks(n.path, raw[i]));
  const contents: Record<string, string> = {};
  notes.forEach((n, i) => (contents[n.path] = raw[i]));
  return { notes, tasks, contents };
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Bugünün daily note yolu: Daily/YYYY-MM-DD-Gün.md (Türkçe gün — docs 06 §6.2). */
export function todayDailyPath(): string {
  const d = new Date();
  return `Daily/${format(d, "yyyy-MM-dd")}-${format(d, "EEEE", { locale: tr })}.md`;
}

/** Vault kökünü izle; değişiklikte cb çağır. Unwatch fonksiyonu döner. */
export async function watchVaultRoot(root: string, cb: () => void): Promise<() => void> {
  return watch(root, () => cb(), { recursive: true, delayMs: 400 });
}

/** Daily note yoksa kullanıcının günlük şablonuyla oluştur. */
export async function ensureDailyNote(backend: VaultBackend, path: string): Promise<void> {
  if (await backend.exists(path)) return;
  const folder = path.split("/").slice(0, -1).join("/");
  if (folder) await backend.ensureDir(folder);
  await backend.writeNote(path, dailyNoteTemplate(new Date()));
}

import { open } from "@tauri-apps/plugin-dialog";
import { watch } from "@tauri-apps/plugin-fs";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { parseTasks } from "../markdown/taskParser";
import { dailyNoteTemplate, dailyNoteTitle } from "./dailyTemplate";
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
  // Görevler yalnızca markdown notlardan parse edilir (çizimler JSON'dur).
  const tasks = notes.flatMap((n, i) => (n.kind === "draw" ? [] : parseTasks(n.path, raw[i])));
  const contents: Record<string, string> = {};
  notes.forEach((n, i) => (contents[n.path] = raw[i]));
  return { notes, tasks, contents };
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * Bir günün daily note yolu — yıl/ay'a göre iç içe klasörlenir:
 * Günlük/YYYY/MM-Ay/YYYY-MM-DD-Gün.md  (ör. Günlük/2026/06-Haziran/2026-06-17-Çarşamba.md)
 */
export function dailyPathFor(d: Date): string {
  const year = format(d, "yyyy");
  const month = `${format(d, "MM")}-${format(d, "MMMM", { locale: tr })}`;
  return `Günlük/${year}/${month}/${dailyNoteTitle(d)}.md`;
}

/** Bugünün daily note yolu (bkz dailyPathFor). */
export function todayDailyPath(): string {
  return dailyPathFor(new Date());
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

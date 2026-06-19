import { open } from "@tauri-apps/plugin-dialog";
import { watch } from "@tauri-apps/plugin-fs";
import { format, getISOWeek } from "date-fns";
import { tr } from "date-fns/locale";
import { parseTasks } from "../markdown/taskParser";
import { dailyNoteTemplate, dailyNoteTitle } from "./dailyTemplate";
import type { VaultBackend, VaultData } from "./types";

export { dailyNoteTemplate, dailyNoteTitle, TODO_HEADING, migrateDailyContent } from "./dailyTemplate";

export { createSampleBackend } from "./sampleBackend";
export { createTauriBackend } from "./tauriBackend";

/** Şablonların yaşadığı özel klasör (Explorer'da en altta, ayrı stil). */
export const TEMPLATES_DIR = "Şablonlar";
/** Günlük not şablonu dosyası — ayarlardan düzenlenebilir. */
export const DAILY_TEMPLATE_PATH = `${TEMPLATES_DIR}/Günlük.md`;

/** Bir yolun/klasörün şablon klasöründe olup olmadığı. */
export function isTemplatePath(folderOrPath: string): boolean {
  return folderOrPath === TEMPLATES_DIR || folderOrPath.startsWith(`${TEMPLATES_DIR}/`);
}

/** Şablon adından dosya yolu (Şablonlar/<ad>.md). */
export function templatePathFor(name: string): string {
  return `${TEMPLATES_DIR}/${name}.md`;
}

/** Günlük şablonundaki yer tutucuları tarihe göre doldur. */
function fillDailyPlaceholders(tpl: string, date: Date): string {
  return tpl
    .replace(/\{\{\s*tarih\s*\}\}/gi, format(date, "d MMMM yyyy", { locale: tr }))
    .replace(/\{\{\s*gün\s*\}\}/gi, format(date, "EEEE", { locale: tr }))
    .replace(/\{\{\s*hafta\s*\}\}/gi, String(getISOWeek(date)))
    .replace(/\{\{\s*iso\s*\}\}/gi, format(date, "yyyy-MM-dd"));
}

/** Şablon klasörünü ve varsayılan günlük şablonunu (yoksa) oluştur. */
export async function ensureTemplates(backend: VaultBackend): Promise<void> {
  if (await backend.exists(DAILY_TEMPLATE_PATH)) return;
  await backend.ensureDir(TEMPLATES_DIR);
  await backend.writeNote(DAILY_TEMPLATE_PATH, dailyNoteTemplate(new Date()));
}

/**
 * Günlük not içeriğini üret. Seçili şablon (templatePath) varsa onu, yoksa varsayılan
 * 'Şablonlar/Günlük.md', o da yoksa gömülü şablonu kullanır; yer tutucuları doldurur.
 */
export async function renderDailyTemplate(
  backend: VaultBackend,
  date: Date,
  templatePath: string = DAILY_TEMPLATE_PATH
): Promise<string> {
  let tpl: string;
  if (await backend.exists(templatePath)) tpl = await backend.readNote(templatePath);
  else if (await backend.exists(DAILY_TEMPLATE_PATH)) tpl = await backend.readNote(DAILY_TEMPLATE_PATH);
  else tpl = dailyNoteTemplate(date);
  return fillDailyPlaceholders(tpl, date);
}

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
  // Görevler yalnızca markdown notlardan parse edilir (çizimler JSON'dur; şablonlar hariç).
  const tasks = notes.flatMap((n, i) =>
    n.kind === "draw" || isTemplatePath(n.folder) ? [] : parseTasks(n.path, raw[i])
  );
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

/** Daily note yoksa seçili günlük şablonuyla oluştur. */
export async function ensureDailyNote(
  backend: VaultBackend,
  path: string,
  templatePath?: string
): Promise<void> {
  if (await backend.exists(path)) return;
  const folder = path.split("/").slice(0, -1).join("/");
  if (folder) await backend.ensureDir(folder);
  await backend.writeNote(path, await renderDailyTemplate(backend, new Date(), templatePath));
}

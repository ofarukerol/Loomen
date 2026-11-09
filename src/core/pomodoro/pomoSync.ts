// Pomodoro kasa eşitlemesi — saf mantık (Tauri/React yok, node testinde koşar).
//
// Ortak sözleşme (Kokpit masaüstü ile aynı): `<kasa>/.loomen/pomodoro/`
//  - aktif.json: anlık sayaç durumu; son yazan kazanır (updatedAt).
//  - oturumlar.jsonl: biten oturumlar, yalnız eklenir; okuyucu id ile tekilleştirir, bozuk son satırı atlar.

export const POMO_DIR = ".loomen/pomodoro";
export const ACTIVE_FILE = `${POMO_DIR}/aktif.json`;
export const SESSIONS_FILE = `${POMO_DIR}/oturumlar.jsonl`;

export type SyncPhase = "focus" | "short" | "long" | "idle";

export interface PomoActive {
  v: 1;
  phase: SyncPhase;
  endsAt: number | null;
  pausedRemainingMs: number | null;
  focusMin: number;
  shortMin: number;
  longMin: number;
  updatedAt: number;
  device: string;
  task: string | null;
}

export interface PomoSession {
  id: string;
  mode: "focus" | "short" | "long";
  start: number;
  end: number;
  seconds: number;
  device: string;
  task: string | null;
}

const PHASES: SyncPhase[] = ["focus", "short", "long", "idle"];
const MODES = ["focus", "short", "long"];
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * Sözleşme epoch ms SAYIDIR. Tolerans: ISO tarih metni de kabul edilir (ms'ye çevrilir); yazarken
 * hep sayı yazılır. Çevrilemeyen değer null döner.
 */
export function toMs(x: unknown): number | null {
  if (isNum(x)) return x;
  if (typeof x === "string" && x.trim()) {
    const t = Date.parse(x);
    if (Number.isFinite(t)) return t;
  }
  return null;
}
const numOrNull = (x: unknown): number | null => toMs(x);

/** Deterministik oturum kimliği: iki cihaz aynı fazı kaydederse aynı id çıkar. */
export function sessionId(mode: PomoSession["mode"], end: number): string {
  return `${mode}-${end}`;
}

/** Yazılacak aktif durumda, uzaktaki dosyada zaten olan görev adını koru (null ile ezme). */
export function preserveTask(a: PomoActive, existing: PomoActive | null): PomoActive {
  return a.task == null && existing?.task != null ? { ...a, task: existing.task } : a;
}

/** aktif.json metnini doğrula; bozuk/yarım ise null. */
export function parseActive(text: string): PomoActive | null {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    console.warn("Pomodoro aktif.json: bozuk JSON, atlandı");
    return null;
  }
  if (!o || typeof o !== "object") {
    console.warn("Pomodoro aktif.json: nesne değil, atlandı");
    return null;
  }
  const r = o as Record<string, unknown>;
  const updatedAt = toMs(r.updatedAt);
  if (!PHASES.includes(r.phase as SyncPhase) || updatedAt == null) {
    console.warn("Pomodoro aktif.json: geçersiz faz/updatedAt, atlandı");
    return null;
  }
  if (!isNum(r.focusMin) || !isNum(r.shortMin) || !isNum(r.longMin)) {
    console.warn("Pomodoro aktif.json: geçersiz süre alanları, atlandı");
    return null;
  }
  const endsAt = numOrNull(r.endsAt);
  const pausedRemainingMs = numOrNull(r.pausedRemainingMs);
  if ((r.endsAt != null && endsAt == null) || (r.pausedRemainingMs != null && pausedRemainingMs == null)) {
    console.warn("Pomodoro aktif.json: sayıya çevrilemeyen alan null sayıldı");
  }
  return {
    v: 1,
    phase: r.phase as SyncPhase,
    endsAt,
    pausedRemainingMs,
    focusMin: r.focusMin,
    shortMin: r.shortMin,
    longMin: r.longMin,
    updatedAt,
    device: typeof r.device === "string" ? r.device : "",
    task: typeof r.task === "string" ? r.task : null,
  };
}

export function serializeActive(a: PomoActive): string {
  // Sözleşmedeki alan sırasıyla yaz (okunaklı, diğer cihazla aynı).
  const { v, phase, endsAt, pausedRemainingMs, focusMin, shortMin, longMin, updatedAt, device, task } = a;
  return JSON.stringify({ v, phase, endsAt, pausedRemainingMs, focusMin, shortMin, longMin, updatedAt, device, task }) + "\n";
}

/**
 * Son yazan kazanır: uzaktaki durum yereldekinden yeniyse benimsenir. Kendi yazdığımızın
 * updatedAt'i yerele eşit olduğundan elenir (cihaz adı iki Loomen'de aynı olabilir, ona bakılmaz).
 */
export function shouldAdopt(remote: PomoActive | null, localUpdatedAt: number): boolean {
  return !!remote && remote.updatedAt > localUpdatedAt;
}

/** oturumlar.jsonl: satır satır oku; bozuk (ör. yarım kalmış son) satırlar atlanır. */
export function parseSessions(text: string): PomoSession[] {
  const out: PomoSession[] = [];
  let dropped = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let o: unknown;
    try {
      o = JSON.parse(t);
    } catch {
      dropped++;
      continue;
    }
    if (!o || typeof o !== "object") {
      dropped++;
      continue;
    }
    const r = o as Record<string, unknown>;
    const start = toMs(r.start), end = toMs(r.end);
    if (typeof r.id !== "string" || !r.id || !MODES.includes(r.mode as string) || start == null || end == null) {
      dropped++;
      continue;
    }
    out.push({
      id: r.id,
      mode: r.mode as PomoSession["mode"],
      start,
      end,
      seconds: isNum(r.seconds) ? r.seconds : Math.round((end - start) / 1000),
      device: typeof r.device === "string" ? r.device : "",
      task: typeof r.task === "string" ? r.task : null,
    });
  }
  if (dropped > 0) console.warn(`Pomodoro oturumlar.jsonl: ${dropped} geçersiz satır atlandı`);
  return out;
}

/** Eklenecek satır; öncesinde bozuk/yarım satır kalmışsa yeni kayıt ayrı satıra düşsün. */
export function sessionLine(s: PomoSession): string {
  return JSON.stringify(s) + "\n";
}

/** Dosya yeni satırla bitmiyorsa (yarım son satır) eklemeden önce satır sonu gerekir. */
export function needsLeadingNewline(existing: string): boolean {
  return existing.length > 0 && !existing.endsWith("\n");
}

/** Aynı oturumu iki cihaz yazdıysa (benimsenen sayaç) yakın başlangıç/bitiş = aynı oturum. */
export const NEAR_MS = 5000;

/** id ile tekilleştir; farklı id'li ama aynı mod + yakın zamanlı kayıtlar da tek sayılır. Bitişe göre sıralı. */
export function mergeSessions(...lists: PomoSession[][]): PomoSession[] {
  const byId = new Map<string, PomoSession>();
  for (const l of lists) for (const s of l) if (!byId.has(s.id)) byId.set(s.id, s);
  const sorted = [...byId.values()].sort((a, b) => a.end - b.end || a.id.localeCompare(b.id));
  const out: PomoSession[] = [];
  for (const s of sorted) {
    const dup = out.some(
      (o) =>
        o.mode === s.mode &&
        o.device !== s.device &&
        !o.id.startsWith(IMPORT_PREFIX) &&
        !s.id.startsWith(IMPORT_PREFIX) &&
        Math.abs(o.end - s.end) <= NEAR_MS &&
        Math.abs(o.start - s.start) <= NEAR_MS,
    );
    if (!dup) out.push(s);
  }
  return out;
}

export function hasNearTwin(list: PomoSession[], s: Pick<PomoSession, "mode" | "start" | "end">): boolean {
  return list.some((o) => o.mode === s.mode && Math.abs(o.end - s.end) <= NEAR_MS && Math.abs(o.start - s.start) <= NEAR_MS);
}

export function dayOf(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Günlük tamamlanan odak sayısı (oturumun BİTTİĞİ gün). */
export function dailyFocusCounts(sessions: PomoSession[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) if (s.mode === "focus") out[dayOf(s.end)] = (out[dayOf(s.end)] ?? 0) + 1;
  return out;
}

/**
 * Yerel geçmiş ile oturum günlüğünü birleştir: gün başına büyük olan. Yerel sayaç da her biten
 * oturumu artırdığı için toplama değil max alınır — aynı oturum iki kez sayılmaz.
 */
export function mergeHistory(local: Record<string, number>, fromSessions: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...local };
  for (const [day, n] of Object.entries(fromSessions)) out[day] = Math.max(out[day] ?? 0, n);
  return out;
}

export const IMPORT_PREFIX = "imp-";

/**
 * Tek seferlik içe aktarma: yerel geçmiş günlükten fazlaysa farkı sentetik oturum olarak üret.
 * Kimlikler sabit (imp-<gün>-<sıra>) → iki cihaz aynı günü içe aktarsa tekilleşir.
 */
export function importLocalHistory(local: Record<string, number>, fromSessions: Record<string, number>): PomoSession[] {
  const out: PomoSession[] = [];
  for (const [day, n] of Object.entries(local)) {
    const have = fromSessions[day] ?? 0;
    const [y, m, d] = day.split("-").map(Number);
    if (!y || !m || !d) continue;
    const noon = new Date(y, m - 1, d, 12, 0, 0).getTime();
    for (let i = have + 1; i <= n; i++) {
      out.push({ id: `${IMPORT_PREFIX}${day}-${i}`, mode: "focus", start: noon, end: noon, seconds: 0, device: "loomen-import", task: null });
    }
  }
  return out;
}

/** Yerel sayaç görüntüsü (store alanlarının sadeleşmiş hali). */
export interface LocalTimer {
  running: boolean;
  endsAt: number | null;
  remaining: number; // sn
  breakActive: boolean;
  breakRunning: boolean;
  breakEndsAt: number | null;
  breakRemaining: number; // sn
  breakLong: boolean;
  focusMin: number;
  shortMin: number;
  longMin: number;
}

/** Yerel sayaçtan aktif.json içeriği. */
export function toActive(t: LocalTimer, now: number, device: string, task: string | null = null): PomoActive {
  const base = { v: 1 as const, focusMin: t.focusMin, shortMin: t.shortMin, longMin: t.longMin, updatedAt: now, device, task };
  if (t.breakActive) {
    return {
      ...base,
      phase: t.breakLong ? "long" : "short",
      endsAt: t.breakRunning ? t.breakEndsAt : null,
      pausedRemainingMs: t.breakRunning ? null : t.breakRemaining * 1000,
    };
  }
  if (t.running) return { ...base, phase: "focus", endsAt: t.endsAt, pausedRemainingMs: null };
  if (t.remaining < t.focusMin * 60) return { ...base, phase: "focus", endsAt: null, pausedRemainingMs: t.remaining * 1000 };
  return { ...base, phase: "idle", endsAt: null, pausedRemainingMs: null };
}

/** Yerel sayaç alanlarının hangileri değişti → yazma gerekir mi (kalan saniye tik'leri hariç). */
export function timerSignature(t: LocalTimer): string {
  const frozen = (running: boolean, rem: number) => (running ? "r" : String(rem));
  return [
    t.running ? t.endsAt : frozen(false, t.remaining),
    t.breakActive,
    t.breakRunning ? t.breakEndsAt : frozen(false, t.breakRemaining),
    t.breakLong,
    t.focusMin,
    t.shortMin,
    t.longMin,
  ].join("|");
}

export interface AdoptPatch {
  pomoRunning: boolean;
  pomoEndsAt: number | null;
  pomoRemaining: number;
  pomoBreakActive: boolean;
  pomoBreakRunning: boolean;
  pomoBreakEndsAt: number | null;
  pomoBreakRemaining: number;
  pomoBreakLong: boolean;
  focusMin: number;
  shortBreak: number;
  longBreak: number;
}

/**
 * Uzaktaki durumu yerel alanlara çevir. Süresi dolmuş uzak sayaç boşta sayılır: biten oturumu
 * onu başlatan cihaz günlüğe yazar, bizde ikinci kez sayılmaz.
 */
export function adoptPatch(a: PomoActive, now: number): AdoptPatch {
  const sec = (ms: number) => Math.max(0, Math.round(ms / 1000));
  const common = { focusMin: a.focusMin, shortBreak: a.shortMin, longBreak: a.longMin };
  const idle: AdoptPatch = {
    pomoRunning: false,
    pomoEndsAt: null,
    pomoRemaining: a.focusMin * 60,
    pomoBreakActive: false,
    pomoBreakRunning: false,
    pomoBreakEndsAt: null,
    pomoBreakRemaining: 0,
    pomoBreakLong: false,
    ...common,
  };
  if (a.phase === "idle") return idle;
  const live = a.endsAt != null && a.endsAt > now;
  const frozen = a.endsAt == null && a.pausedRemainingMs != null;
  if (!live && !frozen) return idle;
  const remaining = live ? sec(a.endsAt! - now) : sec(a.pausedRemainingMs!);
  if (a.phase === "focus") {
    return { ...idle, pomoRunning: live, pomoEndsAt: live ? a.endsAt : null, pomoRemaining: remaining };
  }
  return {
    ...idle,
    pomoBreakActive: true,
    pomoBreakRunning: live,
    pomoBreakEndsAt: live ? a.endsAt : null,
    pomoBreakRemaining: remaining,
    pomoBreakLong: a.phase === "long",
  };
}

/** "loomen-<platform>" cihaz adı. */
export function deviceName(ua: string): string {
  const u = ua.toLowerCase();
  const p = /android/.test(u) ? "android" : /iphone|ipad|ios/.test(u) ? "ios" : /win/.test(u) ? "windows" : /mac/.test(u) ? "macos" : /linux|x11/.test(u) ? "linux" : "unknown";
  return `loomen-${p}`;
}

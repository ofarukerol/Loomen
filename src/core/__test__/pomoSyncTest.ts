// Pomodoro kasa eşitlemesi saf mantık testi (`npm test`).
import {
  adoptPatch, dailyFocusCounts, dayOf, deviceName, hasNearTwin, importLocalHistory, mergeHistory,
  mergeSessions, needsLeadingNewline, parseActive, parseSessions, serializeActive, sessionLine,
  preserveTask, sessionId, shouldAdopt, timerSignature, toActive, type LocalTimer, type PomoSession,
} from "../pomodoro/pomoSync";
import { appendSessions, readActive, readSessions } from "../pomodoro/pomoVaultIO";
import type { VaultBackend } from "../vault/types";

let fails = 0;
let ran = 0;
function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
function eq(name: string, got: unknown, want: unknown): void {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  check(name, a === b, a === b ? "" : `beklenen ${b}, gelen ${a}`);
}

const S = (id: string, end: number, device = "loomen-macos", mode: PomoSession["mode"] = "focus"): PomoSession =>
  ({ id, mode, start: end - 1500000, end, seconds: 1500, device, task: null });

// parse + bozuk satır
const good = sessionLine(S("a", 1_000_000_000_000)) + sessionLine(S("b", 1_000_001_000_000));
eq("iki satır okunur", parseSessions(good).map((s) => s.id), ["a", "b"]);
eq("bozuk son satır atlanır", parseSessions(good + '{"id":"c","mode":"fo').map((s) => s.id), ["a", "b"]);
eq("geçersiz kayıt atlanır", parseSessions('{"id":"x","mode":"zzz","start":1,"end":2}\n[1]\nnull\n\n').length, 0);
check("yarım satırdan sonra satır sonu gerekir", needsLeadingNewline('{"id":"c"') && !needsLeadingNewline(good) && !needsLeadingNewline(""));

// birleştirme
const m = mergeSessions([S("a", 1e12), S("b", 2e12)], [S("b", 2e12), S("c", 3e12)]);
eq("id ile tekilleşir, sıralı", m.map((s) => s.id), ["a", "b", "c"]);
const near = mergeSessions([S("k1", 5e12, "kokpit-mac")], [S("l1", 5e12 + 2000, "loomen-macos")]);
eq("farklı cihaz yakın zaman = tek oturum", near.length, 1);
eq("aynı cihaz yakın ama farklı id korunur", mergeSessions([S("p", 5e12), S("q", 5e12 + 1000)]).length, 2);
check("hasNearTwin", hasNearTwin([S("k1", 5e12, "kokpit-mac")], { mode: "focus", start: 5e12 - 1500000 + 1000, end: 5e12 + 1000 }));

// günlük sayım + geçmiş
const d1 = new Date(2026, 10, 3, 10).getTime(), d2 = new Date(2026, 10, 4, 10).getTime();
const counts = dailyFocusCounts([S("1", d1), S("2", d1 + 1), S("3", d2), S("4", d2, "x", "short")]);
eq("günlük odak sayısı (mola sayılmaz)", counts, { "2026-11-03": 2, "2026-11-04": 1 });
eq("dayOf yerel gün", dayOf(d1), "2026-11-03");
eq("mergeHistory max, çift saymaz", mergeHistory({ "2026-11-03": 3, "2026-11-01": 2 }, { "2026-11-03": 2, "2026-11-04": 1 }), { "2026-11-03": 3, "2026-11-01": 2, "2026-11-04": 1 });
const imp = importLocalHistory({ "2026-11-03": 3, "2026-11-01": 2 }, { "2026-11-03": 1 });
eq("içe aktarma yalnız farkı üretir, sabit id", imp.map((s) => s.id), ["imp-2026-11-03-2", "imp-2026-11-03-3", "imp-2026-11-01-1", "imp-2026-11-01-2"]);
eq("içe aktarma tekrarında tekilleşir", mergeSessions(imp, imp).length, 4);
eq("içe aktarılanlar günde sayılır", dailyFocusCounts(imp), { "2026-11-03": 2, "2026-11-01": 2 });

// aktif.json
const t: LocalTimer = { running: true, endsAt: 2_000_000, remaining: 100, breakActive: false, breakRunning: false, breakEndsAt: null, breakRemaining: 0, breakLong: false, focusMin: 25, shortMin: 5, longMin: 15 };
const act = toActive(t, 1_000_000, "loomen-macos");
eq("çalışan odak", [act.phase, act.endsAt, act.pausedRemainingMs], ["focus", 2_000_000, null]);
eq("durmuş odak kalan taşır", toActive({ ...t, running: false, endsAt: null, remaining: 600 }, 1, "d").pausedRemainingMs, 600000);
eq("dolu süre = idle", toActive({ ...t, running: false, endsAt: null, remaining: 1500 }, 1, "d").phase, "idle");
eq("uzun mola", toActive({ ...t, running: false, breakActive: true, breakLong: true, breakRemaining: 900 }, 1, "d").phase, "long");
eq("serileştir/ayrıştır", serializeActive(parseActive(serializeActive(act))!), serializeActive(act));
eq("bozuk aktif.json null", parseActive('{"v":1,"phase":"fo'), null);
eq("geçersiz faz null", parseActive('{"phase":"x","updatedAt":1,"focusMin":1,"shortMin":1,"longMin":1}'), null);

// son yazan kazanır
check("yeni uzak benimsenir", shouldAdopt({ ...act, device: "kokpit-x", updatedAt: 10 }, 5));
check("eski uzak benimsenmez", !shouldAdopt({ ...act, device: "kokpit-x", updatedAt: 5 }, 10));
check("kendi yazdığımız benimsenmez", !shouldAdopt({ ...act, updatedAt: 5 }, 5));
check("dosya yok", !shouldAdopt(null, 0));

// benimseme
const now = 1_000_000;
const p1 = adoptPatch({ ...act, device: "kokpit-x", endsAt: now + 600_000 }, now);
eq("çalışan odak benimsenir", [p1.pomoRunning, p1.pomoRemaining, p1.pomoEndsAt], [true, 600, now + 600_000]);
const p2 = adoptPatch({ ...act, phase: "short", endsAt: null, pausedRemainingMs: 120_000 }, now);
eq("durmuş mola", [p2.pomoBreakActive, p2.pomoBreakRunning, p2.pomoBreakRemaining, p2.pomoBreakLong, p2.pomoRunning], [true, false, 120, false, false]);
eq("süresi dolmuş uzak = boşta", [adoptPatch({ ...act, endsAt: now - 1 }, now).pomoRunning, adoptPatch({ ...act, endsAt: now - 1 }, now).pomoRemaining], [false, 1500]);
eq("idle", adoptPatch({ ...act, phase: "idle", endsAt: null }, now).pomoBreakActive, false);
eq("ayarlar uzaktan gelir", [p1.focusMin, p1.shortBreak, p1.longBreak], [25, 5, 15]);

// imza: kalan saniye tik'i imzayı değiştirmez
eq("tik imzayı değiştirmez", timerSignature(t) === timerSignature({ ...t, remaining: 50 }), true);
eq("duraklatma imzayı değiştirir", timerSignature(t) !== timerSignature({ ...t, running: false, endsAt: null }), true);
eq("cihaz adı", [deviceName("Mozilla (Macintosh; Intel Mac OS X)"), deviceName("Android 14"), deviceName("iPhone")], ["loomen-macos", "loomen-android", "loomen-ios"]);

// kimlik, görev koruma, ISO toleransı
eq("deterministik id", sessionId("focus", 1_700_000_000_000), "focus-1700000000000");
check("görev korunur", preserveTask({ ...act, task: null }, { ...act, task: "Rapor" }).task === "Rapor");
check("görev boşta temizlenir", preserveTask({ ...act, phase: "idle", endsAt: null, task: null }, { ...act, phase: "idle", endsAt: null, task: "Rapor" }).task === null);
check("farklı koşuda görev taşınmaz", preserveTask({ ...act, endsAt: 5, task: null }, { ...act, endsAt: 9, task: "Rapor" }).task === null);
check("yerel görev ezilmez", preserveTask({ ...act, task: "A" }, { ...act, task: "B" }).task === "A");
const iso = "2026-11-03T10:00:00.000Z", isoMs = Date.parse(iso);
const warns: unknown[] = [];
const origWarn = console.warn;
console.warn = (...a: unknown[]) => { warns.push(a); };
const pa = parseActive(JSON.stringify({ phase: "focus", updatedAt: iso, endsAt: iso, pausedRemainingMs: null, focusMin: 25, shortMin: 5, longMin: 15 }));
eq("ISO aktif.json sayıya çevrilir", [pa?.updatedAt, pa?.endsAt], [isoMs, isoMs]);
check("ISO yazılırken sayı", JSON.parse(serializeActive(pa!)).endsAt === isoMs);
const ps = parseSessions(JSON.stringify({ id: "x", mode: "focus", start: iso, end: isoMs + 1500000 }) + "\n");
eq("ISO oturum çevrilir", [ps[0]?.start, ps[0]?.seconds], [isoMs, 1500]);
warns.length = 0;
parseSessions('{"id":"a","mode":"zzz","start":1,"end":2}\nbozuk\n');
check("atılan satırda uyarı", warns.length === 1);
warns.length = 0;
parseActive('{"phase":"x"}');
parseActive('{"phase":"x"}');
check("aynı bozuk içerik için tek uyarı", warns.length === 1);
const pd = parseActive(JSON.stringify({ phase: "focus", updatedAt: 1, endsAt: null, pausedRemainingMs: iso, focusMin: 25, shortMin: 5, longMin: 15 }));
check("süre alanında ISO kabul edilmez", pd?.pausedRemainingMs === null);
console.warn = origWarn;

// vault IO: hata yayılır, boş sayılmaz
function fakeBE(o: { exists?: () => Promise<boolean>; read?: () => Promise<string>; append?: boolean }): VaultBackend & { appended: string[] } {
  const appended: string[] = [];
  const be: any = {
    exists: o.exists ?? (async () => true),
    readNote: o.read ?? (async () => ""),
    ensureDir: async () => {},
    writeNote: async () => { throw new Error("writeNote çağrılmamalı"); },
    appended,
  };
  if (o.append !== false) be.appendText = async (_p: string, t: string) => { appended.push(t); };
  return be;
}
async function rejects(f: () => Promise<unknown>): Promise<boolean> {
  try { await f(); return false; } catch { return true; }
}
async function ioTests(): Promise<void> {
  check("dosya yok = boş", (await readSessions(fakeBE({ exists: async () => false }))).length === 0);
  check("okuma hatası fırlar (boş değil)", await rejects(() => readSessions(fakeBE({ read: async () => { throw new Error("EIO"); } }))));
  check("exists hatası fırlar", await rejects(() => readActive(fakeBE({ exists: async () => { throw new Error("EIO"); } }))));
  check("append: okuma hatasında yazmaz", await (async () => {
    const be = fakeBE({ read: async () => { throw new Error("EIO"); } });
    return (await rejects(() => appendSessions(be, [S("a", 1e12)]))) && be.appended.length === 0;
  })());
  const be2 = fakeBE({ append: false, read: async () => "mevcut\n" });
  console.warn = () => {};
  await appendSessions(be2, [S("a", 1e12)]); // writeNote çağrılsa fırlatır
  console.warn = origWarn;
  check("appendText yoksa yazılmaz, ezme yok", true);
  const be3 = fakeBE({ read: async () => '{"id":"yarım' });
  await appendSessions(be3, [S("a", 1e12)]);
  check("yarım satırdan sonra satır sonu eklenir", be3.appended[0].startsWith("\n{"));
}
await ioTests();

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

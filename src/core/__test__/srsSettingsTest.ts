// Tekrar ayar dosyasını okuma/yazma koruması (LOM-71): "dosya yok", "okunamadı" ve "bozuk"
// ayrı sonuç verir; okunmamış dosyanın üstüne yazılmaz; yeniden okumada değişmeyen dosyaya
// dokunulmaz, dışarıdan değişen benimsenir.
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import {
  DEFAULT_SETTINGS,
  SETTINGS_FILE,
  readSettings,
  resolveSettingsRead,
  sameSettingsText,
  saveSettings,
  type SettingsRead,
  type SrsSettings,
} from "../srs";
import type { VaultBackend } from "../vault/types";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ReviewSettingsGate } from "../../screens/Review/ReviewSettingsGate";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

async function throws(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Okuma/varlık sorgusu hata fırlatabilen sahte kasa. */
function fakeVault(init: Record<string, string>, fail: { read?: string; exists?: string } = {}) {
  const files = new Map(Object.entries(init));
  const writes: string[] = [];
  const backend: VaultBackend = {
    listNotes: async () => [],
    readNote: async (p) => {
      if (fail.read) throw new Error(fail.read);
      const v = files.get(p);
      if (v === undefined) throw new Error("yok: " + p);
      return v;
    },
    writeNote: async (p, c) => {
      writes.push(p);
      files.set(p, c);
    },
    readBinary: async () => new Uint8Array(),
    writeBinary: async () => {},
    exists: async (p) => {
      if (fail.exists) throw new Error(fail.exists);
      return files.has(p);
    },
    ensureDir: async () => {},
    rename: async () => {},
    trashNote: async () => {},
    listTrash: async () => [],
    restoreFromTrash: async () => "",
    purgeTrashItem: async () => {},
  };
  return { backend, files, writes };
}

const MINE: Partial<SrsSettings> = {
  enabled: true,
  newPerDay: 7,
  desteler: [{ id: "d1", name: "İngilizce", folder: "Dil", tag: "" }],
};
const MINE_RAW = JSON.stringify(MINE, null, 2);

// ---------------------------------------------------------------- readSettings

{
  const r = await readSettings(fakeVault({}).backend);
  check("dosya yok → missing", r.kind === "missing", r.kind);
}
{
  const r = await readSettings(fakeVault({ [SETTINGS_FILE]: MINE_RAW }).backend);
  check("geçerli dosya → ok", r.kind === "ok", r.kind);
  if (r.kind === "ok") {
    check("ok: dosyadaki değerler korunur", r.settings.enabled === true && r.settings.newPerDay === 7);
    check("ok: desteler korunur", r.settings.desteler.length === 1 && r.settings.desteler[0].name === "İngilizce");
    check("ok: eksik alanlar varsayılanla dolar", r.settings.maxPerDay === DEFAULT_SETTINGS.maxPerDay &&
      r.settings.weekLoad.length === 7 && r.settings.learnSteps.length > 0);
    check("ok: ham metin aynen döner", r.raw === MINE_RAW);
  }
}
{
  const r = await readSettings(fakeVault({ [SETTINGS_FILE]: "  \n" }).backend);
  check("boş dosya → error (varsayılan sayılmaz)", r.kind === "error", r.kind);
}
{
  const r = await readSettings(fakeVault({ [SETTINGS_FILE]: '{"enabled": tru' }).backend);
  check("bozuk JSON → error", r.kind === "error", r.kind);
}
{
  const r = await readSettings(fakeVault({ [SETTINGS_FILE]: "[1,2]" }).backend);
  check("nesne olmayan içerik → error", r.kind === "error", r.kind);
}
{
  const r = await readSettings(fakeVault({ [SETTINGS_FILE]: MINE_RAW }, { read: "EBUSY: kilitli" }).backend);
  check("okuma fırlatır → error", r.kind === "error", r.kind);
  check("error: ayrıntı dolu", r.kind === "error" && r.detail.includes("EBUSY"));
}
{
  const r = await readSettings(fakeVault({ [SETTINGS_FILE]: MINE_RAW }, { exists: "EACCES" }).backend);
  check("varlık sorgusu fırlatır → error (missing değil)", r.kind === "error" && r.detail.includes("EACCES"), r.kind);
}

{
  const r = await readSettings(fakeVault({ [SETTINGS_FILE]: "\uFEFF" + MINE_RAW }).backend);
  check("BOM'lu dosya → ok, ham metin aynen", r.kind === "ok" && r.settings.newPerDay === 7 && r.raw.startsWith("\uFEFF"), r.kind);
}
{
  const r = await readSettings(fakeVault({ [SETTINGS_FILE]: "null" }).backend);
  check("'null' içerik → error", r.kind === "error", r.kind);
}
{
  const r = await readSettings(fakeVault({ [SETTINGS_FILE]: "{}" }).backend);
  check("'{}' → ok, hepsi varsayılan", r.kind === "ok" &&
    JSON.stringify(r.settings) === JSON.stringify(DEFAULT_SETTINGS), r.kind);
}

// ---------------------------------------------------------------- saveSettings

const NEXT: SrsSettings = { ...DEFAULT_SETTINGS, enabled: true };
const NEXT_RAW = JSON.stringify(NEXT, null, 2);

{
  const v = fakeVault({ [SETTINGS_FILE]: MINE_RAW });
  const err = await throws(() => saveSettings(v.backend, NEXT, null));
  check("okunmamış (known null) + dosya var → fırlatır", err !== null, err ?? "");
  check("okunmamış dosyaya yazılmadı", v.writes.length === 0 && v.files.get(SETTINGS_FILE) === MINE_RAW);
}
{
  const v = fakeVault({});
  const out = await saveSettings(v.backend, NEXT, null);
  check("known null + dosya yok → yazar", v.writes.length === 1 && v.files.get(SETTINGS_FILE) === NEXT_RAW);
  check("yazılan metni döner", out === NEXT_RAW);
}
{
  const v = fakeVault({ [SETTINGS_FILE]: NEXT_RAW });
  const out = await saveSettings(v.backend, NEXT, NEXT_RAW);
  check("metin bilinenle aynı → diske dokunmaz", v.writes.length === 0 && out === null);
}
{
  const v = fakeVault({ [SETTINGS_FILE]: MINE_RAW });
  const out = await saveSettings(v.backend, NEXT, MINE_RAW);
  check("bilinen farklı → yazar", v.writes.length === 1 && v.files.get(SETTINGS_FILE) === NEXT_RAW);
  check("yeni metni döner", out === NEXT_RAW);
}
{
  // Okuma hatasından sonra store bilinen metni hiç almaz (undefined → null geçer): yazım engellenir.
  const v = fakeVault({ [SETTINGS_FILE]: "{bozuk" });
  const read = await readSettings(v.backend);
  const err = await throws(() => saveSettings(v.backend, NEXT, null));
  check("bozuk dosya okunamadı ve üstüne yazılmadı", read.kind === "error" && err !== null &&
    v.writes.length === 0 && v.files.get(SETTINGS_FILE) === "{bozuk");
}

{
  const v = fakeVault({ [SETTINGS_FILE]: '{"enabled": true, "newPerDay": 3}' });
  const err = await throws(() => saveSettings(v.backend, NEXT, MINE_RAW));
  check("disk bilinenden farklı (dışarıdan değişmiş) → fırlatır, yazmaz", err !== null && v.writes.length === 0, err ?? "");
}
{
  const v = fakeVault({ [SETTINGS_FILE]: "{bozuk" });
  const err = await throws(() => saveSettings(v.backend, NEXT, MINE_RAW));
  check("bilinen dolu ama disk bozulmuş → fırlatır, yazmaz", err !== null && v.files.get(SETTINGS_FILE) === "{bozuk");
}
{
  const v = fakeVault({}, { exists: "EACCES" });
  const err = await throws(() => saveSettings(v.backend, NEXT, null));
  check("varlık sorgusu fırlatır → kayıt da fırlatır, yazmaz", err !== null && v.writes.length === 0);
}
{
  const v = fakeVault({ [SETTINGS_FILE]: MINE_RAW }, { read: "EBUSY" });
  const err = await throws(() => saveSettings(v.backend, NEXT, MINE_RAW));
  check("disk okunamıyor → kayıt fırlatır, yazmaz", err !== null && v.writes.length === 0);
}

// ---------------------------------------------------------------- resolveSettingsRead

const OK: SettingsRead = { kind: "ok", settings: { ...DEFAULT_SETTINGS, enabled: true }, raw: MINE_RAW };

{
  const d = resolveSettingsRead(OK, MINE_RAW);
  check("ok + aynı metin → keep (dokunulmaz)", d.action === "keep", d.action);
}
{
  const d = resolveSettingsRead(OK, '{"enabled": false}');
  check("ok + farklı metin → adopt (dışarıdan değişen benimsenir)", d.action === "adopt" &&
    d.settings.enabled === true && d.raw === MINE_RAW, d.action);
}
{
  const d = resolveSettingsRead(OK, undefined);
  check("ok + hiç okunmamış → adopt", d.action === "adopt" && d.raw === MINE_RAW, d.action);
}
{
  const d = resolveSettingsRead(OK, null);
  check("ok + dosya yok biliniyordu → adopt", d.action === "adopt" && d.raw === MINE_RAW, d.action);
}
{
  const d = resolveSettingsRead({ kind: "missing" }, undefined);
  check("missing + hiç okunmamış → varsayılan", d.action === "adopt" && d.raw === null &&
    JSON.stringify(d.settings) === JSON.stringify(DEFAULT_SETTINGS), d.action);
}
{
  const d = resolveSettingsRead({ kind: "missing" }, MINE_RAW);
  check("missing + önce vardı → varsayılan, bilinen null", d.action === "adopt" && d.raw === null, d.action);
}
{
  const d = resolveSettingsRead({ kind: "missing" }, null);
  check("missing + zaten yoktu → keep", d.action === "keep", d.action);
}
{
  const d = resolveSettingsRead({ kind: "error", detail: "EBUSY" }, MINE_RAW);
  check("error → error (bellek değişmez)", d.action === "error" && d.detail === "EBUSY", d.action);
}
{
  const d = resolveSettingsRead({ kind: "error", detail: "x" }, undefined);
  check("error + hiç okunmamış → error (varsayılana düşmez)", d.action === "error", d.action);
}

// ---------------------------------------------------------------- biçim farkı (LOM-73)
// Senkron ya da düzenleyici satır sonunu, boşluğu, BOM'u, anahtar sırasını değiştirebilir;
// bu içerik değişikliği sayılmaz. Değer farkı sayılır.

const crlf = (t: string) => t.replace(/\n/g, "\r\n");

{
  check("sameSettingsText: aynı metin", sameSettingsText(MINE_RAW, MINE_RAW));
  check("sameSettingsText: CRLF'li kopya aynı", sameSettingsText(crlf(MINE_RAW), MINE_RAW));
  check("sameSettingsText: sona satır sonu eklenmiş aynı", sameSettingsText(MINE_RAW + "\n", MINE_RAW));
  check("sameSettingsText: BOM'lu aynı", sameSettingsText("\uFEFF" + MINE_RAW, MINE_RAW));
  check("sameSettingsText: tek satır (boşluksuz) aynı", sameSettingsText(JSON.stringify(MINE), MINE_RAW));
  const reordered = JSON.stringify({ desteler: MINE.desteler, newPerDay: 7, enabled: true }, null, 2);
  check("sameSettingsText: anahtar sırası farklı, değerler aynı", sameSettingsText(reordered, MINE_RAW));
  check("sameSettingsText: newPerDay farklı → farklı",
    !sameSettingsText(JSON.stringify({ ...MINE, newPerDay: 8 }, null, 2), MINE_RAW));
  check("sameSettingsText: deste listesi farklı → farklı",
    !sameSettingsText(JSON.stringify({ ...MINE, desteler: [] }, null, 2), MINE_RAW));
  check("sameSettingsText: null ile metin farklı", !sameSettingsText(null, MINE_RAW) && !sameSettingsText(MINE_RAW, null));
  check("sameSettingsText: null ile null aynı", sameSettingsText(null, null));
  check("sameSettingsText: bozuk metin + CRLF aynı", sameSettingsText(crlf("{bozuk\nmetin"), "{bozuk\nmetin"));
  check("sameSettingsText: bozuk metin ile geçerli JSON farklı", !sameSettingsText("{bozuk", MINE_RAW));
}
{
  const v = fakeVault({ [SETTINGS_FILE]: crlf(MINE_RAW) });
  const err = await throws(() => saveSettings(v.backend, NEXT, MINE_RAW));
  check("disk yalnız CRLF farklı → yazar, fırlatmaz", err === null && v.files.get(SETTINGS_FILE) === NEXT_RAW, err ?? "");
}
{
  const v = fakeVault({ [SETTINGS_FILE]: MINE_RAW + "\n" });
  const err = await throws(() => saveSettings(v.backend, NEXT, MINE_RAW));
  check("disk yalnız sondaki satır sonu farklı → yazar", err === null && v.files.get(SETTINGS_FILE) === NEXT_RAW, err ?? "");
}
{
  const v = fakeVault({ [SETTINGS_FILE]: "\uFEFF" + MINE_RAW });
  const err = await throws(() => saveSettings(v.backend, NEXT, MINE_RAW));
  check("disk yalnız BOM farklı → yazar", err === null && v.files.get(SETTINGS_FILE) === NEXT_RAW, err ?? "");
}
{
  const v = fakeVault({ [SETTINGS_FILE]: crlf(NEXT_RAW) });
  const out = await saveSettings(v.backend, NEXT, crlf(NEXT_RAW));
  check("bilinen metin içerikçe aynı (CRLF) → diske dokunmaz", out === null && v.writes.length === 0);
}
{
  const v = fakeVault({ [SETTINGS_FILE]: crlf(JSON.stringify({ ...MINE, newPerDay: 3 }, null, 2)) });
  const err = await throws(() => saveSettings(v.backend, NEXT, MINE_RAW));
  check("disk gerçekten farklı içerik (CRLF'li) → yine fırlatır", err !== null && v.writes.length === 0, err ?? "");
}
{
  const d = resolveSettingsRead({ ...OK, raw: crlf(MINE_RAW) }, MINE_RAW);
  check("ok + yalnız CRLF farklı → keep", d.action === "keep", d.action);
}
{
  const d = resolveSettingsRead({ ...OK, raw: JSON.stringify({ ...MINE, newPerDay: 8 }) }, MINE_RAW);
  check("ok + içerik farklı → adopt", d.action === "adopt", d.action);
}

// ReviewSettingsGate çizimi (K4): yükleniyorda anahtar yok, hatada Yeniden dene + gizli ayrıntı.
{
  const t = (k: string) => k;
  const loading = renderToString(createElement(ReviewSettingsGate, { status: "loading", detail: null, t, onRetry: () => {} }));
  check("gate yükleniyor: anahtar (lo-switch) yok", !loading.includes("lo-switch"));
  check("gate yükleniyor: yükleniyor metni var", loading.includes("review.set.loading"));
  check("gate yükleniyor: aria-busy", loading.includes('aria-busy="true"'));
  check("gate yükleniyor: Yeniden dene yok", !loading.includes("review.set.retry"));

  const err = renderToString(createElement(ReviewSettingsGate, { status: "error", detail: "EBUSY: kilitli", t, onRetry: () => {} }));
  check("gate hata: role=alert", err.includes('role="alert"'));
  check("gate hata: başlık ve alt metin", err.includes("review.set.readErrorTitle") && err.includes("review.set.readErrorSub"));
  check("gate hata: anahtar (lo-switch) yok", !err.includes("lo-switch"));
  check("gate hata: Yeniden dene düğmesi", /<button[^>]*>review\.set\.retry<\/button>/.test(err));
  check("gate hata: Ayrıntılar düğmesi aria-expanded=false", /<button[^>]*aria-expanded="false"[^>]*>review\.set\.details/.test(err));
  check("gate hata: ayrıntı gizli ve ltr", /<code[^>]*dir="ltr"[^>]*hidden/.test(err) || /<code[^>]*hidden[^>]*dir="ltr"/.test(err));
  check("gate hata: ham metin yalnız gizli ayrıntıda",
    !err.replace(/<code[^>]*hidden[^>]*>[\s\S]*?<\/code>/, "").includes("EBUSY"));

  const noDetail = renderToString(createElement(ReviewSettingsGate, { status: "error", detail: null, t, onRetry: () => {} }));
  check("gate hata, ayrıntı yok: Ayrıntılar düğmesi çizilmez", !noDetail.includes("review.set.details") && noDetail.includes("review.set.retry"));
}

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

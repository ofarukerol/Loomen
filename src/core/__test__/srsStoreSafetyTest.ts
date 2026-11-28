// Tekrar durum/geçmiş dosyası okuma koruması (LOM-75): dosya yoksa normal başlar;
// okunamayan ya da bozuk dosyanın üstüne yazılmaz.
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import { LOG_FILE, STATE_FILE, appendLog, blockedSrsFiles, loadStates, saveStates, type SrsLog, type SrsState } from "../srs";
import type { VaultBackend } from "../vault/types";

let fails = 0;
let ran = 0;
function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

function fakeVault(init: Record<string, string>, failRead: string[] = []) {
  const files = new Map(Object.entries(init));
  const writes: string[] = [];
  const backend: VaultBackend = {
    listNotes: async () => [],
    readNote: async (p) => {
      if (failRead.includes(p)) throw new Error("EBUSY");
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
    exists: async (p) => files.has(p),
    ensureDir: async () => {},
    rename: async () => {},
    trashNote: async () => {},
    listTrash: async () => [],
    restoreFromTrash: async () => "",
    purgeTrashItem: async () => {},
  };
  return { backend, files, writes };
}

const card = { id: "a", file: "n.md", key: "k", reps: 3 } as unknown as SrsState;
const GOOD = JSON.stringify({ v: 1, cards: [card], daily: {} });
const log = { ms: 1 } as unknown as SrsLog;

{
  const v = fakeVault({});
  const r = await loadStates(v.backend);
  check("dosya yok → hata yok, boş başlar", r.error === null && Object.keys(r.states).length === 0);
  check("dosya yok → kilit yok", !blockedSrsFiles(v.backend).has(STATE_FILE));
  check("dosya yok → kayıt yazılır", (await saveStates(v.backend, { a: card }, {})) === true && v.files.has(STATE_FILE));
}
{
  const v = fakeVault({ [STATE_FILE]: GOOD });
  const r = await loadStates(v.backend);
  check("sağlam dosya okunur", r.error === null && r.states.a?.reps === 3);
}
{
  const v = fakeVault({ [STATE_FILE]: '{"v":1,"cards":[' });
  const r = await loadStates(v.backend);
  check("bozuk JSON → error dolu", r.error !== null, r.error ?? "");
  check("bozuk JSON → kayıt yazılmaz", (await saveStates(v.backend, { a: card }, {})) === false);
  check("bozuk JSON → asıl dosya aynen", v.files.get(STATE_FILE) === '{"v":1,"cards":[');
  const backups = [...v.files.keys()].filter((k) => k.includes(".bozuk-"));
  check("bozuk JSON → yedek yazıldı", backups.length === 1 && v.files.get(backups[0]) === '{"v":1,"cards":[');
  await loadStates(v.backend);
  check("tekrar yüklemede ikinci yedek yok", [...v.files.keys()].filter((k) => k.includes(".bozuk-")).length === 1);
  v.files.set(STATE_FILE, GOOD);
  const ok = await loadStates(v.backend);
  check("sağlam yeniden okuma kilidi açar", ok.error === null && (await saveStates(v.backend, ok.states, ok.daily)) === true);
}
{
  const v = fakeVault({ [STATE_FILE]: GOOD }, [STATE_FILE]);
  const r = await loadStates(v.backend);
  check(
    "okuma hatası → error dolu, yazılmaz",
    r.error !== null && (await saveStates(v.backend, {}, {})) === false && v.files.get(STATE_FILE) === GOOD && v.writes.length === 0,
  );
}
{
  const v = fakeVault({ [STATE_FILE]: "  " });
  const r = await loadStates(v.backend);
  check("boş dosya → korunur", r.error !== null && (await saveStates(v.backend, {}, {})) === false);
}
{
  const v = fakeVault({});
  check("appendLog: dosya yok → yeni açılır", (await appendLog(v.backend, [log])) === true && v.files.has(LOG_FILE));
}
{
  const OLD = '{"ms":9}\n{"ms":8}\n';
  const v = fakeVault({ [LOG_FILE]: OLD }, [LOG_FILE]);
  const ok = await appendLog(v.backend, [log]);
  check("appendLog: okuma hatası → yazılmaz", ok === false && v.files.get(LOG_FILE) === OLD && v.writes.length === 0);
  const w = fakeVault({ [LOG_FILE]: OLD });
  await appendLog(w.backend, [log]);
  check("appendLog: sağlam dosyaya eklenir", w.files.get(LOG_FILE)?.startsWith(OLD) === true && w.files.get(LOG_FILE) !== OLD);
}

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

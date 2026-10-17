// Notun güvenli yazılması ve başarısız kayıtta kurtarma kopyasının korunması (LOM-29).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import { atomicWrite, recoveryNameFor, RENAME_WAITS, type AtomicWriteDeps } from "../vault/atomicWrite";
import { isStaleTmpName, STALE_TMP_AGE_MS, tmpNameFor } from "../vault/tmpFiles";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

function eq(name: string, got: unknown, want: unknown): void {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  check(name, a === b, a === b ? "" : `beklenen ${b}, gelen ${a}`);
}

interface FakeOpts {
  /** Kaçıncı rename çağrısında (1'den) başarılı olsun; 0 = hiçbiri. Kurtarma rename'i de sayılır. */
  renameOkFrom?: number;
  /** Yalnız kurtarma adına rename başarılı olsun. */
  renameToRecoveryOk?: boolean;
  /** Hedefe doğrudan yazma: hata verir; `partial` ise önce yarım içerik bırakır. */
  directWrite?: "ok" | "fail" | "partial";
}

/** Bellekte dosya sistemi: hangi dosyada ne kaldığını görürüz. */
function fakeFs(initial: Record<string, string>, o: FakeOpts) {
  const files = new Map(Object.entries(initial));
  let renames = 0;
  const removed: string[] = [];
  const deps: AtomicWriteDeps = {
    async writeTextFile(p, c) {
      if (p.endsWith(".tmp")) {
        files.set(p, c);
        return;
      }
      if (o.directWrite === "ok") {
        files.set(p, c);
        return;
      }
      if (o.directWrite === "partial") files.set(p, c.slice(0, Math.floor(c.length / 2)));
      throw new Error("Access is denied. (os error 5)");
    },
    async rename(from, to) {
      renames++;
      const toRecovery = to.includes(".kurtarma");
      const ok = toRecovery ? o.renameToRecoveryOk : o.renameOkFrom !== undefined && o.renameOkFrom > 0 && renames >= o.renameOkFrom;
      if (!ok) throw new Error("The process cannot access the file (os error 32)");
      const c = files.get(from);
      if (c === undefined) throw new Error("No such file (os error 2)");
      files.set(to, c);
      files.delete(from);
    },
    async remove(p) {
      removed.push(p);
      files.delete(p);
    },
    async sleep() {},
  };
  return { files, deps, removed, renames: () => renames };
}

const T = "/kasa/Not.md";
const TMP = tmpNameFor(T, Date.now(), 0);
const OLD = "eski içerik";
const NEW = "yeni içerik — tam ve uzun bir metin";

// ---- kurtarma adı ----
eq("not → Not.kurtarma.md", recoveryNameFor("/kasa/Not.md"), "/kasa/Not.kurtarma.md");
eq("çizim uzantısı korunur", recoveryNameFor("/k/a/Çizim.excalidraw"), "/k/a/Çizim.kurtarma.excalidraw");
eq("noktalı klasör adı uzantı sayılmaz", recoveryNameFor("/k/v1.2/Not"), "/k/v1.2/Not.kurtarma");
eq("gizli dosya", recoveryNameFor("/k/.loomen"), "/k/.loomen.kurtarma");
eq("Windows ayırıcısı", recoveryNameFor("C:\\k\\a.b\\Not.md"), "C:\\k\\a.b\\Not.kurtarma.md");
check(
  "kurtarma adı artık temizliğine takılmaz",
  !isStaleTmpName("Not.kurtarma.md", Date.now() + STALE_TMP_AGE_MS * 10)
);

// ---- olağan yol ----
{
  const f = fakeFs({ [T]: OLD }, { renameOkFrom: 1 });
  await atomicWrite(T, TMP, NEW, f.deps);
  eq("ilk rename başarılı → hedef yeni içerik", f.files.get(T), NEW);
  check("yan dosya kalmaz", !f.files.has(TMP));
}
{
  const f = fakeFs({ [T]: OLD }, { renameOkFrom: 3 });
  await atomicWrite(T, TMP, NEW, f.deps);
  eq("üçüncü denemede rename → hedef yeni içerik", f.files.get(T), NEW);
  eq("rename deneme sayısı", f.renames(), RENAME_WAITS.length);
}

// ---- rename olmuyor, doğrudan yazma başarılı ----
{
  const f = fakeFs({ [T]: OLD }, { directWrite: "ok" });
  await atomicWrite(T, TMP, NEW, f.deps);
  eq("doğrudan yazma → hedef yeni içerik", f.files.get(T), NEW);
  check("başarılı doğrudan yazmadan sonra yan dosya silinir", !f.files.has(TMP));
}

// ---- LOM-29: rename olmuyor, doğrudan yazma da hata veriyor ----
{
  const f = fakeFs({ [T]: OLD }, { directWrite: "partial", renameToRecoveryOk: true });
  let err: unknown = null;
  try {
    await atomicWrite(T, TMP, NEW, f.deps);
  } catch (e) {
    err = e;
  }
  check("hata çağırana iletilir", err instanceof Error);
  check("asıl hata metni korunur (şerit sınıflandırması için)", String(err).includes("os error 5"));
  eq("tam içerik kurtarma dosyasında", f.files.get("/kasa/Not.kurtarma.md"), NEW);
  check("yan dosya silinmedi, kurtarma adına taşındı", !f.removed.includes(TMP));
}
{
  const f = fakeFs({ [T]: OLD }, { directWrite: "fail", renameToRecoveryOk: false });
  let threw = false;
  try {
    await atomicWrite(T, TMP, NEW, f.deps);
  } catch {
    threw = true;
  }
  check("kurtarma adına taşıma da olmuyor → yine hata", threw);
  eq("yan dosya tam içerikle yerinde kalır", f.files.get(TMP), NEW);
  check("yan dosya için remove çağrılmadı", !f.removed.includes(TMP));
  eq("asıl dosyaya dokunulmadı", f.files.get(T), OLD);
}
{
  // Üst üste başarısız kayıt: kurtarma dosyası birikmez, en son içerik kalır.
  const f = fakeFs({ [T]: OLD }, { directWrite: "fail", renameToRecoveryOk: true });
  for (const c of ["birinci", "ikinci"]) {
    await atomicWrite(T, tmpNameFor(T, Date.now(), c.length), c, f.deps).catch(() => {});
  }
  eq("kurtarma dosyasında en son içerik", f.files.get("/kasa/Not.kurtarma.md"), "ikinci");
  eq("kasada yalnız hedef ve tek kurtarma dosyası", [...f.files.keys()].sort(), ["/kasa/Not.kurtarma.md", T].sort());
}

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

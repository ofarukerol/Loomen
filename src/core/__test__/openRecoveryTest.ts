// Açılamayan kasa onarım akışı testi (LOM-25): yeniden deneme kilidi, klasör seçici sırasında otomatik
// denemenin durması, klasörü yeniden seçmenin dört dalı, durum geri bildirimi ve örnek kasadan
// gerçek kasaya geçişte taslak koruması. Store yerine bağımlılıkları sahte verilen akış denenir.

import { createOpenRecovery, isVaultSwitch, type RecoveryDeps, type RetryStatus } from "../vault/openRecovery";
import type { VaultOpenError } from "../vault/openError";

let fails = 0;
let ran = 0;
function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const ERR: VaultOpenError = { path: "/v/A", code: "permission", detail: "x" };

function setup(over: Partial<RecoveryDeps> = {}, opts: { reopenOk?: boolean; vaultPath?: string | null } = {}) {
  const log: string[] = [];
  const st = {
    error: ERR as VaultOpenError | null,
    vaults: [{ path: "/v/A", name: "A" }, { path: "/v/B", name: "Kasa B" }],
    vaultPath: opts.vaultPath === undefined ? "/v/A" : opts.vaultPath,
    status: "idle" as RetryStatus,
    reopenCalls: 0,
    release: null as null | (() => void),
  };
  const deps: RecoveryDeps = {
    getError: () => st.error,
    getVaultPath: () => st.vaultPath,
    getVaultPaths: () => st.vaults,
    pickFolder: async () => null,
    createBookmark: async (p) => { log.push(`bookmark:${p}`); return "bm"; },
    setBookmark: (p, b) => log.push(`setBookmark:${p}:${b}`),
    reopen: async (p) => {
      st.reopenCalls++;
      log.push(`reopen:${p}`);
      if (st.release) await new Promise<void>((r) => { st.release = r; });
      if (opts.reopenOk) st.error = null;
    },
    changeVaultPath: async (o, n) => { log.push(`change:${o}:${n}`); },
    switchVault: async (p) => { log.push(`switch:${p}`); },
    addVault: async () => { log.push("addVault"); },
    warnAlreadyVault: async (n) => { log.push(`warn:${n}`); },
    setRetryStatus: (s) => { st.status = s; log.push(`status:${s}`); },
    ...over,
  };
  return { st, log, rec: createOpenRecovery(deps) };
}

let finished = false;
// Bekleyen söz yüzünden süreç sessizce çıkarsa başarılı sayılmasın.
process.on("exit", (c) => {
  if (c === 0 && !finished) {
    console.log("❌ test tamamlanmadan çıktı");
    process.exitCode = 1;
  }
});

(async () => {
  // Yeniden dene
  {
    const a = setup({}, { reopenOk: true });
    await a.rec.retry();
    check("Yeniden dene başarılı: kasa yeniden açılır, şerit kalkar, durum boşta", a.st.reopenCalls === 1 && a.st.error === null && a.st.status === "idle");
    const b = setup({}, { reopenOk: false });
    await b.rec.retry();
    check("Yeniden dene başarısız: şerit kalır, 'yine açılamadı' durumu", b.st.error !== null && b.st.status === "failed");
    check("Yeniden dene sürerken durum 'busy' geçer", b.log.includes("status:busy"));
    const c = setup();
    c.st.error = null;
    await c.rec.retry();
    check("hata yokken deneme yok", c.st.reopenCalls === 0);
  }
  // Art arda odak olayı
  {
    const a = setup();
    a.st.release = () => {};
    const first = a.rec.retry(true);
    const second = a.rec.retry(true);
    const third = a.rec.retry(false);
    await Promise.resolve();
    check("art arda tetikte ikinci/üçüncü deneme engellenir", a.st.reopenCalls === 1, `çağrı=${a.st.reopenCalls}`);
    const rel = a.st.release;
    a.st.release = null;
    rel?.();
    await Promise.all([first, second, third]);
    await a.rec.retry(true);
    check("deneme bitince yenisi başlayabilir", a.st.reopenCalls === 2);
  }
  // Otomatik deneme koşulları
  {
    const a = setup({}, { vaultPath: "/v/Z" });
    await a.rec.retry(true);
    check("açık kasa başkasıysa otomatik deneme yok", a.st.reopenCalls === 0);
    await a.rec.retry(false);
    check("aynı durumda düğmeyle deneme çalışır", a.st.reopenCalls === 1);
  }
  // Klasör seçici açıkken otomatik deneme durur
  {
    let release!: (p: string | null) => void;
    const a = setup({ pickFolder: () => new Promise<string | null>((r) => { release = r; }) });
    const rp = a.rec.repick();
    await Promise.resolve();
    await a.rec.retry(true);
    check("seçici açıkken otomatik deneme başlamaz", a.st.reopenCalls === 0);
    release(null);
    await rp;
    await a.rec.retry(true);
    check("seçici kapanınca otomatik deneme yeniden çalışır", a.st.reopenCalls === 1);
  }
  // Seçici hata verse de bayrak sıfırlanır
  {
    const a = setup({ pickFolder: async () => { throw new Error("boom"); } });
    await a.rec.repick().catch(() => {});
    await a.rec.retry(true);
    check("seçici hata verince otomatik deneme kilitli kalmaz", a.st.reopenCalls === 1);
  }
  // repickFolder dalları
  {
    const cancel = setup({ pickFolder: async () => null });
    await cancel.rec.repick();
    check("iptal: hiçbir şey yapılmaz", cancel.log.filter((l) => !l.startsWith("status:")).length === 0);

    const same = setup({ pickFolder: async () => "/v/A" }, { reopenOk: true });
    await same.rec.repick();
    check("aynı klasör: erişim yeniden üretilir, kayıt güncellenir, kasa açılır, şerit kalkar",
      same.log.join(",").includes("bookmark:/v/A,setBookmark:/v/A:bm,reopen:/v/A") && same.st.error === null);

    const noBm = setup({ pickFolder: async () => "/v/A", createBookmark: async () => null });
    await noBm.rec.repick();
    check("aynı klasör, bookmark üretilemezse yine açmayı dener", noBm.log.includes("reopen:/v/A") && !noBm.log.some((l) => l.startsWith("setBookmark")));

    const other = setup({ pickFolder: async () => "/v/B" });
    await other.rec.repick();
    check("başka kasanın klasörü: kasa adıyla uyarı, açma ve değiştirme yok",
      other.log.includes("warn:Kasa B") && other.st.reopenCalls === 0 && !other.log.some((l) => l.startsWith("change")));

    const otherNoName = setup({ pickFolder: async () => "/x/Yedek" });
    otherNoName.st.vaults = [{ path: "/v/A", name: "A" }, { path: "/x/Yedek", name: "" }];
    await otherNoName.rec.repick();
    check("kasa adı yoksa tam yol değil klasör adı gösterilir", otherNoName.log.includes("warn:Yedek"));

    const fresh = setup({ pickFolder: async () => "/v/C" });
    await fresh.rec.repick();
    check("yeni klasör: klasör değiştirilir", fresh.log.includes("change:/v/A:/v/C"));

    // changeVaultPath kaydı güncelleyip kasayı açmadıysa yeni klasöre geçilir
    const sw2 = setup(
      {
        pickFolder: async () => "/v/C",
        changeVaultPath: async () => { sw2st.vaults[0] = { path: "/v/C", name: "A" }; },
      },
      { vaultPath: "/v/Z" },
    );
    const sw2st = sw2.st;
    sw2st.vaults = [{ path: "/v/A", name: "A" }];
    await sw2.rec.repick();
    check("etkin olmayan kasa yeni klasöre geçirilir", sw2.log.includes("switch:/v/C"));

    const notListed = setup({ pickFolder: async () => "/v/Q" });
    notListed.st.vaults = [{ path: "/v/B", name: "B" }];
    await notListed.rec.repick();
    check("listede olmayan kasa: yeni kasa olarak eklenir", notListed.log.includes("addVault"));
  }
  // Örnek kasadan gerçek kasaya geçiş (veri kaybı önlemi)
  {
    check("kasa başka yola geçiyorsa değişimdir", isVaultSwitch("/v/A", "/v/B", true, null));
    check("normal yeniden açılış (kasa zaten açık) değişim değil", !isVaultSwitch("/v/A", "/v/A", true, null));
    check("açılış başlarken hata yokken (ilk açılış) değişim değil", !isVaultSwitch("/v/A", "/v/A", false, null));
    check("kayıtlı kasa hiç açılmadı, hata var, şimdi açılıyor: değişim sayılır (örnek taslak sızmaz)",
      isVaultSwitch("/v/A", "/v/A", false, ERR));
    check("kasa açıkken aynı kasanın hatası sonra düzelirse değişim değil", !isVaultSwitch("/v/A", "/v/A", true, ERR));
    check("hata başka kasaya aitse değişim değil", !isVaultSwitch("/v/A", "/v/A", false, { ...ERR, path: "/v/B" }));
  }

  finished = true;
  console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
  process.exit(fails === 0 ? 0 : 1);
})();

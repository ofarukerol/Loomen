// Mobil kasa yolu geçişinin node testi — iOS konteyner yolu değişince kasa kaybolmasın.
// Çalıştırma (yeni bağımlılık yok; esbuild vite ile zaten kurulu):
//
//   node_modules/.bin/esbuild src/core/__test__/mobileTest.ts --bundle --platform=node \
//     --format=esm '--define:import.meta.env={}' --outfile=/tmp/mobileTest.mjs && node /tmp/mobileTest.mjs
//
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import {
  normalizePath,
  lastSegment,
  joinPath,
  isUnderRoot,
  mobileVaultFolderName,
  rebaseMobileVaultPath,
  migrateMobileVaults,
} from "../vault/mobileVaultPath";

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

// iOS'ta uygulama veri klasörü: güncellemeden önce ve sonra (konteyner kimliği değişir).
const OLD_ROOT = "/var/mobile/Containers/Data/Application/AAAA-1111/Library/Application Support/com.loomen.app";
const NEW_ROOT = "/var/mobile/Containers/Data/Application/BBBB-2222/Library/Application Support/com.loomen.app";

// ---- yol yardımcıları ----
eq("normalizePath ters eğik çizgiyi çevirir", normalizePath("C:\\Users\\a\\vault"), "C:/Users/a/vault");
eq("normalizePath sondaki ayırıcıyı atar", normalizePath("/a/b/"), "/a/b");
eq("normalizePath tekrar eden ayırıcıyı teke indirir", normalizePath("/a//b///c"), "/a/b/c");
eq("normalizePath kökü korur", normalizePath("/"), "/");
eq("lastSegment klasör adını verir", lastSegment(`${OLD_ROOT}/İşler`), "İşler");
eq("lastSegment boş yolda boş döner", lastSegment(""), "");
eq("joinPath birleştirir", joinPath("/a/b", "vault"), "/a/b/vault");
eq("joinPath fazla ayırıcıyı yutar", joinPath("/a/b/", "/vault"), "/a/b/vault");
check("isUnderRoot kökün kendisini sayar", isUnderRoot(OLD_ROOT, OLD_ROOT));
check("isUnderRoot alt klasörü bulur", isUnderRoot(OLD_ROOT, `${OLD_ROOT}/vault`));
check("isUnderRoot yabancı yolu reddeder", !isUnderRoot(OLD_ROOT, `${NEW_ROOT}/vault`));
check("isUnderRoot ön ek benzerliğine aldanmaz", !isUnderRoot("/a/b", "/a/bc/vault"));

// ---- klasör adı çıkarımı ----
eq("güncel kök altındaki yol ada iner", mobileVaultFolderName(NEW_ROOT, `${NEW_ROOT}/vault`), "vault");
eq("bayat konteyner yolundan ad çıkar", mobileVaultFolderName(NEW_ROOT, `${OLD_ROOT}/İşler`), "İşler");
eq(
  "güncel kök altındaki iç içe yol tam kalır",
  mobileVaultFolderName(NEW_ROOT, `${NEW_ROOT}/a/b`),
  "a/b"
);
// Bayat konteyner yolunda da derinlik korunmalı: yalnız son parça alınırsa ("b") kasa
// "<kök>/b" gibi YANLIŞ bir yere taşınır, klasör bulunamaz ve notlar kaybolmuş görünür.
eq(
  "bayat konteyner yolunda iç içe derinlik korunur",
  mobileVaultFolderName(NEW_ROOT, `${OLD_ROOT}/a/b`),
  "a/b"
);
eq(
  "bayat iç içe yol güncel kökte aynı derinlikte kurulur",
  rebaseMobileVaultPath(NEW_ROOT, `${OLD_ROOT}/a/b`),
  `${NEW_ROOT}/a/b`
);
// Kökün son parçası (paket kimliği) yolda hiç geçmiyorsa elde yalnız kasa adı kalır.
eq(
  "yabancı yolda son parçaya düşülür",
  mobileVaultFolderName(NEW_ROOT, "/tmp/yedek/İşler"),
  "İşler"
);

// ---- yeniden tabanlama ----
eq("bayat yol güncel köke taşınır", rebaseMobileVaultPath(NEW_ROOT, `${OLD_ROOT}/vault`), `${NEW_ROOT}/vault`);
eq("güncel yol değişmez", rebaseMobileVaultPath(NEW_ROOT, `${NEW_ROOT}/vault`), `${NEW_ROOT}/vault`);
eq("kökün kendisi kök kalır", rebaseMobileVaultPath(NEW_ROOT, NEW_ROOT), NEW_ROOT);

// ---- kasa listesi geçişi ----
{
  const before = {
    vaultPath: `${OLD_ROOT}/İşler`,
    vaults: [
      { path: `${OLD_ROOT}/vault`, repo: null },
      { path: `${OLD_ROOT}/İşler`, repo: null, name: "İşler" },
    ],
    tabsByVault: {
      [`${OLD_ROOT}/İşler`]: { openTabs: ["a.md"], pinnedTabs: [], activeNote: "a.md", activeDraw: null },
    },
  };
  const after = migrateMobileVaults(NEW_ROOT, before);
  check("geçiş değişiklik bildirir", after.changed);
  eq("aktif kasa yeni köke taşındı", after.vaultPath, `${NEW_ROOT}/İşler`);
  eq(
    "kasa listesi yeni köke taşındı",
    after.vaults.map((v) => v.path),
    [`${NEW_ROOT}/vault`, `${NEW_ROOT}/İşler`]
  );
  eq("kasa adı korunur", after.vaults[1].name, "İşler");
  eq(
    "sekme kayıtları yeni anahtara taşındı",
    Object.keys(after.tabsByVault),
    [`${NEW_ROOT}/İşler`]
  );
  eq("sekme içeriği korunur", after.tabsByVault[`${NEW_ROOT}/İşler`].openTabs, ["a.md"]);
  eq("eşleme eski yolu gösterir", after.renamed[`${OLD_ROOT}/vault`], `${NEW_ROOT}/vault`);
}

// Aynı klasör adına düşen eski + yeni kayıt teke iner (liste ölü kayıt biriktirmesin).
{
  const after = migrateMobileVaults(NEW_ROOT, {
    vaultPath: `${NEW_ROOT}/vault`,
    vaults: [
      { path: `${OLD_ROOT}/vault`, repo: null, name: "Birincil" },
      { path: `${NEW_ROOT}/vault`, repo: null },
    ],
    tabsByVault: {},
  });
  eq("mükerrer kayıt teke indi", after.vaults.length, 1);
  eq("ilk kaydın alanları korundu", after.vaults[0].name, "Birincil");
  eq("tek kalan kayıt güncel kökte", after.vaults[0].path, `${NEW_ROOT}/vault`);
}

// Kök değişmemişse hiçbir şeye dokunulmaz.
{
  const state = {
    vaultPath: `${NEW_ROOT}/vault`,
    vaults: [{ path: `${NEW_ROOT}/vault`, repo: null }],
    tabsByVault: { [`${NEW_ROOT}/vault`]: { openTabs: [], pinnedTabs: [], activeNote: null, activeDraw: null } },
  };
  const after = migrateMobileVaults(NEW_ROOT, state);
  check("kök aynıysa değişiklik yok", !after.changed);
  eq("aktif kasa aynı", after.vaultPath, state.vaultPath);
}

// Boş durum (henüz kasa yok) çökmemeli.
{
  const after = migrateMobileVaults(NEW_ROOT, { vaultPath: null, vaults: [], tabsByVault: {} });
  check("boş durum değişiklik bildirmez", !after.changed);
  eq("boş durumda aktif kasa yok", after.vaultPath, null);
}

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

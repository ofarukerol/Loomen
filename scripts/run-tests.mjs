#!/usr/bin/env node
// Çekirdek node testlerini derleyip koşturur — `npm test`.
//
// Yeni bağımlılık yok: esbuild zaten Vite ile geliyor. Testler saf çekirdek modüllerini
// çağırır (React/i18n kurulumu istemez), bu yüzden tek dosya halinde bundle edilip
// node ile çalıştırılırlar.
//
// `--define:import.meta.env={}` gerekir: google.ts Vite ortam değişkeni okur, node'da yoktur.
//
// vaultTest gerçek bir kasa klasörü ister; argüman verilmezse depodaki demo-vault kullanılır.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "node_modules", ".cache", "loomen-test");
const esbuild = join(root, "node_modules", ".bin", "esbuild");

if (!existsSync(esbuild)) {
  console.error("esbuild bulunamadı — önce `npm install` çalıştırın.");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const vault = process.argv[2] ?? join(root, "demo-vault");

/** Testler: [dosya, ek argümanlar]. Kaynağı yoksa atlanır (dalda olmayan modüller). */
const suites = [
  ["src/core/__test__/coreTest.ts", []],
  ["src/core/__test__/vaultTest.ts", existsSync(vault) ? [vault] : null],
  ["src/core/__test__/srsTest.ts", []],
  ["src/core/__test__/aiTest.ts", []],
  ["src/core/__test__/editorTest.ts", []],
  ["src/core/__test__/mobileTest.ts", []],
];

let failed = 0;
let ran = 0;

for (const [src, args] of suites) {
  if (!existsSync(join(root, src))) continue; // bu dalda yok
  const name = src.split("/").pop().replace(/\.ts$/, "");
  if (args === null) {
    console.log(`\n⏭  ${name} atlandı (kasa klasörü yok: ${vault})`);
    continue;
  }
  const out = join(outDir, `${name}.mjs`);
  const build = spawnSync(
    esbuild,
    [src, "--bundle", "--platform=node", "--format=esm", "--define:import.meta.env={}", `--outfile=${out}`],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  if (build.status !== 0) {
    console.error(`\n✗ ${name} derlenemedi`);
    failed++;
    continue;
  }
  console.log(`\n── ${name} ──`);
  const run = spawnSync(process.execPath, [out, ...args], { cwd: root, stdio: "inherit" });
  ran++;
  if (run.status !== 0) failed++;
}

if (ran === 0) {
  console.error("Hiçbir test koşmadı.");
  process.exit(1);
}
console.log(failed === 0 ? `\n✅ ${ran} test dosyasının tümü geçti` : `\n❌ ${failed}/${ran} test dosyası başarısız`);
process.exit(failed === 0 ? 0 : 1);

// Masaüstünde pencerenin üst çubuktan sürüklenmesinin node testi (LOM-39).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır; cwd depo köküdür.
//
// Sürükleme iki şey ister: öğede `data-tauri-drag-region` işareti ve masaüstü izin
// dosyasında `core:window:allow-start-dragging`. Tauri'nin sürükleme betiği yalnız
// doğrudan basılan öğeye baktığı için düğmeler ve sekmeler işaretsiz kalmalı.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const root = process.cwd();
const readJson = (rel: string) => JSON.parse(readFileSync(join(root, rel), "utf8"));

// İzin dosyaları
const desktop = readJson("src-tauri/capabilities/default.json");
const perms: unknown[] = desktop.permissions ?? [];
check("masaüstü: start-dragging izni var", perms.includes("core:window:allow-start-dragging"));
check("masaüstü: core:default korunuyor (çift tıklama büyütme)", perms.includes("core:default"));
check("masaüstü: ana pencereye uygulanıyor", (desktop.windows ?? []).includes("main"));
for (const p of ["macOS", "windows", "linux"]) {
  check(`masaüstü: ${p} platformunda geçerli`, (desktop.platforms ?? []).includes(p));
}

const mobile = readJson("src-tauri/capabilities/mobile.json");
check(
  "mobil: start-dragging izni yok",
  !JSON.stringify(mobile.permissions ?? []).includes("allow-start-dragging"),
);

// Üst çubuk işaretleri
const src = readFileSync(join(root, "src/components/TopBar.tsx"), "utf8");

// Açılış etiketinin gövdesi: `onClick={() => …}` içindeki `=>` etiketi erken kesmesin.
const TAG = "(?:=>|[^>])*>";

/** className'i tam olarak `cls` olan <div ...> açılış etiketini döndürür. */
function divTag(cls: string): string | null {
  const re = new RegExp(`<div\\s+className="${cls}"${TAG}`);
  return src.match(re)?.[0] ?? null;
}

for (const cls of ["lo-topbar", "lo-topbar__os", "lo-topbar__spacer", "lo-topbar__tabs"]) {
  const tag = divTag(cls);
  check(`${cls} sürükleme bölgesi`, !!tag && tag.includes("data-tauri-drag-region"), tag ?? "etiket bulunamadı");
}

const buttons = src.match(new RegExp(`<button\\b${TAG}`, "g")) ?? [];
check("üst çubukta düğme bulundu", buttons.length >= 4, `${buttons.length} düğme`);
check(
  "hiçbir düğme sürükleme işareti taşımıyor",
  buttons.every((b) => !b.includes("data-tauri-drag-region")),
);

const wtabs = src.match(new RegExp(`<div\\b[^<>]*?className=\\{?"lo-wtab[" ]${TAG}`, "g")) ?? [];
check("sekme kutusu bulundu", wtabs.length >= 1, `${wtabs.length} sekme etiketi`);
check(
  "sekme kutuları sürükleme işareti taşımıyor",
  wtabs.every((t) => !t.includes("data-tauri-drag-region")),
);

console.log(`\n${ran - fails}/${ran} kontrol geçti`);
if (fails > 0) process.exit(1);

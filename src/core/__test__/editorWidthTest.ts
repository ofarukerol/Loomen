// Not editörünün "Tam genişlik" anahtarının node testi (LOM-90).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır; cwd depo köküdür.
//
// Anahtar açıkken (varsayılan) düzenleme ve okuma modunda 760/680 px sınırı kalkar;
// kapalıyken eski dar sütun aynen korunur.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { editorRootClass } from "../../screens/Editor/editorLayout";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

// Kök sınıf
check("sınıf: dar değil, geniş değil", editorRootClass({ narrow: false, wide: false }) === "lo-editor");
check("sınıf: dar", editorRootClass({ narrow: true, wide: false }) === "lo-editor lo-editor--narrow");
check("sınıf: geniş", editorRootClass({ narrow: false, wide: true }) === "lo-editor lo-editor--wide");
check(
  "sınıf: dar + geniş",
  editorRootClass({ narrow: true, wide: true }) === "lo-editor lo-editor--narrow lo-editor--wide",
);

// app.css: geniş kural üç seçiciyi kapsar ve sınırı kaldırır
const css = read("src/styles/app.css");
const wideIdx = css.indexOf(".lo-editor--wide");
const wideRule = wideIdx < 0 ? "" : css.slice(wideIdx, css.indexOf("}", wideIdx) + 1);
check("css: .lo-editor--wide kuralı var", wideRule.length > 0);
check("css: geniş kural editwrap'i kapsar", wideRule.includes(".lo-editor--wide .lo-editor__editwrap"));
check("css: geniş kural preview'u kapsar", wideRule.includes(".lo-editor--wide .lo-editor__preview"));
check("css: geniş kural .lo-prose'u kapsar", wideRule.includes(".lo-editor--wide .lo-prose"));
check("css: geniş kural max-width: none", /max-width:\s*none/.test(wideRule));

// Anahtar kapalı: eski dar sütun kuralları korunur
check("css: editwrap 760px korunur", /\.lo-editor__editwrap\s*\{[^}]*max-width:\s*760px/.test(css));
check("css: preview 760px korunur", /\.lo-editor__preview\s*\{[^}]*max-width:\s*760px/.test(css));
check("css: .lo-prose 680px korunur", /\.lo-prose\s*\{[^}]*max-width:\s*680px/.test(css));
check("css: tablo sarmalayıcısı yatay kaydırılır", /\.lo-tablewrap\s*\{[^}]*overflow-x:\s*auto/.test(css));

// CodeMirror teması sabit genişlik koymaz
const cm = read("src/screens/Editor/CodeMirrorEditor.tsx");
const cmIdx = cm.indexOf('".cm-content": {');
const cmContent = cmIdx < 0 ? "" : cm.slice(cmIdx, cm.indexOf("}", cmIdx) + 1);
check("cm: .cm-content kuralı bulundu", cmContent.length > 0);
check("cm: .cm-content'te px maxWidth yok", !/maxWidth:\s*"\d+px"/.test(cmContent), cmContent);

// Editör ekranı anahtarı okur ve sınıfı fonksiyonla üretir
const screen = read("src/screens/Editor/EditorScreen.tsx");
check("ekran: editorRootClass kullanılır", /className=\{editorRootClass\(/.test(screen));
check("ekran: editorSettings.fullWidth okunur", screen.includes("editorSettings.fullWidth"));

// Store: varsayılan açık, eski kayıtta alan yoksa açık sayılır
const store = read("src/store/useAppStore.ts");
check("store: arayüzde fullWidth var", /fullWidth:\s*boolean/.test(store));
check("store: varsayılan fullWidth: true", /editorSettings:\s*\{[^}]*fullWidth:\s*true/.test(store));
check("store: merge boolean korumalı", /typeof es\.fullWidth !== "boolean"/.test(store));

// Ayarlar ekranında satır
const settings = read("src/screens/Settings/SettingsScreen.tsx");
check("ayarlar: Tam genişlik satırı", settings.includes('{ key: "fullWidth", label: t("settings.fullWidth") }'));

// Çeviriler
for (const lang of ["tr", "en", "ar"]) {
  const j = JSON.parse(read(`src/i18n/locales/${lang}/translation.json`));
  const v = j?.settings?.fullWidth;
  check(`çeviri ${lang}: settings.fullWidth dolu`, typeof v === "string" && v.trim().length > 0, String(v));
}

console.log(`\n${ran - fails}/${ran} kontrol geçti`);
if (fails > 0) process.exit(1);

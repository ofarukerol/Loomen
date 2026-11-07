// Tablo formülü öneri listesinin node testi (LOM-88).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır; cwd depo köküdür.
//
// Saf öneri mantığı (formulaSuggest.ts) ve hücre kutusu / stil / çeviri bağlantısı.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applySuggestion, colLetter, suggestFormula } from "../markdown/formulaSuggest";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const H = ["Ad", "Tutar", "Ödenen"];
const at = (text: string, caret = text.length, lng = "tr", header = H) => suggestFormula(text, caret, header, lng);
const labels = (text: string, caret = text.length, lng = "tr") => (at(text, caret, lng)?.items ?? []).map((i) => i.label);

// ─── Fonksiyon önerisi ──────────────────────────────────────────────────────
const to = at("=TO");
check("'=TO' → ilk öğe TOPLA", to?.items[0]?.label === "TOPLA", JSON.stringify(labels("=TO")));
check("'=TO' → insert 'TOPLA('", to?.items[0]?.insert === "TOPLA(");
check("'=TO' → alias SUM", to?.items[0]?.alias === "SUM");
check("'=TO' → açıklama anahtarı fnSum", to?.items[0]?.descKey === "tableFormula.fnSum");
check("'=TO' → örnek '=TOPLA(B2:B9)'", to?.items[0]?.example === "=TOPLA(B2:B9)");
check("'=TO' → aralık 1..3", to?.replaceFrom === 1 && to?.replaceTo === 3);
if (to) {
  const ap = applySuggestion("=TO", to.replaceFrom, to.replaceTo, to.items[0].insert);
  check("'=TO' uygulanınca '=TOPLA(' imleç 7", ap.text === "=TOPLA(" && ap.caret === 7, JSON.stringify(ap));
}
check("'=to' aynı sonuç", labels("=to")[0] === "TOPLA");
check("'=tO' aynı sonuç", labels("=tO")[0] === "TOPLA");
check("'=SU' Türkçede SUM", labels("=SU")[0] === "SUM" && at("=SU")?.items[0]?.alias === "TOPLA");
check("'=MI' → MIN", labels("=MI")[0] === "MIN");
check("Türkçe küçük '=mi' → MIN", labels("=mi")[0] === "MIN");
check("noktasız '=mın' → MIN", labels("=mın")[0] === "MIN");
check("MIN aynı adda alias boş", at("=MI")?.items[0]?.alias === "");
check("'=ORT' → ORTALAMA", labels("=ORT")[0] === "ORTALAMA");
check("İngilizce dilde '=TO' → TOPLA (alias SUM)", labels("=TO", 3, "en")[0] === "TOPLA");

// ─── Boş kelime ─────────────────────────────────────────────────────────────
const all = at("=");
check("'=' → 7 fonksiyon + 3 sütun", all?.items.length === 10, `alınan ${all?.items.length}`);
check("'=' tr'de ilk TOPLA", all?.items[0]?.label === "TOPLA");
check("'=' en'de ilk SUM", labels("=", 1, "en")[0] === "SUM");
const fnLabels = (all?.items ?? []).filter((i) => i.kind === "fn").map((i) => i.insert);
check("aynı fonksiyon listede bir kez", new Set(fnLabels).size === fnLabels.length && fnLabels.length === 7);
const inParen = at("=TOPLA(");
check("'=TOPLA(' → sütunlar önce", inParen?.items[0]?.kind === "column" && inParen?.items[0]?.label === "A");
check("'=TOPLA(' → aralık boş, imleçte", inParen?.replaceFrom === 7 && inParen?.replaceTo === 7);

// ─── Sütun önerisi ──────────────────────────────────────────────────────────
const tu = at("=Tu");
check("'=Tu' → B (Tutar)", tu?.items[0]?.label === "B" && tu?.items[0]?.descParam === "Tutar", JSON.stringify(tu?.items[0]));
check("sütun açıklama anahtarı", tu?.items[0]?.descKey === "tableFormula.column");
check("sütun insert harftir", tu?.items[0]?.insert === "B");
check("'=öd' → C (Ödenen)", labels("=öd").includes("C"));
const colon = at("=TOPLA(B:B");
check("'=TOPLA(B:B' → B önerisi", colon?.items.some((i) => i.label === "B") === true, JSON.stringify(colon?.items.map((i) => i.label)));
check("'=TOPLA(B:B' → aralık 9..10", colon?.replaceFrom === 9 && colon?.replaceTo === 10);

check("'=B*C' → tam sütun C ilk sırada (COUNT değil)", labels("=B*C", 4, "en")[0] === "C", JSON.stringify(labels("=B*C", 4, "en")));
check("'=A' → tam sütun A ilk sırada (ABS değil)", labels("=A")[0] === "A");
check("'=b' küçük harf → B ilk sırada", labels("=b")[0] === "B");
check("'=TO' tam sütun yok → TOPLA ilk", labels("=TO")[0] === "TOPLA");

// ─── Öneri çıkmayan durumlar ────────────────────────────────────────────────
check("'=1+2' → null", at("=1+2") === null);
check("'=B2' → null", at("=B2") === null);
check("'=2A' (rakamdan sonra harf) → null", at("=2A") === null);
check("'Tutar' (eşittir yok) → null", at("Tutar") === null);
check("'' → null", at("") === null);
check("'=TOPLA' imleç ortada → null", at("=TOPLA", 3) === null);
check("'=TOPLA(B2;' → null (boş, öncesi ;)", at("=TOPLA(B2;") === null);
check("'=XYZ' eşleşme yok → null", at("=XYZ") === null);
check("imleç '=' öncesinde → null", at("=TO", 0) === null);

// ─── Ortada uygulama ────────────────────────────────────────────────────────
const mid = at("=TO+1", 3);
check("'=TO+1' imleç 3 → aralık 1..3", mid?.replaceFrom === 1 && mid?.replaceTo === 3);
if (mid) {
  const ap = applySuggestion("=TO+1", mid.replaceFrom, mid.replaceTo, mid.items[0].insert);
  check("'=TO+1' uygulanınca '=TOPLA(+1' imleç 7", ap.text === "=TOPLA(+1" && ap.caret === 7, JSON.stringify(ap));
}

// ─── Sütun harfi ────────────────────────────────────────────────────────────
check("colLetter(0) = A", colLetter(0) === "A");
check("colLetter(25) = Z", colLetter(25) === "Z");
check("colLetter(26) = AA", colLetter(26) === "AA");
check("colLetter(27) = AB", colLetter(27) === "AB");

// ─── Kaynak denetimi ────────────────────────────────────────────────────────
const tw = read("src/screens/Editor/tableWidget.ts");
check("widget suggestFormula( çağırıyor", tw.includes("suggestFormula("));
check("widget cm-table-suggest sınıfı", tw.includes("cm-table-suggest"));
check(
  "öneri öğesinde pointerdown + preventDefault",
  /cm-table-suggest__item[\s\S]*addEventListener\("pointerdown", \(e\) => \{\s*e\.preventDefault\(\)/.test(tw),
);
const itemBlock = tw.slice(tw.indexOf("cm-table-suggest__item\""), tw.indexOf("suggest.appendChild(item)"));
check("öneri öğesi dokunmatikte createTapTracker kullanıyor", itemBlock.includes("createTapTracker()") && itemBlock.includes("isTapInput(e.pointerType)"));
check("öneri öğesi dokunmatikte pointerup'ta seçiyor", /addEventListener\("pointerup"[\s\S]*tap\.up\(/.test(itemBlock));
check("öneri öğesi pointercancel'da sayacı bırakıyor", itemBlock.includes("tap.cancel(e.pointerId)"));
check("ok tuşuyla imleç kayınca liste yenileniyor", /addEventListener\("keyup"[\s\S]{0,200}ArrowLeft[\s\S]{0,120}refreshSuggest\(\)/.test(tw));
check("tüketilen tuşta stopImmediatePropagation", tw.includes("stopImmediatePropagation"));
check("ArrowDown işleniyor", tw.includes('"ArrowDown"'));
check("öneri kutusu temizlikte kaldırılıyor", tw.includes("suggest.remove()"));
const css = read("src/styles/app.css");
const i = css.indexOf(".cm-table-suggest {");
check("app.css .cm-table-suggest kuralı", i >= 0);
check("app.css z-index 1001", i >= 0 && css.slice(i, css.indexOf("}", i)).includes("z-index: 1001"));
for (const lng of ["tr", "en", "ar"]) {
  const t = JSON.parse(read(`src/i18n/locales/${lng}/translation.json`)).tableFormula ?? {};
  const keys = ["fnSum", "fnAverage", "fnMin", "fnMax", "fnCount", "fnRound", "fnAbs", "column", "suggestLabel"];
  check(`i18n ${lng}: öneri anahtarları dolu`, keys.every((k) => typeof t[k] === "string" && t[k].length > 0));
  check(`i18n ${lng}: column {{name}} içeriyor`, typeof t.column === "string" && t.column.includes("{{name}}"));
}
check("run-tests.mjs'de test kayıtlı", read("scripts/run-tests.mjs").includes("src/core/__test__/formulaSuggestTest.ts"));

console.log(`\n${ran - fails}/${ran} kontrol geçti`);
if (fails > 0) process.exit(1);

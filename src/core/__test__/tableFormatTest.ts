// Tabloda biçim (hizalama, kalın, italik) node testi (LOM-98).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır; cwd depo köküdür.
//
// Saf biçim modülü (tableStyle.ts), not satırının `bicim` bölümü ve taşıma (tableMeta.ts),
// tablo modelinin ayraç hizası (tableModel.ts); ayrıca düzenleme/okuma modu bağlantısı,
// stil ve çeviri anahtarları (kaynak denetimi).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyFormat,
  effectiveCellStyle,
  parseSeparatorAlign,
  parseStyleFlags,
  parseStyleKey,
  serializeStyleFlags,
  setSeparatorAlign,
  styleClasses,
  styleKey,
  type StyleTarget,
} from "../markdown/tableStyle";
import {
  columnCurrency,
  moveMetaColumn,
  moveMetaRow,
  parseTableMeta,
  serializeTableMeta,
  setColumnCurrency,
  setTargetStyle,
  targetStyle,
  type TableMeta,
} from "../markdown/tableMeta";
import { findTables, moveTableColumn, moveTableRow } from "../../screens/Editor/tableModel";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const root = process.cwd();
const read = (p: string) => {
  try {
    return readFileSync(join(root, p), "utf8");
  } catch {
    return "";
  }
};

// ─── Anahtarlar ─────────────────────────────────────────────────────────────
const keyCases: [StyleTarget, string][] = [
  [{ kind: "col", col: 1 }, "B"],
  [{ kind: "row", row: 0 }, "2"],
  [{ kind: "row", row: -1 }, "1"],
  [{ kind: "cell", row: 0, col: 1 }, "B2"],
  [{ kind: "cell", row: 1, col: 26 }, "AA3"],
  [{ kind: "cell", row: -1, col: 0 }, "A1"],
];
for (const [t, k] of keyCases) {
  check(`anahtar: ${JSON.stringify(t)} → ${k}`, styleKey(t) === k, styleKey(t));
  check(`anahtar geri: ${k}`, eq(parseStyleKey(k), t), JSON.stringify(parseStyleKey(k)));
}
check("anahtar: küçük harf okunur", eq(parseStyleKey("b2"), { kind: "cell", row: 0, col: 1 }));
check("anahtar: geçersiz null", parseStyleKey("") === null && parseStyleKey("2B") === null && parseStyleKey("0") === null && parseStyleKey("B-1") === null);

// ─── Belirteçler ────────────────────────────────────────────────────────────
check("belirteç: orta,kalin", eq(parseStyleFlags("orta,kalin"), { align: "center", bold: true }));
check("belirteç: sag,-kalin,-italik", eq(parseStyleFlags("sag,-kalin,-italik"), { align: "right", bold: false, italic: false }));
check("belirteç: bilinmeyen yok sayılır", eq(parseStyleFlags("renk,italik"), { italic: true }));
check("belirteç: hepsi bilinmeyense null", parseStyleFlags("renk") === null && parseStyleFlags("") === null);
check("belirteç yazma: sıra hiza,kalın,italik", serializeStyleFlags({ italic: true, bold: true, align: "left" }) === "sol,kalin,italik");
check("belirteç yazma: -kalin", serializeStyleFlags({ bold: false }) === "-kalin");
check("belirteç yazma: boşsa null", serializeStyleFlags({}) === null && serializeStyleFlags(null) === null);

// ─── Not satırı ─────────────────────────────────────────────────────────────
const full = "<!-- loomen: para B=TRY bicim B=kalin 2=orta,italik B2=sag,-kalin -->";
const fm = parseTableMeta(full)!;
check("not: para okunur", columnCurrency(fm, 1) === "TRY");
check(
  "not: bicim okunur",
  eq(fm.style, { B: { bold: true }, "2": { align: "center", italic: true }, B2: { align: "right", bold: false } }),
  JSON.stringify(fm.style)
);
check("not: aynı metne yazılır", serializeTableMeta(fm) === full, String(serializeTableMeta(fm)));
check(
  "not: yalnız para eskisiyle birebir",
  serializeTableMeta(parseTableMeta("<!-- loomen: para B=TRY D=USD -->")) === "<!-- loomen: para B=TRY D=USD -->"
);
check("not: yalnız para okununca style alanı yok", parseTableMeta("<!-- loomen: para B=TRY -->")!.style === undefined);
check("not: yalnız bicim → para yazılmaz", serializeTableMeta({ currency: {}, style: { A: { italic: true } } }) === "<!-- loomen: bicim A=italik -->");
check("not: ikisi boşsa null", serializeTableMeta({ currency: {}, style: {} }) === null);
check(
  "not: yazım sırası sütun, satır, hücre",
  serializeTableMeta({ currency: {}, style: { C3: { bold: true }, "3": { bold: true }, A2: { bold: true }, B: { bold: true } } }) ===
    "<!-- loomen: bicim B=kalin 3=kalin A2=kalin C3=kalin -->"
);
const unk = parseTableMeta("<!-- loomen: bicim B=kalin,renk 3=x renk A=1 para C=EUR -->")!;
check("not: bilinmeyen belirteç/bölüm yok sayılır", eq(unk.style, { B: { bold: true } }) && columnCurrency(unk, 2) === "EUR", JSON.stringify(unk));
check("not: para değişince biçim korunur", eq(setColumnCurrency(fm, 1, null).style, fm.style));
check("not: targetStyle", eq(targetStyle(fm, { kind: "row", row: 0 }), { align: "center", italic: true }) && eq(targetStyle(fm, { kind: "col", col: 0 }), {}));
const ts = setTargetStyle(fm, { kind: "cell", row: 0, col: 1 }, {});
check("not: setTargetStyle boşsa anahtar silinir", ts.style?.B2 === undefined && fm.style?.B2 !== undefined);
check("not: setTargetStyle tek anahtar → style kalkar", setTargetStyle({ currency: {}, style: { A: { bold: true } } }, { kind: "col", col: 0 }, null).style === undefined);

// ─── Ayraç satırı ───────────────────────────────────────────────────────────
check("ayraç: hizalar", eq(parseSeparatorAlign("| :--: | --- | --: | :-- |"), ["center", null, "right", "left"]));
check("ayraç: borusuz", eq(parseSeparatorAlign(":--|--:"), ["left", "right"]));
const sep = "  | --- | :--- | ---: |";
check("ayraç yaz: orta", setSeparatorAlign(sep, 0, "center") === "  | :---: | :--- | ---: |", setSeparatorAlign(sep, 0, "center"));
check("ayraç yaz: null → ---", setSeparatorAlign(sep, 1, null) === "  | --- | --- | ---: |");
check("ayraç yaz: sağ", setSeparatorAlign("|---|---|", 1, "right") === "|---|---:|", setSeparatorAlign("|---|---|", 1, "right"));
check("ayraç yaz: borusuz", setSeparatorAlign("--- | ---", 1, "left") === "--- | :---", setSeparatorAlign("--- | ---", 1, "left"));
check("ayraç yaz: sütun yoksa aynen", setSeparatorAlign(sep, 5, "center") === sep && setSeparatorAlign(sep, -1, "center") === sep);

// ─── Çözümleme ──────────────────────────────────────────────────────────────
const em: TableMeta = { currency: {}, style: { B: { bold: true }, "2": { align: "right", italic: true }, B2: { align: "left", bold: false } } };
const ca = ["center", "center", null] as const;
check("etkin: sütun hizası", eq(effectiveCellStyle(ca, em, 1, 0), { align: "center", bold: false, italic: false }));
check("etkin: satır sütunu yener", eq(effectiveCellStyle(ca, em, 0, 0), { align: "right", bold: false, italic: true }));
check("etkin: hücre satırı yener, -kalin düz", eq(effectiveCellStyle(ca, em, 0, 1), { align: "left", bold: false, italic: true }));
check("etkin: sütun kalını", effectiveCellStyle(ca, em, 1, 1).bold === true);
check("etkin: başka satır değişmez", eq(effectiveCellStyle(ca, em, 1, 2), { align: null, bold: false, italic: false }));
check("etkin: meta yoksa sade", eq(effectiveCellStyle(null, null, 0, 0), { align: null, bold: false, italic: false }));
check("sınıflar", eq(styleClasses({ align: "center", bold: true, italic: true }), ["is-align-center", "is-bold", "is-italic"]) && eq(styleClasses({ align: null, bold: false, italic: false }), []));

// ─── Uygulama ───────────────────────────────────────────────────────────────
const base: TableMeta = { currency: { 1: "TRY" } };
const a1 = applyFormat({ meta: base, colAlign: [null, null], target: { kind: "col", col: 1 }, action: { type: "align", align: "center" } });
check("uygula: sütun ortala → yalnız ayraç", eq(a1.colAlign, [null, "center"]) && eq(a1.meta, base), JSON.stringify(a1));
const a2 = applyFormat({ meta: a1.meta, colAlign: a1.colAlign, target: { kind: "col", col: 1 }, action: { type: "align", align: "center" } });
check("uygula: sütun ikinci tıklama kaldırır", eq(a2.colAlign, [null, null]));
check("uygula: girdi değişmez", eq(a1.colAlign, [null, "center"]));
const a3 = applyFormat({ meta: base, colAlign: [], target: { kind: "col", col: 2 }, action: { type: "align", align: "right" } });
check("uygula: kısa colAlign tamamlanır", eq(a3.colAlign, [null, null, "right"]));
const r1 = applyFormat({ meta: base, colAlign: [], target: { kind: "row", row: 0 }, action: { type: "bold" } });
check("uygula: satır kalın → 2=kalin", eq(r1.meta.style, { "2": { bold: true } }) && serializeTableMeta(r1.meta) === "<!-- loomen: para B=TRY bicim 2=kalin -->");
check("uygula: girdi meta değişmez", base.style === undefined);
const c1 = applyFormat({ meta: r1.meta, colAlign: [], target: { kind: "cell", row: 0, col: 1 }, action: { type: "bold" } });
check("uygula: kalın satırda hücre → -kalin", eq(c1.meta.style?.B2, { bold: false }) && effectiveCellStyle([], c1.meta, 0, 1).bold === false);
check("uygula: diğer hücreler kalın kalır", effectiveCellStyle([], c1.meta, 0, 0).bold === true);
const c2 = applyFormat({ meta: c1.meta, colAlign: [], target: { kind: "cell", row: 0, col: 1 }, action: { type: "bold" } });
check("uygula: kalıtılana eşitse anahtar silinir", c2.meta.style?.B2 === undefined && c2.meta.style?.["2"]?.bold === true);
const r2 = applyFormat({ meta: r1.meta, colAlign: [], target: { kind: "row", row: 0 }, action: { type: "bold" } });
check("uygula: satır ikinci tıklama kaldırır", r2.meta.style === undefined && serializeTableMeta(r2.meta) === "<!-- loomen: para B=TRY -->");
const h1 = applyFormat({ meta: null, colAlign: [], target: { kind: "cell", row: 1, col: 0 }, action: { type: "align", align: "center" } });
const h2 = applyFormat({ meta: h1.meta, colAlign: [], target: { kind: "cell", row: 1, col: 0 }, action: { type: "italic" } });
check("uygula: hücre hiza + italik", eq(h2.meta.style, { A3: { align: "center", italic: true } }));
const h3 = applyFormat({ meta: h2.meta, colAlign: [], target: { kind: "cell", row: 1, col: 0 }, action: { type: "align", align: "center" } });
check("uygula: hücre aynı hiza kaldırır", eq(h3.meta.style, { A3: { italic: true } }));
const col1 = applyFormat({ meta: null, colAlign: [], target: { kind: "col", col: 0 }, action: { type: "italic" } });
check("uygula: sütun italik not satırına", eq(col1.meta.style, { A: { italic: true } }));

// ─── Taşıma ─────────────────────────────────────────────────────────────────
const mm: TableMeta = { currency: { 1: "TRY" }, style: { B: { bold: true }, "2": { italic: true }, B2: { align: "right" }, A1: { bold: true } } };
const mc = moveMetaColumn(mm, 1, 3);
check("taşı sütun: B → D", eq(mc.style, { D: { bold: true }, "2": { italic: true }, D2: { align: "right" }, A1: { bold: true } }) && columnCurrency(mc, 3) === "TRY", JSON.stringify(mc));
check("taşı sütun: sınır dışı aynen", eq(moveMetaColumn(mm, 1, 4, 4), mm));
check("taşı sütun: style yoksa alan eklenmez", moveMetaColumn({ currency: { 1: "TRY" } }, 1, 0).style === undefined);
const mr = moveMetaRow(mm, 0, 1);
check("taşı satır: 2 ↔ 3", eq(mr.style, { B: { bold: true }, "3": { italic: true }, B3: { align: "right" }, A1: { bold: true } }), JSON.stringify(mr));
check("taşı satır: para aynen", columnCurrency(mr, 1) === "TRY");
check("taşı satır: sınır dışı aynen", eq(moveMetaRow(mm, 0, 2, 2), mm) && eq(moveMetaRow(mm, -1, 0), mm));
check("taşı satır: aynı indeks aynen", eq(moveMetaRow(mm, 1, 1).style, mm.style));
check("taşı: girdi değişmez", eq(mm.style, { B: { bold: true }, "2": { italic: true }, B2: { align: "right" }, A1: { bold: true } }));
// Metinle tutarlı: kalın satır taşınınca içeriğiyle gider.
const tbl = ["| Ad | Tutar |", "| :--: | --: |", "| a | 1 |", "| b | 2 |"];
const movedRows = findTables(moveTableRow(tbl, 0, 1))[0].rows;
const movedStyle = moveMetaRow({ currency: {}, style: { "2": { bold: true } } }, 0, 1, 2);
check("taşı satır: kalın 'a' satırıyla gider", movedRows[1][0] === "a" && effectiveCellStyle([], movedStyle, 1, 0).bold && !effectiveCellStyle([], movedStyle, 0, 0).bold);

// ─── Tablo modeli ───────────────────────────────────────────────────────────
const doc = ["| Ad | Tutar | Not |", "| :--: | --- | --: |", "| a | 1 | x |", "<!-- loomen: bicim 2=kalin -->"];
const [t] = findTables(doc);
check("model: ayraç :--: ile tablo tanınır", !!t && t.rows.length === 1);
check("model: align dolu", eq(t.align, ["center", null, "right"]), JSON.stringify(t?.align));
check("model: bicim not satırı tabloya ait", t.metaLine === 3 && t.meta?.style?.["2"]?.bold === true);
check("model: kısa ayraç null ile tamamlanır", eq(findTables(["| a | b |", "| :-- |", "| 1 | 2 |"])[0]?.align, ["left", null]));
check("model: hiza sütunla taşınır", eq(findTables(moveTableColumn(doc.slice(0, 3), 0, 2))[0].align, [null, "right", "center"]));

// ─── Kaynak denetimi (diğer parçalar) ───────────────────────────────────────
const widget = read("src/screens/Editor/tableWidget.ts");
check("widget: effectiveCellStyle kullanılır", widget.includes("effectiveCellStyle("));
check("widget: biçim şeridi cm-table-format", widget.includes("cm-table-format"));
check("widget: writeTableFormat", widget.includes("writeTableFormat("));
check("widget: satır taşımada moveMetaRow", widget.includes("moveMetaRow("));
const md = read("src/screens/Editor/Markdown.tsx");
check("okuma: parseSeparatorAlign", md.includes("parseSeparatorAlign("));
check("okuma: styleClasses", md.includes("styleClasses("));
function after(src: string, first: string, ...later: string[]): boolean {
  const i = src.indexOf(first);
  return i >= 0 && later.every((l) => src.indexOf(l, i) > i);
}
const cm = read("src/screens/Editor/CodeMirrorEditor.tsx");
check("tema: hiza/kalın kuralları currency kuralından sonra", after(cm, "cm-table__currency", "is-align-center", "is-bold"));
const css = read("src/styles/app.css");
check("css: hiza/kalın kuralları currency kuralından sonra", after(css, ".lo-table td.lo-table__currency", "is-align-center", "is-bold"));
for (const lang of ["tr", "en", "ar"]) {
  let tf: Record<string, string> | undefined;
  try {
    tf = JSON.parse(read(`src/i18n/locales/${lang}/translation.json`)).tableFormat;
  } catch {
    tf = undefined;
  }
  const keys = ["scopeCell", "scopeRow", "scopeColumn", "alignLeft", "alignCenter", "alignRight", "bold", "italic"];
  check(`çeviri ${lang}: tableFormat`, !!tf && keys.every((k) => typeof tf![k] === "string" && tf![k].length > 0));
}
check("test listesi: tableFormatTest kayıtlı", read("scripts/run-tests.mjs").includes("src/core/__test__/tableFormatTest.ts"));

console.log(`\n${ran - fails}/${ran} kontrol geçti`);
if (fails > 0) process.exit(1);

// Tabloda sütun para biriminin node testi (LOM-89).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır; cwd depo köküdür.
//
// Saf not satırı modülü (tableMeta.ts): okuma/yazma, sütun taşıma, biçimleme; tablo modeli
// (tableModel.ts) not satırını tabloya katıyor mu; blok ekleme not satırını koparmıyor mu;
// ayrıca widget/okuma modu bağlantısı, stil ve çeviri anahtarları (kaynak denetimi).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CURRENCIES,
  columnCurrency,
  formatCellDisplay,
  formatCurrency,
  indexToLetter,
  isTableMetaLine,
  moveMetaColumn,
  parseTableMeta,
  serializeTableMeta,
  setColumnCurrency,
} from "../markdown/tableMeta";
import { evaluateTable, parseLocalizedNumber } from "../markdown/tableFormula";
import {
  ensureTrailingBlankLine,
  findTables,
  moveTableColumn,
  needsTrailingBlankLine,
  tableContaining,
  tableLastLine,
} from "../../screens/Editor/tableModel";
import { computeBlockInsert } from "../../screens/Editor/editorCommands";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const NBSP = /[  ]/g;
const norm = (s: string | null) => (s == null ? s : s.replace(NBSP, " "));

// ─── Para birimleri ─────────────────────────────────────────────────────────
check(
  "para birimleri: ₺ $ € £ (ISO kodlu)",
  eq(
    CURRENCIES.map((c) => [c.code, c.symbol]),
    [
      ["TRY", "₺"],
      ["USD", "$"],
      ["EUR", "€"],
      ["GBP", "£"],
    ]
  )
);
check("harf: 0 → A, 25 → Z, 26 → AA", indexToLetter(0) === "A" && indexToLetter(25) === "Z" && indexToLetter(26) === "AA");

// ─── Not satırı okuma / yazma ───────────────────────────────────────────────
check("not satırı tanınır", isTableMetaLine("<!-- loomen: para B=TRY -->"));
check("not satırı: girintili/boşluksuz da tanınır", isTableMetaLine("  <!--loomen: para B=TRY-->"));
check("başka HTML yorumu not satırı değil", !isTableMetaLine("<!-- not -->"));
check("tablo satırı not satırı değil", !isTableMetaLine("| a | b |"));
check("boş satır not satırı değil", !isTableMetaLine(""));
const m1 = parseTableMeta("<!-- loomen: para B=TRY D=usd -->");
check("okuma: B=TRY, D=USD", columnCurrency(m1, 1) === "TRY" && columnCurrency(m1, 3) === "USD", JSON.stringify(m1));
check("okuma: seçilmeyen sütun null", columnCurrency(m1, 0) === null);
check("okuma: bilinmeyen kod yok sayılır", eq(parseTableMeta("<!-- loomen: para B=XYZ C=EUR -->")?.currency, { 2: "EUR" }));
check("okuma: not satırı değilse null", parseTableMeta("| a |") === null);
check("okuma: AA sütunu", columnCurrency(parseTableMeta("<!-- loomen: para AA=GBP -->"), 26) === "GBP");
check("yazma: sütun sırasıyla", serializeTableMeta({ currency: { 3: "USD", 1: "TRY" } }) === "<!-- loomen: para B=TRY D=USD -->");
check("yazma: boşsa null (satır silinir)", serializeTableMeta({ currency: {} }) === null && serializeTableMeta(null) === null);
check("gidiş-dönüş", eq(parseTableMeta(serializeTableMeta(m1)!), m1));

// ─── Seçim değiştirme ───────────────────────────────────────────────────────
const s1 = setColumnCurrency(null, 1, "TRY");
check("seç: B=TRY", serializeTableMeta(s1) === "<!-- loomen: para B=TRY -->");
const s2 = setColumnCurrency(s1, 1, "EUR");
check("seç: değiştir B=EUR", columnCurrency(s2, 1) === "EUR");
check("seç: girdi değişmez", columnCurrency(s1, 1) === "TRY");
const s3 = setColumnCurrency(s2, 1, null);
check("seç: Yok → not satırı silinir", serializeTableMeta(s3) === null);

// ─── Sütun taşıma ───────────────────────────────────────────────────────────
const mv = { currency: { 1: "TRY" as const, 3: "USD" as const } };
check("taşı: B → D (sağa)", eq(moveMetaColumn(mv, 1, 3).currency, { 2: "USD", 3: "TRY" }), JSON.stringify(moveMetaColumn(mv, 1, 3)));
check("taşı: D → A (sola)", eq(moveMetaColumn(mv, 3, 0).currency, { 0: "USD", 2: "TRY" }), JSON.stringify(moveMetaColumn(mv, 3, 0)));
check("taşı: aralık dışı etkilenmez", eq(moveMetaColumn(mv, 0, 1).currency, { 0: "TRY", 3: "USD" }));
check("taşı: aynı indeks aynen", eq(moveMetaColumn(mv, 2, 2).currency, mv.currency));
check("taşı: sınır dışı aynen", eq(moveMetaColumn(mv, 1, 4, 4).currency, mv.currency) && eq(moveMetaColumn(mv, -1, 2).currency, mv.currency));
// Taşıma tablo metniyle tutarlı: para birimi başlığıyla birlikte gider.
const hdr = ["| Ad | Tutar | Not |", "| --- | --- | --- |", "| x | 5 | y |"];
const movedHdr = findTables(moveTableColumn(hdr, 1, 2))[0].header;
const movedMeta = moveMetaColumn({ currency: { 1: "TRY" } }, 1, 2);
check("taşı: ₺ Tutar başlığıyla gider", movedHdr[2] === "Tutar" && columnCurrency(movedMeta, 2) === "TRY");

// ─── Biçimleme ──────────────────────────────────────────────────────────────
check("biçim: 212500 TRY tr → '212.500 ₺'", norm(formatCurrency(212500, "TRY", "tr")) === "212.500 ₺", formatCurrency(212500, "TRY", "tr"));
check("biçim: 1500 USD en → '1,500 $'", norm(formatCurrency(1500, "USD", "en")) === "1,500 $");
check("biçim: 1234.5 EUR tr → '1.234,5 €'", norm(formatCurrency(1234.5, "EUR", "tr")) === "1.234,5 €");
check("hücre: '212500' → '212.500 ₺'", norm(formatCellDisplay("212500", "TRY", "tr")) === "212.500 ₺");
check("hücre: '212.500' → '212.500 ₺'", norm(formatCellDisplay("212.500", "TRY", "tr")) === "212.500 ₺");
check("hücre: '₺ 1.200' simge çiftlenmez", norm(formatCellDisplay("₺ 1.200", "TRY", "tr")) === "1.200 ₺");
check("hücre: '£5' okunur", norm(formatCellDisplay("£5", "GBP", "tr")) === "5 £");
check("hücre: metin olduğu gibi (null)", formatCellDisplay("Kira", "TRY", "tr") === null);
check("hücre: boş olduğu gibi (null)", formatCellDisplay("", "TRY", "tr") === null);
check("hücre: formül null (sonuç ayrıca biçimlenir)", formatCellDisplay("=B2*2", "TRY", "tr") === null);
check("hücre: para birimi yoksa null", formatCellDisplay("212500", null, "tr") === null);
check("sayı okuma: £ temizlenir", parseLocalizedNumber("£ 1.250") === 1250);
const ev = evaluateTable(["Ad", "Tutar"], [["a", "200.000"], ["b", "12.500"], ["Toplam", "=TOPLA(B:B)"]]);
check(
  "formül sonucu: TOPLA → '212.500 ₺'",
  ev[2][1].value !== null && norm(formatCurrency(ev[2][1].value, "TRY", "tr")) === "212.500 ₺"
);

// ─── Tablo modeli ───────────────────────────────────────────────────────────
const doc = [
  "Giriş",
  "| Ad | Tutar |",
  "| --- | --- |",
  "| a | 200.000 |",
  "| b | =B2+1 |",
  "<!-- loomen: para B=TRY -->",
  "Sonra",
];
const [t] = findTables(doc);
check("model: not satırı tabloya ait", t.metaLine === 5 && t.endLine === 4, JSON.stringify({ e: t.endLine, m: t.metaLine }));
check("model: meta okunur", columnCurrency(t.meta, 1) === "TRY");
check("model: gövde satırları değişmez", t.rows.length === 2 && t.rows[0][1] === "200.000" && t.rows[1][1] === "=B2+1");
check("model: tableLastLine not satırı", tableLastLine(t) === 5);
check("model: tableContaining not satırını kapsar", tableContaining(doc, 5)?.headerLine === 1);
check("model: tablonun dışı kapsanmaz", tableContaining(doc, 6) === null);
const noMeta = findTables(["| a |", "| --- |", "| 1 |", "", "<!-- loomen: para A=TRY -->"])[0];
check("model: boş satırdan sonraki not satırı tabloya ait değil", noMeta.metaLine === null && noMeta.meta === null);
const plain = findTables(["| a |", "| --- |", "| 1 |"])[0];
check("model: not satırı yoksa null", plain.metaLine === null && plain.meta === null && tableLastLine(plain) === 2);
const fenced = findTables(["| a |", "| --- |", "| 1 |", "```", "<!-- loomen: para A=TRY -->", "```"])[0];
check("model: kod bloğundaki satır not sayılmaz", fenced.metaLine === null);
const two = findTables(["| a |", "| --- |", "| 1 |", "<!-- loomen: para A=USD -->", "| b |", "| --- |", "| 2 |"]);
check(
  "model: not satırından sonra yeni tablo",
  two.length === 2 && columnCurrency(two[0].meta, 0) === "USD" && two[1].headerLine === 4 && two[1].metaLine === null
);

// ─── Belge sonu boş satır ───────────────────────────────────────────────────
const endsMeta = ["| a |", "| --- |", "| 1 |", "<!-- loomen: para A=TRY -->"];
check("sona boş satır: not satırıyla biten tablo", needsTrailingBlankLine(endsMeta));
check("sona boş satır: metin hâli", ensureTrailingBlankLine(endsMeta.join("\n")).endsWith("-->\n"));
check("sona boş satır: tablosuz yorum gerekmez", !needsTrailingBlankLine(["metin", "<!-- loomen: para A=TRY -->"]));

// ─── Blok ekleme not satırını koparmaz ──────────────────────────────────────
const bdoc = ["| a | b |", "| --- | --- |", "| 1 | 2 |", "<!-- loomen: para B=TRY -->", "", "son"].join("\n");
const ins = computeBlockInsert(bdoc, 2, "---");
const after = bdoc.slice(0, ins.from) + ins.insert + bdoc.slice(ins.from);
check(
  "blok ekleme: not satırının altına",
  after.includes("| 1 | 2 |\n<!-- loomen: para B=TRY -->\n\n---") && findTables(after.split("\n"))[0].metaLine === 3,
  JSON.stringify(after)
);

// ─── Kaynak denetimi (arayüz bağlantısı) ────────────────────────────────────
const widget = read("src/screens/Editor/tableWidget.ts");
check("widget formatCurrency( kullanıyor", widget.includes("formatCurrency("));
check("widget formatCellDisplay( kullanıyor", widget.includes("formatCellDisplay("));
check("widget cm-table__currency sınıfı", widget.includes("cm-table__currency"));
check("widget seçim şeridi cm-table-currency", widget.includes("cm-table-currency"));
check("widget sütun taşımada moveMetaColumn(", widget.includes("moveMetaColumn("));
check("widget not satırını yazıyor (serializeTableMeta)", widget.includes("serializeTableMeta("));
check("widget not satırını kapsıyor (metaLine)", widget.includes("metaLine"));
const md = read("src/screens/Editor/Markdown.tsx");
check("okuma modu not satırını tanıyor", md.includes("isTableMetaLine(") || md.includes("parseTableMeta("));
check("okuma modu lo-table__currency sınıfı", md.includes("lo-table__currency"));
const cm = read("src/screens/Editor/CodeMirrorEditor.tsx");
check("tema: cm-table__currency kuralı", cm.includes("cm-table__currency"));
check("tema: belge sonu ön elemesi yorum satırını görüyor", cm.includes("<!--"));
const css = read("src/styles/app.css");
check("stil: .lo-table__currency kuralı", css.includes(".lo-table__currency"));
check("stil: .cm-table-currency kuralı", css.includes(".cm-table-currency"));
for (const lng of ["tr", "en", "ar"]) {
  const j = JSON.parse(read(`src/i18n/locales/${lng}/translation.json`));
  const tc = j.tableCurrency;
  check(
    `i18n ${lng}: tableCurrency anahtarları`,
    !!tc && typeof tc === "object" && Object.values(tc).length > 0 && Object.values(tc).every((v) => typeof v === "string" && v.length > 0)
  );
}
check("run-tests.mjs'de test kayıtlı", read("scripts/run-tests.mjs").includes("src/core/__test__/tableCurrencyTest.ts"));

console.log(`\n${ran - fails}/${ran} kontrol geçti`);
if (fails > 0) process.exit(1);

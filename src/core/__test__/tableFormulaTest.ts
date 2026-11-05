// Tabloda Excel benzeri formülün node testi (LOM-79).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır; cwd depo köküdür.
//
// Saf formül motoru (tableFormula.ts): sayı okuma, başvuru, aralık, fonksiyon, öncelik,
// hatalar, biçimleme; ayrıca widget/okuma modu bağlantısı ve çeviri anahtarları.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateTable,
  formatFormulaResult,
  isFormulaCell,
  parseLocalizedNumber,
  type CellResult,
} from "../markdown/tableFormula";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-9;

// ─── Sayı okuma ─────────────────────────────────────────────────────────────
const nums: [string, number | null][] = [
  ["212.500", 212500],
  ["212.500,50", 212500.5],
  ["1.250,75", 1250.75],
  ["1,5", 1.5],
  ["1.5", 1.5],
  ["1.500.000", 1500000],
  ["₺ 1.200", 1200],
  ["1.200 TL", 1200],
  ["-50", -50],
  ["42", 42],
  ["abc", null],
  ["", null],
  ["  ", null],
  ["1.2.3", null],
];
for (const [s, want] of nums) {
  const got = parseLocalizedNumber(s);
  check(`sayı okuma: ${JSON.stringify(s)} → ${want}`, want === null ? got === null : near(got, want), `alınan ${got}`);
}

check("isFormulaCell: '=B-C' formül", isFormulaCell("=B-C"));
check("isFormulaCell: ' =1 ' formül", isFormulaCell(" =1 "));
check("isFormulaCell: '=' tek başına formül değil", !isFormulaCell("="));
check("isFormulaCell: düz metin formül değil", !isFormulaCell("Tutar"));

// ─── Kalan senaryosu ────────────────────────────────────────────────────────
const header = ["Ad", "Tutar", "Ödenen", "Kalan"];
const rows = [
  ["x", "212.500", "50.000", "=B-C"],
  ["y", "1.000", "250", "=B3-C3"],
  ["Toplam", "=TOPLA(B:B)", "=SUM(C2:C3)", "=SUM(D:D)"],
];
const res = evaluateTable(header, rows);
const v = (r: number, c: number) => res[r][c].value;
check("kalan: =B-C aynı satır → 162500", near(v(0, 3), 162500), `alınan ${v(0, 3)}`);
check("kalan: =B3-C3 → 750", near(v(1, 3), 750), `alınan ${v(1, 3)}`);
check("toplam: =TOPLA(B:B) kendi hücresini dışlar → 213500", near(v(2, 1), 213500), `alınan ${v(2, 1)}`);
check("toplam: =SUM(C2:C3) → 50250", near(v(2, 2), 50250), `alınan ${v(2, 2)}`);
check("toplam: =SUM(D:D) formül sonuçlarını toplar → 163250", near(v(2, 3), 163250), `alınan ${v(2, 3)}`);
check("formül olmayan hücrede formula null", res[0][0].formula === null && res[0][1].formula === null);
check("formül hücresinde formula metni tutulur", res[0][3].formula === "=B-C");
check("sonuç boyutu satır×sütun", res.length === 3 && res.every((r) => r.length === 4));
check("girdi değişmez (dosyaya sonuç yazılmaz)", rows[0][3] === "=B-C" && rows[2][1] === "=TOPLA(B:B)");

// Başvurulan hücre değişince yeniden hesap (K5): aynı girdi, değişen değer.
const rows2 = rows.map((r) => [...r]);
rows2[0][2] = "60.000";
check("değişim: ödenen 60.000 olunca kalan 152500", near(evaluateTable(header, rows2)[0][3].value, 152500));

// ─── Tek hücreli formül yardımcısı ──────────────────────────────────────────
/** A=5, B=boş, C='metin', D=formül. Gövde satırı 2. */
function one(formula: string, extra: Partial<Record<"a" | "b" | "c", string>> = {}): CellResult {
  const h = ["A", "B", "C", "D"];
  const r = [[extra.a ?? "5", extra.b ?? "", extra.c ?? "metin", formula]];
  return evaluateTable(h, r)[0][3];
}
const val = (f: string) => one(f).value;
const err = (f: string) => one(f).error;

check("öncelik: =2+3*4 → 14", near(val("=2+3*4"), 14));
check("öncelik: =(2+3)*4 → 20", near(val("=(2+3)*4"), 20));
check("tekli eksi: =-A → -5", near(val("=-A"), -5));
check("üs: =2^3 → 8", near(val("=2^3"), 8));
check("üs öncelik: =2*3^2 → 18", near(val("=2*3^2"), 18));
check("YUVARLA: =YUVARLA(10/3;2) → 3.33", near(val("=YUVARLA(10/3;2)"), 3.33));
check("ROUND: =round(2,5) yarım yukarı → 3", near(val("=round(2,5)"), 3));
check("ABS: =ABS(-A) → 5", near(val("=ABS(-A)"), 5));
check("virgül ondalık: =A*1,18 → 5.9", near(val("=A*1,18"), 5.9));
check("küçük harf başvuru: =a2*2 → 10", near(val("=a2*2"), 10));
check("boş hücre doğrudan başvuruda 0: =A+B → 5", near(val("=A+B"), 5));

const stats = evaluateTable(
  ["N", "F"],
  [["10", "=ORTALAMA(A:A)"], ["20", "=MIN(A2:A5)"], ["metin", "=MAX(A:A)"], ["30", "=SAY(A:A)"], ["", "=COUNT(A2;A3;A4)"]]
);
check("ORTALAMA: metin ve boş atlanır → 20", near(stats[0][1].value, 20), `alınan ${stats[0][1].value}`);
check("MIN → 10", near(stats[1][1].value, 10));
check("MAX → 30", near(stats[2][1].value, 30));
check("SAY: yalnız sayılar → 3", near(stats[3][1].value, 3));
check("COUNT tek başvurularla → 2", near(stats[4][1].value, 2));
check("aralıkta metin atlanır: =SUM(A2:C2) → 5", near(val("=SUM(A2:C2)"), 5));

// ─── Hatalar ────────────────────────────────────────────────────────────────
check("yazım: =A2+ → syntax", err("=A2+") === "syntax");
check("yazım: =(1+2 → syntax", err("=(1+2") === "syntax");
check("yazım: bilinmeyen fonksiyon → syntax", err("=FOO(1)") === "syntax");
check("yazım: =1 2 → syntax", err("=1 2") === "syntax");
check("olmayan hücre: =Z9 → ref", err("=Z9") === "ref");
check("olmayan satır: =A9 → ref", err("=A9") === "ref");
check("sıfıra bölme: =1/0 → div0", err("=1/0") === "div0");
check("metne doğrudan başvuru: =C+1 → value", err("=C+1") === "value");
const cyc = evaluateTable(["A", "B", "C"], [["=B2", "=A2", "=A2+1"], ["=A3", "1", "=B3*2"]]);
check("döngü: A→B→A → cycle", cyc[0][0].error === "cycle" && cyc[0][1].error === "cycle");
check("döngüye başvuran hücre de hata taşır", cyc[0][2].error === "cycle");
check("kendine başvuru → cycle", cyc[1][0].error === "cycle");
check("hatalı hücre diğerlerini bozmaz", near(cyc[1][2].value, 2));
const prop = evaluateTable(["A", "B"], [["=1/0", "=A2+1"]]);
check("hatalı hücreye başvuran aynı hatayı taşır", prop[0][0].error === "div0" && prop[0][1].error === "div0");
check("hatalı hücrede değer null", prop[0][0].value === null);
check("başlıkta formül değerlendirilmez", evaluateTable(["=1+1"], [["1"]])[0][0].formula === null);

// ─── Biçimleme ──────────────────────────────────────────────────────────────
check("biçim tr: 212500 → '212.500'", formatFormulaResult(212500, "tr") === "212.500", formatFormulaResult(212500, "tr"));
check("biçim tr: 1234.5 → '1.234,5'", formatFormulaResult(1234.5, "tr") === "1.234,5", formatFormulaResult(1234.5, "tr"));
check("biçim en: 212500 → '212,500'", formatFormulaResult(212500, "en") === "212,500", formatFormulaResult(212500, "en"));
check("biçim: en çok 2 ondalık", formatFormulaResult(10 / 3, "en") === "3.33");
check("biçim: geçersiz dilde tr yedeği", formatFormulaResult(1500, "??bozuk??") === "1.500");

// ─── Kaynak denetimi ────────────────────────────────────────────────────────
const widget = read("src/screens/Editor/tableWidget.ts");
check("widget evaluateTable( çağırıyor", widget.includes("evaluateTable("));
check("widget dataset.raw formül metnini koruyor", widget.includes("el.dataset.raw = text"));
check("widget formül sınıfı cm-table__formula", widget.includes("cm-table__formula"));
const md = read("src/screens/Editor/Markdown.tsx");
check("okuma modu evaluateTable( çağırıyor", md.includes("evaluateTable("));
check("okuma modu lo-table__formula sınıfı", md.includes("lo-table__formula"));
const cmTheme = read("src/screens/Editor/CodeMirrorEditor.tsx");
check("tema: cm-table__formula kuralı", cmTheme.includes("cm-table__formula"));
check("stil: lo-table__formula kuralı", read("src/styles/app.css").includes(".lo-table__formula"));
for (const lng of ["tr", "en", "ar"]) {
  const j = JSON.parse(read(`src/i18n/locales/${lng}/translation.json`));
  const t = j.tableFormula ?? {};
  check(
    `i18n ${lng}: tableFormula anahtarları`,
    ["errorLabel", "syntax", "ref", "cycle", "div0", "value"].every((k) => typeof t[k] === "string" && t[k].length > 0)
  );
}
check("run-tests.mjs'de test kayıtlı", read("scripts/run-tests.mjs").includes("src/core/__test__/tableFormulaTest.ts"));

console.log(`\n${ran - fails}/${ran} kontrol geçti`);
if (fails > 0) process.exit(1);

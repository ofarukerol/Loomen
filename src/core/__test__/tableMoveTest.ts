// Tabloda satır/sütun sürükle-bırak taşımasının node testi (LOM-78).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır; cwd depo köküdür.
//
// Saf taşıma fonksiyonları (tableModel.ts) metni doğru yeniden yazıyor mu, sonuç yeniden
// ayrıştırılınca sıra kalıcı mı; widget'ta tutma yerleri ve pointer akışı var mı.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dropIndex,
  findTables,
  joinTableCells,
  moveTableColumn,
  moveTableRow,
  rawTableCells,
  slotToIndex,
  splitTableRow,
} from "../../screens/Editor/tableModel";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

// --- rawTableCells / joinTableCells ---
check("ham: boşluklar korunur", eq(rawTableCells("| a |  b |"), [" a ", "  b "]), JSON.stringify(rawTableCells("| a |  b |")));
check("ham: kaçışlı boru bölünmez", eq(rawTableCells("| a \\| x | b |"), [" a \\| x ", " b "]));
check("ham: başı/sonu borusuz satır", eq(rawTableCells("a | b"), ["a ", " b"]));
check("ham: sonda kaçışlı boru hücreye ait", eq(rawTableCells("| a | b \\|"), [" a ", " b \\|"]));
check("birleştir: |a|b|", joinTableCells([" a ", " b "]) === "| a | b |");

// --- moveTableRow ---
const T = ["| Ad | Yaş | Şehir |", "| --- | :--: | ---: |", "| Ali | 30 | İzmir |", "| Ayşe | 25 | Bursa |", "| Can | 40 | Van |"];

const r02 = moveTableRow(T, 0, 2);
check("satır 0→2: başlık/ayraç yerinde", r02[0] === T[0] && r02[1] === T[1]);
check("satır 0→2: gövde sırası", eq(r02.slice(2), [T[3], T[4], T[2]]), JSON.stringify(r02));
const r20 = moveTableRow(T, 2, 0);
check("satır 2→0: gövde sırası", eq(r20.slice(2), [T[4], T[2], T[3]]));
check("satır: yazılar değişmedi", eq([...r02].sort(), [...T].sort()));
check("satır: aynı indeks metni değiştirmez", moveTableRow(T, 1, 1) === T);
check("satır: sınır dışı metni değiştirmez", moveTableRow(T, 0, 3) === T && moveTableRow(T, -1, 0) === T);

// --- moveTableColumn ---
const c02 = moveTableColumn(T, 0, 2);
check("sütun 0→2: başlık", c02[0] === "| Yaş | Şehir | Ad |", c02[0]);
check("sütun 0→2: ayraç hizası sütunla gider", c02[1] === "| :--: | ---: | --- |", c02[1]);
check("sütun 0→2: gövde", c02[2] === "| 30 | İzmir | Ali |" && c02[4] === "| 40 | Van | Can |", c02[2]);
const c20 = moveTableColumn(T, 2, 0);
check("sütun 2→0: başlık", c20[0] === "| Şehir | Ad | Yaş |", c20[0]);
check("sütun: aynı yere bırakmak metni değiştirmez", moveTableColumn(T, 1, 1) === T);
check("sütun: sınır dışı metni değiştirmez", moveTableColumn(T, 0, 3) === T);

const esc = ["| a | b |", "| --- | --- |", "| x \\| y | z |"];
const escMoved = moveTableColumn(esc, 0, 1);
check("sütun: kaçışlı boru korunur", escMoved[2] === "| z | x \\| y |", escMoved[2]);
check("sütun: kaçışlı hücre değeri aynı", eq(splitTableRow(escMoved[2]), ["z", "x | y"]));

const bare = ["a | b", "--- | ---", "1 | 2"];
const bareMoved = moveTableColumn(bare, 0, 1);
check("sütun: borusuz satır", eq(bareMoved.map((l) => splitTableRow(l)), [["b", "a"], ["---", "---"], ["2", "1"]]), JSON.stringify(bareMoved));

const short = ["| a | b | c |", "| --- | --- | --- |", "| 1 |", "| 1 | 2 | 3 | 4 |"];
const shortMoved = moveTableColumn(short, 0, 2);
check("sütun: eksik hücreli satır boş hücreyle tamamlanır", eq(splitTableRow(shortMoved[2]), ["", "", "1"]), shortMoved[2]);
check("sütun: fazla hücre yerinde kalır", eq(splitTableRow(shortMoved[3]), ["2", "3", "1", "4"]), shortMoved[3]);

const indented = ["  | a | b |", "  | --- | --- |", "  | 1 | 2 |"];
check("sütun: girinti korunur", moveTableColumn(indented, 0, 1)[0] === "  | b | a |");

// --- Kalıcılık: yeniden ayrıştırılınca yeni sıra ---
const doc = ["Not", "", ...moveTableRow(moveTableColumn(T, 0, 2), 2, 0), "", "son"];
const tables = findTables(doc);
check("kalıcılık: tek tablo bulundu", tables.length === 1);
const t0 = tables[0];
check("kalıcılık: başlık yeni sırada", !!t0 && eq(t0.header, ["Yaş", "Şehir", "Ad"]), JSON.stringify(t0?.header));
check(
  "kalıcılık: satırlar yeni sırada",
  !!t0 && eq(t0.rows, [["40", "Van", "Can"], ["30", "İzmir", "Ali"], ["25", "Bursa", "Ayşe"]]),
  JSON.stringify(t0?.rows),
);
const escTable = findTables(escMoved)[0];
check("kalıcılık: kaçışlı tablo hâlâ tablo", !!escTable && eq(escTable.rows, [["z", "x | y"]]));
const shortTable = findTables(shortMoved)[0];
check("kalıcılık: eksik hücreli tablo hâlâ tablo", !!shortTable && shortTable.rows.length === 2);

// --- dropIndex / slotToIndex ---
const edges = [
  { start: 0, end: 100 },
  { start: 100, end: 200 },
  { start: 200, end: 300 },
];
check("bırakma: baştan önce → 0", dropIndex(edges, -20) === 0);
check("bırakma: ilk öğenin ilk yarısı → 0", dropIndex(edges, 40) === 0);
check("bırakma: ilk öğenin ikinci yarısı → 1", dropIndex(edges, 60) === 1);
check("bırakma: son öğenin ikinci yarısı → 3", dropIndex(edges, 280) === 3);
check("bırakma: sondan sonra → 3", dropIndex(edges, 999) === 3);
check("bırakma: boş liste → 0", dropIndex([], 10) === 0);
check("yuva: 0'ı sona taşı → 2", slotToIndex(0, 3) === 2);
check("yuva: 2'yi başa taşı → 0", slotToIndex(2, 0) === 0);
check("yuva: kendi önü/arkası → aynı", slotToIndex(1, 1) === 1 && slotToIndex(1, 2) === 1);

// --- Kaynak denetimi: widget ve tema ---
const tw = read("src/screens/Editor/tableWidget.ts");
check("widget: sütun tutma yeri", tw.includes('"cm-table__colgrip"'));
check("widget: satır tutma yeri", tw.includes('"cm-table__rowgrip"'));
check("widget: setPointerCapture", tw.includes("grip.setPointerCapture("));
check("widget: moveTableColumn çağrısı", tw.includes("moveTableColumn(lines"));
check("widget: moveTableRow çağrısı", tw.includes("moveTableRow(lines"));
const gripFn = tw.slice(tw.indexOf("private makeGrip("), tw.indexOf("private addBtn("));
check(
  "widget: tutma yerine basmak hücreyi açmaz (preventDefault + stopPropagation)",
  /addEventListener\("pointerdown", \(e\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);/.test(gripFn),
);
check("widget: tek dispatch", (tw.slice(tw.indexOf("private applyMove("), tw.indexOf("private makeGrip(")).match(/dispatch\(/g) ?? []).length === 1);
check("widget: sütun genişlikleri taşınıyor", /colWidths\.set\(this\.from, moveItem\(/.test(tw));
check("widget: ignoreEvent true kaldı", /ignoreEvent\(\): boolean \{\s*return true;/.test(tw));

const cm = read("src/screens/Editor/CodeMirrorEditor.tsx");
const colRule = cm.slice(cm.indexOf('".cm-table__colgrip": {'), cm.indexOf("},", cm.indexOf('".cm-table__colgrip": {')));
check("tema: colgrip kuralı bulundu", colRule.length > 0);
check("tema: colgrip touchAction none", /touchAction:\s*"none"/.test(colRule));
const rowRule = cm.slice(cm.indexOf('".cm-table__rowgrip": {'), cm.indexOf("},", cm.indexOf('".cm-table__rowgrip": {')));
check("tema: rowgrip touchAction none", /touchAction:\s*"none"/.test(rowRule));
const css = read("src/styles/app.css");
check("mobil: tutma yerleri büyük ve görünür", css.includes(".lo-app.is-mobile .cm-table__colgrip") && css.includes(".lo-app.is-mobile .cm-table__rowgrip"));
for (const lng of ["tr", "en", "ar"]) {
  const j = JSON.parse(read(`src/i18n/locales/${lng}/translation.json`));
  check(`i18n ${lng}: ctx.moveColumn / ctx.moveRow`, !!j.ctx?.moveColumn && !!j.ctx?.moveRow);
}

console.log(`\n${ran - fails}/${ran} kontrol geçti`);
if (fails > 0) process.exit(1);

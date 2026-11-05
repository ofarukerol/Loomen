// Tablo hücresinde uzun yazının alt satıra sarılmasının node testi (LOM-77).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır; cwd depo köküdür.
//
// Düzenleme (CodeMirror widget'ı) ve okuma modundaki hücreler tek satıra zorlanmaz;
// sütun tutamacı width + min-width yazar; hücre düzenleme kutusu çok satırlıdır ama
// kaydedilen kaynakta satır sonu kalmaz.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cellSourceText } from "../../screens/Editor/tableModel";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/** `start` ile başlayan bloğu ilk `end`e kadar döndürür (yoksa boş). */
function block(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return j < 0 ? "" : src.slice(i, j + end.length);
}

// Düzenleme modu: CodeMirror teması
const cm = read("src/screens/Editor/CodeMirrorEditor.tsx");
const cmCell = block(cm, '".cm-table th, .cm-table td": {', "},");
check("düzenleme: hücre kuralı bulundu", cmCell.length > 0);
check("düzenleme: hücrede nowrap yok", !cmCell.includes("nowrap"));
check("düzenleme: hücrede whiteSpace normal", /whiteSpace:\s*"normal"/.test(cmCell));
check("düzenleme: hücrede overflowWrap break-word", /overflowWrap:\s*"break-word"/.test(cmCell));

// Okuma modu ve düzenleme kutusu: app.css
const css = read("src/styles/app.css");
const loCell = block(css, ".lo-table th,\n.lo-table td {", "}");
check("okuma: hücre kuralı bulundu", loCell.length > 0);
check("okuma: hücrede white-space: nowrap yok", !loCell.includes("white-space: nowrap"));
check("okuma: hücrede white-space: normal", loCell.includes("white-space: normal"));
const editorCss = block(css, ".cm-table-editor {", "}");
check("kutu: stil kuralı bulundu", editorCss.length > 0);
check("kutu: white-space: pre-wrap", editorCss.includes("white-space: pre-wrap"));
check("kutu: resize: none", editorCss.includes("resize: none"));

// Tablo widget'ı
const tw = read("src/screens/Editor/tableWidget.ts");
const openFn = block(tw, "function openCellEditor(", "\n}\n");
check("kutu: openCellEditor bulundu", openFn.length > 0);
check("kutu: textarea oluşturuluyor", openFn.includes('document.createElement("textarea")'));
check("kutu: tek satırlık input yok", !openFn.includes('createElement("input")'));
check("kutu: yazıyla büyüyor (scrollHeight)", openFn.includes("scrollHeight"));
check("kutu: Enter kaydediyor", /e\.key === "Enter"[\s\S]{0,80}finish\(true\)/.test(openFn));
check("kutu: Esc vazgeçiyor", /e\.key === "Escape"[\s\S]{0,80}finish\(false\)/.test(openFn));
check("kutu: Tab komşu hücreye geçiyor", /e\.key === "Tab"[\s\S]*moveTo\(r, c\)/.test(openFn));

const onMove = block(tw, "const onMove = (ev: PointerEvent) => {", "\n        };");
check("tutamaç: onMove bulundu", onMove.length > 0);
check(
  "tutamaç: width ve min-width birlikte yazılıyor",
  onMove.includes("c2.style.width = `${w}px`") && onMove.includes("c2.style.minWidth = `${w}px`"),
);
check(
  "saklı genişlik: width ve min-width birlikte",
  tw.includes("el.style.width = `${widths[col]}px`") && tw.includes("el.style.minWidth = `${widths[col]}px`"),
);

// Kaydedilen kaynakta satır sonu kalmaz
check("kaynak: satır sonu boşluğa çevrilir", cellSourceText("a\nb") === " a b ", JSON.stringify(cellSourceText("a\nb")));
check("kaynak: \\r\\n de çevrilir", cellSourceText("a\r\nb") === " a b ");

console.log(`\n${ran - fails}/${ran} kontrol geçti`);
if (fails > 0) process.exit(1);

/**
 * Not editörünün saf mantığının node testi (esbuild ile bundle edilip çalıştırılır).
 *
 * Koşmak için (repo kökünden):
 *   npx esbuild src/core/__test__/editorTest.ts --bundle --platform=node --format=cjs \
 *     --define:import.meta.env='{}' --outfile=/tmp/editorTest.cjs && node /tmp/editorTest.cjs
 *
 * Kapsam: tablo ayrıştırma (kod bloğu içi tablolar dahil), hücre aralıkları, satır/sütun ekleme,
 * belge sonu boş satır garantisi, blok ekleme (insertBlock) planı ve not açılış imleci.
 * DOM gerektirmez; @codemirror/state yalnız gerçek belge kaydırmalarını doğrulamak için kullanılır.
 */
import { EditorState } from "@codemirror/state";
import {
  splitTableRow,
  isSeparator,
  pipePositions,
  findFenceBlocks,
  isInFence,
  findTables,
  tableBlockAt,
  tableContaining,
  cellLineIndex,
  cellRange,
  cellSourceText,
  newRowText,
  newColCellText,
  isBlockEmbedLine,
  needsTrailingBlankLine,
  ensureTrailingBlankLine,
} from "../../screens/Editor/tableModel";
import { computeBlockInsert } from "../../screens/Editor/editorCommands";
import { firstSectionCaret } from "../../screens/Editor/noteCaret";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  check(name, g === w, g === w ? "" : `beklenen ${w}, gelen ${g}`);
}

/** insertBlock planını gerçekten uygula — sonuç belgesi ve imlecin düştüğü satır. */
function applyInsert(doc: string, pos: number, text: string, caretIn?: number) {
  const plan = computeBlockInsert(doc, pos, text, caretIn);
  const next = doc.slice(0, plan.from) + plan.insert + doc.slice(plan.from);
  const state = EditorState.create({ doc: next });
  const inRange = plan.caret >= 0 && plan.caret <= next.length;
  const line = inRange ? state.doc.lineAt(plan.caret) : null;
  return { next, caret: plan.caret, inRange, caretLine: line?.text ?? null, caretLineNo: line?.number ?? -1 };
}

/** İmlecin bulunduğu satırın 0-tabanlı indeksi (computeBlockInsert testleri için). */
function lineIndexOf(doc: string, pos: number): number {
  return doc.slice(0, pos).split("\n").length - 1;
}

/** Satır indeksinin belge başlangıç kaydırması. */
function offsetOfLine(doc: string, idx: number): number {
  const lines = doc.split("\n");
  let acc = 0;
  for (let i = 0; i < idx; i++) acc += lines[i].length + 1;
  return acc;
}

console.log("\n=== 1. Tablo satırı ayrıştırma ===");
eq("Basit satır hücrelere ayrılır", splitTableRow("| a | b | c |"), ["a", "b", "c"]);
eq("Baş/son borusuz satır", splitTableRow("a | b"), ["a", "b"]);
eq("Boş hücreler korunur", splitTableRow("|  |  |"), ["", ""]);
eq("Kaçışlı boru hücreyi bölmez", splitTableRow("| a \\| b | c |"), ["a | b", "c"]);
eq("Hücre içi boşluk kırpılır", splitTableRow("|   x   |   y |"), ["x", "y"]);

check("Ayraç satırı tanınır", isSeparator("| --- | --- |"));
check("Hizalı ayraç tanınır", isSeparator("| :--- | :---: | ---: |"));
check("Normal satır ayraç değil", !isSeparator("| a | b |"));
check("Tire içermeyen satır ayraç değil", !isSeparator("| | |"));
check("Metinli satır ayraç değil", !isSeparator("| --- | a |"));

eq("pipePositions kaçışlıyı atlar", pipePositions("| a \\| b | c |"), [0, 9, 13]);
eq("pipePositions boru yoksa boş", pipePositions("düz metin"), []);

console.log("\n=== 2. Kod bloğu çitleri ===");
{
  const lines = ["Metin", "```", "| a | b |", "| --- | --- |", "```", "Son"];
  eq("Kapalı çit bulunur", findFenceBlocks(lines), [{ start: 1, end: 4 }]);
  check("Çit içindeki satır in-fence", isInFence(lines, 2));
  check("Çit dışındaki satır in-fence değil", !isInFence(lines, 5));
  eq("Kod bloğu içindeki tablo tablo SAYILMAZ", findTables(lines).length, 0);
}
{
  const lines = ["```js", "kod", "```", "", "| a | b |", "| --- | --- |", "| 1 | 2 |"];
  const t = findTables(lines);
  eq("Çitten sonra gelen gerçek tablo bulunur", t.length, 1);
  eq("Tablo aralığı doğru", t[0] && { h: t[0].headerLine, e: t[0].endLine }, { h: 4, e: 6 });
}
{
  const lines = ["```", "| a |", "| --- |"];
  eq("Kapanmamış çit belge sonuna uzanır", findFenceBlocks(lines), [{ start: 0, end: 2 }]);
  eq("Kapanmamış çit içindeki tablo sayılmaz", findTables(lines).length, 0);
}
{
  // Farklı işaretçi (~~~) ``` ile kapanmaz.
  const lines = ["~~~", "| a | b |", "| --- | --- |", "~~~"];
  eq("Tilde çiti de tanınır", findFenceBlocks(lines), [{ start: 0, end: 3 }]);
  eq("Tilde çiti içindeki tablo sayılmaz", findTables(lines).length, 0);
}

console.log("\n=== 3. Tablo blokları ===");
{
  const doc = "Giriş\n\n| Ad | Yaş |\n| --- | --- |\n| Ali | 30 |\n| Ayşe | 25 |\n\nSon";
  const lines = doc.split("\n");
  const tables = findTables(lines);
  eq("Tek tablo bulunur", tables.length, 1);
  eq("Başlık satırı", tables[0].headerLine, 2);
  eq("Son satır", tables[0].endLine, 5);
  eq("Başlık hücreleri", tables[0].header, ["Ad", "Yaş"]);
  eq("Gövde satırları", tables[0].rows, [["Ali", "30"], ["Ayşe", "25"]]);
  check("tableBlockAt başlık satırıyla bulur", tableBlockAt(lines, 2)?.endLine === 5);
  check("tableBlockAt yanlış satırda null", tableBlockAt(lines, 3) === null);
  check("tableContaining gövde satırında bulur", tableContaining(lines, 4)?.headerLine === 2);
  check("tableContaining tablo dışında null", tableContaining(lines, 7) === null);
}
{
  // Eksik/fazla hücreli satırlar başlık uzunluğuna hizalanmalı.
  const lines = ["| a | b | c |", "| --- | --- | --- |", "| 1 |", "| 1 | 2 | 3 | 4 |"];
  const t = findTables(lines)[0];
  eq("Eksik hücreler boşla tamamlanır", t.rows[0], ["1", "", ""]);
  eq("Fazla hücreler kırpılır", t.rows[1], ["1", "2", "3"]);
}
{
  // Aralarında boş satır olan iki tablo ayrı bloklardır.
  const lines = "| a | b |\n| --- | --- |\n| 1 | 2 |\n\n| c | d |\n| --- | --- |\n| 3 | 4 |".split("\n");
  const t = findTables(lines);
  eq("Art arda iki tablo ayrı bulunur", t.map((x) => [x.headerLine, x.endLine]), [[0, 2], [4, 6]]);
}
{
  // Ayraç satırı olmayan '|' içeren metin tablo değildir.
  const lines = ["a | b", "c | d"];
  eq("Ayraçsız boru metni tablo değil", findTables(lines).length, 0);
}

console.log("\n=== 4. Hücre aralıkları ===");
{
  const doc = "| Ad | Yaş |\n| --- | --- |\n| Ali | 30 |\n| Ayşe | 25 |";
  const lines = doc.split("\n");
  const block = findTables(lines)[0];
  eq("Başlık satır indeksi (row = -1)", cellLineIndex(block, -1), 0);
  eq("İlk gövde satırı (row = 0)", cellLineIndex(block, 0), 2);
  eq("İkinci gövde satırı (row = 1)", cellLineIndex(block, 1), 3);

  const line = lines[cellLineIndex(block, 1)];
  const r0 = cellRange(line, 0);
  const r1 = cellRange(line, 1);
  eq("0. hücre kaynağı", r0 && line.slice(r0.from, r0.to), " Ayşe ");
  eq("1. hücre kaynağı", r1 && line.slice(r1.from, r1.to), " 25 ");
  check("Olmayan sütun null", cellRange(line, 2) === null);
  check("Negatif sütun null", cellRange(line, -1) === null);

  // Belge kaydırmasına çevrilince gerçekten o hücreyi göstermeli.
  const state = EditorState.create({ doc });
  const base = offsetOfLine(doc, cellLineIndex(block, 0));
  const rr = cellRange(lines[cellLineIndex(block, 0)], 0)!;
  eq(
    "Hücre aralığı belge kaydırmasında doğru",
    state.sliceDoc(base + rr.from, base + rr.to).trim(),
    "Ali"
  );
}
{
  const line = "| a \\| b | c |";
  const r = cellRange(line, 0);
  eq("Kaçışlı boru hücre aralığını bozmaz", r && line.slice(r.from, r.to), " a \\| b ");
}
eq("cellSourceText boruyu kaçışlar", cellSourceText("a|b"), " a\\|b ");
eq("cellSourceText satır sonunu boşluğa çevirir", cellSourceText("a\nb"), " a b ");
eq("cellSourceText CRLF'i de düzler", cellSourceText("a\r\nb"), " a b ");
eq("cellSourceText fazla boşluğu sıkıştırır", cellSourceText("  a    b  "), " a b ");
eq("cellSourceText boş değer", cellSourceText(""), "  ");

console.log("\n=== 5. Satır / sütun ekleme ===");
{
  const doc = "| Ad | Yaş |\n| --- | --- |\n| Ali | 30 |";
  const next = doc + newRowText(2);
  const t = findTables(next.split("\n"))[0];
  eq("Satır ekleyince gövde 2 satır olur", t.rows.length, 2);
  eq("Yeni satır boş hücreli", t.rows[1], ["", ""]);
  eq("Başlık bozulmadı", t.header, ["Ad", "Yaş"]);
  eq("Tablo son satırı güncellendi", t.endLine, 3);
}
{
  // Tek sütunluk tabloya satır ekleme (Math.max(1, cols) korumasını dener).
  const t = findTables(("| a |\n| --- |" + newRowText(1)).split("\n"))[0];
  eq("Tek sütunlu tabloya satır", t.rows, [[""]]);
}
{
  const lines = "| Ad | Yaş |\n| --- | --- |\n| Ali | 30 |".split("\n");
  const next = [
    lines[0] + newColCellText("header"),
    lines[1] + newColCellText("separator"),
    lines[2] + newColCellText("body"),
  ].join("\n");
  const t = findTables(next.split("\n"))[0];
  eq("Sütun ekleyince başlık 3 olur", t.header, ["Ad", "Yaş", "Başlık"]);
  eq("Gövde de 3 hücreli", t.rows[0], ["Ali", "30", ""]);
  check("Ayraç satırı hâlâ geçerli", isSeparator(next.split("\n")[1]), next.split("\n")[1]);
}

console.log("\n=== 6. Belge sonu boş satır garantisi ===");
check("Tabloyla biten belge alt satır ister", needsTrailingBlankLine("| a | b |\n| --- | --- |\n| 1 | 2 |".split("\n")));
check("Zaten boş satırla biten belge istemez", !needsTrailingBlankLine("| a | b |\n| --- | --- |\n| 1 | 2 |\n".split("\n")));
check("Tablodan sonra metin varsa istemez", !needsTrailingBlankLine("| a |\n| --- |\n| 1 |\nSon".split("\n")));
check("Ses embed'iyle biten belge ister", needsTrailingBlankLine(["metin", "![[kayit.flac]]"]));
check("Resim embed'iyle (wiki) biten belge ister", needsTrailingBlankLine(["metin", "![[foto.png]]"]));
check("Boyutlu resim embed'i de ister", needsTrailingBlankLine(["metin", "![[foto.png|300]]"]));
check("Markdown resmiyle biten belge ister", needsTrailingBlankLine(["metin", "![alt](Ekler/foto.png)"]));
check("Düz metinle biten belge istemez", !needsTrailingBlankLine(["metin", "son satır"]));
check("Kod bloğu içindeki tablo satırı alt satır istemez", !needsTrailingBlankLine(["```", "| a |", "| --- |"]));
check("Boş belge istemez", !needsTrailingBlankLine([""]));

check("isBlockEmbedLine: ses", isBlockEmbedLine("![[a.flac]]"));
check("isBlockEmbedLine: resim", isBlockEmbedLine("![[a.jpeg]]"));
check("isBlockEmbedLine: md resmi", isBlockEmbedLine("![](a.webp)"));
check("isBlockEmbedLine: satır içi metinli resim blok değil", !isBlockEmbedLine("bak ![[a.png]] şuna"));
check("isBlockEmbedLine: normal wikilink blok değil", !isBlockEmbedLine("[[Not]]"));
check("isBlockEmbedLine: pdf blok değil", !isBlockEmbedLine("![[dosya.pdf]]"));

{
  const doc = "| a | b |\n| --- | --- |\n| 1 | 2 |";
  const once = ensureTrailingBlankLine(doc);
  const twice = ensureTrailingBlankLine(once);
  eq("ensureTrailingBlankLine tek \\n ekler", once, doc + "\n");
  eq("ensureTrailingBlankLine idempotent (döngüye girmez)", twice, once);
  eq("Alt satır gerekmiyorsa belge değişmez", ensureTrailingBlankLine("düz metin"), "düz metin");
  // Satır eklendikten sonra tablo hâlâ okunabilir olmalı.
  eq("Alt satır tabloyu bozmaz", findTables(once.split("\n"))[0].rows, [["1", "2"]]);
}
{
  // Tablonun sonuna satır eklenince belge yine blokla bitiyor → yeniden alt satır gerekir.
  const doc = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";
  const grown = doc.trimEnd() + newRowText(2);
  check("Satır eklenen tablonun altına yine boş satır gerekir", needsTrailingBlankLine(grown.split("\n")));
  check("Garanti sonrası gerekmez", !needsTrailingBlankLine(ensureTrailingBlankLine(grown).split("\n")));
}

console.log("\n=== 7. Blok ekleme (insertBlock) ===");
const TABLE = "| Başlık | Başlık |\n| --- | --- |\n|  |  |";
{
  const r = applyInsert("", 0, TABLE);
  eq("Boş nota tablo: belge", r.next, TABLE + "\n");
  check("Boş nota tablo: imleç belge içinde", r.inRange, `caret=${r.caret} len=${r.next.length}`);
  eq("Boş nota tablo: imleç tablonun ALTINDAKİ boş satırda", r.caretLine, "");
  eq("Boş nota tablo: imleç son satırda", r.caretLineNo, 4);
  check("Boş nota tablo: belge sonu alt satır garantisi sağlanmış", !needsTrailingBlankLine(r.next.split("\n")));
}
{
  // İmleç tablonun ORTASINDA — blok tablonun içine girmemeli.
  const doc = "| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n";
  const pos = offsetOfLine(doc, 2) + 2; // "| 1 | 2 |" satırının içi
  const r = applyInsert(doc, pos, "---");
  const t = findTables(r.next.split("\n"));
  eq("Tablo içi imleç: tablo tek parça kaldı", t.length, 1);
  eq("Tablo içi imleç: tablo satırları bozulmadı", t[0].rows, [["1", "2"], ["3", "4"]]);
  eq("Tablo içi imleç: blok tablodan SONRA eklendi", r.next.split("\n")[5], "---");
  eq("Tablo içi imleç: imleç bloğun altındaki boş satırda", r.caretLine, "");
  check("Tablo içi imleç: imleç bloktan sonra", r.caret > r.next.indexOf("---"));
}
{
  // İmleç tablonun başlık satırında.
  const doc = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";
  const r = applyInsert(doc, 1, TABLE);
  const t = findTables(r.next.split("\n"));
  eq("Başlıkta imleç: iki ayrı tablo oluştu", t.map((x) => [x.headerLine, x.endLine]), [[0, 2], [4, 6]]);
  eq("Başlıkta imleç: ilk tablo korundu", t[0].rows, [["1", "2"]]);
}
{
  // Dolu paragrafın ortasında — paragraf ikiye bölünmemeli.
  const doc = "bir\niki\nüç\n\nsonra\n";
  const r = applyInsert(doc, offsetOfLine(doc, 1) + 1, "---");
  const lines = r.next.split("\n");
  eq("Paragraf içi imleç: paragraf bölünmedi", lines.slice(0, 3), ["bir", "iki", "üç"]);
  eq("Paragraf içi imleç: blok paragrafın sonunda", lines[4], "---");
  eq("Paragraf içi imleç: önünde boş satır var", lines[3], "");
  eq("Paragraf içi imleç: sonraki paragraf korundu", lines[6], "sonra");
}
{
  // Paragrafı bir tablo takip ediyorsa blok araya girmeli, tabloyu yutmamalı.
  const doc = "metin\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";
  const r = applyInsert(doc, 0, "---");
  const lines = r.next.split("\n");
  eq("Paragraf+tablo: blok metnin hemen altında", lines[2], "---");
  const t = findTables(lines);
  eq("Paragraf+tablo: tablo sağlam", t.length === 1 && t[0].rows, [["1", "2"]]);
}
{
  // İmleç kod bloğunun içinde — yeni blok çitlerin arasına düşmemeli.
  const doc = "```js\nkod satırı\n```\n";
  const r = applyInsert(doc, offsetOfLine(doc, 1) + 2, "---");
  const lines = r.next.split("\n");
  eq("Kod bloğu içi imleç: çitler bozulmadı", lines.slice(0, 3), ["```js", "kod satırı", "```"]);
  eq("Kod bloğu içi imleç: blok çitten sonra", lines[4], "---");
  eq("Kod bloğu içi imleç: fence hâlâ tek blok", findFenceBlocks(lines), [{ start: 0, end: 2 }]);
}
{
  // Art arda iki tablo — ilkinin içindeyken blok ikisinin arasına girmeli.
  const doc = "| a | b |\n| --- | --- |\n| 1 | 2 |\n\n| c | d |\n| --- | --- |\n| 3 | 4 |\n";
  const r = applyInsert(doc, offsetOfLine(doc, 1), "---");
  const t = findTables(r.next.split("\n"));
  eq("İki tablo: ikisi de sağlam", t.map((x) => x.rows), [[["1", "2"]], [["3", "4"]]]);
  eq("İki tablo: blok aralarında", r.next.split("\n")[4], "---");
  eq("İki tablo: imleç boş satırda", r.caretLine, "");
}
{
  // Alttaki satır zaten boşsa fazladan boş satır açılmamalı.
  const doc = "metin\n\nsonra\n";
  const r = applyInsert(doc, 0, "---");
  eq("Alt satır boşsa fazladan satır açılmaz", r.next, "metin\n\n---\n\nsonra\n");
  eq("İmleç var olan boş satıra gider", r.caretLine, "");
  eq("İmleç satır numarası", r.caretLineNo, 4);
}
{
  // Kod bloğu komutu — imleç çitlerin arasındaki boş satıra (caretIn = 4).
  const r = applyInsert("", 0, "```\n\n```", 4);
  eq("Kod bloğu: belge", r.next, "```\n\n```\n");
  eq("Kod bloğu: imleç çitlerin arasında", r.caretLineNo, 2);
  eq("Kod bloğu: imleç satırı boş", r.caretLine, "");
}
{
  const r = applyInsert("metin\n", 0, "```\n\n```", 4);
  eq("Kod bloğu (dolu belge): imleç çitler arasında", r.caretLineNo, 4);
  eq("Kod bloğu (dolu belge): satır boş", r.caretLine, "");
  eq("Kod bloğu (dolu belge): çitler yerinde", findFenceBlocks(r.next.split("\n")), [{ start: 2, end: 4 }]);
}
{
  // Callout — imleç "> " işaretinden sonraya (caretIn = 12).
  const r = applyInsert("", 0, "> [!note]\n> ", 12);
  eq("Callout: imleç '> ' sonrası", r.caret, 12);
  eq("Callout: imleç ikinci satırda", r.caretLineNo, 2);
}
{
  // Sınır: pos belge sonundan büyük / negatif olsa da plan geçerli kalmalı.
  const doc = "metin\n";
  const over = applyInsert(doc, 9999, "---");
  check("pos belge dışında: imleç geçerli", over.inRange, `caret=${over.caret} len=${over.next.length}`);
  const under = applyInsert(doc, -5, "---");
  check("pos negatif: imleç geçerli", under.inRange, `caret=${under.caret} len=${under.next.length}`);
  eq("pos negatif ilk satır gibi davranır", lineIndexOf(under.next, under.caret), 3);
}
{
  // Her senaryoda imleç belge sınırları içinde kalmalı.
  const docs = ["", "\n", "metin", "metin\n", TABLE, TABLE + "\n", "```\nkod\n```", "# Başlık\n\nmetin\n"];
  let ok = true;
  const bad: string[] = [];
  for (const d of docs) {
    for (let p = 0; p <= d.length; p++) {
      for (const [txt, ci] of [["---", undefined], ["```\n\n```", 4]] as [string, number | undefined][]) {
        const r = applyInsert(d, p, txt, ci);
        if (!r.inRange) {
          ok = false;
          bad.push(`doc=${JSON.stringify(d)} pos=${p}`);
        }
      }
    }
  }
  check("Tüm pozisyonlarda imleç belge içinde", ok, bad.slice(0, 3).join(" | "));
}

console.log("\n=== 8. Not açılış imleci (firstSectionCaret) ===");
eq("Boş belge → 0", firstSectionCaret(""), 0);
eq("Başlıksız belge → metin sonu", firstSectionCaret("sadece metin"), 12);
eq("Yalnız H1 varsa (## yok) → metin sonu", firstSectionCaret("# Başlık\nmetin"), 14);
{
  const doc = "# Günlük\n\n## Ephemeral Notlar\n\nİlk satır\n\n## Görevler\n- [ ] a\n";
  const c = firstSectionCaret(doc);
  check("Dolu bölüm: imleç son dolu satırın sonunda", doc.slice(0, c).endsWith("İlk satır"), JSON.stringify(doc.slice(c - 12, c)));
  check("Dolu bölüm: sonraki başlığa taşmadı", c < doc.indexOf("## Görevler"));
}
{
  const doc = "## Notlar\n\n## Diğer\n";
  const c = firstSectionCaret(doc);
  eq("Boş bölüm: imleç başlığın altındaki boş satırda", c, 10);
  eq("Boş bölüm: o satır gerçekten boş", EditorState.create({ doc }).doc.lineAt(c).text, "");
}
{
  const doc = "## Notlar\n## Diğer\n";
  eq("Başlık hemen ardından başlık: imleç başlık satırının sonunda", firstSectionCaret(doc), 9);
}
{
  const doc = "metin\n## Notlar";
  eq("Başlık son satırsa: imleç satır sonunda", firstSectionCaret(doc), doc.length);
}
{
  const doc = "```\n## Sahte\n```\n\n## Gerçek\nveri\n";
  const c = firstSectionCaret(doc);
  check("Kod bloğundaki ## başlık sayılmaz", doc.slice(0, c).endsWith("veri"), JSON.stringify(doc.slice(0, c)));
}
{
  const doc = "## Notlar\n\nbir\n\niki\n\n\n";
  const c = firstSectionCaret(doc);
  check("Bölüm sonundaki boş satırlar atlanır", doc.slice(0, c).endsWith("iki"), JSON.stringify(doc.slice(0, c)));
}
{
  const doc = "## Notlar\n\nbir\n### Alt başlık\niki\n";
  const c = firstSectionCaret(doc);
  check("Alt başlık (###) bölümü bitirir", doc.slice(0, c).endsWith("bir"), JSON.stringify(doc.slice(0, c)));
}
{
  // Sınır: her belge için imleç geçerli olmalı.
  const docs = [
    "",
    "\n",
    "##",
    "## ",
    "## A",
    "## A\n",
    "## A\n\n",
    "#\n## A\n",
    "```\n## A",
    "## A\n```\n## B\n```\n",
    "metin\n\n\n",
  ];
  let ok = true;
  const bad: string[] = [];
  for (const d of docs) {
    const c = firstSectionCaret(d);
    if (!Number.isInteger(c) || c < 0 || c > d.length) {
      ok = false;
      bad.push(`${JSON.stringify(d)} → ${c}`);
    }
  }
  check("firstSectionCaret her belgede geçerli kaydırma döner", ok, bad.join(" | "));
}

console.log("\n=== 9. Uçtan uca: tablo ekle → satır ekle → alt satıra in ===");
{
  // Kullanıcı senaryosu: boş nota tablo ekle, satır ekle, tablonun altına yaz.
  let doc = "";
  const ins = computeBlockInsert(doc, 0, TABLE);
  doc = doc.slice(0, ins.from) + ins.insert + doc.slice(ins.from);
  let caret = ins.caret;
  check("1) Tablo eklendi, imleç altta", EditorState.create({ doc }).doc.lineAt(caret).text === "");

  // Tabloya satır ekle (tableWidget'ın yaptığı gibi blok sonuna newRowText).
  const block = findTables(doc.split("\n"))[0];
  const endOffset = offsetOfLine(doc, block.endLine) + doc.split("\n")[block.endLine].length;
  doc = doc.slice(0, endOffset) + newRowText(block.header.length) + doc.slice(endOffset);
  const t2 = findTables(doc.split("\n"))[0];
  eq("2) Satır eklendi", t2.rows.length, 2);
  check("2) Belge hâlâ boş satırla bitiyor", !needsTrailingBlankLine(doc.split("\n")), JSON.stringify(doc.slice(-6)));

  // Tablonun altındaki satıra yaz.
  const below = offsetOfLine(doc, t2.endLine + 1);
  doc = doc.slice(0, below) + "tablo altı metin" + doc.slice(below);
  const t3 = findTables(doc.split("\n"))[0];
  eq("3) Alt satıra yazınca tablo bozulmadı", t3.rows, [["", ""], ["", ""]]);
  check("3) Metin tablonun altında", doc.split("\n")[t3.endLine + 1] === "tablo altı metin", JSON.stringify(doc));
  check("3) Artık alt satır gerekmiyor", !needsTrailingBlankLine(doc.split("\n")));
}

console.log(`\n${fails === 0 ? "✅ TÜM TESTLER GEÇTİ" : `❌ ${fails} test başarısız`}`);
process.exit(fails === 0 ? 0 : 1);

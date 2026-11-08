// Salt okunur SQLite çözücü testi (LOM-95): başlık, tablo listesi, satırlar, tipler, taşma
// sayfası, çok sayfalı tablo, INTEGER PRIMARY KEY takma adı, bozuk dosya korumaları.
// Fikstür: src/core/__test__/fixtures/kobo-sample.sqlite (scripts/fixtures/kobo-sample.sql'den).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openSqlite, parseCreateTable, sqlCol, SqliteError } from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
function throws(fn: () => unknown, re?: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return !re || re.test(String((e as Error).message));
  }
}

const bytes = new Uint8Array(readFileSync(join(process.cwd(), "src/core/__test__/fixtures/kobo-sample.sqlite")));
check("fikstür 1024 bayt sayfalı", bytes[16] === 4 && bytes[17] === 0);

const db = openSqlite(bytes);
const tables = db.tables();
check("tablo listesi (indeksler yok)", tables.join(",") === "content,Bookmark,loomen_types,garip ad", tables.join(","));

// ─── Çok sayfalı tablo (iç sayfa) ───
const content = db.rows("content");
check("content bütün satırlar (iç sayfa)", content.length === 124, String(content.length));
const rootPage = bytes[(2 - 1) * 1024];
check("content kökü iç sayfa", rootPage === 0x05, String(rootPage));
check("content Türkçe metin", content[0].Title === "Kürk Mantolu Madonna" && content[0].Attribution === "Sabahattin Ali");
check("content ilk sütun anahtarı", typeof content[0].ContentID === "string" && (content[0].ContentID as string).endsWith(".kepub.epub"));
check("dolgu sırası korunur", content[123].Title === "Dolgu bölümü numara 120 — biraz uzun bir başlık");
check("tablo adı büyük/küçük harfe duyarsız", db.rows("CONTENT").length === 124 && db.rows("bookmark").length === 51);

// ─── Taşma sayfası ───
const bm = db.rows("Bookmark");
const long = bm.find((r) => r.BookmarkID === "b3");
const lt = typeof long?.Text === "string" ? long.Text : "";
check("taşma sayfalı uzun metin tam döner", lt.length > 3000 && lt.startsWith("Uzun bir alıntı: Çiğdem") && lt.endsWith("sis vardı."), String(lt.length));
check("uzun metin tekrarları sağlam", lt.split("Uzun bir alıntı").length - 1 === 30);
check("sqlCol duyarsız", sqlCol(bm[0], "bookmarkid") === "b1" && sqlCol(bm[0], "yok") === undefined);
check("ondalık sütun", bm[0].ChapterProgress === 0.5);
check("NULL sütun", bm[0].Annotation === null);

// ─── Tipler ───
const ty = db.rows("loomen_types");
const byId = new Map(ty.map((r) => [r.id, r]));
check("INTEGER PRIMARY KEY rowid'den dolar", ty.map((r) => r.id).join(",") === "1,2,3,4,5,6,7,8,9,1000,1001", ty.map((r) => r.id).join(","));
check("1 bayt tamsayı", byId.get(1)?.i1 === 100);
check("2 bayt tamsayı", byId.get(2)?.i1 === 1000);
check("3 bayt tamsayı", byId.get(3)?.i1 === 100000);
check("4 bayt tamsayı", byId.get(4)?.i1 === 100000000);
check("6 bayt tamsayı", byId.get(5)?.i1 === 100000000000);
check("8 bayt tamsayı", byId.get(6)?.i1 === 9007199254740991);
check("eksi tamsayı", byId.get(7)?.i1 === -5 && byId.get(8)?.i1 === -300000 && byId.get(1001)?.i1 === -1);
check("0 ve 1 sabitleri", byId.get(9)?.i1 === 0 && byId.get(1000)?.i1 === 1);
check("ondalık", byId.get(1)?.f === 3.25 && byId.get(2)?.f === -0.5);
const blob = byId.get(1)?.b;
check("blob", blob instanceof Uint8Array && [...blob].join(",") === "0,255,16");
const empty = byId.get(2)?.b;
check("boş blob", empty instanceof Uint8Array && empty.length === 0);
check("null ve boş metin", byId.get(1)?.n === null && byId.get(3)?.n === "" && byId.get(2)?.n === "metin");
check("sonradan eklenen sütun eski satırda null", byId.get(1)?.extra === null && byId.get(1001)?.extra === "son");

const odd = db.rows("garip ad");
check("tırnaklı ad ve virgüllü sütun adı", odd.length === 1 && odd[0]["sütun, virgüllü"] === "değer" && odd[0]["köşeli"] === 42 && odd[0].ters === "x", JSON.stringify(odd[0]));

// ─── CREATE TABLE ───
const t1 = parseCreateTable('CREATE TABLE t (a INTEGER PRIMARY KEY, "b c" TEXT, PRIMARY KEY (x), UNIQUE (b))');
check("sütunlar ve takma ad", t1.columns.join("|") === "a|b c" && t1.rowidAlias === 0);
const t2 = parseCreateTable("CREATE TABLE t (k TEXT, id INTEGER, v BLOB, PRIMARY KEY (id))");
check("tablo düzeyinde INTEGER PRIMARY KEY", t2.rowidAlias === 1);
check("INT takma ad değil", parseCreateTable("CREATE TABLE t (id INT PRIMARY KEY)").rowidAlias === -1);
check("WITHOUT ROWID hata", throws(() => parseCreateTable("CREATE TABLE t (a TEXT PRIMARY KEY) WITHOUT ROWID"), /WITHOUT ROWID/));
check("tablo bulunamazsa hata", throws(() => db.rows("yok"), /tablo yok/));

// ─── Bozuk dosyalar ───
check("SQLite olmayan dosya hata", throws(() => openSqlite(new TextEncoder().encode("merhaba dünya, bu bir metin dosyası ".repeat(5))), /SQLite dosyası değil/));
check("çok kısa dosya hata", throws(() => openSqlite(bytes.slice(0, 50))));
check("hepsi SqliteError", (() => {
  try {
    openSqlite(new Uint8Array(10));
  } catch (e) {
    return e instanceof SqliteError;
  }
  return false;
})());
check("kesik dosya hata (sayfa dışı)", throws(() => openSqlite(bytes.slice(0, 1024 * 3)).rows("content"), /bozuk dosya/));
{
  const bad = bytes.slice();
  bad[16] = 0;
  bad[17] = 100; // sayfa boyutu 100
  check("geçersiz sayfa boyutu hata", throws(() => openSqlite(bad), /sayfa boyutu/));
}
{
  const bad = bytes.slice();
  bad[59] = 2; // UTF-16le
  check("UTF-16 desteklenmez", throws(() => openSqlite(bad), /UTF-8/));
}
{
  // content kök sayfasının sağ işaretçisini kendisine çevir → döngü.
  const bad = bytes.slice();
  const base = 1024;
  bad[base + 8] = 0;
  bad[base + 9] = 0;
  bad[base + 10] = 0;
  bad[base + 11] = 2;
  check("sayfa döngüsü hata", throws(() => openSqlite(bad).rows("content"), /döngü/));
}
{
  // content kök sayfasının sağ işaretçisini dosya dışına çevir.
  const bad = bytes.slice();
  const base = 1024;
  bad[base + 8] = 0;
  bad[base + 9] = 0xff;
  bad[base + 10] = 0;
  bad[base + 11] = 0;
  check("sınır dışı işaretçi hata", throws(() => openSqlite(bad).rows("content"), /dışında/));
}
{
  // Tablo ağacında indeks sayfası türü.
  const bad = bytes.slice();
  bad[1024] = 0x02;
  check("yanlış sayfa türü hata", throws(() => openSqlite(bad).rows("content"), /sayfa türü/));
}
check("özgün baytlar değişmedi", openSqlite(bytes).rows("content").length === 124);

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nSQLite çözücü testleri geçti");

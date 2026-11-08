// KOReader çizimlerini içe aktarma testi (LOM-94): Lua kitap-yanı dosyası (yeni ve eski düzen),
// JSON dışa aktarma, kimlikler, tekrarsız ve artımlı alım, not biçimi.
import {
  applyKoreaderBook,
  blockIds,
  bookNoteTemplate,
  decodeBook,
  encodeBook,
  insertHighlightBlock,
  kindleBookHash,
  koreaderBookHash,
  koreaderColor,
  koreaderHighlightId,
  newBook,
  parseKoreaderDate,
  parseKoreaderFile,
  parseKoreaderJson,
  parseKoreaderLua,
  updateHighlightBlock,
  type Book,
  type KoreaderBook,
} from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const NOW = 1_800_000_000_000;

// Yeni düzen (annotations) — KOReader'ın yazdığı biçimde (dump.lua, %q kaçışları).
const NEW_LUA = `-- we can read Lua syntax here!
return {
    ["annotations"] = {
        [1] = {
            ["chapter"] = "Birinci Bölüm",
            ["color"] = "yellow",
            ["datetime"] = "2024-05-01 10:00:00",
            ["drawer"] = "lighten",
            ["page"] = "/body/DocFragment[3]/body/p[5]/text().0",
            ["pageno"] = 12,
            ["pos0"] = "/body/DocFragment[3]/body/p[5]/text().0",
            ["pos1"] = "/body/DocFragment[3]/body/p[5]/text().40",
            ["text"] = "Korku zihni öldürendir.",
        },
        [2] = {
            ["datetime"] = "2024-05-01 10:05:00",
            ["page"] = "/body/DocFragment[4]/body/p[1]/text().0",
            ["pageno"] = 20,
            ["text"] = "Sayfa 20",
        },
        [3] = {
            ["chapter"] = "İkinci Bölüm",
            ["color"] = "green",
            ["datetime"] = "2024-05-02 08:30:15",
            ["drawer"] = "lighten",
            ["note"] = "Şu \\"tırnaklı\\" not\\
ikinci satır",
            ["page"] = "/body/DocFragment[5]/body/p[2]/text().3",
            ["pageno"] = 31,
            ["pos0"] = "/body/DocFragment[5]/body/p[2]/text().3",
            ["pos1"] = "/body/DocFragment[5]/body/p[2]/text().60",
            ["text"] = "Çok satırlı\\
alıntı \\195\\182rnek",
        },
        [4] = {
            ["datetime"] = "2024-05-01 09:00:00",
            ["pageno"] = 5,
            ["pos0"] = "/body/DocFragment[2]/body/p[1]/text().0",
            ["pos1"] = "/body/DocFragment[2]/body/p[1]/text().9",
            ["color"] = "purple",
            ["text"] = "Baştaki çizim",
        },
    },
    ["doc_pages"] = 300,
    ["doc_path"] = "/mnt/onboard/Books/Dune.epub",
    ["doc_props"] = {
        ["authors"] = "Frank Herbert\\
Brian Herbert",
        ["language"] = "tr",
        ["title"] = "Dune",
    },
    ["percent_finished"] = 0.25,
}
`;

// Eski düzen (highlight + bookmarks) — 2024 öncesi KOReader.
const OLD_LUA = `-- /mnt/onboard/Books/Tutunamayanlar.epub
return {
    ["bookmarks"] = {
        [1] = {
            ["datetime"] = "2020-03-01 21:00:00",
            ["highlighted"] = true,
            ["notes"] = "Ben kimim?",
            ["page"] = "/body/DocFragment[2]/body/p[1]/text().0",
            ["pos0"] = "/body/DocFragment[2]/body/p[1]/text().0",
            ["pos1"] = "/body/DocFragment[2]/body/p[1]/text().10",
            ["text"] = "Sayfa 45 Ben kimim? @ 2020-03-01 21:00:00",
        },
        [2] = {
            ["datetime"] = "2020-03-01 21:10:00",
            ["highlighted"] = true,
            ["notes"] = "Tutunamamak bir sanattır.",
            ["page"] = "/body/DocFragment[3]/body/p[4]/text().0",
            ["pos0"] = "/body/DocFragment[3]/body/p[4]/text().0",
            ["pos1"] = "/body/DocFragment[3]/body/p[4]/text().25",
            ["text"] = "Benim notum burada",
        },
        [3] = {
            ["datetime"] = "2020-03-02 09:00:00",
            ["notes"] = "Sayfa 80",
            ["page"] = "/body/DocFragment[5]/body/p[1]/text().0",
            ["text"] = "",
        },
    },
    ["doc_props"] = {
        ["authors"] = "Oğuz Atay",
        ["title"] = "",
    },
    ["highlight"] = {
        [45] = {
            [1] = {
                ["chapter"] = "1",
                ["datetime"] = "2020-03-01 21:00:00",
                ["drawer"] = "lighten",
                ["pos0"] = "/body/DocFragment[2]/body/p[1]/text().0",
                ["pos1"] = "/body/DocFragment[2]/body/p[1]/text().10",
                ["text"] = "Ben kimim?",
            },
        },
        [50] = {
            [1] = {
                ["datetime"] = "2020-03-01 21:10:00",
                ["drawer"] = "lighten",
                ["pos0"] = "/body/DocFragment[3]/body/p[4]/text().0",
                ["pos1"] = "/body/DocFragment[3]/body/p[4]/text().25",
                ["text"] = "Tutunamamak bir sanattır.",
            },
        },
    },
}
`;

// ─── Yardımcılar ───
check("renk eşlemesi", koreaderColor("yellow") === "yellow" && koreaderColor("orange") === "yellow" && koreaderColor("Green") === "green" && koreaderColor("olive") === "green" && koreaderColor("cyan") === "blue" && koreaderColor("blue") === "blue" && koreaderColor("red") === "pink" && koreaderColor("purple") === "pink" && koreaderColor("gray") === "yellow" && koreaderColor(undefined) === "yellow");
check("tarih", parseKoreaderDate("2024-05-01 10:00:00") === new Date(2024, 4, 1, 10, 0, 0).getTime());
check("bozuk tarih", parseKoreaderDate("2024-13-01 10:00:00") === undefined && parseKoreaderDate("dün") === undefined && parseKoreaderDate(5) === undefined);

// ─── Yeni düzen ───
const gNew = parseKoreaderLua(NEW_LUA, "/mnt/onboard/Books/Dune.sdr/metadata.epub.lua");
const dune = gNew.books[0];
check("yeni düzen: tek kitap", gNew.books.length === 1);
check("yeni düzen: başlık ve yazarlar", dune.title === "Dune" && dune.author === "Frank Herbert, Brian Herbert", `${dune.title} / ${dune.author}`);
check("yeni düzen: yer imi atlanır ve sayılır", dune.highlights.length === 3 && gNew.skipped === 1);
check("yeni düzen: sayfa sırası", dune.highlights.map((h) => h.page).join(",") === "5,12,31");
const d12 = dune.highlights.find((h) => h.page === 12)!;
check("yeni düzen: alanlar", d12.text === "Korku zihni öldürendir." && d12.chapter === "Birinci Bölüm" && d12.color === "yellow" && d12.addedAt === new Date(2024, 4, 1, 10, 0, 0).getTime() && d12.pos0 === "/body/DocFragment[3]/body/p[5]/text().0" && d12.pos1?.endsWith("().40") === true);
const d31 = dune.highlights.find((h) => h.page === 31)!;
check("yeni düzen: kaçışlı metin ve UTF-8 bayt", d31.text === "Çok satırlı\nalıntı örnek", JSON.stringify(d31.text));
check("yeni düzen: kaçışlı not", d31.note === 'Şu "tırnaklı" not\nikinci satır' && d31.color === "green");
check("yeni düzen: mor → pembe", dune.highlights[0].color === "pink");

// PDF: pos0 tablo, page sayı.
{
  const PDF = `return { ["annotations"] = { { ["pos0"] = { ["page"] = 3, ["x"] = 10, ["y"] = 20 }, ["pos1"] = { ["page"] = 3, ["x"] = 90, ["y"] = 30 }, ["page"] = 3, ["text"] = "pdf alıntı" } }, ["doc_props"] = { ["title"] = "Rapor" } }`;
  const g = parseKoreaderLua(PDF);
  const h = g.books[0]?.highlights[0];
  check("PDF: sayfa sayıdan, tablo konum yazılmaz", !!h && h.page === 3 && h.pos0 === undefined && h.text === "pdf alıntı");
}

// ─── Eski düzen ───
const gOld = parseKoreaderLua(OLD_LUA, "/mnt/onboard/Books/Tutunamayanlar.sdr/metadata.epub.lua");
const tut = gOld.books[0];
check("eski düzen: başlık boşsa .sdr klasör adından", tut?.title === "Tutunamayanlar" && tut.author === "Oğuz Atay", tut?.title);
check("eski düzen: iki çizim sayfa sırasıyla", tut.highlights.map((h) => `${h.page}:${h.text}`).join("|") === "45:Ben kimim?|50:Tutunamamak bir sanattır.");
check("eski düzen: otomatik yer imi metni not sayılmaz", tut.highlights[0].note === undefined);
check("eski düzen: kullanıcı notu bağlanır", tut.highlights[1].note === "Benim notum burada");
check("eski düzen: çizimsiz yer imi atlanır", gOld.skipped === 1);
check("eski düzen: bölüm", tut.highlights[0].chapter === "1");
{
  const noProps = parseKoreaderLua(`return { ["doc_path"] = "/sd/Kitaplar/Saatleri_Ayarlama.epub", ["highlight"] = { [2] = { { ["text"] = "a", ["datetime"] = "2020-01-01 00:00:00" } } } }`);
  check("başlık doc_path'ten", noProps.books[0]?.title === "Saatleri Ayarlama");
  const nothing = parseKoreaderLua(`return { ["highlight"] = { [2] = { { ["text"] = "a" } } } }`);
  check("hiç başlık yoksa KOReader", nothing.books[0]?.title === "KOReader");
}
check("bozuk Lua boş liste", parseKoreaderLua("return { a = ").books.length === 0);
check("çizimsiz dosya boş liste", parseKoreaderLua(`return { ["doc_props"] = { ["title"] = "X" } }`).books.length === 0);
check("Lua içinde kod çalışmaz", parseKoreaderLua(`return { ["doc_props"] = { ["title"] = os.getenv("HOME") } }`).books.length === 0);

// ─── JSON dışa aktarma ───
const JSON_ONE = JSON.stringify({
  title: "Dune",
  author: "Frank Herbert\nBrian Herbert",
  file: "/mnt/onboard/Books/Dune.epub",
  number_of_pages: 300,
  entries: [
    { page: 31, time: 1714635015, sort: "highlight", drawer: "lighten", color: "green", chapter: "İkinci Bölüm", text: "Çok satırlı\nalıntı örnek", note: 'Şu "tırnaklı" not\nikinci satır' },
    { page: 13, time: 1714546800, sort: "highlight", drawer: "lighten", chapter: "Birinci Bölüm", text: "Korku zihni öldürendir." },
    { page: 9, time: 1714546800, sort: "highlight", text: "" },
  ],
});
const jOne = parseKoreaderJson(JSON_ONE);
check("JSON tek kitap", jOne.books.length === 1 && jOne.books[0].title === "Dune" && jOne.books[0].author === "Frank Herbert, Brian Herbert");
check("JSON sayfa sırası ve boş metin atlanır", jOne.books[0].highlights.map((h) => h.page).join(",") === "13,31" && jOne.skipped === 1);
check("JSON alanlar", jOne.books[0].highlights[0].addedAt === 1714546800000 && jOne.books[0].highlights[1].note === 'Şu "tırnaklı" not\nikinci satır' && jOne.books[0].highlights[1].color === "green" && jOne.books[0].highlights[1].chapter === "İkinci Bölüm");
const JSON_MANY = "﻿" + JSON.stringify([
  JSON.parse(JSON_ONE),
  { title: "Sapiens", author: "Yuval Noah Harari", entries: [{ page: 3, time: 1700000000, text: "Buğdayı biz evcilleştirmedik." }] },
  { title: "Boş", entries: [] },
  { title: "Dune", author: "Frank Herbert\nBrian Herbert", entries: [{ page: 12, text: "Korku zihni öldürendir.", note: "sonradan" }, { page: 40, text: "Yeni çizim" }] },
]);
const jMany = parseKoreaderJson(JSON_MANY);
check("JSON dizi: çizimli kitaplar sırayla", jMany.books.map((b) => b.title).join(",") === "Dune,Sapiens", jMany.books.map((b) => b.title).join(","));
check("JSON dizi: aynı kitap birleşir, alıntı tekil", jMany.books[0].highlights.map((h) => h.page).join(",") === "13,31,40");
check("JSON dizi: tekrar eden alıntıya not işlenir", jMany.books[0].highlights[0].note === "sonradan");
check("bozuk JSON boş liste", parseKoreaderJson("{ bozuk").books.length === 0 && parseKoreaderJson("42").books.length === 0);
check("JSON: notlu çizim (sort note) alınır", parseKoreaderJson(JSON.stringify({ title: "X", entries: [{ page: 1, sort: "note", text: "alıntı", note: "n" }] })).books[0]?.highlights[0]?.note === "n");
{
  const OLD_SWAP = `return { ["doc_props"] = { ["title"] = "Y" }, ["highlight"] = { [3] = { { ["datetime"] = "2020-01-01 10:00:00", ["text"] = "Aynı alıntı" } } }, ["bookmarks"] = { { ["datetime"] = "2020-01-01 10:00:00", ["highlighted"] = true, ["notes"] = "Page 3 Ch @ 2020-01-01 10:00:00", ["text"] = "Aynı alıntı" } } }`;
  check("eski düzen: alıntıyla aynı yer imi metni not sayılmaz", parseKoreaderLua(OLD_SWAP).books[0]?.highlights[0]?.note === undefined);
}
check("JSON: yer imi girdisi atlanır", parseKoreaderJson(JSON.stringify({ title: "X", entries: [{ page: 1, sort: "bookmark", text: "Sayfa 1" }] })).skipped === 1);

// ─── Biçim seçimi ───
check("dosya seçimi: JSON", parseKoreaderFile(JSON_ONE, "/x/Dune.json").books[0]?.highlights.length === 2);
check("dosya seçimi: Lua", parseKoreaderFile(NEW_LUA, "/x/Dune.sdr/metadata.epub.lua").books[0]?.highlights.length === 3);
check("dosya seçimi: tanınmayan metin boş", parseKoreaderFile("Bu bir Markdown dışa aktarımı\n# Dune", "/x/dune.md").books.length === 0);
check("dosya seçimi: { ile başlayan Lua tablosu", parseKoreaderFile(`{ ["annotations"] = { { ["pos0"] = "a", ["pageno"] = 2, ["text"] = "t" } } }`, "/x/metadata.pdf.lua").books.length === 1);

// ─── Kimlikler ───
const hDune = await koreaderBookHash("Dune", "Frank Herbert, Brian Herbert");
check("kitap özeti 64 hane", /^[0-9a-f]{64}$/.test(hDune));
check("özet büyük/küçük harf ve boşluktan bağımsız", (await koreaderBookHash(" DUNE ", "frank  herbert, brian herbert")) === hDune);
check("Kindle özetiyle çakışmaz", (await kindleBookHash("Dune", "Frank Herbert, Brian Herbert")) !== hDune);
check("Lua ve JSON aynı kitabı verir", gNew.books[0].key === jOne.books[0].key);
const id1 = await koreaderHighlightId({ text: "Korku zihni öldürendir." });
check("çizim kimliği biçimi", /^o[0-9a-f]{10}$/.test(id1));
check("çizim kimliği boşluk ve satır sonundan bağımsız", (await koreaderHighlightId({ text: "  Korku zihni\nöldürendir. " })) === id1);
check("çizim kimliğine sayfa girmez (Lua ve JSON eşleşir)", (await koreaderHighlightId(gNew.books[0].highlights[1])) === (await koreaderHighlightId(jOne.books[0].highlights[0])));

// ─── Kayda işleme ───
const note = (b: Book) => bookNoteTemplate(b);
const r1 = await applyKoreaderBook(null, dune, NOW, { hash: hDune, notePath: "Kütüphane/Dune.md" });
check("yeni kayıt", r1.created && r1.book.format === "koreader" && r1.book.size === 0 && r1.book.fileName === "" && r1.book.title === "Dune" && r1.book.author === "Frank Herbert, Brian Herbert");
check("kayıt kimliği özetten", r1.book.id === hDune.slice(0, 16));
check("bütün çizimler eklenir", r1.added.length === 3 && r1.book.highlights.length === 3 && r1.same === 0);
check("çizimler sayfa sırasıyla", r1.book.highlights.map((h) => (h.anchor.kind === "koreader" ? h.anchor.page : 0)).join(",") === "5,12,31");
check("çıpa KOReader konumunu taşır", r1.book.highlights[1].anchor.kind === "koreader" && r1.book.highlights[1].anchor.pos0 === d12.pos0);
check("renk, bölüm ve not taşınır", r1.book.highlights[2].color === "green" && r1.book.highlights[2].chapter === "İkinci Bölüm" && r1.book.highlights[2].note === d31.note);
check("oluşma anı KOReader'dan, güncelleme anı alım anı", r1.added.every((h) => h.updatedAt === NOW && h.createdAt < NOW));
const dec = decodeBook(encodeBook(r1.book));
check("kayıt yaz-oku", !!dec && encodeBook(dec) === encodeBook(r1.book));

const n1 = note(r1.book);
check("notta KOReader kaynak satırı, Kitabı aç yok", n1.includes("\n*KOReader*\n") && !n1.includes("Kitabı aç"));
check("notta sayfa etiketi", n1.includes(`🟨 [s. 12](loomen://book/${r1.book.id}?hl=${id1})`));
check("not blokları kitap sırasıyla", blockIds(n1).join(",") === r1.book.highlights.map((h) => h.id).join(","));

// İkinci alım: aynı dosya → değişiklik yok.
const r2 = await applyKoreaderBook(r1.book, parseKoreaderLua(NEW_LUA).books[0], NOW + 1000);
check("aynı dosya: yeni çizim yok", r2.added.length === 0 && r2.updated.length === 0 && r2.same === 3);
check("aynı dosya: kayıt nesnesi aynı (yazım yok)", r2.book === r1.book);
check("aynı dosya: not aynı", note(r2.book) === n1);
// JSON ile aynı kitap: sayfa farklı olsa da tekrar yok.
const r2j = await applyKoreaderBook(r1.book, jOne.books[0], NOW + 1500);
check("JSON ile yeniden alım tekrar etmez", r2j.added.length === 0 && r2j.book === r1.book);

// Artımlı: yeni çizim + var olan çizime not.
const NEW_LUA2 = NEW_LUA.replace(
  `            ["text"] = "Korku zihni öldürendir.",`,
  `            ["note"] = "Sonradan yazılan not",\n            ["text"] = "Korku zihni öldürendir.",`,
).replace(
  `        [4] = {`,
  `        [5] = {\n            ["datetime"] = "2024-06-01 12:00:00",\n            ["pageno"] = 20,\n            ["pos0"] = "/body/DocFragment[4]/body/p[3]/text().0",\n            ["text"] = "Arada yeni çizim",\n        },\n        [4] = {`,
);
const g3 = parseKoreaderLua(NEW_LUA2);
check("değişen dosya ayrışır", g3.books[0].highlights.length === 4, String(g3.books[0].highlights.length));
const t3 = NOW + 2000;
const r3 = await applyKoreaderBook(r1.book, g3.books[0], t3);
check("artımlı: yalnız yeni çizim eklenir", r3.added.length === 1 && r3.added[0].text === "Arada yeni çizim" && r3.same === 2);
check("artımlı: nota yazılan not güncellenir", r3.updated.length === 1 && r3.updated[0].next.note === "Sonradan yazılan not" && r3.updated[0].prev.note === undefined);
check("artımlı: sıra korunur", r3.book.highlights.map((h) => (h.anchor.kind === "koreader" ? h.anchor.page : 0)).join(",") === "5,12,20,31");
check("artımlı: kayıt güncelleme anı", r3.book.updatedAt === t3 && !r3.created);
{
  // Store'un yaptığı gibi: notta yalnız fark işlenir.
  const order = r3.book.highlights.map((h) => h.id);
  let out = n1;
  for (const h of r3.added) out = insertHighlightBlock(out, r3.book, h, order);
  for (const u of r3.updated) out = updateHighlightBlock(out, r3.book, u.next, order, undefined, u.prev);
  check("not: yeni blok sırasına girer", blockIds(out).join(",") === order.join(","));
  check("not: güncellenen blokta yeni not", out.includes("> Korku zihni öldürendir.\n\nSonradan yazılan not\n\n🟨 [s. 12]"));
  check("not: diğer bloklar aynı", out.includes("> Baştaki çizim\n\n🩷 [s. 5]"));
}
// KOReader'da not silindiyse Loomen'daki not kalır.
{
  const r4 = await applyKoreaderBook(r3.book, parseKoreaderLua(NEW_LUA).books[0], NOW + 3000);
  check("KOReader'da notsuz çizim Loomen notunu silmez", r4.updated.length === 0 && r4.book.highlights.find((h) => h.text === "Korku zihni öldürendir.")?.note === "Sonradan yazılan not");
  check("dosyadan silinen çizim Loomen'da kalır", r4.book.highlights.length === 4);
}

// Koruma: KOReader olmayan kayıt, özetsiz yeni kayıt.
{
  const pdf = newBook({ hash: "a".repeat(64), size: 1, fileName: "a.pdf", format: "pdf", notePath: "Kütüphane/a.md" }, NOW);
  let threw = false;
  try {
    await applyKoreaderBook(pdf, dune, NOW);
  } catch {
    threw = true;
  }
  check("pdf kayda koreader işlenmez", threw);
  threw = false;
  try {
    await applyKoreaderBook({ ...r1.book, format: "kindle" }, dune, NOW);
  } catch {
    threw = true;
  }
  check("kindle kayda koreader işlenmez", threw);
  threw = false;
  try {
    await applyKoreaderBook(null, dune, NOW);
  } catch {
    threw = true;
  }
  check("yeni kayıt özetsiz oluşmaz", threw);
  const empty: KoreaderBook = { key: "x|", title: "X", highlights: [{ text: "   ", page: 1, color: "yellow" }] };
  const re = await applyKoreaderBook(null, empty, NOW, { hash: "b".repeat(64), notePath: "Kütüphane/X.md" });
  check("boş alıntı atlanır", re.skipped === 1 && re.book.highlights.length === 0);
}

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nKOReader içe aktarma: tüm kontroller geçti");

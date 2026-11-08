// Kobo çizimlerini içe aktarma testi (LOM-95): örnek KoboReader.sqlite'tan kitaplar ve çizimler,
// atlanan girdiler, bölüm/renk/tarih eşlemesi, kimlikler, tekrarsız ve artımlı alım, not biçimi.
// Fikstür: src/core/__test__/fixtures/kobo-sample.sqlite (scripts/fixtures/kobo-sample.sql'den).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyKoboBook,
  blockIds,
  bookNoteTemplate,
  decodeBook,
  encodeBook,
  hasBookFile,
  insertHighlightBlock,
  kindleBookHash,
  koboBookHash,
  koboColor,
  koboHighlightId,
  koboTitleFromPath,
  koreaderBookHash,
  locationLabel,
  newBook,
  parseKoboDatabase,
  parseKoboDate,
  updateHighlightBlock,
  type KoboBook,
} from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
async function rejects(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

const NOW = 1_800_000_000_000;
const bytes = new Uint8Array(readFileSync(join(process.cwd(), "src/core/__test__/fixtures/kobo-sample.sqlite")));

// ─── Ayrıştırma ───
const g = parseKoboDatabase(bytes);
check("çizimli 2 kitap, sırayla", g.books.map((b) => b.title).join("|") === "Kürk Mantolu Madonna|The Old Man and the Sea", g.books.map((b) => b.title).join("|"));
const [kmm, sea] = g.books;
check("yazar content'ten", kmm.author === "Sabahattin Ali" && sea.author === undefined);
check("kitap 1 çizim sayısı (tekrar birleşir)", kmm.highlights.length === 4, String(kmm.highlights.length));
check("kitap 2 çizim sayısı", sea.highlights.length === 2);
check("gizli, yer imi, kalem çizimi ve boş metin atlanır", g.skipped === 44, String(g.skipped));
check("gizli çizim alınmaz", !kmm.highlights.some((h) => h.text.includes("Gizlenmiş")));
const texts = kmm.highlights.map((h) => h.text.slice(0, 12));
check("sıra: bölüm, sonra ilerleme", texts.join("|") === "Hayatımda te|Uzun bir alı|Ne zaman bir|Üçüncü bölüm", texts.join("|"));
const [h2, h3, h1, h4] = kmm.highlights;
check("bölüm adı ve sırası (tam eşleşme)", h2.chapter === "Birinci Bölüm" && h2.chapterIndex === 0);
check("bölüm: önek eşleşmesi (-1 ekli kimlik)", h1.chapter === "İkinci Bölüm" && h1.chapterIndex === 1);
check("bölüm: # parçası atılır, adsız bölüm", h4.chapter === undefined && h4.chapterIndex === 2);
check("not Annotation'dan, kırpılmış", h2.note === "Çok güzel bir cümle.");
check("boş Annotation not değil", h3.note === undefined);
check("tekrar eden alıntı: not ve en eski an korunur", h1.note === "Tekrar notu" && h1.addedAt === Date.UTC(2024, 2, 1, 0, 0, 0));
check("uzun alıntı tam (taşma sayfası)", h3.text.length > 3000);
check("renk eşlemesi", h2.color === "pink" && h3.color === "green" && h1.color === "yellow" && h4.color === "blue");
check("bilinmeyen ve boş renk sarı", sea.highlights.every((h) => h.color === "yellow"));
check("ilerleme", h2.progress === 0.25 && h3.progress === 0.75 && h4.progress === 0.1);
check("tarih: Z", h2.addedAt === Date.UTC(2024, 2, 9, 8, 0, 0));
check("tarih: saat dilimi", h4.addedAt === Date.UTC(2024, 2, 11, 7, 0, 0));
check("tarih: dilimsiz UTC", h3.addedAt === Date.UTC(2024, 2, 9, 9, 0, 0));
check("başlık yoldan, bölüm yok, sıra ilerleme", sea.highlights.map((h) => h.progress).join(",") === "0.1,0.42" && sea.highlights.every((h) => h.chapterIndex === undefined));
check("çözülemeyen tarih yok", sea.highlights.every((h) => h.addedAt === undefined));

check("parseKoboDate", parseKoboDate("2023-01-02T03:04:05.123") === Date.UTC(2023, 0, 2, 3, 4, 5, 123) && parseKoboDate("x") === undefined && parseKoboDate(null) === undefined && parseKoboDate("2023-13-01T00:00:00") === undefined);
check("koboColor", koboColor(0) === "yellow" && koboColor(1) === "pink" && koboColor(2) === "green" && koboColor(3) === "blue" && koboColor("2") === "green" && koboColor(null) === "yellow" && koboColor(99) === "yellow");
check("başlık yoldan: kepub ve URL çözümü", koboTitleFromPath("file:///mnt/onboard/A%20B/Kitap_Adi.kepub.epub") === "Kitap Adi" && koboTitleFromPath("/mnt/onboard/x.pdf") === "x" && koboTitleFromPath("") === "");
check("SQLite olmayan dosya hata", (() => {
  try {
    parseKoboDatabase(new TextEncoder().encode("bu bir sqlite değil".repeat(10)));
    return false;
  } catch {
    return true;
  }
})());

// ─── Kimlikler ───
const hK = await koboBookHash("Kürk Mantolu Madonna", "Sabahattin Ali");
check("kitap özeti 64 hane", /^[0-9a-f]{64}$/.test(hK));
check("özet büyük/küçük harf ve boşluktan bağımsız", (await koboBookHash(" kürk mantolu  madonna", "SABAHATTİN ALİ".toLocaleLowerCase("tr"))) === hK);
check("Kindle ve KOReader özetiyle çakışmaz", (await kindleBookHash("Kürk Mantolu Madonna", "Sabahattin Ali")) !== hK && (await koreaderBookHash("Kürk Mantolu Madonna", "Sabahattin Ali")) !== hK);
const id1 = await koboHighlightId(h1);
check("çizim kimliği biçimi", /^b[0-9a-f]{10}$/.test(id1));
check("çizim kimliği boşluktan bağımsız", (await koboHighlightId({ text: "  Ne zaman bir insanı\nsevdiğimi anlasam, ondan korkardım." })) === id1);

// ─── Kayda işleme ───
const r1 = await applyKoboBook(null, kmm, NOW, { hash: hK, notePath: "Kütüphane/Kürk Mantolu Madonna.md" });
check("yeni kayıt", r1.created && r1.book.format === "kobo" && r1.book.size === 0 && r1.book.fileName === "" && r1.book.title === "Kürk Mantolu Madonna" && r1.book.author === "Sabahattin Ali");
check("kayıt kimliği özetten", r1.book.id === hK.slice(0, 16));
check("Kobo kitabında dosya yok", !hasBookFile(r1.book));
check("bütün çizimler eklenir", r1.added.length === 4 && r1.book.highlights.length === 4 && r1.same === 0);
check("kayıtta sıra bölüm/ilerleme", r1.book.highlights.map((h) => h.text.slice(0, 4)).join("|") === "Haya|Uzun|Ne z|Üçün");
const a0 = r1.book.highlights[0].anchor;
check("çıpa bölüm ve ilerleme taşır", a0.kind === "kobo" && a0.chapter === 0 && a0.progress === 0.25);
check("oluşma anı Kobo'dan, güncelleme anı alım anı", r1.added.every((h) => h.updatedAt === NOW && h.createdAt < NOW));
const dec = decodeBook(encodeBook(r1.book));
check("kayıt yaz-oku", !!dec && dec.format === "kobo" && encodeBook(dec) === encodeBook(r1.book));

const n1 = bookNoteTemplate(r1.book);
check("notta Kobo kaynak satırı, Kitabı aç yok", n1.includes("\n*Kobo*\n") && !n1.includes("Kitabı aç") && !n1.includes("*KOReader*"));
check("notta bölüm adı etiketi", n1.includes(`🩷 [Birinci Bölüm](loomen://book/${r1.book.id}?hl=`));
check("notta adsız bölüm sırası", n1.includes(`🟦 [Bölüm 3](loomen://book/${r1.book.id}?hl=`));
check("not blokları kitap sırasıyla", blockIds(n1).join(",") === r1.book.highlights.map((h) => h.id).join(","));
check("yer etiketi", locationLabel(r1.book.highlights[2]) === "İkinci Bölüm");

// Kitap 2: bölümsüz → yüzde etiketi.
const hS = await koboBookHash(sea.title, sea.author);
const rs = await applyKoboBook(null, sea, NOW, { hash: hS, notePath: "Kütüphane/Sea.md" });
check("bölümsüz çizimde yüzde etiketi", bookNoteTemplate(rs.book).includes(`🟨 [%42](loomen://book/${rs.book.id}?hl=`) && bookNoteTemplate(rs.book).includes("[%10]"));

// İkinci alım: aynı dosya → değişiklik yok.
const g2 = parseKoboDatabase(bytes);
const r2 = await applyKoboBook(r1.book, g2.books[0], NOW + 1000);
check("aynı dosya: yeni çizim yok", r2.added.length === 0 && r2.updated.length === 0 && r2.same === 4);
check("aynı dosya: kayıt nesnesi aynı (yazım yok)", r2.book === r1.book);
check("aynı dosya: not aynı", bookNoteTemplate(r2.book) === n1);

// Artımlı: yeni çizim + var olan çizime Kobo'da yazılan not.
const changed: KoboBook = {
  ...kmm,
  highlights: [
    ...kmm.highlights.map((h) => (h === h3 ? { ...h, note: "Sonradan Kobo'da yazılan not" } : { ...h })),
    { text: "Arada yeni çizim", progress: 0.9, chapterIndex: 0, chapter: "Birinci Bölüm", color: "yellow", addedAt: NOW - 5 },
  ],
};
const t3 = NOW + 2000;
const r3 = await applyKoboBook(r1.book, changed, t3);
check("artımlı: yalnız yeni çizim eklenir", r3.added.length === 1 && r3.added[0].text === "Arada yeni çizim" && r3.same === 3);
check("artımlı: Kobo notu çizime işlenir", r3.updated.length === 1 && r3.updated[0].next.note === "Sonradan Kobo'da yazılan not" && r3.updated[0].prev.note === undefined);
check("artımlı: sıra korunur", r3.book.highlights.map((h) => h.text.slice(0, 4)).join("|") === "Haya|Uzun|Arad|Ne z|Üçün");
check("artımlı: kayıt güncelleme anı", r3.book.updatedAt === t3 && !r3.created);
{
  const order = r3.book.highlights.map((h) => h.id);
  let out = n1;
  for (const h of r3.added) out = insertHighlightBlock(out, r3.book, h, order);
  for (const u of r3.updated) out = updateHighlightBlock(out, r3.book, u.next, order, undefined, u.prev);
  check("not: yeni blok sırasına girer", blockIds(out).join(",") === order.join(","));
  check("not: güncellenen blokta yeni not", out.includes("\n\nSonradan Kobo'da yazılan not\n\n🟩 [Birinci Bölüm]"));
  // Elle değiştirilmiş blok korunur.
  const id3 = r3.updated[0].prev.id;
  const edited = n1.replace(/(<!-- loomen:hl (b[0-9a-f]+) -->\n> Uzun)/, "$1 ELLE");
  check("elle değiştirme uygulandı", edited !== n1 && edited.includes(`<!-- loomen:hl ${id3} -->\n> Uzun ELLE`));
  const kept = updateHighlightBlock(edited, r3.book, r3.updated[0].next, order, undefined, r3.updated[0].prev);
  check("elle değiştirilmiş bloğa dokunulmaz", kept === edited);
}
// Kobo'da not silindiyse Loomen'daki not kalır.
{
  const r4 = await applyKoboBook(r3.book, kmm, NOW + 3000);
  check("Kobo'da notsuz çizim Loomen notunu silmez", r4.updated.length === 0 && r4.book.highlights.find((h) => h.text.startsWith("Uzun"))?.note === "Sonradan Kobo'da yazılan not");
  check("dosyadan silinen çizim Loomen'da kalır", r4.book.highlights.length === 5);
}

// Koruma: Kobo olmayan kayıt, özetsiz yeni kayıt, boş alıntı.
{
  const pdf = newBook({ hash: "a".repeat(64), size: 1, fileName: "a.pdf", format: "pdf", notePath: "Kütüphane/a.md" }, NOW);
  check("pdf kayda kobo işlenmez", await rejects(() => applyKoboBook(pdf, kmm, NOW)));
  check("koreader kayda kobo işlenmez", await rejects(() => applyKoboBook({ ...r1.book, format: "koreader" }, kmm, NOW)));
  check("kindle kayda kobo işlenmez", await rejects(() => applyKoboBook({ ...r1.book, format: "kindle" }, kmm, NOW)));
  check("yeni kayıt özetsiz oluşmaz", await rejects(() => applyKoboBook(null, kmm, NOW)));
  const empty: KoboBook = { key: "x|", title: "X", highlights: [{ text: "   ", progress: 0, color: "yellow" }] };
  const re = await applyKoboBook(null, empty, NOW, { hash: "b".repeat(64), notePath: "Kütüphane/X.md" });
  check("boş alıntı atlanır", re.skipped === 1 && re.book.highlights.length === 0);
}

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nKobo içe aktarma: tüm kontroller geçti");

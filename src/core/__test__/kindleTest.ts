// Kindle çizimlerini içe aktarma testi (LOM-84): ayrıştırma, gruplama, tekrarsız ve artımlı alım.
import {
  applyKindleBook,
  blockIds,
  bookNoteTemplate,
  decodeBook,
  encodeBook,
  groupClippings,
  insertHighlightBlock,
  kindleBookHash,
  kindleHighlightId,
  parseClippings,
  parseKindleDate,
  updateHighlightBlock,
  type Book,
  type KindleBookGroup,
} from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const SEP = "==========";
const entry = (title: string, meta: string, body = "") => [title, meta, "", body, SEP].join("\n");

// İngilizce: iki kitap, not, yer imi, eski kısaltılmış aralık, tekrar eden girdi.
const EN = [
  entry("Dune (Frank Herbert)", "- Your Highlight on page 12 | Location 180-182 | Added on Monday, 3 April 2023 10:15:22", "Fear is the mind-killer."),
  entry("Dune (Frank Herbert)", "- Your Note on page 12 | Location 182 | Added on Monday, 3 April 2023 10:16:00", "Famous line"),
  entry("Dune (Frank Herbert)", "- Your Bookmark on page 20 | Location 300 | Added on Monday, 3 April 2023 10:20:00"),
  entry("Sapiens (Yuval Noah Harari)", "- Highlight Loc. 1234-56 | Added on Monday, March 7, 2011, 10:00 PM", "We did not domesticate wheat.\nIt domesticated us."),
  entry("Dune (Frank Herbert)", "- Your Highlight on Location 50-51 | Added on Tuesday, 4 April 2023 08:00:00", "A beginning is the time."),
  entry("Dune (Frank Herbert)", "- Your Highlight on page 12 | Location 180-182 | Added on Monday, 3 April 2023 10:15:22", "Fear is the mind-killer."),
].join("\n");

// Türkçe ve bilinmeyen dil.
const TR = [
  entry("Tutunamayanlar (Oğuz Atay)", "- Sayfa 45'deki Vurgunuz | Konum 690-692 | Eklenme Tarihi: 3 Nisan 2023 Pazartesi 10:15:22", "Ben kimim?"),
  entry("Tutunamayanlar (Oğuz Atay)", "- Konum 692'deki Notunuz | Eklenme Tarihi: 3 Nisan 2023 Pazartesi 10:16:00", "Güzel soru"),
  entry("Tutunamayanlar (Oğuz Atay)", "- Sayfa 50'deki Yer İmi | Konum 700 | Eklenme Tarihi: 3 Nisan 2023 Pazartesi 10:17:00"),
  entry("Le Petit Prince (Antoine de Saint-Exupéry)", "- Votre passage surligné en 10-12 | Ajouté le lundi 3 avril 2023 10:15:22", "On ne voit bien qu'avec le cœur."),
  entry("Bilinmez (Yazar)", "- Ihr Markerrr 77-79 | 2023", "Unbekannte Sprache"),
  entry("Boş (Yazar)", "- Your Highlight on Location 5-6 | Added on Monday, 3 April 2023 10:15:22", ""),
].join("\n");

// BOM + Windows satır sonları (Kindle her başlığın önüne de BOM koyabilir).
const withBom = (s: string) => "﻿" + s.replace(/\n/g, "\r\n").replace(/\r\n==========\r\n/g, "\r\n==========\r\n﻿");

// ─── Ayrıştırma ───
const en = parseClippings(withBom(EN));
check("İngilizce girdi sayısı", en.length === 6, String(en.length));
check("başlık ve yazar ayrılır, BOM temizlenir", en[0].title === "Dune" && en[0].author === "Frank Herbert" && en.every((c) => !c.title.includes("﻿")));
check("vurgu: sayfa ve konum", en[0].type === "highlight" && en[0].page === 12 && en[0].location?.start === 180 && en[0].location?.end === 182);
check("CRLF metinde kalmaz", en.every((c) => !c.text.includes("\r")));
check("not ve yer imi tanınır", en[1].type === "note" && en[1].location?.start === 182 && en[2].type === "bookmark" && en[2].text === "");
check("kısaltılmış aralık açılır", en[3].location?.start === 1234 && en[3].location?.end === 1256);
check("çok satırlı alıntı", en[3].text === "We did not domesticate wheat.\nIt domesticated us.");
check("tarih (gün ay yıl)", en[0].addedAt === new Date(2023, 3, 3, 10, 15, 22).getTime());
check("tarih (ABD, PM)", en[3].addedAt === new Date(2011, 2, 7, 22, 0, 0).getTime());

const tr = parseClippings(withBom(TR));
check("Türkçe vurgu", tr[0].type === "highlight" && tr[0].title === "Tutunamayanlar" && tr[0].author === "Oğuz Atay" && tr[0].page === 45 && tr[0].location?.start === 690 && tr[0].location?.end === 692);
check("Türkçe tarih", tr[0].addedAt === new Date(2023, 3, 3, 10, 15, 22).getTime());
check("Türkçe not", tr[1].type === "note" && tr[1].location?.start === 692 && tr[1].text === "Güzel soru");
check("Türkçe yer imi", tr[2].type === "bookmark");
const fr = tr.find((c) => c.title === "Le Petit Prince");
check("bilinmeyen dilde aralık + metin vurgu sayılır", fr?.type === "highlight" && fr.location?.start === 10 && fr.location?.end === 12 && fr.addedAt === undefined);
check("bilinmeyen dil, tarih yok", tr.find((c) => c.title === "Bilinmez")?.location?.start === 77);
check("metinsiz vurgu atlanır", !tr.some((c) => c.title === "Boş"));
check("ayraçsız son girdi de okunur", parseClippings("A (B)\n- Your Highlight on Location 1-2 | Added on Monday, 3 April 2023 10:15:22\n\nson").length === 1);
check("boş metin", parseClippings("").length === 0 && parseClippings("﻿\r\n==========\r\n").length === 0);
check("çözülemeyen tarih", parseKindleDate("garip 2023") === undefined);

// ─── Gruplama ───
const gEn = groupClippings(en);
const dune = gEn.books.find((b) => b.title === "Dune")!;
check("kitaplar dosya sırasıyla", gEn.books.map((b) => b.title).join(",") === "Dune,Sapiens");
check("tekrar eden vurgu bir kez", dune.highlights.length === 2, String(dune.highlights.length));
check("not konumu kapsayan vurguya bağlanır", dune.highlights[0].note === "Famous line");
check("yer imi atlanır ve sayılır", gEn.skipped === 1);
const gTr = groupClippings(tr);
check("Türkçe not bağlanır", gTr.books[0].highlights[0].note === "Güzel soru");
{
  const orphan = groupClippings(parseClippings(entry("X (Y)", "- Your Note on Location 999 | Added on Monday, 3 April 2023 10:15:22", "sahipsiz")));
  check("sahipsiz not atlanır", orphan.books.length === 0 && orphan.skipped === 1);
  const prevAttach = groupClippings(
    parseClippings(
      entry("X (Y)", "- Your Highlight on Location 10-12 | Added on Monday, 3 April 2023 10:15:22", "alıntı") +
        "\n" +
        entry("X (Y)", "- Your Note on Location 13 | Added on Monday, 3 April 2023 10:15:30", "hemen sonra"),
    ),
  );
  check("kapsamayan not hemen önceki vurguya", prevAttach.books[0].highlights[0].note === "hemen sonra");
  const far = groupClippings(
    parseClippings(
      entry("X (Y)", "- Your Highlight on Location 10-12 | Added on Monday, 3 April 2023 10:15:22", "alıntı") +
        "\n" +
        entry("X (Y)", "- Your Note on Location 500 | Added on Monday, 3 April 2023 10:15:30", "uzak"),
    ),
  );
  check("uzaktaki not önceki vurguya bağlanmaz", far.books[0].highlights[0].note === undefined && far.skipped === 1);
  const edited = groupClippings(
    parseClippings(
      entry("X (Y)", "- Your Highlight on Location 10-12 | Added on Monday, 3 April 2023 10:15:22", "alıntı") +
        "\n" +
        entry("X (Y)", "- Your Note on Location 12 | Added on Monday, 3 April 2023 10:15:30", "ilk") +
        "\n" +
        entry("X (Y)", "- Your Note on Location 12 | Added on Monday, 3 April 2023 10:16:30", "düzenlenmiş"),
    ),
  );
  check("düzenlenen notta son geçerli", edited.books[0].highlights[0].note === "düzenlenmiş");
}

// Sayfa-yalnız girdiler (Kindle'daki PDF'ler konum vermez).
const PAGED = [
  entry("Rapor (Kurum)", "- Your Highlight on page 3 | Added on Monday, 3 April 2023 10:15:22", "Birinci bulgu."),
  entry("Rapor (Kurum)", "- Your Note on page 3 | Added on Monday, 3 April 2023 10:15:40", "Sayfa notu"),
  entry("Rapor (Kurum)", "- Sayfa 1'deki Vurgunuz | Eklenme Tarihi: 3 Nisan 2023 Pazartesi 10:14:00", "Giriş."),
].join("\n");
{
  const pc = parseClippings(PAGED);
  check("sayfa-yalnız girdi ayrışır", pc.length === 3 && pc[0].page === 3 && pc[0].location === undefined && pc[2].page === 1);
  const pg = groupClippings(pc);
  check("sayfa-yalnız not aynı sayfadaki vurguya", pg.books[0].highlights[0].note === "Sayfa notu" && pg.skipped === 0);
  const ph = await kindleBookHash("Rapor", "Kurum");
  const pr = await applyKindleBook(null, pg.books[0], 1_700_000_000_000, { hash: ph, notePath: "Kütüphane/Rapor.md" });
  const pnote = bookNoteTemplate(pr.book);
  check("sayfa-yalnız çizimler sayfa sırasıyla", pr.book.highlights.map((h) => h.text).join("|") === "Giriş.|Birinci bulgu.");
  check("sayfa-yalnız blok etiketi sayfa", pnote.includes(`> Birinci bulgu.\n\nSayfa notu\n\n🟨 [s. 3](loomen://book/${ph.slice(0, 16)}?hl=`));
  check("eklenen çizimde güncelleme anı alım anı", pr.added.every((h) => h.updatedAt === 1_700_000_000_000 && h.createdAt < h.updatedAt));
  check("Türkçe büyük İ ile aynı kitap", (await kindleBookHash("İSTANBUL", "Yazar")) === (await kindleBookHash("istanbul", "yazar")));
}

// ─── Kimlikler ───
const h1 = await kindleBookHash("Dune", "Frank Herbert");
check("kitap özeti 64 hane", /^[0-9a-f]{64}$/.test(h1));
check("kitap özeti büyük/küçük harf ve boşluktan bağımsız", (await kindleBookHash("  dune ", "FRANK   herbert")) === h1);
check("farklı yazar farklı özet", (await kindleBookHash("Dune", "Başka")) !== h1);
const id1 = await kindleHighlightId(dune.highlights[0]);
check("çizim kimliği deterministik", /^k[0-9a-f]{10}$/.test(id1) && id1 === (await kindleHighlightId({ ...dune.highlights[0], note: "farklı" })));
check("farklı konum farklı kimlik", id1 !== (await kindleHighlightId({ ...dune.highlights[0], location: { start: 181, end: 182 } })));

// ─── Kayda işleme + not (store'un yapacağı akış) ───
const NOW = 1_700_000_000_000;
const books = new Map<string, Book>();
const notes = new Map<string, string>();

/** Store akışının saf benzeri: yeni kitapta şablon, var olanda blok ekle/güncelle. */
async function importText(text: string, now: number) {
  const groups = groupClippings(parseClippings(text));
  let added = 0;
  let updated = 0;
  let same = 0;
  for (const g of groups.books) {
    const hash = await kindleBookHash(g.title, g.author);
    const id = hash.slice(0, 16);
    const prev = books.get(id) ?? null;
    const r = await applyKindleBook(prev, g, now, { hash, notePath: `Kütüphane/${g.title}.md` });
    added += r.added.length;
    updated += r.updated.length;
    same += r.same;
    if (r.book === prev) continue;
    // Kayıt yaz-oku turu: diske giden biçim kayıpsız.
    const round = decodeBook(encodeBook(r.book));
    if (!round || encodeBook(round) !== encodeBook(r.book)) throw new Error("kayıt yaz-oku tutmadı");
    books.set(id, round);
    const order = round.highlights.map((h) => h.id);
    if (r.created) notes.set(id, bookNoteTemplate(round));
    else {
      let t = notes.get(id)!;
      for (const h of r.added) t = insertHighlightBlock(t, round, h, order);
      for (const u of r.updated) t = updateHighlightBlock(t, round, u.next, order, undefined, u.prev);
      notes.set(id, t);
    }
  }
  return { added, updated, same, skipped: groups.skipped };
}

const ALL = withBom(EN + "\n" + TR);
const first = await importText(ALL, NOW);
check("ilk alım: her kitap için kayıt ve not", books.size === 5 && notes.size === 5, String(books.size));
check("ilk alımda çizimler eklendi", first.added === 6 && first.updated === 0, JSON.stringify(first));
const duneId = (await kindleBookHash("Dune", "Frank Herbert")).slice(0, 16);
const duneBook = books.get(duneId)!;
check("kindle kitabı alanları", duneBook.format === "kindle" && duneBook.size === 0 && duneBook.fileName === "" && duneBook.author === "Frank Herbert");
check("çizimler kitap sırasıyla (konum)", duneBook.highlights.map((h) => h.anchor.kind === "kindle" && h.anchor.location?.start).join(",") === "50,180");
check("çizim rengi sarı, an Kindle'dan", duneBook.highlights.every((h) => h.color === "yellow") && duneBook.highlights[1].createdAt === new Date(2023, 3, 3, 10, 15, 22).getTime());
const duneNote = notes.get(duneId)!;
check("not blokları sırayla ve bir kez", blockIds(duneNote).join(",") === duneBook.highlights.map((h) => h.id).join(","));
check("not bloğu biçimi", duneNote.includes(`> Fear is the mind-killer.\n\nFamous line\n\n🟨 [s. 12](loomen://book/${duneId}?hl=${id1})`));
check("kindle notunda kaynak satırı", duneNote.includes("\n*Kindle*\n") && !duneNote.includes("Kitabı aç"));

// K3: aynı dosya ikinci kez → çoğalma yok, kayıt nesneleri aynı.
const snapshot = new Map(books);
const noteSnap = new Map(notes);
const second = await importText(ALL, NOW + 1000);
check("ikinci alımda yeni çizim yok", second.added === 0 && second.updated === 0 && second.same === 6, JSON.stringify(second));
check("ikinci alımda kitap sayısı aynı", books.size === 5);
check("ikinci alımda kayıtlar değişmedi", [...books].every(([id, b]) => snapshot.get(id) === b));
check("ikinci alımda notlar değişmedi", [...notes].every(([id, t]) => noteSnap.get(id) === t));
{
  const g: KindleBookGroup = groupClippings(parseClippings(ALL)).books[0];
  const r = await applyKindleBook(books.get(duneId)!, g, NOW + 5);
  check("değişiklik yoksa aynı kitap nesnesi", r.book === books.get(duneId) && r.added.length === 0);
}

// K4 + K5: dosyanın sonuna yeni vurgu ve eski vurguya not eklenir.
const MORE =
  ALL +
  "\r\n" +
  entry("Dune (Frank Herbert)", "- Your Highlight on Location 100-101 | Added on Wednesday, 5 April 2023 09:00:00", "The spice must flow.").replace(/\n/g, "\r\n") +
  "\r\n" +
  entry("Dune (Frank Herbert)", "- Your Note on Location 51 | Added on Wednesday, 5 April 2023 09:05:00", "Başlangıç notu").replace(/\n/g, "\r\n");
const third = await importText(MORE, NOW + 2000);
check("sonradan eklenen vurgu gelir", third.added === 1, JSON.stringify(third));
check("sonradan yazılan not mevcut çizime işlenir", third.updated === 1);
const dune3 = books.get(duneId)!;
check("eskiler yerinde, sıra korunur", dune3.highlights.map((h) => (h.anchor.kind === "kindle" ? h.anchor.location?.start : 0)).join(",") === "50,100,180");
check("eski çizim kimlikleri değişmedi", duneBook.highlights.every((h) => dune3.highlights.some((x) => x.id === h.id)));
const note3 = notes.get(duneId)!;
check("yeni blok notta doğru yerde", blockIds(note3).join(",") === dune3.highlights.map((h) => h.id).join(","));
check("not bloğa yazıldı", note3.includes("> A beginning is the time.\n\nBaşlangıç notu\n\n🟨 [Konum 50-51]"));
check("diğer kitaplar değişmedi", [...books].filter(([id]) => id !== duneId).every(([id, b]) => snapshot.get(id) === b));
const fourth = await importText(MORE, NOW + 3000);
check("büyümüş dosya tekrar alınınca da çoğalmaz", fourth.added === 0 && fourth.updated === 0 && blockIds(notes.get(duneId)!).length === 3);

// Kullanıcının elle değiştirdiği blok, not güncellenince ezilmez.
{
  const edited = notes.get(duneId)!.replace("Başlangıç notu", "Başlangıç notu — benim ekim");
  notes.set(duneId, edited);
  const LATER = MORE + "\r\n" + entry("Dune (Frank Herbert)", "- Your Note on Location 51 | Added on Thursday, 6 April 2023 09:05:00", "Yeni not").replace(/\n/g, "\r\n");
  const r = await importText(LATER, NOW + 4000);
  check("elle değişmiş blok ezilmez", r.updated === 1 && notes.get(duneId) === edited);
}

// Kindle olmayan kitaba işlenmez; yeni kayıt için özet şart.
{
  let threw = false;
  try {
    await applyKindleBook({ ...duneBook, format: "pdf" }, dune, NOW);
  } catch {
    threw = true;
  }
  check("pdf kayda kindle işlenmez", threw);
  threw = false;
  try {
    await applyKindleBook(null, dune, NOW);
  } catch {
    threw = true;
  }
  check("yeni kayıt özetsiz oluşmaz", threw);
}

// Kırpma sınırı uyarısı alıntı sayılmaz (inceleme bulgusu)
{
  const lim = entry("Dune (Frank Herbert)", "- Your Highlight on page 99 | Location 900-901 | Added on Monday, 3 April 2023 10:15:22", "<You have reached the clipping limit for this item>");
  const real = entry("Dune (Frank Herbert)", "- Your Highlight on page 98 | Location 890-891 | Added on Monday, 3 April 2023 10:15:22", "<b>gerçek</b> metin");
  const got = parseClippings([lim, real].join("\n"));
  check("kırpma sınırı uyarısı atılır, gerçek alıntı kalır", got.length === 1 && got[0].text.includes("gerçek"));
}

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nKindle içe aktarma: tüm kontroller geçti");

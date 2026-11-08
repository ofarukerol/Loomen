// Fotoğraftan alıntı testi (LOM-87): okunan metnin temizlenmesi, deterministik kimlikler, kitaba
// ekleme ve çift kayıt koruması, dosyasız basılı kitap (`paper`) kaydı, `photo` çıpasının kayıt
// gidiş-dönüşü, her biçimdeki kitaba eklenebilmesi, nottaki yer etiketi ve şablon.
import {
  addHighlight,
  applyPhotoQuote,
  applySharedQuote,
  blockIds,
  bookNoteTemplate,
  cleanOcrText,
  compareAnchor,
  decodeAnchor,
  decodeBook,
  encodeBook,
  hasBookFile,
  insertHighlightBlock,
  locationLabel,
  newBook,
  paperBookHash,
  photoAnchor,
  photoHighlightId,
  positionOfAnchor,
  sortHighlights,
  type Book,
} from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
const show = (v: unknown) => JSON.stringify(v);
const NOW = 1_800_000_000_000;

// ─── Metin temizleme ──────────────────────────────────────────────────────────────
{
  const raw = "﻿İnsan, ken-\ndini bilmeli.\r\nBu satır aynı\nparagraf.\n\n\nYeni   paragraf­lar.  \n";
  const c = cleanOcrText(raw);
  check("tire birleşir, tek satır sonu boşluk, paragraf korunur", c === "İnsan, kendini bilmeli. Bu satır aynı paragraf.\n\nYeni paragraflar.", show(c));
  check("kod bloğu çitleri atılır", cleanOcrText("```text\nMerhaba dünya\n```") === "Merhaba dünya");
  check("büyük harfle başlayan satırda tire korunur", cleanOcrText("Ankara-\nİstanbul") === "Ankara- İstanbul");
  check("boş metin boş döner", cleanOcrText("  \n\n ") === "" && cleanOcrText(undefined as unknown as string) === "");
  check("çok uzun metin kırpılır", cleanOcrText("a".repeat(30000)).length === 20000);
  check("kırpma emojiyi ortadan bölmez", cleanOcrText("a".repeat(19999) + "😀b").length === 19999);
}

// ─── Kimlikler ────────────────────────────────────────────────────────────────────
{
  const a = await photoHighlightId("“Her şey geçer.”");
  const b = await photoHighlightId("her sey gecer");
  check("çizim kimliği 'p' + 10 hane", /^p[0-9a-f]{10}$/.test(a), a);
  check("noktalama/işaret farkı aynı kimlik", a === b);
  check("farklı metin farklı kimlik", a !== (await photoHighlightId("başka cümle")));
  const h1 = await paperBookHash("Tutunamayanlar", "Oğuz Atay");
  const h2 = await paperBookHash("  tutunamayanlar ", "oğuz  atay");
  check("basılı kitap özeti deterministik", /^[0-9a-f]{64}$/.test(h1) && h1 === h2);
  // Paylaşım kaydıyla çakışmaz: aynı başlık farklı özet.
  const s = await applySharedQuote(null, { quote: "x", title: "Tutunamayanlar", author: "Oğuz Atay" }, NOW, {
    hash: "e".repeat(64),
    notePath: "Kütüphane/S.md",
  });
  check("paylaşım özetinden ayrı", h1 !== s.book.hash);
  check("çıpa sayfa doğrulaması", show(photoAnchor(12)) === show({ kind: "photo", page: 12 }) && show(photoAnchor(0)) === show({ kind: "photo" }) && show(photoAnchor(1.5)) === show({ kind: "photo" }));
}

// ─── Kayda işleme ─────────────────────────────────────────────────────────────────
{
  const pdf = newBook({ hash: "a".repeat(64), size: 1, fileName: "k.pdf", format: "pdf", notePath: "Kütüphane/K.md", title: "K" }, NOW);
  const r1 = await applyPhotoQuote(pdf, { quote: "Okunan\ncümle burada.", page: 42 }, NOW + 1);
  check("raftaki kitaba eklenir", !r1.created && !r1.duplicate && r1.book.highlights.length === 1 && r1.book.updatedAt === NOW + 1);
  check("alıntı tek satır, çıpa sayfalı", r1.added?.text === "Okunan cümle burada." && show(r1.added?.anchor) === show({ kind: "photo", page: 42 }));
  check("kimlik deterministik", r1.added?.id === (await photoHighlightId("Okunan cümle burada.")));
  const r2 = await applyPhotoQuote(r1.book, { quote: "  okunan cümle burada  " }, NOW + 2);
  check("aynı metin ikinci kez eklenmez", r2.duplicate && r2.added === null && r2.book === r1.book);
  // Okuyucudan gelmiş aynı cümle de çift sayılır.
  const withPdf = addHighlight(pdf, { text: "Okuyucudan gelen", anchor: { kind: "pdf", page: 1, rects: [] }, color: "green" }, NOW, "ab");
  const r3 = await applyPhotoQuote(withPdf.book, { quote: "Okuyucudan gelen." }, NOW + 3);
  check("başka yoldan gelmiş aynı cümle çift sayılır", r3.duplicate);
  let threw = false;
  try {
    await applyPhotoQuote(pdf, { quote: "   " }, NOW);
  } catch {
    threw = true;
  }
  check("boş alıntı hata atar", threw);
  const rn = await applyPhotoQuote(pdf, { quote: "Notlu cümle", note: " düşüncem " }, NOW);
  check("çizim notu taşınır", rn.added?.note === "düşüncem");
}

// ─── Yeni basılı kitap ────────────────────────────────────────────────────────────
{
  const r = await applyPhotoQuote(null, { quote: "Basılı sayfadan", title: " Tutunamayanlar ", author: "Oğuz Atay", page: 7 }, NOW, {
    notePath: "Kütüphane/Tutunamayanlar.md",
  });
  const hash = await paperBookHash("Tutunamayanlar", "Oğuz Atay");
  check(
    "yeni paper kaydı açılır",
    r.created && r.book.format === "paper" && r.book.title === "Tutunamayanlar" && r.book.author === "Oğuz Atay" && r.book.size === 0 && r.book.fileName === "" && r.book.hash === hash && r.book.id === hash.slice(0, 16),
    show(r.book),
  );
  check("paper kaydının dosyası yok", !hasBookFile(r.book));
  let threw = false;
  try {
    await applyPhotoQuote(null, { quote: "x" }, NOW, { notePath: "Kütüphane/X.md" });
  } catch {
    threw = true;
  }
  check("başlıksız yeni kayıt hata atar", threw);
  threw = false;
  try {
    await applyPhotoQuote(null, { quote: "x", title: "T" }, NOW);
  } catch {
    threw = true;
  }
  check("not yolsuz yeni kayıt hata atar", threw);

  // Kayıt gidiş-dönüşü
  const dec = decodeBook(encodeBook(r.book));
  check("paper kaydı yaz-oku", !!dec && dec.format === "paper" && show(dec.highlights[0]?.anchor) === show({ kind: "photo", page: 7 }) && encodeBook(dec) === encodeBook(r.book));

  // Not şablonu ve blok
  const tpl = bookNoteTemplate(r.book);
  const hl = r.added!;
  check("şablonda kaynak satırı *Basılı kitap*", tpl.includes("\n*Basılı kitap*\n") && !tpl.includes("Kitabı aç"));
  check(
    "fotoğraf bloğu yer etiketiyle",
    tpl.includes(`<!-- loomen:hl ${hl.id} -->\n> Basılı sayfadan\n\n🟨 [Fotoğraf · s. 7](loomen://book/${r.book.id}?hl=${hl.id})\n<!-- /loomen:hl ${hl.id} -->`),
  );
  const EN = { page: "p. {n}", section: "Section {n}", openBook: "Open book", quotes: "Highlights", photo: "Photo", paper: "Printed book" };
  check("etiketler dile göre", bookNoteTemplate(r.book, EN).includes("\n*Printed book*\n") && locationLabel(hl, EN) === "Photo · p. 7");
  check("eski etiket nesnesinde varsayılan", locationLabel({ ...hl, anchor: { kind: "photo" } }, { page: "p. {n}", section: "S", openBook: "O", quotes: "Q" }) === "Fotoğraf");

  // İkinci alıntı var olan nota blok olarak eklenir.
  const r2 = await applyPhotoQuote(r.book, { quote: "İkinci cümle", page: 3 }, NOW + 1);
  const note = insertHighlightBlock(tpl, r2.book, r2.added!, r2.book.highlights.map((h) => h.id));
  check("ikinci blok eklenir, sayfa sırasıyla", blockIds(note).join(",") === `${r2.added!.id},${hl.id}`, blockIds(note).join(","));
}

// ─── Çıpa ─────────────────────────────────────────────────────────────────────────
{
  check("yalın çıpa okunur", show(decodeAnchor({ kind: "photo" })) === show({ kind: "photo" }));
  check("sayfalı çıpa okunur", show(decodeAnchor({ kind: "photo", page: 5 })) === show({ kind: "photo", page: 5 }));
  check("sıfır ya da kesirli sayfa bozuk", decodeAnchor({ kind: "photo", page: 0 }) === null && decodeAnchor({ kind: "photo", page: 2.5 }) === null);
  check("kitapta yeri yok", positionOfAnchor({ kind: "photo", page: 3 }) === null);
  check("sayfa sırası, sayfasız sona", compareAnchor({ kind: "photo", page: 2 }, { kind: "photo", page: 9 }) < 0 && compareAnchor({ kind: "photo" }, { kind: "photo", page: 1 }) > 0 && compareAnchor({ kind: "photo" }, { kind: "photo" }) === 0);
  check("fotoğraf paylaşımdan sonra gelir", compareAnchor({ kind: "shared" }, { kind: "photo" }) < 0);
  for (const format of ["pdf", "epub", "kindle", "koreader", "kobo", "shared", "paper"] as const) {
    const b: Book = newBook({ hash: "7".repeat(64), size: 0, fileName: "", format, notePath: "Kütüphane/F.md", title: "F" }, NOW);
    let ok = true;
    try {
      ok = addHighlight(b, { text: "a", anchor: { kind: "photo" }, color: "yellow" }, NOW, "px").book.highlights.length === 1;
    } catch {
      ok = false;
    }
    check(`${format} kitaba fotoğraf çizimi eklenir`, ok);
  }
  const p = newBook({ hash: "8".repeat(64), size: 0, fileName: "", format: "paper", notePath: "Kütüphane/P.md", title: "P" }, NOW);
  let threw = false;
  try {
    addHighlight(p, { text: "a", anchor: { kind: "pdf", page: 1, rects: [] }, color: "yellow" }, NOW, "pa");
  } catch {
    threw = true;
  }
  check("paper kitaba PDF çıpası eklenmez", threw);
  const sorted = sortHighlights([
    { id: "b", color: "yellow", text: "b", anchor: { kind: "photo" }, createdAt: 2, updatedAt: 2 },
    { id: "a", color: "yellow", text: "a", anchor: { kind: "photo", page: 4 }, createdAt: 3, updatedAt: 3 },
  ]);
  check("sıralama sayfaya göre", sorted.map((h) => h.id).join(",") === "a,b");
}

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nFotoğraftan alıntı: tüm kontroller geçti");

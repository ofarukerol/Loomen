// Paylaş menüsünden alıntı testi (LOM-96): adres çözme, Kindle / Apple Kitaplar / Google Play Kitaplar
// metinleri, tanınmayan metin, raf eşleştirme, çift kayıt koruması, dosyasız paylaşım kaydı, not biçimi.
import {
  applySharedQuote,
  blockIds,
  bookNoteTemplate,
  decodeBook,
  encodeBook,
  insertHighlightBlock,
  matchBooks,
  newBook,
  normalizeTitle,
  parseSharedText,
  parseShareUrl,
  quoteKey,
  shareAppFromHint,
  sharedBookHash,
  sharedHighlightId,
  type Book,
  type ParsedShare,
} from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
const show = (v: unknown) => JSON.stringify(v);

const NOW = 1_800_000_000_000;

// ─── Adres ────────────────────────────────────────────────────────────────────────
{
  const p = parseShareUrl(
    "loomen://share?text=%E2%80%9CHer%20%C5%9Fey%20ge%C3%A7er.%E2%80%9D%0A%E2%80%94%20Yazar%2C%20Kitap&subject=Kitap&app=com.amazon.kindle",
  );
  check("adres çözülür", p?.text === "“Her şey geçer.”\n— Yazar, Kitap" && p?.subject === "Kitap" && p?.app === "com.amazon.kindle", show(p));
  check("+ ve %2B ayrılır", parseShareUrl("loomen://share?text=a+b%2Bc")?.text === "a b+c");
  check("sondaki bölü kabul", parseShareUrl("loomen://share/?text=x")?.text === "x");
  check("metinsiz adres boş metin", parseShareUrl("loomen://share")?.text === "");
  check("kitap bağlantısı paylaşım değil", parseShareUrl("loomen://book/abc?hl=x") === null);
  check("Google dönüşü paylaşım değil", parseShareUrl("com.googleusercontent.apps.1:/oauth2redirect?code=1&state=s") === null);
  check("başka konak paylaşım değil", parseShareUrl("loomen://sharex?text=a") === null);
  check("bozuk kaçış çökmez", typeof parseShareUrl("loomen://share?text=%E0%A4%A")?.text === "string");
  check("uygulama ipucu: kindle", shareAppFromHint("com.amazon.kindle") === "kindle");
  check("uygulama ipucu: play", shareAppFromHint("com.google.android.apps.books") === "playbooks");
  check("uygulama ipucu: apple", shareAppFromHint("https://books.apple.com/x") === "applebooks");
  check("uygulama ipucu: bilinmeyen", shareAppFromHint("org.telegram.messenger") === undefined);
}

// ─── Metin ayıklama ───────────────────────────────────────────────────────────────
const parsed = (name: string, text: string, want: Partial<ParsedShare>, subject?: string, app?: string) => {
  const p = parseSharedText(text, subject, app);
  const ok = !!p && (Object.keys(want) as (keyof ParsedShare)[]).every((k) => p[k] === want[k]);
  check(name, ok, show(p));
  return p;
};

// Kindle (Android/iOS): "from Başlık by Yazar" + tanıtım bağlantısı, tek satırda.
parsed(
  "Kindle: from … by …",
  "“It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.” from Pride and Prejudice by Jane Austen. Start reading it for free: https://a.co/d/abc123",
  {
    quote: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    app: "kindle",
  },
);
// Kindle: alıntı + "— Yazar, Başlık" satırı + bağlantı satırı.
parsed(
  "Kindle: tire satırı",
  "\"Zaman, insanın en kıymetli sermayesidir.\"\n\n— Ahmet Hamdi Tanpınar, Saatleri Ayarlama Enstitüsü\n\nÜcretsiz okumaya başlayın: https://a.co/d/xyz",
  { quote: "Zaman, insanın en kıymetli sermayesidir.", title: "Saatleri Ayarlama Enstitüsü", author: "Ahmet Hamdi Tanpınar", app: "kindle" },
);
// Kindle paket adı ipucu, bağlantı yok.
parsed("Kindle: paket ipucu", "“Kısa alıntı.” from Kitap by Yazar", { quote: "Kısa alıntı.", title: "Kitap", author: "Yazar", app: "kindle" }, undefined, "com.amazon.kindle");

// Apple Kitaplar (yeni): alıntı, "Excerpt From", başlık, yazar, bağlantı, telif satırı.
parsed(
  "Apple Kitaplar: Excerpt From",
  "“Bütün mutlu aileler birbirine benzer.”\n\nExcerpt From\nAnna Karenina\nLev Tolstoy\nhttps://books.apple.com/tr/book/anna-karenina/id123\nThis material may be protected by copyright.",
  { quote: "Bütün mutlu aileler birbirine benzer.", title: "Anna Karenina", author: "Lev Tolstoy", app: "applebooks" },
);
// Apple Kitaplar Türkçe arayüz.
parsed(
  "Apple Kitaplar: Alıntı (Türkçe)",
  "“Kalbin sesi.”\n\nAlıntı:\nKürk Mantolu Madonna\nSabahattin Ali\nBu materyal telif hakkıyla korunuyor olabilir.",
  { quote: "Kalbin sesi.", title: "Kürk Mantolu Madonna", author: "Sabahattin Ali", app: "applebooks" },
);
// Apple Kitaplar (eski tek satır).
parsed(
  "Apple Kitaplar: eski biçim",
  "“Call me Ishmael.”\n\nExcerpt From: Herman Melville. “Moby-Dick.” Apple Books.",
  { quote: "Call me Ishmael.", title: "Moby-Dick", author: "Herman Melville", app: "applebooks" },
);

// Google Play Kitaplar: alıntı + "Başlık by Yazar" + bağlantı.
parsed(
  "Google Play Kitaplar: by",
  "\"So it goes.\"\nSlaughterhouse-Five by Kurt Vonnegut\nhttps://play.google.com/store/books/details?id=abc",
  { quote: "So it goes.", title: "Slaughterhouse-Five", author: "Kurt Vonnegut", app: "playbooks" },
);
// Google Play Kitaplar: sayfa bilgisiyle ve "Başlık - Yazar".
parsed(
  "Google Play Kitaplar: sayfa ve tire",
  "“Yalnızlık paylaşılmaz.”\nTutunamayanlar - Oğuz Atay, sayfa 42\nhttps://books.google.com/books?id=x",
  { quote: "Yalnızlık paylaşılmaz.", title: "Tutunamayanlar", author: "Oğuz Atay", app: "playbooks", page: 42 },
);

// Tanınmayan metin: tamamı alıntı; konu varsa kitap adı.
{
  const raw = "Bu, herhangi bir uygulamadan gelen\nçok satırlı bir metin.";
  const p = parsed("genel: tamamı alıntı", raw, { quote: raw });
  check("genel: başlık yok", p?.title === undefined && p?.author === undefined && p?.app === undefined);
  parsed("genel: konu başlık olur", raw, { quote: raw, title: "Dune" }, "Dune");
  parsed("genel: konu öneki temizlenir", raw, { quote: raw, title: "Dune" }, "Excerpt From: Dune");
  const mid = "Adam “merhaba” dedi ve gitti, sonra hiç dönmedi.";
  parsed("genel: metin içi tırnak alıntıyı bölmez", mid, { quote: mid, title: undefined });
  parsed("genel: konu alıntının başıysa başlık değil", "Uzun bir cümle burada", { title: undefined }, "Uzun bir cümle");
  // İnceleme bulguları: genel metin bozulmaz.
  parsed("genel: telif geçen cümle silinmez", "Telif hakkı yasaları sanatçıyı korur.", { quote: "Telif hakkı yasaları sanatçıyı korur.", app: undefined });
  const withUrl = "Bkz. https://example.com/sayfa ve sonrası.";
  parsed("genel: yabancı bağlantı alıntıda kalır", withUrl, { quote: withUrl, app: undefined });
  const midMark = "Birinci satır\nAlıntı\nİkinci satır\nÜçüncü satır\nDördüncü satır";
  parsed("genel: metin içindeki Alıntı satırı bölmez", midMark, { quote: midMark, title: undefined, app: undefined });
  const midMark2 = "Birinci satır\nAlıntı: şu söz";
  parsed("genel: Alıntı: satırı kitap adı olmaz", midMark2, { quote: midMark2, title: undefined });
  parsed("by geçen başlık son by'da bölünür", "“Darkness.” from Stand by Me by Stephen King", { quote: "Darkness.", title: "Stand by Me", author: "Stephen King" });
  parsed("Kindle tire satırında by geçen başlık", "“Darkness.”\n— Stephen King, Stand by Me", { quote: "Darkness.", title: "Stand by Me", author: "Stephen King" });
  const wiki = "Orman https://en.wikipedia.org/wiki/Amazon_rainforest diye geçer.";
  parsed("yolunda amazon geçen bağlantı kalır", wiki, { quote: wiki, app: undefined });
  parsed(
    "iki tırnaklı alıntı yarım kalmaz",
    "“Quote one” and “quote two”\n\n— Author, Book",
    { quote: "“Quote one” and “quote two”", title: "Book", author: "Author" },
  );

  check("yalnız bağlantı null", parseSharedText("https://a.co/d/x") === null);
  parsed("BOM ve CRLF temizlenir", "﻿“A b.”\r\nKitap by Yazar\r\nhttps://play.google.com/x", { quote: "A b.", title: "Kitap", author: "Yazar" });
}

// ─── Eşleştirme ───────────────────────────────────────────────────────────────────
const mk = (id: string, title: string, author?: string, format: Book["format"] = "epub"): Book => {
  const b = newBook({ hash: id.repeat(64).slice(0, 64), size: 1, fileName: `${title}.epub`, format, notePath: `Kütüphane/${title}.md`, title }, NOW);
  if (author) b.author = author;
  return b;
};
{
  check("normalizeTitle", normalizeTitle("  IŞIK: Bir  Roman! ") === "isik bir roman" && normalizeTitle("Çalıkuşu") === normalizeTitle("CALIKUSU"));
  const shelf = [
    mk("a", "Saatleri Ayarlama Enstitüsü", "Ahmet Hamdi Tanpınar"),
    mk("b", "Dune", "Frank Herbert", "pdf"),
    mk("c", "Dune Messiah", "Frank Herbert"),
    mk("d", "Huzur", "Ahmet Hamdi Tanpınar", "kindle"),
    mk("e", "Huzur", "Başka Yazar"),
  ];
  const ids = (l: Book[]) => l.map((b) => b.title + "/" + (b.author ?? "")).join(",");
  check("tam eşleşme tek kitap", ids(matchBooks(shelf, { title: "saatleri ayarlama enstitusu" })) === "Saatleri Ayarlama Enstitüsü/Ahmet Hamdi Tanpınar");
  check("tam eşleşme, içerenler aday olmaz", ids(matchBooks(shelf, { title: "Dune" })) === "Dune/Frank Herbert");
  check("alt başlıkla gelen içerme eşleşir", matchBooks(shelf, { title: "Dune Messiah: Book Two" }).length === 1);
  check("aynı başlık iki kitap → yazar daraltır", ids(matchBooks(shelf, { title: "Huzur", author: "Ahmet Hamdi Tanpınar" })) === "Huzur/Ahmet Hamdi Tanpınar");
  check("aynı başlık, yazar yok → iki aday", matchBooks(shelf, { title: "Huzur" }).length === 2);
  check("yazar daraltmazsa adaylar kalır", matchBooks(shelf, { title: "Huzur", author: "Bilinmeyen" }).length === 2);
  check("eşleşme yok → boş", matchBooks(shelf, { title: "Tutunamayanlar" }).length === 0);
  check("başlık yok → boş", matchBooks(shelf, {}).length === 0);
  check("kısa başlık içermeyle eşleşmez", matchBooks(shelf, { title: "Du" }).length === 0);
  const shelf2 = [mk("a", "Time"), mk("b", "Sapiens: Hayvanlardan Tanrılara", "Harari"), mk("c", "Dune")];
  check("yalnız içerme eşleşmez", matchBooks(shelf2, { title: "A Brief History of Time" }).length === 0 && matchBooks(shelf2, { title: "Dune Messiah" }).length === 0);
  check("iki ayrı alt başlık eşleşmez", matchBooks([mk("a", "Harry Potter: Felsefe Taşı")], { title: "Harry Potter: Sırlar Odası" }).length === 0);
  check("ana başlık eşleşir", ids(matchBooks(shelf2, { title: "Sapiens" })) === "Sapiens: Hayvanlardan Tanrılara/Harari");
}

// ─── Kimlik, çift kayıt, kayda işleme ─────────────────────────────────────────────
{
  check("alıntı anahtarı tırnak/büyük harf farkını yok sayar", quoteKey("“Her Şey   geçer.”") === quoteKey("her şey geçer"));
  check("Latin dışı işaretler anahtarda korunur", quoteKey("ば") !== quoteKey("は") && quoteKey("कि") !== quoteKey("क"));
  check("Türkçe İ/ı düzlenir", quoteKey("İstanbul") === quoteKey("istanbul") && quoteKey("IŞIK") === quoteKey("ışık"));
  const id1 = await sharedHighlightId("Her şey geçer.");
  const id2 = await sharedHighlightId("“her şey geçer”");
  check("çizim kimliği deterministik", id1 === id2 && /^s[0-9a-f]{10}$/.test(id1), id1);
  const h1 = await sharedBookHash("Kitap", "Yazar");
  check("kayıt özeti deterministik", h1 === (await sharedBookHash("  KİTAP ", "yazar")) && /^[0-9a-f]{64}$/.test(h1));

  const pdf = mk("b", "Dune", "Frank Herbert", "pdf");
  const q: ParsedShare = { quote: "Fear is the mind-killer.", title: "Dune", app: "kindle", page: 12 };
  const r1 = await applySharedQuote(pdf, q, NOW + 1);
  check("PDF kitaba paylaşılan alıntı eklenir", !r1.duplicate && !r1.created && r1.book.highlights.length === 1 && r1.added?.anchor.kind === "shared");
  check("çıpa uygulama ve sayfa taşır", show(r1.added?.anchor) === show({ kind: "shared", app: "kindle", page: 12 }));
  check("kitap biçimi değişmez", r1.book.format === "pdf" && r1.book.updatedAt === NOW + 1);
  const r2 = await applySharedQuote(r1.book, { quote: "“fear is the mind killer”" }, NOW + 2);
  check("aynı alıntı ikinci kez eklenmez", r2.duplicate && r2.book === r1.book && r2.added === null);

  // Kindle'dan alınmış aynı cümle de çift sayılır.
  const kindle = { ...mk("d", "Huzur", "Ahmet Hamdi Tanpınar", "kindle") };
  kindle.highlights = [{ id: "k0123456789", color: "yellow", text: "İstanbul'u dinliyorum.", anchor: { kind: "kindle", page: 3 }, createdAt: NOW, updatedAt: NOW }];
  const r3 = await applySharedQuote(kindle, { quote: "istanbul’u dinliyorum" }, NOW + 3);
  check("Kindle çizimiyle aynı alıntı çift sayılır", r3.duplicate && r3.book === kindle);

  // Raftaki kitapla eşleşmeyen başlık: dosyasız paylaşım kaydı.
  const p = parseSharedText("“Yalnızlık paylaşılmaz.”\nTutunamayanlar by Oğuz Atay\nhttps://play.google.com/x")!;
  const hash = await sharedBookHash(p.title!, p.author);
  const r4 = await applySharedQuote(null, p, NOW + 4, { hash, notePath: "Kütüphane/Tutunamayanlar.md" });
  check(
    "yeni paylaşım kaydı",
    r4.created && r4.book.format === "shared" && r4.book.title === "Tutunamayanlar" && r4.book.author === "Oğuz Atay" && r4.book.size === 0 && r4.book.fileName === "" && r4.book.highlights.length === 1,
    show(r4.book),
  );
  check("kayıt kimliği özetten", r4.book.id === hash.slice(0, 16));
  const back = decodeBook(encodeBook(r4.book));
  check("paylaşım kaydı kodek gidiş-dönüş", !!back && encodeBook(back) === encodeBook(r4.book));
  let threw = false;
  try {
    await applySharedQuote(null, { quote: "x" }, NOW, { hash, notePath: "Kütüphane/X.md" });
  } catch {
    threw = true;
  }
  check("başlıksız yeni kayıt açılmaz", threw);
  threw = false;
  try {
    await applySharedQuote(null, p, NOW);
  } catch {
    threw = true;
  }
  check("özetsiz yeni kayıt açılmaz", threw);
  threw = false;
  try {
    await applySharedQuote(pdf, { quote: "   " }, NOW);
  } catch {
    threw = true;
  }
  check("boş alıntı eklenmez", threw);

  // Not: şablon kaynak satırı ve blok etiketi.
  const note = bookNoteTemplate(r4.book);
  check("paylaşım kaydı notunda kaynak satırı", note.includes("\n*Paylaşıldı*\n") && !note.includes("Kitabı aç"));
  check("paylaşım bloğu notta", note.includes("> Yalnızlık paylaşılmaz.") && blockIds(note).length === 1 && note.includes("🟨 [Paylaşıldı](loomen://book/"));
  // Dosyalı kitabın notuna paylaşılan blok eklenir; "Kitabı aç" kalır, etiket sayfalı.
  const pdfNote = bookNoteTemplate(pdf);
  const withShared = insertHighlightBlock(pdfNote, r1.book, r1.added!, r1.book.highlights.map((h) => h.id));
  check("PDF notuna paylaşım bloğu", withShared.includes("Kitabı aç") && withShared.includes("🟨 [Paylaşıldı · s. 12](loomen://book/" + pdf.id + "?hl=" + r1.added!.id + ")"));
}

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nPaylaş ile alıntı: tüm kontroller geçti");

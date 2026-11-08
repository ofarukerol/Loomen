// Kitap notundaki çizim bloklarının testi (LOM-83, K3).
import {
  addHighlight,
  addInkStroke,
  clearInkPage,
  inkBlockLines,
  inkBlockPages,
  inkBlockState,
  inkImagePath,
  insertInkBlock,
  removeInkBlock,
  syncInkBlocks,
  updateInkBlock,
  blockIds,
  blockState,
  bookNoteTemplate,
  insertHighlightBlock,
  locationLabel,
  newBook,
  noteBookId,
  removeHighlightBlock,
  updateHighlight,
  updateHighlightBlock,
  type Highlight,
} from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const NOW = 1_700_000_000_000;
const b0 = newBook({ hash: "a".repeat(64), size: 1, fileName: "Dune.pdf", format: "pdf", notePath: "Kütüphane/Dune.md" }, NOW);
const book = { ...b0, author: "Frank Herbert" };
const pdfAt = (page: number, y = 0.1) => ({ kind: "pdf" as const, page, rects: [{ x: 0.1, y, w: 0.5, h: 0.02 }] });

const empty = bookNoteTemplate(book);
check("ön maddede kitap kimliği", noteBookId(empty) === book.id);
check("başlık, yazar, aç bağlantısı, Alıntılar", empty.includes("# Dune") && empty.includes("*Frank Herbert*") && empty.includes(`[Kitabı aç](loomen://book/${book.id})`) && empty.includes("## Alıntılar"));
check("tek satır sonuyla biter", empty.endsWith("\n") && !empty.endsWith("\n\n"));
check("ön madde yoksa kimlik null", noteBookId("# Başlık\nloomen-book: x") === null);

let b = book;
const add = (text: string, page: number, id: string, extra: Partial<Highlight> = {}) => {
  const r = addHighlight(b, { text, anchor: pdfAt(page), color: extra.color ?? "yellow", note: extra.note }, NOW, id);
  b = r.book;
  return r.highlight;
};
const order = () => b.highlights.map((h) => h.id);

const h5 = add("beşinci sayfa", 5, "hl5", { note: "önemli\nikinci satır" });
let note = insertHighlightBlock(empty, b, h5, order());
check("blok eklenir", blockState(note, "hl5") === "ok");
check("blokta alıntı, not, sayfa bağlantısı", note.includes("> beşinci sayfa") && note.includes("önemli\nikinci satır") && note.includes(`🟨 [s. 5](loomen://book/${b.id}?hl=hl5)`));

// Kullanıcı nota kendi metnini ekler.
note = note.replace("## Alıntılar", "## Alıntılar\n\nBenim düşüncelerim.");
note += "\n## Son söz\nKendi yazım.\n";

const h2 = add("ikinci sayfa", 2, "hl2", { color: "green" });
note = insertHighlightBlock(note, b, h2, order());
const h9 = add("dokuzuncu sayfa", 9, "hl9");
note = insertHighlightBlock(note, b, h9, order());
check("kitap sırası korunur", blockIds(note).join(",") === "hl2,hl5,hl9", blockIds(note).join(","));
check("kullanıcı metni korunur", note.includes("Benim düşüncelerim.") && note.includes("## Son söz\nKendi yazım."));
check("yeşil simge", note.includes("🟩 [s. 2]"));
check("arkaya eklenen blok kullanıcının son bölümünden önce", note.indexOf("hl9") < note.indexOf("## Son söz"));

// Güncelleme
b = updateHighlight(b, "hl5", { color: "blue", note: "" }, NOW + 1);
const before = note;
note = updateHighlightBlock(note, b, b.highlights.find((h) => h.id === "hl5")!, order());
check("güncelleme notu siler, rengi değiştirir", !note.includes("önemli") && note.includes("🟦 [s. 5]"));
check("güncelleme diğer bloklara dokunmaz", note.split("<!-- loomen:hl hl2 -->")[0] === before.split("<!-- loomen:hl hl2 -->")[0]);

// Silme: yalnız o blok
const withoutRest = (s: string) => s.replace(/<!-- loomen:hl hl9 -->[\s\S]*?<!-- \/loomen:hl hl9 -->\n?\n?/, "");
const removed = removeHighlightBlock(note, "hl9");
check("silinen blok gider", blockState(removed, "hl9") === "missing" && blockIds(removed).join(",") === "hl2,hl5");
check("silme yalnız bloğu ve bir boş satırı alır", removed === withoutRest(note).replace(/\n+$/, "\n"), JSON.stringify(removed.slice(-120)));
check("olmayanı silmek metni değiştirmez", removeHighlightBlock(removed, "yok") === removed);

// Bozuk blok (bitişi silinmiş) dokunulmaz.
const broken = removed.replace("<!-- /loomen:hl hl5 -->", "");
check("bitişi olmayan blok bozuk sayılır", blockState(broken, "hl5") === "broken");
check("bozuk blok silinmez", removeHighlightBlock(broken, "hl5") === broken);
check("bozuk blok güncellenmez", updateHighlightBlock(broken, b, b.highlights.find((h) => h.id === "hl5")!, order()) === broken);

// Blok elle silinmişse güncelleme yeniden ekler.
const gone = removeHighlightBlock(removed, "hl2");
const readd = updateHighlightBlock(gone, b, b.highlights.find((h) => h.id === "hl2")!, order());
check("eksik blok güncellemede yeniden eklenir ve sıraya girer", blockIds(readd).join(",") === "hl2,hl5");

// İşaret enjeksiyonu
const evil = add("a --> b <!-- loomen:hl hl2 -->", 1, "hle");
const ev = insertHighlightBlock(readd, b, evil, order());
check("metindeki yorum işaretleri etkisizleşir", blockIds(ev).join(",") === "hle,hl2,hl5" && !ev.includes("a --> b"));

// Windows satır sonu korunur.
const crlf = empty.replace(/\n/g, "\r\n");
const crlfOut = insertHighlightBlock(crlf, b, h2, order());
check("CRLF korunur", !/[^\r]\n/.test(crlfOut) && blockState(crlfOut, "hl2") === "ok");

// EPUB bölüm etiketi
const e0 = newBook({ hash: "b".repeat(64), size: 1, fileName: "k.epub", format: "epub", notePath: "Kütüphane/k.md" }, NOW);
const eh = addHighlight(e0, { text: "x", anchor: { kind: "epub", spine: 2, href: "c.xhtml", start: 0, end: 1 }, color: "pink", chapter: "Giriş [1]" }, NOW, "ep1");
const en = insertHighlightBlock(bookNoteTemplate(e0), eh.book, eh.highlight, ["ep1"]);
check("EPUB bölüm adı etiket olur, köşeli parantez kaçar", en.includes("🩷 [Giriş \\[1\\]](loomen://book/"));
const eh2 = addHighlight(e0, { text: "y", anchor: { kind: "epub", spine: 2, href: "c.xhtml", start: 0, end: 1 }, color: "yellow" }, NOW, "ep2");
check("bölüm adı yoksa sıra", insertHighlightBlock(bookNoteTemplate(e0), eh2.book, eh2.highlight, ["ep2"]).includes("[Bölüm 3]"));

// Var olan çizimlerle not şablonu (not yeniden oluşturulurken)
const tpl = bookNoteTemplate(b);
check("şablon bütün çizimleri sırayla içerir", blockIds(tpl).join(",") === order().join(","));

// Kullanıcı bloğun içine yazdıysa güncelleme/silme üstüne yazmaz (inceleme bulgusu)
{
  const g0 = newBook({ hash: "c".repeat(64), size: 1, fileName: "G.pdf", format: "pdf", notePath: "Kütüphane/G.md" }, NOW);
  const r = addHighlight(g0, { text: "alıntı", anchor: pdfAt(1), color: "yellow" }, NOW, "g1");
  const base = insertHighlightBlock(bookNoteTemplate(g0), r.book, r.highlight, ["g1"]);
  const up = updateHighlight(r.book, "g1", { color: "pink" }, NOW);
  const h2 = up.highlights.find((h) => h.id === "g1")!;
  const recolored = updateHighlightBlock(base, up, h2, ["g1"], undefined, r.highlight);
  check("dokunulmamış blok renk değişince yazılır", recolored !== base && recolored.includes("🩷"));
  const edited = base.replace("<!-- /loomen:hl g1 -->", "Benim yorumum\n<!-- /loomen:hl g1 -->");
  check("elle değişmiş blok güncellenmez", updateHighlightBlock(edited, up, h2, ["g1"], undefined, r.highlight) === edited);
  check("elle değişmiş blok silinmez", removeHighlightBlock(edited, "g1", { book: r.book, h: r.highlight }) === edited);
  const EN = { page: "p. {n}", section: "Section {n}", openBook: "Open book", quotes: "Highlights", location: "Location {n}", kindle: "Kindle" };
  check("dil değişse de dokunulmamış blok silinir", blockState(removeHighlightBlock(base, "g1", { book: r.book, h: r.highlight, labels: EN }), "g1") === "missing");
  check("dil değişse de dokunulmamış blok güncellenir", updateHighlightBlock(base, up, h2, ["g1"], EN, r.highlight) !== base);
  check("dokunulmamış blok silinir", blockState(removeHighlightBlock(base, "g1", { book: r.book, h: r.highlight }), "g1") === "missing");
}

// Kindle kitabı (LOM-84)
{
  const k0 = newBook({ hash: "d".repeat(64), size: 0, fileName: "", format: "kindle", notePath: "Kütüphane/K.md", title: "Kindle Kitabı" }, NOW);
  const tplK = bookNoteTemplate(k0);
  check("kindle şablonunda kaynak satırı", tplK.includes("\n*Kindle*\n") && !tplK.includes("Kitabı aç"));
  const r1 = addHighlight(k0, { text: "Korku zihni öldürendir.", anchor: { kind: "kindle", location: { start: 180, end: 182 } }, color: "yellow" }, NOW, "ka");
  const r2 = addHighlight(r1.book, { text: "Sayfalı", anchor: { kind: "kindle", location: { start: 200, end: 200 }, page: 12 }, color: "yellow", note: "notum" }, NOW, "kb");
  const hA = r2.book.highlights.find((h) => h.id === "ka")!;
  const hB = r2.book.highlights.find((h) => h.id === "kb")!;
  check("kindle konum etiketi aralık", locationLabel(hA) === "Konum 180-182");
  check("kindle sayfa varsa sayfa", locationLabel(hB) === "s. 12");
  check("kindle tek konum", locationLabel({ ...hA, anchor: { kind: "kindle", location: { start: 7, end: 7 } } }) === "Konum 7");
  const EN_K = { page: "p. {n}", section: "Section {n}", openBook: "Open book", quotes: "Highlights", location: "Location {n}", kindle: "Kindle" };
  check("kindle konum etiketi dile göre", locationLabel(hA, EN_K) === "Location 180-182" && locationLabel(hB, EN_K) === "p. 12");
  check("eski etiket nesnesinde konum varsayılana döner", locationLabel(hA, { page: "p. {n}", section: "S {n}", openBook: "O", quotes: "Q" }) === "Konum 180-182");
  const full = bookNoteTemplate(r2.book);
  check("kindle blok biçimi aynı", full.includes(`<!-- loomen:hl ka -->\n> Korku zihni öldürendir.\n\n🟨 [Konum 180-182](loomen://book/${k0.id}?hl=ka)\n<!-- /loomen:hl ka -->`));
  check("kindle notlu blok", full.includes(`> Sayfalı\n\nnotum\n\n🟨 [s. 12](loomen://book/${k0.id}?hl=kb)`));
  check("kindle şablon sırası", blockIds(full).join(",") === "ka,kb");
}

// KOReader kitabı (LOM-94)
{
  const o0 = newBook({ hash: "e".repeat(64), size: 0, fileName: "", format: "koreader", notePath: "Kütüphane/O.md", title: "KOReader Kitabı" }, NOW);
  const tplO = bookNoteTemplate(o0);
  check("koreader şablonunda kaynak satırı", tplO.includes("\n*KOReader*\n") && !tplO.includes("Kitabı aç") && !tplO.includes("*Kindle*"));
  const EN_O = { page: "p. {n}", section: "Section {n}", openBook: "Open book", quotes: "Highlights", location: "Location {n}", kindle: "Kindle", koreader: "KOReader (EN)" };
  check("koreader kaynak satırı dile göre", bookNoteTemplate(o0, EN_O).includes("\n*KOReader (EN)*\n"));
  check("eski etiket nesnesinde koreader varsayılana döner", bookNoteTemplate(o0, { page: "p. {n}", section: "S {n}", openBook: "O", quotes: "Q" }).includes("\n*KOReader*\n"));
  const r1 = addHighlight(o0, { text: "İkinci sayfa", anchor: { kind: "koreader", page: 40 }, color: "blue", chapter: "Bölüm 2" }, NOW, "ob");
  const r2 = addHighlight(r1.book, { text: "İlk sayfa", anchor: { kind: "koreader", page: 7, pos0: "/body/p[1]" }, color: "yellow", note: "notum" }, NOW, "oa");
  const hA = r2.book.highlights.find((h) => h.id === "oa")!;
  const hB = r2.book.highlights.find((h) => h.id === "ob")!;
  check("koreader yer etiketi sayfa (bölüm adı değil)", locationLabel(hA) === "s. 7" && locationLabel(hB) === "s. 40");
  check("koreader yer etiketi dile göre", locationLabel(hB, EN_O) === "p. 40");
  const full = bookNoteTemplate(r2.book);
  check("koreader blok biçimi aynı", full.includes(`<!-- loomen:hl oa -->\n> İlk sayfa\n\nnotum\n\n🟨 [s. 7](loomen://book/${o0.id}?hl=oa)\n<!-- /loomen:hl oa -->`));
  check("koreader renk simgesi", full.includes(`🟦 [s. 40](loomen://book/${o0.id}?hl=ob)`));
  check("koreader şablon sırası sayfaya göre", blockIds(full).join(",") === "oa,ob");
}

// Kobo kitabı (LOM-95)
{
  const k0 = newBook({ hash: "f".repeat(64), size: 0, fileName: "", format: "kobo", notePath: "Kütüphane/K.md", title: "Kobo Kitabı" }, NOW);
  const tplK = bookNoteTemplate(k0);
  check("kobo şablonunda kaynak satırı", tplK.includes("\n*Kobo*\n") && !tplK.includes("Kitabı aç") && !tplK.includes("*KOReader*"));
  const EN_K = { page: "p. {n}", section: "Section {n}", openBook: "Open book", quotes: "Highlights", location: "Location {n}", kindle: "Kindle", koreader: "KOReader", kobo: "Kobo (EN)", progress: "{n}%" };
  check("kobo kaynak satırı dile göre", bookNoteTemplate(k0, EN_K).includes("\n*Kobo (EN)*\n"));
  check("eski etiket nesnesinde kobo varsayılana döner", bookNoteTemplate(k0, { page: "p. {n}", section: "S {n}", openBook: "O", quotes: "Q" }).includes("\n*Kobo*\n"));
  const r1 = addHighlight(k0, { text: "Bölüm adlı", anchor: { kind: "kobo", progress: 0.5, chapter: 1 }, color: "blue", chapter: "İkinci Bölüm" }, NOW, "kb");
  const r2 = addHighlight(r1.book, { text: "Adsız bölüm", anchor: { kind: "kobo", progress: 0.2, chapter: 0 }, color: "yellow", note: "notum" }, NOW, "ka");
  const r3 = addHighlight(r2.book, { text: "Bölümsüz", anchor: { kind: "kobo", progress: 0.426 }, color: "pink" }, NOW, "kc");
  const hA = r3.book.highlights.find((h) => h.id === "ka")!;
  const hB = r3.book.highlights.find((h) => h.id === "kb")!;
  const hC = r3.book.highlights.find((h) => h.id === "kc")!;
  check("kobo yer etiketi bölüm adı", locationLabel(hB) === "İkinci Bölüm");
  check("kobo yer etiketi bölüm sırası", locationLabel(hA) === "Bölüm 1" && locationLabel(hA, EN_K) === "Section 1");
  check("kobo yer etiketi yüzde", locationLabel(hC) === "%43" && locationLabel(hC, EN_K) === "43%");
  check("eski etiket nesnesinde yüzde varsayılana döner", locationLabel(hC, { page: "p. {n}", section: "S {n}", openBook: "O", quotes: "Q" }) === "%43");
  const full = bookNoteTemplate(r3.book);
  check("kobo blok biçimi aynı", full.includes(`<!-- loomen:hl ka -->\n> Adsız bölüm\n\nnotum\n\n🟨 [Bölüm 1](loomen://book/${k0.id}?hl=ka)\n<!-- /loomen:hl ka -->`));
  check("kobo şablon sırası bölüm, bölümsüz sonda", blockIds(full).join(",") === "ka,kb,kc");
}

// --- Kalem notları (LOM-97, K6) ---
{
  const ib = { ...b0, id: "1111222233334444" };
  const href = (p: number) => `loomen://book/${ib.id}?page=${p}`;
  check("kalem resim yolu", inkImagePath(ib.id, 12) === `Kütüphane/Kalem/${ib.id}-s12.png`);
  let threw = false;
  try {
    inkImagePath("../x", 1);
  } catch {
    threw = true;
  }
  check("kalem resim yolu kimliği denetler", threw);
  const bl = inkBlockLines(ib, 12);
  check(
    "kalem blok biçimi",
    bl.join("\n") === `<!-- loomen:ink p12 -->\n![[Kütüphane/Kalem/${ib.id}-s12.png]]\n\n✏️ [s. 12](${href(12)})\n<!-- /loomen:ink p12 -->`,
    bl.join(" | "),
  );

  const base = bookNoteTemplate(ib);
  check("kalemsiz şablonda bölüm yok", !base.includes("Kalem notları") && !base.includes("loomen:ink"));
  const t1 = insertInkBlock(base, ib, 12);
  check("ilk kalem bloğu başlıkla sona eklenir", t1.includes(`## Kalem notları\n\n<!-- loomen:ink p12 -->`) && t1.endsWith("<!-- /loomen:ink p12 -->\n"));
  check("alıntılar bölümü yerinde", t1.indexOf("## Alıntılar") < t1.indexOf("## Kalem notları"));
  check("kalem durumu ok", inkBlockState(t1, 12) === "ok" && inkBlockState(t1, 3) === "missing");
  const t2 = insertInkBlock(insertInkBlock(t1, ib, 30), ib, 3);
  check("kalem blokları sayfa sırasıyla", inkBlockPages(t2).join(",") === "3,12,30", inkBlockPages(t2).join(","));
  check("başlık tek", t2.split("## Kalem notları").length === 2);
  check("ekleme iki kez aynı", insertInkBlock(t2, ib, 12) === t2 && updateInkBlock(t2, ib, 12) === t2);
  check("çizim blokları kalem bloğu sayılmaz", blockIds(t2).length === 0);

  // Başlık var, blok yok (kullanıcı başlığı önceden yazmış ya da bloklar silinmiş).
  const withHead = base.replace(/\n$/, "") + "\n\n## Kalem notları\n\nKendi yazım\n";
  const t3 = insertInkBlock(withHead, ib, 5);
  check("var olan başlığın altına girer", t3.includes("## Kalem notları\n\n<!-- loomen:ink p5 -->") && t3.includes("<!-- /loomen:ink p5 -->\n\nKendi yazım"));
  check("başlık çoğalmaz", t3.split("## Kalem notları").length === 2);

  // Kullanıcı bloğa yazdıysa ezilmez; bozuk bloğa dokunulmaz.
  const edited = t2.replace(`✏️ [s. 12](${href(12)})`, `✏️ [s. 12](${href(12)}) benim notum`);
  check("elle değişen kalem bloğu yeniden yazılmaz", insertInkBlock(edited, ib, 12) === edited);
  check("elle değişen kalem bloğu beklenenle silinmez", removeInkBlock(edited, 12, { book: ib }) === edited);
  const broken = t2.replace("<!-- /loomen:ink p12 -->", "");
  check("bitişi olmayan kalem bloğu bozuk", inkBlockState(broken, 12) === "broken");
  check("bozuk kalem bloğuna eklenmez", insertInkBlock(broken, ib, 12) === broken && removeInkBlock(broken, 12) === broken);
  check("bozuk blok sonrakini yutmaz", inkBlockState(broken, 30) === "ok");

  // Dil değişince etiket güncellenir (blok "elle değişmiş" sayılmaz).
  const EN = { page: "p. {n}", section: "Section {n}", openBook: "Open book", quotes: "Highlights", ink: "Pen notes" };
  const en = updateInkBlock(t2, ib, 12, EN);
  check("kalem etiketi dile göre güncellenir", en.includes(`✏️ [p. 12](${href(12)})`) && en.includes(`✏️ [s. 3](${href(3)})`));
  check("İngilizce notta Türkçe başlık tanınır", insertInkBlock(en, ib, 40, EN).split("Kalem notları").length === 2 && !insertInkBlock(en, ib, 40, EN).includes("Pen notes"));
  check("İngilizce başlık", insertInkBlock(base, ib, 1, EN).includes("## Pen notes\n\n<!-- loomen:ink p1 -->"));
  check("etiketsiz eski nesnede varsayılan başlık", insertInkBlock(base, ib, 1, { page: "p. {n}", section: "S {n}", openBook: "O", quotes: "Q" }).includes("## Kalem notları"));

  // Kaldırma: blok ve bir boş satır gider, başlık kalır.
  const r = removeInkBlock(t2, 12, { book: ib });
  check("kalem bloğu kaldırılır", inkBlockPages(r).join(",") === "3,30" && !r.includes("\n\n\n"));
  const r0 = removeInkBlock(removeInkBlock(r, 3), 30);
  check("son blok gidince başlık kalır", inkBlockPages(r0).length === 0 && r0.includes("## Kalem notları") && r0.endsWith("## Kalem notları\n"));
  check("olmayan bloğu kaldırmak metni değiştirmez", removeInkBlock(base, 9) === base);

  // CRLF korunur.
  const crlf = t1.replace(/\n/g, "\r\n");
  const c2 = insertInkBlock(crlf, ib, 20);
  check("CRLF korunur", !/[^\r]\n/.test(c2) && inkBlockPages(c2).join(",") === "12,20");

  // Çizim ve kalem blokları birbirini bozmaz.
  let hb = ib;
  hb = addHighlight(hb, { text: "Bir alıntı", anchor: pdfAt(2), color: "green" }, NOW, "h1").book;
  const mixed = insertInkBlock(bookNoteTemplate(hb), hb, 2);
  check("çizim bloğu kalem ekleyince sağlam", blockState(mixed, "h1") === "ok" && blockIds(mixed).join(",") === "h1");
  const mixed2 = insertHighlightBlock(mixed, hb, { ...hb.highlights[0], id: "h2" }, ["h1", "h2"]);
  check("çizim eklemek kalem bloğunu bozmaz", inkBlockState(mixed2, 2) === "ok" && mixed2.indexOf("loomen:hl h2") < mixed2.indexOf("## Kalem notları"));
  // Kalem bölümü varken ilk alıntı Alıntılar bölümüne girer, kalem bölümüne karışmaz.
  const inkOnly = insertInkBlock(bookNoteTemplate(ib), ib, 3);
  const firstHl = insertHighlightBlock(inkOnly, ib, { ...hb.highlights[0], id: "h9" }, ["h9"]);
  check("ilk alıntı kalem başlığının önüne girer", firstHl.indexOf("loomen:hl h9") > firstHl.indexOf("## Alıntılar") && firstHl.indexOf("<!-- /loomen:hl h9 -->") < firstHl.indexOf("## Kalem notları") && firstHl.includes("<!-- /loomen:hl h9 -->\n\n## Kalem notları") && !firstHl.includes("\n\n\n"));
  const noHead = inkOnly.replace("## Kalem notları\n\n", "");
  const firstHl2 = insertHighlightBlock(noHead, ib, { ...hb.highlights[0], id: "h9" }, ["h9"]);
  check("başlık silinmişse ilk kalem bloğunun önüne girer", firstHl2.indexOf("<!-- /loomen:hl h9 -->") < firstHl2.indexOf("loomen:ink p3"));
  check("geçersiz kimlikte kalem eşitlemesi hata atmaz", insertInkBlock(base, { id: "../x" }, 1) === base && removeInkBlock(t1, 12, { book: { id: "../x" } }) === t1);
  const hlBroken = mixed.replace("<!-- /loomen:hl h1 -->", "");
  check("bitişi olmayan çizim bloğu kalem bloğunu yutmaz", blockState(hlBroken, "h1") === "broken" && inkBlockState(hlBroken, 2) === "ok");

  // Şablon ve eşitleme kitabın kalem kaydından.
  let kb = ib;
  kb = addInkStroke(kb, 7, [{ x: 0.1, y: 0.1 }], NOW, "s1").book;
  kb = addInkStroke(kb, 2, [{ x: 0.2, y: 0.2 }], NOW, "s2").book;
  const tpl = bookNoteTemplate(kb);
  check("şablonda kalem bölümü sayfa sırasıyla", inkBlockPages(tpl).join(",") === "2,7" && tpl.includes("## Alıntılar\n\n## Kalem notları") && !tpl.includes("\n\n\n"));
  check("şablon eşitlemeyle aynı", syncInkBlocks(tpl, kb) === tpl);
  check("eşitleme eksik blokları ekler", inkBlockPages(syncInkBlocks(base, kb)).join(",") === "2,7");
  const cleared = clearInkPage(kb, 7, NOW + 1);
  const synced = syncInkBlocks(tpl, cleared);
  check("temizlenen sayfanın bloğu eşitlemede kalkar", inkBlockPages(synced).join(",") === "2");
  const editedTpl = tpl.replace(`✏️ [s. 7](${href(7)})`, "elle");
  check("eşitleme elle değişen bloğu silmez", inkBlockState(syncInkBlocks(editedTpl, cleared), 7) === "ok");
}

// Paylaşılan alıntı (LOM-96)
{
  const s0 = newBook({ hash: "d".repeat(64), size: 0, fileName: "", format: "shared", notePath: "Kütüphane/P.md", title: "Paylaşılan Kitap" }, NOW);
  const tplS = bookNoteTemplate(s0);
  check("paylaşım şablonunda kaynak satırı", tplS.includes("\n*Paylaşıldı*\n") && !tplS.includes("Kitabı aç") && !tplS.includes("*Kindle*"));
  const EN_S = { page: "p. {n}", section: "Section {n}", openBook: "Open book", quotes: "Highlights", shared: "Shared" };
  check("paylaşım kaynak satırı dile göre", bookNoteTemplate(s0, EN_S).includes("\n*Shared*\n"));
  check("eski etiket nesnesinde paylaşım varsayılana döner", bookNoteTemplate(s0, { page: "p. {n}", section: "S {n}", openBook: "O", quotes: "Q" }).includes("\n*Paylaşıldı*\n"));
  const r1 = addHighlight(s0, { text: "Paylaşılan cümle", anchor: { kind: "shared", app: "applebooks" }, color: "yellow" }, NOW, "sa");
  const r2 = addHighlight(r1.book, { text: "Sayfalı cümle", anchor: { kind: "shared", page: 9 }, color: "green" }, NOW + 1, "sb");
  const hA = r2.book.highlights.find((h) => h.id === "sa")!;
  const hB = r2.book.highlights.find((h) => h.id === "sb")!;
  check("paylaşım yer etiketi", locationLabel(hA) === "Paylaşıldı" && locationLabel(hB) === "Paylaşıldı · s. 9");
  check("paylaşım yer etiketi dile göre", locationLabel(hA, EN_S) === "Shared" && locationLabel(hB, EN_S) === "Shared · p. 9");
  const full = bookNoteTemplate(r2.book);
  check("paylaşım blok biçimi aynı", full.includes(`<!-- loomen:hl sa -->\n> Paylaşılan cümle\n\n🟨 [Paylaşıldı](loomen://book/${s0.id}?hl=sa)\n<!-- /loomen:hl sa -->`));
  check("paylaşım şablon sırası geliş anına göre", blockIds(full).join(",") === "sa,sb");
  // Dosyalı (PDF) kitabın notuna paylaşım bloğu: "Kitabı aç" bağlantısı yerinde kalır.
  const p0 = newBook({ hash: "c".repeat(64), size: 1, fileName: "p.pdf", format: "pdf", notePath: "Kütüphane/PDF.md", title: "PDF" }, NOW);
  const pr = addHighlight(p0, { text: "Dışarıdan", anchor: { kind: "shared" }, color: "yellow" }, NOW, "sz");
  const pNote = insertHighlightBlock(bookNoteTemplate(p0), pr.book, pr.highlight, ["sz"]);
  check("pdf notuna paylaşım bloğu", pNote.includes(`[Kitabı aç](loomen://book/${p0.id})`) && pNote.includes(`🟨 [Paylaşıldı](loomen://book/${p0.id}?hl=sz)`) && blockIds(pNote).join(",") === "sz");
}

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nKitap notu blokları: tüm kontroller geçti");

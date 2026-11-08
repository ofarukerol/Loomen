// Kitap notundaki çizim bloklarının testi (LOM-83, K3).
import {
  addHighlight,
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

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nKitap notu blokları: tüm kontroller geçti");

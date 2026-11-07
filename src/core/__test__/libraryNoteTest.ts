// Kitap notundaki çizim bloklarının testi (LOM-83, K3).
import {
  addHighlight,
  blockIds,
  blockState,
  bookNoteTemplate,
  insertHighlightBlock,
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

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nKitap notu blokları: tüm kontroller geçti");

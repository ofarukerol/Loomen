// Asistanın kütüphane bilgisi testi (LOM-87): raf özeti ve sınırı, soruda kitap/yazar eşleşmesi
// (Türkçe harf ve ekler), kitap sorusu tanıma, çizim bağlamı, kitap notundaki gizli işaretlerin
// parçaya girmemesi, sistem metninde Kütüphane bölümü.
import { chunkNote } from "../ai/chunk";
import { buildContext, buildSystemPrompt } from "../ai/context";
import {
  highlightsContext,
  isBookQuestion,
  libraryDigest,
  libraryHint,
  libraryPromptContext,
  matchBooksInQuestion,
  type LibraryBook,
} from "../ai/library";
import { bookNoteTemplate, type Book, type Highlight } from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
const show = (v: unknown) => JSON.stringify(v);

const NOW = 1_800_000_000_000;

function hl(id: string, text: string, page: number, note?: string): Highlight {
  return {
    id,
    color: "yellow",
    text,
    note,
    anchor: { kind: "pdf", page, rects: [{ x: 0, y: 0, w: 1, h: 0.1 }] },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function book(id: string, title: string, author: string | undefined, highlights: Highlight[], over: Partial<Book> = {}): Book {
  return {
    id,
    title,
    author,
    format: "pdf",
    hash: id.padEnd(64, "0"),
    size: 1,
    fileName: `${title}.pdf`,
    status: "reading",
    notePath: `Kütüphane/${title}.md`,
    addedAt: NOW,
    updatedAt: NOW,
    pages: 300,
    progress: 0.42,
    highlights,
    ...over,
  };
}

const sapiens = book("aaaaaaaaaaaaaaaa", "Sapiens: Hayvanlardan Tanrılara", "Yuval Noah Harari", [
  hl("h1", "Tarım devrimi tarihin en büyük sahtekârlığıydı.", 87, "Buğday bizi evcilleştirdi."),
  hl("h2", "Para, insanların icat ettiği en evrensel güven sistemidir.", 180),
]);
const ince = book("bbbbbbbbbbbbbbbb", "İnce Memed", "Yaşar Kemal", [hl("i1", "Toros dağlarında bir köy.", 3)], {
  status: "done",
  updatedAt: NOW - 1000,
});
const su = book("cccccccccccccccc", "Su", undefined, [], { status: "toread", updatedAt: NOW - 5 });
const shelf = [su, ince, sapiens];

// ─── Raf özeti ────────────────────────────────────────────────────────────────────
{
  const d = libraryDigest(shelf);
  const lines = d.split("\n");
  check("özet başlığı kitap ve çizim sayısını söyler", lines[0] === "Rafta 3 kitap, toplam 3 çizim var.", lines[0]);
  check("okunan kitap önce", lines[1].startsWith('- "Sapiens: Hayvanlardan Tanrılara" — Yuval Noah Harari'), lines[1]);
  check("durum, ilerleme, sayfa, çizim sayısı", lines[1].endsWith("· okunuyor · %42 · 300 sayfa · 2 çizim"), lines[1]);
  check("biten ikinci, okunacak son", lines[2].includes("İnce Memed") && lines[2].includes("bitti") && lines[3].includes('"Su"') && lines[3].includes("okunacak"), show(lines));
  check("yazarsız kitapta tire yok", lines[3] === '- "Su" · okunacak · 300 sayfa · 0 çizim', lines[3]);
  check("boş raf boş özet", libraryDigest([]) === "" && libraryHint([]) === "");
  check("ipucu tek satır", libraryHint(shelf) === "Kullanıcının Kütüphane'sinde 3 kitap var.");

  const many: Book[] = [];
  for (let i = 0; i < 120; i++) many.push(book(`d${String(i).padStart(15, "0")}`, `Kitap numarası ${i} uzun bir başlık`, `Yazar ${i}`, [], { updatedAt: NOW - i }));
  const big = libraryDigest(many);
  const bl = big.split("\n");
  check("özet karakter sınırında kalır", big.length <= 1500, String(big.length));
  check("kalan kitap sayısı söylenir", /^… ve \d+ kitap daha\.$/.test(bl[bl.length - 1]), bl[bl.length - 1]);
  const shown = bl.filter((l) => l.startsWith("- ")).length;
  check("gösterilen + kalan = toplam", bl[bl.length - 1] === `… ve ${120 - shown} kitap daha.`, `${shown}`);
  const capped = libraryDigest(many, { maxBooks: 5, maxChars: 100_000 }).split("\n");
  check("kitap sınırı", capped.filter((l) => l.startsWith("- ")).length === 5 && capped[capped.length - 1] === "… ve 115 kitap daha.");
  const long = libraryDigest([book("jjjjjjjjjjjjjjjj", "Ç".repeat(5000), "Y".repeat(5000), [])]);
  check("çok uzun başlık/yazar kısaltılır", long.length < 300 && long.includes("…"), String(long.length));
  const evil = libraryDigest([book("eeeeeeeeeeeeeeee", "Satır\nkıran\tbaşlık", "Ad\nSoyad", [])]);
  check("başlıktaki satır sonu özeti bölmez", evil.split("\n").length === 2 && evil.includes('"Satır kıran başlık" — Ad Soyad'), evil);
}

// ─── Soruda kitap eşleşmesi ──────────────────────────────────────────────────────
{
  const names = (q: string) => matchBooksInQuestion(shelf, q).map((b) => b.id);
  check("ana başlık + Türkçe ek", show(names("Sapiens'ten ne çizmiştim?")) === show([sapiens.id]));
  check("tam başlık", show(names("sapiens: hayvanlardan tanrılara kitabındaki çizimler")) === show([sapiens.id]));
  check("büyük İ ve ı yok sayılır", show(names("INCE MEMED'de ne vardı")) === show([ince.id]));
  check("yazar soyadıyla", show(names("Harari'nin kitabında para hakkında ne dedim")) === show([sapiens.id]));
  check("yazar tam adıyla, aksansız", show(names("yasar kemal okudum mu")) === show([ince.id]));
  check("kısa başlık her soruya uymaz", !names("Su içmeyi unutma, susadım").includes(su.id));
  check("sözcük ortası eşleşmez", show(names("homosapiens nedir")) === "[]");
  check("eşleşme yoksa boş", show(names("bugün hava nasıl")) === "[]");
  check("boş soru boş", show(names("   ")) === "[]");
  const comma = [book("kkkkkkkkkkkkkkkk", "Homo Deus", "Harari, Yuval Noah", [])];
  check("\"Soyad, Ad\" yazımında soyadı", matchBooksInQuestion(comma, "Harari'nin kitabı").length === 1);
  check("\"Soyad, Ad\" yazımında ad soyadı sayılmaz", matchBooksInQuestion(comma, "Noah'ın gemisi").length === 0);
  check("başlık eşleşmesi yazardan önce", show(names("Harari ve İnce Memed")) === show([ince.id, sapiens.id]));
}

// ─── Kitap sorusu tanıma ─────────────────────────────────────────────────────────
{
  for (const q of [
    "Bu kitaptan ne çizmiştim?",
    "Şu konuda hangi kitaplarda ne okudum?",
    "Altını çizdiğim yerler",
    "KİTAPLARIM",
    "alıntılarımı göster",
    "Hangi yazarları okuyorum?",
    "What did I highlight in this book?",
    "Bu kitabın özeti ne?",
    "Kitabımda ne yazıyordu",
    "Hangi romanları bitirdim",
  ]) check(`kitap sorusu: ${q}`, isBookQuestion(q));
  for (const q of ["Toplantı notlarını özetle", "Çizelge nasıl yapılır", "Okul servisi saat kaçta", "yarın ne yapacağım", "Not yazarak özetle", "Romantik bir mesaj yaz", "bookmark ekle"]) {
    check(`kitap sorusu değil: ${q}`, !isBookQuestion(q));
  }
}

// ─── Çizim bağlamı ───────────────────────────────────────────────────────────────
{
  const hits = highlightsContext(sapiens);
  check("tek parça", hits.length === 1, String(hits.length));
  const c = hits[0].chunk;
  check("kaynak kitabın notu", c.path === sapiens.notePath && c.title === sapiens.title && c.heading === "Çizimler", show(c));
  check("kitap başlığı ve sayısı", c.text.startsWith('Kitap: "Sapiens: Hayvanlardan Tanrılara" — Yuval Noah Harari (2 çizim)'), c.text);
  check("alıntı yer etiketiyle", c.text.includes("> Tarım devrimi tarihin en büyük sahtekârlığıydı. (s. 87)"), c.text);
  check("kullanıcının notu", c.text.includes("Not: Buğday bizi evcilleştirdi."));
  check("kitap sırası korunur", c.text.indexOf("Tarım") < c.text.indexOf("Para,"));

  const empty = highlightsContext(su);
  check("çizimsiz kitap açıkça söylenir", empty.length === 1 && empty[0].chunk.text.includes("Bu kitapta henüz çizim yok."), show(empty));

  const lots = book("ffffffffffffffff", "Uzun Kitap", "Biri", Array.from({ length: 60 }, (_, i) => hl(`l${i}`, `Bu ${i}. çizimin metni, biraz uzunca bir cümle olsun diye yazıldı.`, i + 1)));
  const lh = highlightsContext(lots, { maxChars: 2000 });
  const total = lh.reduce((n, h) => n + h.chunk.text.length, 0);
  check("bütçe aşılmaz", total <= 2000 + 120, String(total));
  check("birden çok parça, sıra numaralı", lh.length > 1 && lh.every((h, i) => h.chunk.index === i), String(lh.length));
  check("parçalar not parçası boyunda", lh.every((h) => h.chunk.text.length <= 900), show(lh.map((h) => h.chunk.text.length)));
  check("kalan çizim sayısı söylenir", /… ve \d+ çizim daha/.test(lh[lh.length - 1].chunk.text));
  check("skor sırası azalan", lh.every((h, i) => i === 0 || h.score < lh[i - 1].score));

  const huge = book("gggggggggggggggg", "Dev", undefined, [hl("g1", "kelime ".repeat(500), 1)]);
  const gh = highlightsContext(huge)[0].chunk.text;
  check("çok uzun alıntı kısaltılır", gh.length < 800 && gh.includes(" … (s. 1)"), String(gh.length));
}

// ─── Soru için kütüphane payı ────────────────────────────────────────────────────
{
  const p = libraryPromptContext(shelf, "Sapiens'ten ne çizmiştim?");
  check("eşleşen kitabın çizimleri", p.matched.length === 1 && p.hits.length === 1 && p.hits[0].chunk.path === sapiens.notePath);
  check("kitap sorusunda tam özet", p.library.startsWith("Rafta 3 kitap"), p.library);
  const g = libraryPromptContext(shelf, "Toplantı notlarını özetle");
  check("ilgisiz soruda yalnız ipucu", g.hits.length === 0 && g.library === libraryHint(shelf), g.library);
  const t = libraryPromptContext(shelf, "Şu konuda hangi kitaplarda ne okudum?");
  check("kitap adı yoksa çizim yok ama özet var", t.hits.length === 0 && t.library.startsWith("Rafta"));
  check("boş raf hiçbir şey eklemez", show(libraryPromptContext([], "Sapiens")) === show({ hits: [], library: "", matched: [] }));
  const four = [sapiens, ince, book("hhhhhhhhhhhhhhhh", "Dune", "Frank Herbert", []), book("iiiiiiiiiiiiiiii", "Körlük", "Jose Saramago", [])];
  check("en çok 3 kitap", libraryPromptContext(four, "Sapiens, İnce Memed, Dune ve Körlük").matched.length === 3);

  // Getirilen not parçalarıyla aynı alıntı yolu: numara ve kaynak yolu doğru.
  const built = buildContext(p.hits);
  check("alıntı numarası ve kaynak", built.citations.length === 1 && built.citations[0].n === 1 && built.citations[0].path === sapiens.notePath, show(built.citations));
  check("bağlamda kitap ve çizim", built.text.startsWith("[1] Sapiens: Hayvanlardan Tanrılara › Çizimler\nKitap:"), built.text);
}

// ─── Kitap notundaki gizli işaretler parçaya girmez ──────────────────────────────
{
  const note = bookNoteTemplate(sapiens);
  check("şablonda işaret var (ön koşul)", note.includes("<!-- loomen:hl h1 -->"));
  const chunks = chunkNote(sapiens.notePath, note);
  const all = chunks.map((c) => c.text).join("\n");
  check("parçada loomen:hl yok", !all.includes("loomen:hl") && !all.includes("<!--"), all);
  check("alıntı ve not parçada kalır", all.includes("> Tarım devrimi") && all.includes("Buğday bizi evcilleştirdi."), all);
  check("başlık zinciri korunur", chunks.some((c) => c.heading.endsWith("Alıntılar")), show(chunks.map((c) => c.heading)));

  const ink = "# Kitap\n\n## Kalem notları\n\n<!-- loomen:ink p12 -->\n![[Kütüphane/Kalem/x-s12.png]]\n\n✏️ [s. 12](loomen://book/x?page=12)\n<!-- /loomen:ink p12 -->\n";
  const ic = chunkNote("Kütüphane/K.md", ink).map((c) => c.text).join("\n");
  check("parçada loomen:ink yok", !ic.includes("loomen:ink") && ic.includes("s. 12"), ic);

  const code = "# Örnek\n\n```\n<!-- loomen:hl h1 -->\n```\n";
  const cc = chunkNote("N.md", code).map((c) => c.text).join("\n");
  check("kod bloğundaki işaret metni korunur", cc.includes("<!-- loomen:hl h1 -->"), cc);
  const other = chunkNote("N.md", "Metin\n<!-- kendi yorumum -->\n").map((c) => c.text).join("\n");
  check("başka HTML yorumu atılmaz", other.includes("<!-- kendi yorumum -->"), other);
}

// ─── Sistem metni ────────────────────────────────────────────────────────────────
{
  const ctx = buildContext(highlightsContext(sapiens));
  const digest = libraryDigest(shelf);
  const sp = buildSystemPrompt({ context: ctx, library: digest });
  check("Kütüphane bölümü var", sp.includes(`--- KÜTÜPHANE ---\n${digest}\n--- KÜTÜPHANE SONU ---`));
  check("çizimlerden cevap ver, uydurma", sp.includes("Çizimler") && sp.includes("uydurma"));
  check("bağlam bölümü önce, kütüphane sonra", sp.indexOf("NOTLARDAN İLGİLİ BÖLÜMLER") < sp.indexOf("--- KÜTÜPHANE ---"));
  const plain = buildSystemPrompt({ context: ctx });
  check("kütüphane yoksa bölüm yok", !plain.includes("KÜTÜPHANE") && !plain.includes("Kütüphane'si"));
  check("boş metin bölüm açmaz", !buildSystemPrompt({ context: ctx, library: "  " }).includes("KÜTÜPHANE"));
  check("null bölüm açmaz", !buildSystemPrompt({ context: ctx, library: null }).includes("KÜTÜPHANE"));
  const hint = buildSystemPrompt({ context: { text: "", citations: [] }, library: libraryHint(shelf) });
  check("ipucu da bölümde", hint.includes("Kullanıcının Kütüphane'sinde 3 kitap var."));
}

// LibraryBook türü Book'un alt kümesi: tam Book kabul edilir (tip denetimi).
const _typed: LibraryBook = sapiens;
void _typed;

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\naiLibraryTest: hepsi geçti");

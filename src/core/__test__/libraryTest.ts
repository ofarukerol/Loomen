// Kütüphane çekirdeğinin node testi: kayıt biçimi, hesaplar, kasa deposu (LOM-83).
import {
  LIBRARY_DIR,
  addHighlight,
  applyMeta,
  bookFileName,
  bookIdFromHash,
  createMemoryBookFiles,
  coverFileName,
  decodeBook,
  detectFormat,
  encodeBook,
  freeNotePath,
  loadBooks,
  locateBookNote,
  markOpened,
  newBook,
  newHighlightId,
  normalizeReaderPrefs,
  positionOfAnchor,
  removeBook,
  removeHighlight,
  safeNoteName,
  saveBook,
  setPosition,
  setStatus,
  sha256Hex,
  shelfBooks,
  shelfCounts,
  titleFromFileName,
  updateHighlight,
  type Book,
} from "../library";
import type { DirEntry, VaultBackend } from "../vault/types";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}
async function rejects(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
}

const NOW = Date.UTC(2026, 10, 7, 10);
const enc = (s: string) => new TextEncoder().encode(s);

// ─── Özet ve biçim ───
const hash = await sha256Hex(enc("abc"));
check("SHA-256 bilinen değer", hash === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", hash);
check("kimlik özetin ilk 16 hanesi", bookIdFromHash(hash) === "ba7816bf8f01cfea");

const pdf = enc("%PDF-1.7\n...");
const epubHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...enc("....mimetypeapplication/epub+zip")]);
const zipOnly = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
check("PDF imzadan tanınır", detectFormat("x.bin", pdf) === "pdf");
check("EPUB mimetype'tan tanınır", detectFormat("x.zip", epubHead) === "epub");
check("ZIP + .epub uzantısı EPUB", detectFormat("Kitap.EPUB", zipOnly) === "epub");
check("ZIP + .zip uzantısı reddedilir", detectFormat("a.zip", zipOnly) === null);
check("rastgele dosya reddedilir", detectFormat("a.pdf", enc("merhaba")) === null);
check("başında çöp olan PDF uzantıyla kabul", detectFormat("a.pdf", enc("\n\n%PDF-1.4")) === "pdf");

check("başlık dosya adından", titleFromFileName("/Users/x/Suç_ve_Ceza.pdf") === "Suç ve Ceza");
check("Windows yolu", titleFromFileName("C:\\Kitaplar\\Dune.epub") === "Dune");
check("Android belge yolu", titleFromFileName("content://x/document/primary%3ADownload%2FKitap.pdf") === "Kitap");
check("not adı yasak karakter atar", safeNoteName('a/b:c*?"<>|[x]') === "a b c x", safeNoteName('a/b:c*?"<>|[x]'));
check("not adı nokta ile başlamaz", safeNoteName("...gizli") === "gizli");
check("boş not adı Kitap", safeNoteName("  ") === "Kitap");
const taken = new Set([`${LIBRARY_DIR}/Dune.md`, `${LIBRARY_DIR}/Dune 2.md`]);
check("boş not yolu sayı ekler", freeNotePath("Dune", (p) => taken.has(p)) === `${LIBRARY_DIR}/Dune 3.md`);

// ─── Yeni kitap, durum ───
const b0 = newBook({ hash, size: 3, fileName: "/tmp/Dune.pdf", format: "pdf", notePath: `${LIBRARY_DIR}/Dune.md` }, NOW);
check("yeni kitap okunacak", b0.status === "toread" && b0.title === "Dune" && b0.fileName === "Dune.pdf");
check("dosya adı özet + biçim", bookFileName(b0) === `${hash}.pdf`);
check("geçersiz özet hata", throws(() => newBook({ hash: "xyz", size: 1, fileName: "a.pdf", format: "pdf", notePath: "a.md" }, NOW)));
const opened = markOpened(b0, NOW + 1);
check("açılınca okunuyor", opened.status === "reading");
check("okunuyor kitap açılınca aynı nesne", markOpened(opened, NOW + 2) === opened);
const done = setStatus(opened, "done", NOW + 5);
check("bitti → bitiş anı", done.finishedAt === NOW + 5);
check("bitti'den çıkınca bitiş anı silinir", setStatus(done, "reading", NOW + 6).finishedAt === undefined);
check("aynı durum aynı nesne", setStatus(done, "done", NOW + 7) === done);

// ─── Konum ───
const p1 = setPosition(b0, { kind: "pdf", page: 3, offset: 0.25 }, 0.1, NOW + 1);
check("konum yazılır", p1.position?.kind === "pdf" && p1.progress === 0.1);
check("aynı konum aynı nesne", setPosition(p1, { kind: "pdf", page: 3, offset: 0.25 }, 0.1, NOW + 2) === p1);
check("ilerleme 0..1'e kırpılır", setPosition(b0, { kind: "pdf", page: 1, offset: 0 }, 7, NOW).progress === 1);

// ─── Bilgi ───
const m1 = applyMeta(b0, { title: "Dune: Çöl Gezegeni", author: "Frank Herbert", pages: 600 }, NOW + 1);
check("dosya adından gelen başlık değişir", m1.title === "Dune: Çöl Gezegeni" && m1.author === "Frank Herbert" && m1.pages === 600);
const m2 = applyMeta(m1, { title: "Başka", author: "Başka" }, NOW + 2);
check("verilmiş başlık/yazar ezilmez", m2 === m1);

// ─── Çizimler ───
const ids = ["aaaaaa"];
let n = 0;
const seq = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
const fixedRand = () => seq[n++ % seq.length];
const hid = newHighlightId(ids, fixedRand);
check("çakışan kimlik yeniden üretilir", hid !== "aaaaaa" && /^[a-z0-9]{6}$/.test(hid), hid);

const a1 = addHighlight(b0, { text: "  ikinci\nsayfa ", anchor: { kind: "pdf", page: 2, rects: [{ x: 0.1, y: 0.5, w: 0.3, h: 0.02 }] }, color: "green" }, NOW, "h2");
const a2 = addHighlight(a1.book, { text: "birinci", anchor: { kind: "pdf", page: 1, rects: [{ x: 0.1, y: 0.9, w: 0.3, h: 0.02 }] }, color: "yellow", note: " not " }, NOW, "h1");
const a3 = addHighlight(a2.book, { text: "ikinci üst", anchor: { kind: "pdf", page: 2, rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.02 }] }, color: "blue" }, NOW, "h3");
check("alıntı sadeleşir", a1.highlight.text === "ikinci sayfa");
check("not kırpılır", a2.highlight.note === "not");
check("kitap sırası: sayfa → üst kenar", a3.book.highlights.map((h) => h.id).join(",") === "h1,h3,h2");
check("boş seçim hata", throws(() => addHighlight(b0, { text: "  ", anchor: { kind: "pdf", page: 1, rects: [] }, color: "yellow" }, NOW, "x")));
check("biçime uymayan çıpa hata", throws(() => addHighlight(b0, { text: "a", anchor: { kind: "epub", spine: 0, href: "a", start: 0, end: 1 }, color: "yellow" }, NOW, "x")));
check("aynı kimlik hata", throws(() => addHighlight(a3.book, { text: "a", anchor: { kind: "pdf", page: 1, rects: [] }, color: "yellow" }, NOW, "h1")));

const u1 = updateHighlight(a3.book, "h1", { color: "pink", note: "" }, NOW + 1);
const h1 = u1.highlights.find((h) => h.id === "h1")!;
check("renk değişir, boş not siler", h1.color === "pink" && h1.note === undefined && h1.updatedAt === NOW + 1);
check("değişmeyen güncelleme aynı nesne", updateHighlight(u1, "h1", { color: "pink" }, NOW + 2) === u1);
check("olmayan çizim aynı nesne", updateHighlight(u1, "yok", { color: "blue" }, NOW + 2) === u1);
const r1 = removeHighlight(u1, "h3", NOW + 3);
check("çizim silinir", r1.highlights.map((h) => h.id).join(",") === "h1,h2");
check("olmayanı silmek aynı nesne", removeHighlight(r1, "h3", NOW + 4) === r1);
const pos = positionOfAnchor({ kind: "pdf", page: 4, rects: [{ x: 0, y: 0.6, w: 1, h: 0.1 }, { x: 0, y: 0.4, w: 1, h: 0.1 }] });
check("çizimin konumu en üst kenar", pos.kind === "pdf" && pos.page === 4 && pos.offset === 0.4);

// EPUB sırası
const e0 = newBook({ hash: "1".repeat(64), size: 1, fileName: "k.epub", format: "epub", notePath: "Kütüphane/k.md" }, NOW);
const e1 = addHighlight(e0, { text: "b", anchor: { kind: "epub", spine: 1, href: "c1.xhtml", start: 10, end: 20 }, color: "yellow", chapter: "Bölüm 2" }, NOW, "e2").book;
const e2 = addHighlight(e1, { text: "a", anchor: { kind: "epub", spine: 0, href: "c0.xhtml", start: 50, end: 60 }, color: "yellow" }, NOW, "e1").book;
check("EPUB sırası bölüm → başlangıç", e2.highlights.map((h) => h.id).join(",") === "e1,e2");

// ─── Kayıt biçimi ───
const full: Book = { ...setPosition(setStatus(applyMeta(r1, { author: "F. H." }, NOW), "done", NOW + 9), { kind: "pdf", page: 2, offset: 0.123456789 }, 0.3333333, NOW + 10) };
const text = encodeBook(full);
const back = decodeBook(text);
check("yaz-oku aynı metni üretir", !!back && encodeBook(back) === text);
check("konum 5 haneye yuvarlanır", text.includes('"offset": 0.12346'));
check("sürüm alanı başta", text.startsWith('{\n  "v": 1,'));
check("EPUB kayıt yaz-oku", encodeBook(decodeBook(encodeBook(e2))!) === encodeBook(e2));
check("bozuk JSON null", decodeBook("{ yarım") === null);
check("bilinmeyen sürüm null", decodeBook(text.replace('"v": 1', '"v": 2')) === null);
check("bozuk özet null", decodeBook(text.replace(hash, "zz")) === null);
check("tek bozuk çizim → dosya null", decodeBook(text.replace('"page": 1,', '"page": 0,')) === null);
check("geçersiz durum okunacak olur", decodeBook(text.replace('"status": "done"', '"status": "x"'))?.status === "toread");

// ─── Raf ───
const shelf = [
  { ...b0, id: "a", status: "toread" as const, addedAt: 1 },
  { ...b0, id: "b", status: "toread" as const, addedAt: 5 },
  { ...b0, id: "c", status: "reading" as const, updatedAt: 3 },
  { ...b0, id: "d", status: "done" as const, finishedAt: 9 },
  { ...b0, id: "e", status: "reading" as const, updatedAt: 8 },
];
check("raf sırası", shelfBooks(shelf).map((b) => b.id).join("") === "ecbad", shelfBooks(shelf).map((b) => b.id).join(""));
check("süzgeç", shelfBooks(shelf, "toread").map((b) => b.id).join("") === "ba");
const counts = shelfCounts(shelf);
check("sayılar", counts.all === 5 && counts.reading === 2 && counts.toread === 2 && counts.done === 1);

// ─── Tercihler ───
const np = normalizeReaderPrefs({ fontScale: 9, theme: "neon", color: "blue" });
check("tercih temizliği", np.fontScale === 2 && np.theme === "light" && np.color === "blue");
check("bozuk tercih varsayılan", normalizeReaderPrefs("x").fontScale === 1);

// ─── Kasa deposu ───
function fakeVault(init: Record<string, string>) {
  const files = new Map(Object.entries(init));
  const writes: string[] = [];
  const trashed: string[] = [];
  const backend: VaultBackend = {
    listNotes: async () => [],
    readNote: async (p) => {
      const c = files.get(p);
      if (c === undefined) throw new Error("yok");
      return c;
    },
    writeNote: async (p, c) => {
      writes.push(p);
      files.set(p, c);
    },
    readBinary: async () => new Uint8Array(),
    writeBinary: async () => {},
    exists: async (p) => files.has(p),
    ensureDir: async () => {},
    rename: async () => {},
    trashNote: async (p) => {
      trashed.push(p);
      files.delete(p);
    },
    listTrash: async () => [],
    restoreFromTrash: async () => "",
    purgeTrashItem: async () => {},
    listDir: async (dir) => {
      const prefix = dir ? `${dir}/` : "";
      const seen = new Map<string, boolean>();
      for (const p of files.keys()) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const i = rest.indexOf("/");
        const name = i < 0 ? rest : rest.slice(0, i);
        seen.set(name, (seen.get(name) ?? false) || i >= 0);
      }
      return [...seen].map(([name, isDirectory]): DirEntry => ({ name, isDirectory }));
    },
  };
  return { backend, files, writes, trashed };
}

const NFD = LIBRARY_DIR.normalize("NFD");
check("NFD ad gerçekten farklı", NFD !== LIBRARY_DIR);
const good = { ...b0, id: bookIdFromHash(hash) };
const fv = fakeVault({
  [`${NFD}/${good.id}.json`]: encodeBook(good),
  [`${NFD}/bozuk.json`]: "{",
  [`${NFD}/yanlis.json`]: encodeBook(good),
  [`${NFD}/Dune.md`]: "# not",
});
const lib = await loadBooks(fv.backend);
check("NFD klasör bulunur", lib.dirName === NFD);
check("geçerli kayıt yüklenir", lib.books.length === 1 && lib.books[0].id === good.id);
check("bozuk ve kimliği uymayan broken", lib.broken.join(",") === "bozuk.json,yanlis.json");
check("değişmeyen kayıt yazılmaz", (await saveBook(fv.backend, lib.books[0], lib)) === false && fv.writes.length === 0);
const changed = setStatus(lib.books[0], "reading", NOW + 100);
check("değişen kayıt yazılır", (await saveBook(fv.backend, changed, lib)) === true && fv.writes[0] === `${NFD}/${good.id}.json`);
check("bozuk dosyanın üstüne yazılmaz", await rejects(saveBook(fv.backend, { ...good, id: "bozuk" }, lib)));
fv.files.set(`${NFD}/sonradan.json`, "{}");
check("yüklenmemiş dosyanın üstüne yazılmaz", await rejects(saveBook(fv.backend, { ...good, id: "sonradan" }, lib)));
await removeBook(fv.backend, good.id, lib);
check("silme çöpe taşır", fv.trashed[0] === `${NFD}/${good.id}.json` && lib.raw[good.id] === undefined);

// Not bulma
const contents = {
  "Kütüphane/Dune.md": `---\nloomen-book: ${good.id}\n---\n# Dune`,
  "Başka/Taşındı.md": `---\nloomen-book: eeeeeeeeeeeeeeee\n---\n`,
  "Kütüphane/Eski.md": `---\nloomen-book: baskakitap\n---\n`,
};
check("kayıttaki yol bulunur", locateBookNote(contents, { id: good.id, notePath: "Kütüphane/Dune.md" }) === "Kütüphane/Dune.md");
check("taşınan not kimlikle bulunur", locateBookNote(contents, { id: "eeeeeeeeeeeeeeee", notePath: "Kütüphane/Eski.md" }) === "Başka/Taşındı.md");
check("bulunamazsa null", locateBookNote(contents, { id: "ffffffffffffffff", notePath: "Kütüphane/Yok.md" }) === null);

// Uygulama klasörü
const files = createMemoryBookFiles();
await files.write(`${hash}.pdf`, pdf);
check("kitap dosyası yazılır/okunur", (await files.read(`${hash}.pdf`)).length === pdf.length);
check("kapak adı", coverFileName("abc", "image/jpeg") === "covers/abc.jpg" && coverFileName("abc", "image/png") === "covers/abc.png");
check("yol kaçışı reddedilir", await rejects(files.write("../x.pdf", pdf)));
check("bilinmeyen uzantı reddedilir", await rejects(files.write("a.exe", pdf)));

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nKütüphane çekirdeği: tüm kontroller geçti");

// Kütüphane çekirdeğinin node testi: kayıt biçimi, hesaplar, kasa deposu (LOM-83).
import {
  LIBRARY_DIR,
  addHighlight,
  applyMeta,
  bookFileName,
  bookIdFromHash,
  compareAnchor,
  comparePosition,
  decodeAnchor,
  decodePosition,
  encodeAnchor,
  encodePosition,
  hasBookFile,
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
  newerPosition,
  newHighlightId,
  normalizeReaderPrefs,
  positionOfAnchor,
  removeBook,
  remotePositionAhead,
  removeHighlight,
  safeNoteName,
  saveBook,
  setPosition,
  setStatus,
  sha256Hex,
  shouldKeepPendingPosition,
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
check("konumun kayıt anı yazılır (LOM-92)", p1.positionSavedAt === NOW + 1);

// ─── Cihazlar arası kalınan yer (LOM-92) ───
{
  const pdf = (page: number, offset = 0) => ({ kind: "pdf" as const, page, offset });
  const epub = (spine: number, offset: number) => ({ kind: "epub" as const, spine, href: `c${spine}.xhtml`, offset });
  check("pdf ileri sayfa > 0", comparePosition(pdf(4), pdf(3, 0.9)) > 0);
  check("pdf aynı sayfa ileri oran > 0", comparePosition(pdf(3, 0.6), pdf(3, 0.2)) > 0);
  check("pdf geri < 0", comparePosition(pdf(2, 0.9), pdf(3)) < 0);
  check("pdf eşit 0", comparePosition(pdf(3, 0.25), pdf(3, 0.25)) === 0);
  check("epub ileri bölüm > 0", comparePosition(epub(2, 0), epub(1, 900)) > 0);
  check("epub aynı bölüm geri < 0", comparePosition(epub(1, 10), epub(1, 50)) < 0);
  check("epub eşit 0", comparePosition(epub(1, 50), epub(1, 50)) === 0);
  check("farklı tür 0", comparePosition(pdf(9), epub(1, 0)) === 0);

  const hl = addHighlight(b0, { text: "yerel çizim", anchor: { kind: "pdf", page: 1, rects: [{ x: 0, y: 0, w: 0.5, h: 0.1 }] }, color: "yellow" }, NOW, "h_mem").book;
  const mem = setPosition(hl, pdf(5), 0.2, NOW + 100);
  const diskNewer: Book = { ...b0, position: pdf(9, 0.5), progress: 0.4, positionSavedAt: NOW + 200 };
  const merged = newerPosition(mem, diskNewer);
  check(
    "disk yeniyse konum diskten gelir",
    merged.position?.kind === "pdf" && merged.position.page === 9 && merged.progress === 0.4 && merged.positionSavedAt === NOW + 200
  );
  check("birleşmede çizimler bellekten kalır", merged.highlights.length === 1 && merged.highlights[0].id === "h_mem");
  const diskOlder: Book = { ...b0, position: pdf(2), progress: 0.05, positionSavedAt: NOW + 50 };
  check("bellek yeniyse aynı nesne döner", newerPosition(mem, diskOlder) === mem);
  check("zamansız eski disk kaydı belleği ezmez", newerPosition(mem, { ...b0, position: pdf(1) }) === mem);

  check("disk yeniyse bekleyen konum yazılmaz", shouldKeepPendingPosition(diskNewer, NOW + 150) === false);
  check("disk eskiyse bekleyen konum yazılır", shouldKeepPendingPosition(diskOlder, NOW + 150) === true);
  check("zamansız kayıtta bekleyen konum yazılır", shouldKeepPendingPosition(b0, NOW) === true);

  const remote: Book = { ...b0, position: pdf(9), positionSavedAt: NOW + 500 };
  check("aynı konum → şerit yok", remotePositionAhead(remote, { pos: pdf(9), at: NOW }) === null);
  check("geride konum → şerit yok", remotePositionAhead(remote, { pos: pdf(12), at: NOW }) === null);
  check("ileri ama eski zaman → şerit yok", remotePositionAhead(remote, { pos: pdf(3), at: NOW + 600 }) === null);
  // Açılışta yerel an = kaydın konum zamanı: açılıştan önce başka cihazda okunmuş ama açılan
  // kayıttan yeni konum eşitlemeyle gelince şerit çıkar (açılış anı karşılaştırılmaz).
  const opened92: Book = { ...b0, position: pdf(30), positionSavedAt: NOW + 100 };
  const openLocal = { pos: opened92.position, at: opened92.positionSavedAt ?? 0 };
  check("açılışta kendi kaydı için şerit yok", remotePositionAhead(opened92, openLocal) === null);
  const synced92: Book = { ...opened92, position: pdf(50), positionSavedAt: NOW + 300 };
  const ahead92 = remotePositionAhead(synced92, openLocal);
  check("açılıştan önce okunmuş ama kayıttan yeni konum → şerit var", ahead92?.kind === "pdf" && ahead92.page === 50);
  check("zamansız eski kayıtla açılınca gelen ileri konum → şerit var", remotePositionAhead(synced92, { pos: pdf(30), at: 0 }) !== null);
  const ahead = remotePositionAhead(remote, { pos: pdf(3), at: NOW + 400 });
  check("ileri ve yeni → konum döner", ahead?.kind === "pdf" && ahead.page === 9);
  check("yerel konum yokken ileri sayılır", remotePositionAhead(remote, { at: NOW }) !== null);
  check("kayıtta konum yoksa şerit yok", remotePositionAhead(b0, { at: 0 }) === null);
}

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
check("çizimin konumu en üst kenar", !!pos && pos.kind === "pdf" && pos.page === 4 && pos.offset === 0.4);

// EPUB sırası
const e0 = newBook({ hash: "1".repeat(64), size: 1, fileName: "k.epub", format: "epub", notePath: "Kütüphane/k.md" }, NOW);
const e1 = addHighlight(e0, { text: "b", anchor: { kind: "epub", spine: 1, href: "c1.xhtml", start: 10, end: 20 }, color: "yellow", chapter: "Bölüm 2" }, NOW, "e2").book;
const e2 = addHighlight(e1, { text: "a", anchor: { kind: "epub", spine: 0, href: "c0.xhtml", start: 50, end: 60 }, color: "yellow" }, NOW, "e1").book;
check("EPUB sırası bölüm → başlangıç", e2.highlights.map((h) => h.id).join(",") === "e1,e2");

// Kindle çıpası ve konumu (LOM-84)
{
  const ka = { kind: "kindle" as const, location: { start: 180, end: 182 }, page: 12 };
  check("kindle çıpa yaz-oku", JSON.stringify(decodeAnchor(JSON.parse(JSON.stringify(encodeAnchor(ka))))) === JSON.stringify(ka));
    const kpage = decodeAnchor({ kind: "kindle", page: 3 });
  check("kindle yalnız sayfa okunur", kpage?.kind === "kindle" && kpage.page === 3 && kpage.location === undefined);
  check("kindle konumsuz ve sayfasız çıpa bozuk", decodeAnchor({ kind: "kindle" }) === null);
  check("kindle ters aralık bozuk", decodeAnchor({ kind: "kindle", location: { start: 9, end: 3 } }) === null);
  check("kindle sıfır sayfa bozuk", decodeAnchor({ kind: "kindle", page: 0 }) === null);
  const kp = decodePosition(encodePosition({ kind: "kindle", location: 180 }));
  check("kindle konum yaz-oku", kp?.kind === "kindle" && kp.location === 180);
  check("kindle bozuk konum okunmaz", decodePosition({ kind: "kindle", location: -1 }) === undefined);
  const kpos = positionOfAnchor(ka);
  check("kindle çizim konumu aralık başı", !!kpos && kpos.kind === "kindle" && kpos.location === 180);
  check("kindle yalnız sayfa konumu sayfa", (positionOfAnchor({ kind: "kindle", page: 7 }) as { location: number }).location === 7);
  const k = (start: number, end = start, page?: number) => ({ kind: "kindle" as const, location: { start, end }, ...(page ? { page } : {}) });
  check("kindle sırası konum başı", compareAnchor(k(10), k(20)) < 0 && compareAnchor(k(20), k(10)) > 0);
  check("kindle aynı başta kısa önce", compareAnchor(k(10, 12), k(10, 15)) < 0);
  check("kindle konumsuz sona", compareAnchor(k(999), { kind: "kindle", page: 1 }) < 0);
  check("türler arası sabit sıra", compareAnchor({ kind: "epub", spine: 0, href: "a", start: 0, end: 1 }, k(1)) < 0 && compareAnchor(k(1), { kind: "pdf", page: 1, rects: [] }) > 0);
  const kb = newBook({ hash: "9".repeat(64), size: 0, fileName: "", format: "kindle", notePath: "Kütüphane/K.md", title: "K" }, NOW);
  check("kindle kitabında dosya yok", !hasBookFile(kb) && hasBookFile(b0));
  const kb1 = addHighlight(kb, { text: "alıntı", anchor: ka, color: "yellow" }, NOW, "k1").book;
  const kdec = decodeBook(encodeBook(kb1));
  check("kindle kitabı yaz-oku", !!kdec && kdec.format === "kindle" && kdec.size === 0 && kdec.fileName === "" && encodeBook(kdec) === encodeBook(kb1));
  check("pdf kitaba kindle çizim hata", throws(() => addHighlight(b0, { text: "a", anchor: ka, color: "yellow" }, NOW, "kx")));
}

// KOReader çıpası ve konumu (LOM-94)
{
  const oa = { kind: "koreader" as const, page: 12, pos0: "/body/DocFragment[3]/body/p[5]/text().0", pos1: "/body/DocFragment[3]/body/p[5]/text().40" };
  check("koreader çıpa yaz-oku", JSON.stringify(decodeAnchor(JSON.parse(JSON.stringify(encodeAnchor(oa))))) === JSON.stringify(oa));
  const op = decodeAnchor({ kind: "koreader", page: 3 });
  check("koreader yalnız sayfa okunur", op?.kind === "koreader" && op.page === 3 && op.pos0 === undefined);
  check("koreader sayfasız çıpa bozuk", decodeAnchor({ kind: "koreader" }) === null);
  check("koreader sıfır sayfa bozuk", decodeAnchor({ kind: "koreader", page: 0 }) === null);
  check("koreader dize olmayan pos0 bozuk", decodeAnchor({ kind: "koreader", page: 2, pos0: { x: 1 } }) === null);
  const opos = decodePosition(encodePosition({ kind: "koreader", location: 12 }));
  check("koreader konum yaz-oku", opos?.kind === "koreader" && opos.location === 12);
  check("koreader bozuk konum okunmaz", decodePosition({ kind: "koreader", location: 0 }) === undefined);
  const ppos = positionOfAnchor(oa);
  check("koreader çizim konumu sayfa", !!ppos && ppos.kind === "koreader" && ppos.location === 12);
  const o = (page: number) => ({ kind: "koreader" as const, page });
  check("koreader sırası sayfa", compareAnchor(o(3), o(10)) < 0 && compareAnchor(o(10), o(3)) > 0 && compareAnchor(o(5), o(5)) === 0);
  check("koreader türler arası en sonda", compareAnchor({ kind: "kindle", page: 1 }, o(1)) < 0 && compareAnchor(o(1), { kind: "pdf", page: 1, rects: [] }) > 0);
  check("koreader konum karşılaştırma", comparePosition({ kind: "koreader", location: 9 }, { kind: "koreader", location: 4 }) > 0);
  const ob = newBook({ hash: "8".repeat(64), size: 0, fileName: "", format: "koreader", notePath: "Kütüphane/O.md", title: "O" }, NOW);
  check("koreader kitabında dosya yok", !hasBookFile(ob));
  const ob1 = addHighlight(ob, { text: "alıntı", anchor: oa, color: "green", chapter: "Bölüm 1" }, NOW, "o1").book;
  const odec = decodeBook(encodeBook(ob1));
  check("koreader kitabı yaz-oku", !!odec && odec.format === "koreader" && odec.size === 0 && encodeBook(odec) === encodeBook(ob1));
  check("pdf kitaba koreader çizim hata", throws(() => addHighlight(b0, { text: "a", anchor: oa, color: "yellow" }, NOW, "ox")));
  check("koreader kitaba kindle çizim hata", throws(() => addHighlight(ob, { text: "a", anchor: { kind: "kindle", page: 1 }, color: "yellow" }, NOW, "ox")));
}

// Kobo çıpası ve konumu (LOM-95)
{
  const ka = { kind: "kobo" as const, progress: 0.25, chapter: 3 };
  check("kobo çıpa yaz-oku", JSON.stringify(decodeAnchor(JSON.parse(JSON.stringify(encodeAnchor(ka))))) === JSON.stringify(ka));
  const kp = decodeAnchor({ kind: "kobo", progress: 0.5 });
  check("kobo bölümsüz çıpa okunur", kp?.kind === "kobo" && kp.progress === 0.5 && kp.chapter === undefined);
  check("kobo ilerleme 0..1'e sıkışır", (decodeAnchor({ kind: "kobo", progress: 7 }) as { progress: number } | null)?.progress === 1);
  check("kobo yazımda ilerleme yuvarlanır", (encodeAnchor({ kind: "kobo", progress: 0.123456789 }) as { progress: number }).progress === 0.12346);
  check("kobo ilerlemesiz çıpa bozuk", decodeAnchor({ kind: "kobo" }) === null);
  check("kobo dize ilerleme bozuk", decodeAnchor({ kind: "kobo", progress: "0.5" }) === null);
  check("kobo eksi bölüm bozuk", decodeAnchor({ kind: "kobo", progress: 0.1, chapter: -1 }) === null);
  check("kobo kesirli bölüm bozuk", decodeAnchor({ kind: "kobo", progress: 0.1, chapter: 1.5 }) === null);
  const kpos = decodePosition(encodePosition({ kind: "kobo", location: 3250 }));
  check("kobo konum yaz-oku", kpos?.kind === "kobo" && kpos.location === 3250);
  check("kobo bozuk konum okunmaz", decodePosition({ kind: "kobo", location: -1 }) === undefined);
  const kpa = positionOfAnchor(ka);
  check("kobo çizim konumu bölüm+ilerleme", kpa?.kind === "kobo" && kpa.location === 3250);
  const k = (progress: number, chapter?: number) => ({ kind: "kobo" as const, progress, ...(chapter === undefined ? {} : { chapter }) });
  check("kobo sırası bölüm önce", compareAnchor(k(0.9, 1), k(0.1, 2)) < 0 && compareAnchor(k(0.1, 2), k(0.9, 1)) > 0);
  check("kobo aynı bölümde ilerleme", compareAnchor(k(0.2, 1), k(0.6, 1)) < 0 && compareAnchor(k(0.5, 1), k(0.5, 1)) === 0);
  check("kobo bölümü bilinmeyen sona", compareAnchor(k(0.9, 5), k(0.1)) < 0 && compareAnchor(k(0.1), k(0.3)) < 0);
  check("kobo türler arası en sonda", compareAnchor({ kind: "koreader", page: 1 }, k(0)) < 0 && compareAnchor(k(0), { kind: "pdf", page: 1, rects: [] }) > 0);
  check("kobo konum karşılaştırma", comparePosition({ kind: "kobo", location: 9 }, { kind: "kobo", location: 4 }) > 0);
  const kb = newBook({ hash: "9".repeat(64), size: 0, fileName: "", format: "kobo", notePath: "Kütüphane/K.md", title: "K" }, NOW);
  check("kobo kitabında dosya yok", !hasBookFile(kb));
  const kb1 = addHighlight(kb, { text: "alıntı", anchor: ka, color: "pink", chapter: "Bölüm adı" }, NOW, "b1").book;
  const kdec = decodeBook(encodeBook(kb1));
  check("kobo kitabı yaz-oku", !!kdec && kdec.format === "kobo" && kdec.size === 0 && encodeBook(kdec) === encodeBook(kb1));
  check("pdf kitaba kobo çizim hata", throws(() => addHighlight(b0, { text: "a", anchor: ka, color: "yellow" }, NOW, "bx")));
  check("kobo kitaba koreader çizim hata", throws(() => addHighlight(kb, { text: "a", anchor: { kind: "koreader", page: 1 }, color: "yellow" }, NOW, "bx")));
}

// Paylaşılan alıntı çıpası (LOM-96)
{
  const sa = { kind: "shared" as const, app: "kindle" as const, page: 12 };
  check("paylaşım çıpa yaz-oku", JSON.stringify(decodeAnchor(JSON.parse(JSON.stringify(encodeAnchor(sa))))) === JSON.stringify(sa));
  check("paylaşım yalın çıpa", JSON.stringify(decodeAnchor({ kind: "shared" })) === JSON.stringify({ kind: "shared" }));
  check("paylaşım bilinmeyen uygulama düşer, çizim bozulmaz", JSON.stringify(decodeAnchor({ kind: "shared", app: "yeni-uygulama" })) === JSON.stringify({ kind: "shared" }));
  check("paylaşım sıfır sayfa bozuk", decodeAnchor({ kind: "shared", page: 0 }) === null);
  check("paylaşım çizim konumu yok", positionOfAnchor(sa) === null);
  check("paylaşım türler arası en sonda", compareAnchor({ kind: "koreader", page: 99 }, sa) < 0 && compareAnchor(sa, { kind: "pdf", page: 1, rects: [] }) > 0);
  check("paylaşım kendi arasında eşit", compareAnchor(sa, { kind: "shared" }) === 0);
  const pdf1 = addHighlight(b0, { text: "pdf çizim", anchor: { kind: "pdf", page: 3, rects: [] }, color: "yellow" }, NOW, "p1").book;
  const s1 = addHighlight(pdf1, { text: "ilk paylaşım", anchor: sa, color: "yellow" }, NOW + 2, "s2").book;
  const s2 = addHighlight(s1, { text: "ikinci paylaşım", anchor: { kind: "shared" }, color: "yellow" }, NOW + 1, "s1").book;
  check("pdf kitaba paylaşım çizimi eklenir", s2.format === "pdf" && s2.highlights.length === 3);
  check("paylaşımlar sonda, geliş anına göre", s2.highlights.map((h) => h.id).join(",") === "p1,s1,s2");
  for (const format of ["epub", "kindle", "koreader", "kobo", "shared"] as const) {
    const fb = newBook({ hash: "7".repeat(64), size: 0, fileName: "", format, notePath: "Kütüphane/S.md", title: "S" }, NOW);
    check(`${format} kitaba paylaşım çizimi eklenir`, addHighlight(fb, { text: "a", anchor: { kind: "shared" }, color: "yellow" }, NOW, "sx").book.highlights.length === 1);
  }
  const sb = newBook({ hash: "6".repeat(64), size: 0, fileName: "", format: "shared", notePath: "Kütüphane/S.md", title: "S" }, NOW);
  check("paylaşım kaydında dosya yok", !hasBookFile(sb));
  const sdec = decodeBook(encodeBook(addHighlight(sb, { text: "a", anchor: sa, color: "pink" }, NOW, "sa").book));
  check("paylaşım kaydı yaz-oku", !!sdec && sdec.format === "shared" && sdec.highlights[0]?.anchor.kind === "shared");
  check("paylaşım kaydına pdf çizim hata", throws(() => addHighlight(sb, { text: "a", anchor: { kind: "pdf", page: 1, rects: [] }, color: "yellow" }, NOW, "px")));
  check("pdf kitaba kindle çizim hâlâ hata", throws(() => addHighlight(b0, { text: "a", anchor: { kind: "kindle", page: 1 }, color: "yellow" }, NOW, "kx")));
}

// ─── Kayıt biçimi ───
const full: Book = { ...setPosition(setStatus(applyMeta(r1, { author: "F. H." }, NOW), "done", NOW + 9), { kind: "pdf", page: 2, offset: 0.123456789 }, 0.3333333, NOW + 10) };
const text = encodeBook(full);
const back = decodeBook(text);
check("yaz-oku aynı metni üretir", !!back && encodeBook(back) === text);
check("konum 5 haneye yuvarlanır", text.includes('"offset": 0.12346'));
check("sürüm alanı başta", text.startsWith('{\n  "v": 1,'));
check("EPUB kayıt yaz-oku", encodeBook(decodeBook(encodeBook(e2))!) === encodeBook(e2));
check("konum kayıt anı yaz-oku korunur (LOM-92)", back?.positionSavedAt === NOW + 10 && text.includes(`"positionSavedAt": ${NOW + 10}`));
{
  const legacy = text.replace(`,\n    "positionSavedAt": ${NOW + 10}`, "");
  const old = decodeBook(legacy);
  check("konum zamanı olmayan eski kayıt bozuk sayılmaz", !legacy.includes("positionSavedAt") && !!old && old.position?.kind === "pdf");
  check("eski kayıtta konum zamanı tanımsız", !!old && old.positionSavedAt === undefined && encodeBook(old) === legacy);
}
check("bozuk JSON null", decodeBook("{ yarım") === null);
check("bilinmeyen sürüm null", decodeBook(text.replace('"v": 1', '"v": 2')) === null);
check("bozuk özet null", decodeBook(text.replace(hash, "zz")) === null);
check("tek bozuk çizim → dosya null", decodeBook(text.replace('"page": 1,', '"page": 0,')) === null);
// Kalem verisi yaz-oku (LOM-97)
{
  const inked: Book = {
    ...full,
    ink: [
      { page: 5, updatedAt: NOW + 12, strokes: [{ id: "s2", createdAt: NOW + 12, points: [{ x: 0.5, y: 0.5 }] }] },
      { page: 2, updatedAt: NOW + 11, strokes: [{ id: "s1", createdAt: NOW + 11, points: [{ x: 0.123456789, y: 0.2 }, { x: 0.3, y: 0.4 }] }] },
    ],
  };
  const it = encodeBook(inked);
  const ib = decodeBook(it);
  check("kalem yaz-oku aynı metni üretir", !!ib && encodeBook(ib) === it);
  check("kalem sayfaları sıralı yazılır", !!ib && ib.ink?.map((p) => p.page).join(",") === "2,5");
  check("kalem noktası 5 haneye yuvarlanır, tek metin", it.includes('"points": "0.12346,0.2 0.3,0.4"'));
  check("kalem noktası okununca aynı yer", ib?.ink?.[0].strokes[0].points[1].x === 0.3 && ib?.ink?.[0].strokes[0].points[1].y === 0.4);
  check("kalemsiz kayıtta ink alanı yazılmaz", !text.includes('"ink"') && decodeBook(text)?.ink === undefined);
  check("boş ink dizisi yazılmaz", encodeBook({ ...full, ink: [] }) === text);
  const nan: Book = { ...full, ink: [{ page: 1, updatedAt: 0, strokes: [{ id: "n", createdAt: 0, points: [{ x: NaN, y: 0 }] }] }] };
  check("geçersiz noktalı çizgi yazılmaz, dosya okunur kalır", encodeBook(nan) === text);
  check("kalem alanı en sonda", it.indexOf('"ink"') > it.indexOf('"highlights"'));
  const bad = (from: string, to: string) => decodeBook(it.replace(from, to)) === null;
  check("bozuk nokta metni → dosya null", bad('"0.12346,0.2 0.3,0.4"', '"0.1,x"'));
  check("boş nokta → dosya null", bad('"0.12346,0.2 0.3,0.4"', '""'));
  check("eksik koordinat → dosya null", bad('"0.12346,0.2 0.3,0.4"', '"0.1 0.2"'));
  check("dizi olmayan ink → dosya null", decodeBook(encodeBook(full).replace('"highlights": [', '"ink": 3,\n    "highlights": [')) === null);
  check("sıfır sayfa → dosya null", bad('"page": 2,\n        "updatedAt"', '"page": 0,\n        "updatedAt"'));
  check("bozuk çizgi kimliği → dosya null", bad('"id": "s1"', '"id": "s/1"'));
  check("aynı sayfa iki kez → dosya null", bad('"page": 5,', '"page": 2,'));
  const neg = decodeBook(it.replace('"0.12346,0.2 0.3,0.4"', '"1.5,0.2 0.3,0.4"'));
  check("aralık dışı nokta kırpılır", neg?.ink?.[0].strokes[0].points[0].x === 1);
  check("eksi işaretli nokta → dosya null", bad('"0.12346,0.2 0.3,0.4"', '"-0.1,0.2"'));
}
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

// Çizimden Tekrar kartı testi (LOM-91): kitabın kendi listesi, satır biçimi, tekrar koruması,
// dosya gidiş-dönüşü, kart üretimi ve üç dilde metinler. `npm test` ile koşar.
import tr from "../../i18n/locales/tr/translation.json";
import en from "../../i18n/locales/en/translation.json";
import ar from "../../i18n/locales/ar/translation.json";
import { addHighlightRow, bookListId, highlightRow, newBookReviewList, quoteInList, type Book, type Highlight } from "../library";
import { LIST_ID_RE, LISTS_DIR, decodeList, encodeList, listCards, listPath, saveList, type ListVault } from "../srs";
import type { DirEntry, VaultBackend } from "../vault/types";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
async function rejects(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
}

const book: Book = {
  id: "0123456789abcdef",
  title: "Suç ve Ceza",
  author: "Dostoyevski",
  format: "pdf",
  hash: "0123456789abcdef".repeat(4),
  size: 10,
  fileName: "suc.pdf",
  status: "reading",
  notePath: "Kütüphane/Suç ve Ceza.md",
  addedAt: 1,
  updatedAt: 1,
  highlights: [],
};
const hl = (id: string, text: string, extra: Partial<Highlight> = {}): Highlight => ({
  id,
  color: "yellow",
  text,
  anchor: { kind: "pdf", page: 12, rects: [{ x: 0, y: 0, w: 1, h: 0.1 }] },
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

// ——— Liste kimliği ve yeni liste ———
const id = bookListId(book.id);
check("liste kimliği kitap-<id>", id === "kitap-0123456789abcdef", id);
check("liste kimliği dosya adı kuralına uyar", LIST_ID_RE.test(id));
const empty = newBookReviewList(book, 1000);
check("yeni listenin adı kitabın başlığı", empty.name === "Suç ve Ceza");
check("yeni liste tek yönlü (cümle → kitap)", empty.direction === "front");
check("yeni liste boş, genel günlük sınır", empty.rows.length === 0 && empty.newPerDay === null && empty.createdAt === 1000);

// ——— Satır ———
const h1 = hl("a1", "  Acı ve ıstırap,\ngeniş bir zekâ   için kaçınılmazdır. ", { note: "Raskolnikov" });
const row = highlightRow(book, h1);
check("ön yüz cümle (sadeleşmiş)", row.front === "Acı ve ıstırap, geniş bir zekâ için kaçınılmazdır.", row.front);
check("arka yüz kitap adı + yazar + yer", row.back === "Suç ve Ceza — Dostoyevski · s. 12", row.back);
check("not alanı çizim notu", row.note === "Raskolnikov");
const epubRow = highlightRow({ title: "Kitap" }, hl("e1", "Söz", { anchor: { kind: "epub", spine: 2, href: "c.xhtml", start: 0, end: 3 }, chapter: "Bölüm Bir" }));
check("yazarsız; EPUB'da bölüm adı yer olur", epubRow.back === "Kitap · Bölüm Bir", epubRow.back);
check("notsuz çizimde not alanı yok", !("note" in epubRow));

// ——— Ekleme ve gidiş-dönüş ———
const r1 = addHighlightRow(empty, book, h1);
check("ilk cümle eklenir", r1.added && r1.list.rows.length === 1 && r1.list !== empty);
check("girdi listesi değişmez", empty.rows.length === 0);
const decoded = decodeList(id, encodeList(r1.list));
check("dosyaya yazılıp okunur", !!decoded && decoded.rows.length === 1);
check("gidiş-dönüşte ön yüz cümle", decoded?.rows[0].front === row.front);
check("gidiş-dönüşte arka yüz başlık + yer", decoded?.rows[0].back === row.back);
check("gidiş-dönüşte not", decoded?.rows[0].note === "Raskolnikov");
check("gidiş-dönüşte liste adı ve yön", decoded?.name === "Suç ve Ceza" && decoded?.direction === "front");

// ——— Tekrar koruması ———
check("cümle listede görünür", quoteInList(r1.list, h1.text));
const dup = addHighlightRow(r1.list, book, hl("a2", "ACI VE ISTIRAP,   geniş bir zekâ için kaçınılmazdır."));
check("aynı cümle (boşluk/büyük harf farkı) eklenmez", !dup.added && dup.list === r1.list);
check("diskten okunan listede de tekrar sayılır", !!decoded && !addHighlightRow(decoded, book, h1).added);
check("liste yokken cümle yok sayılır", !quoteInList(undefined, h1.text) && !quoteInList(empty, h1.text));

const colon = hl("c1", "Saat :: on iki");
const rc = addHighlightRow(r1.list, book, colon);
check("'::' içeren cümle eklenir", rc.added && rc.list.rows.length === 2);
const rcDisk = decodeList(id, encodeList(rc.list));
check("'::' içeren cümle dosyada tek satır kalır", rcDisk?.rows.length === 2 && rcDisk.rows[1].front === "Saat : : on iki" && rcDisk.rows[1].back === row.back);
check("'::' içeren cümle yazıldıktan sonra da tekrar sayılır", !!rcDisk && quoteInList(rcDisk, colon.text) && !addHighlightRow(rcDisk, book, colon).added);

const other = addHighlightRow(rc.list, book, hl("b1", "Başka bir cümle."));
check("farklı cümle eklenir", other.added && other.list.rows.length === 3);
check("boş çizim eklenmez", !addHighlightRow(empty, book, hl("z", "   ")).added);

// ——— Kartlar ———
const cards = listCards(r1.list);
check("tek yönlü tek kart", cards.length === 1 && cards[0].kind === "basic", JSON.stringify(cards.map((c) => c.kind)));
check("kartın sorusu cümle", cards[0]?.question === row.front);
check("kartın cevabı arka yüz + not", cards[0]?.answer === `${row.back}\n\nRaskolnikov`);
check("kart liste dosyasında", cards[0]?.file === `${LISTS_DIR}/${id}.txt`);

// ——— Kasada yazım: yalnız liste dosyası ———
function fakeVault(init: Record<string, string> = {}) {
  const files = new Map(Object.entries(init));
  const writes: string[] = [];
  const backend: VaultBackend = {
    listNotes: async () => [],
    readNote: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error("yok: " + p);
      return v;
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
    trashNote: async () => {},
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
        seen.set(i < 0 ? rest : rest.slice(0, i), i >= 0);
      }
      return [...seen].map(([name, isDirectory]): DirEntry => ({ name, isDirectory }));
    },
  };
  return { backend, files, writes };
}

const fv = fakeVault({ [book.notePath]: "# Suç ve Ceza\n" });
const v: ListVault = { raw: {}, broken: [] };
await saveList(fv.backend, other.list, v);
check("yazılan yol Tekrar/Listeler/kitap-…", fv.writes.length === 1 && fv.writes[0] === listPath(id) && fv.writes[0].startsWith(`${LISTS_DIR}/kitap-`), fv.writes.join(","));
check("hiçbir .md yazılmaz", fv.writes.every((p) => !p.endsWith(".md")));
check("kitap notu değişmez", fv.files.get(book.notePath) === "# Suç ve Ceza\n");

// Başka cihazdan gelmiş ama okunmamış liste dosyasının üstüne yazılmaz (depo önce listeleri okur).
const synced = fakeVault({ [listPath(id)]: encodeList(r1.list) });
check("okunmamış liste dosyası ezilmez", await rejects(saveList(synced.backend, newBookReviewList(book, 5), { raw: {}, broken: [] })));

// ——— Metinler: tr/en/ar ———
const keys = (j: unknown) => {
  const r = (j as { library?: { review?: Record<string, string> } }).library?.review ?? {};
  return r;
};
const slots = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(",");
const langs = { tr: keys(tr), en: keys(en), ar: keys(ar) };
const want = ["add", "done", "saveError"];
for (const [lng, r] of Object.entries(langs)) {
  check(`${lng}: library.review anahtarları tam`, want.every((k) => typeof r[k] === "string" && r[k].trim().length > 0) && Object.keys(r).sort().join() === [...want].sort().join(), Object.keys(r).join(","));
  for (const k of want) check(`${lng}: ${k} yer tutucuları tr ile aynı`, slots(r[k] ?? "") === slots(langs.tr[k] ?? ""));
}
check("saveError {{detail}} taşır", slots(langs.tr.saveError ?? "") === "{{detail}}");
check("tr düğme metinleri", langs.tr.add === "Tekrar kartı yap" && langs.tr.done === "Tekrar'da");

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nÇizimden Tekrar kartı: tüm kontroller geçti");

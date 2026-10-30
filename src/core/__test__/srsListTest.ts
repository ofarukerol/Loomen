// Tekrar listeleri (LOM-65) çekirdeğinin node testi.
//   npx esbuild src/core/__test__/srsListTest.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/srsListTest.mjs && node /tmp/srsListTest.mjs
import {
  DEFAULT_SETTINGS,
  LISTS_DIR,
  buildQueue,
  cardId,
  collectCards,
  collectListCards,
  decodeList,
  dropListStates,
  encodeList,
  findDuplicates,
  freshState,
  isListFile,
  keepListStates,
  keepNoteStatesWithoutNotes,
  listCards,
  listIdOf,
  listNewCaps,
  listPath,
  loadLists,
  matchStates,
  normalizeKey,
  parsePasted,
  removeList,
  saveList,
  twinId,
  type ReviewList,
  type SrsCard,
  type SrsSettings,
  type SrsState,
} from "../srs";
import { STALE_TMP_AGE_MS, isStaleTmpName, tmpNameFor } from "../vault/tmpFiles";
import type { DirEntry, VaultBackend } from "../vault/types";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const CFG: SrsSettings = { ...DEFAULT_SETTINGS, enabled: true, minutesPerDay: 0, newPerDay: 10, maxPerDay: 200 };

const LIST: ReviewList = {
  id: "ingilizce",
  name: "İngilizce kelimeler",
  emoji: "📚",
  color: "teal",
  direction: "both",
  newPerDay: 3,
  createdAt: 1767225600000,
  rows: [
    { front: "apple", back: "elma" },
    { front: "book", back: "kitap", note: "I read a book." },
    { front: "kitap", back: "كتاب" },
    { front: "çiçek", back: "flower", note: "Bahçede çiçek var." },
  ],
};

// ---------------------------------------------------------------- dosya biçimi

const text = encodeList(LIST);
const back = decodeList(LIST.id, text);
check("gidiş dönüş: başlık alanları aynen", !!back &&
  back.name === LIST.name && back.emoji === LIST.emoji && back.color === LIST.color &&
  back.direction === LIST.direction && back.newPerDay === 3 && back.createdAt === LIST.createdAt);
check("gidiş dönüş: bütün satırlar (not dahil) aynen", JSON.stringify(back?.rows) === JSON.stringify(LIST.rows));
check("yazım deterministik ve tek satır sonuyla bitiyor", encodeList(back!) === text && text.endsWith("\n") && !text.endsWith("\n\n"));
for (const d of ["front", "back", "both"] as const) {
  const r = decodeList("x", encodeList({ ...LIST, direction: d }));
  check(`yön '${d}' korunuyor`, r?.direction === d);
}
check("günlük: genel sınır (null) korunuyor", decodeList("x", encodeList({ ...LIST, newPerDay: null }))?.newPerDay === null);
check("satırdaki '::' ve satır sonu dosyayı bozmuyor", (() => {
  const r = decodeList("x", encodeList({ ...LIST, rows: [{ front: "a::b", back: "c\nd", note: "e:::f" }] }));
  return r?.rows.length === 1 && r.rows[0].front === "a: :b" && r.rows[0].back === "c d" && !r.rows[0].note?.includes("::");
})());
check("başlıksız dosya okunmaz (null)", decodeList("x", "elma :: apple\n") === null);
check("bilinmeyen sürüm okunmaz (null)", decodeList("x", text.replace("surum: 1", "surum: 2")) === null);
check("eksik başlık alanı varsayılanla doluyor", (() => {
  const r = decodeList("abc", "---\n---\nelma :: apple\n\nbozuk satır\n :: boş\n");
  return r?.name === "abc" && r.direction === "front" && r.newPerDay === null && r.rows.length === 1;
})());
check("bilinmeyen başlık alanı yoksayılıyor", decodeList("x", text.replace("---\nsurum", "---\nbaska: 5\nsurum"))?.name === LIST.name);
check("Windows satır sonları okunuyor", decodeList("x", text.replace(/\n/g, "\r\n"))?.rows.length === 4);

// ---------------------------------------------------------------- yapıştırma

const pasted = parsePasted([
  "elma :: apple",
  "armut\tpear\tBir armut aldım.",
  "kiraz - cherry",
  "üzüm – grape",
  "muz = banana",
  "erik;plum",
  "Elma :: apple again",
  "ayıraçsız satır",
  "",
  "boş ön :: ",
].join("\n"));
check("beş ayıraç tanınıyor", pasted.rows.length === 6, JSON.stringify(pasted.rows.map((r) => r.front)));
check("sekme ile üçüncü parça not oluyor", pasted.rows[1]?.note === "Bir armut aldım." && pasted.rows[1].back === "pear");
check("uzun tire de ayıraç", pasted.rows[3]?.front === "üzüm" && pasted.rows[3].back === "grape");
check("tekrar eden satır sayılıyor", pasted.duplicates === 1);
check("ayıraçsız / boş taraflı satır atlanıyor", pasted.skipped === 2);
check("tire kelime içinde bölmüyor", parsePasted("well-known - iyi bilinen").rows[0]?.front === "well-known");
check("mevcut listeyle çakışan bulunuyor", findDuplicates(pasted.rows, LIST.rows).length === 0 &&
  findDuplicates([{ front: "Apple", back: "x" }], LIST.rows).length === 1);

// ---------------------------------------------------------------- kartlar ve kimlik

const cards = listCards(LIST);
check("iki yönlü: satır başına iki kart", cards.length === 8);
check("kartlar liste dosyasında", cards.every((c) => c.file === listPath(LIST.id)) && isListFile(cards[0].file));
check("liste kimliği yoldan geri bulunuyor", listIdOf(cards[0].file) === LIST.id && listIdOf("Notlar/a.md") === null);
check("ileri kart kimliği nottaki kuralla aynı", cards[0].id === cardId(listPath(LIST.id), normalizeKey("apple")));
check("ters kart '|ters' anahtarlı", cards[1].kind === "reverse" && cards[1].key === normalizeKey("elma") + "|ters");
check("not cevaba ekleniyor", cards[2].answer === "kitap\n\nI read a book.");
check("yön 'front' yalnız ileri", listCards({ ...LIST, direction: "front" }).every((c) => c.kind === "basic"));
check("yön 'back' yalnız ters", listCards({ ...LIST, direction: "back" }).every((c) => c.kind === "reverse"));
const dirIds = new Set(cards.map((c) => c.id));
check("yön değişince var olan kimlikler aynı", [
  ...listCards({ ...LIST, direction: "front" }),
  ...listCards({ ...LIST, direction: "back" }),
].every((c) => dirIds.has(c.id)));

const shifted = listCards({ ...LIST, rows: [{ front: "yeni", back: "new" }, ...LIST.rows] });
check("satır kayınca kimlikler değişmiyor", cards.every((c) => shifted.some((x) => x.id === c.id)));
check("aynı ön yüz iki kez → tek ileri kart",
  listCards({ ...LIST, direction: "front", rows: [{ front: "a", back: "b" }, { front: "A", back: "c" }] }).length === 1);

const saved: Record<string, SrsState> = {};
for (const c of cards) saved[c.id] = { ...freshState(c.id, c.file, c.key), phase: "review", reps: 5 };
const edited = listCards({ ...LIST, rows: LIST.rows.map((r, i) => (i === 0 ? { ...r, front: "apples" } : r)) });
const m = matchStates(edited, saved);
check("küçük düzenlemede geçmiş taşınıyor", m.recovered >= 1 && Object.values(m.states).filter((s) => s.reps === 5).length === 8);

check("twinId ileri → ters", twinId(cards[0], LIST) === cards[1].id);
check("twinId ters → ileri", twinId(cards[1], LIST) === cards[0].id);
check("twinId satır kaymışsa da buluyor", twinId({ ...cards[2], line: 0 }, LIST) === cards[3].id);
check("twinId başka dosyada null", twinId({ ...cards[0], file: "Notlar/a.md" }, LIST) === null);

// ---------------------------------------------------------------- kuyruk ve günlük sınır

const NOTE = "Başkent :: Ankara\nDağ :: Ağrı\nNehir :: Fırat\n";
const noteCards: SrsCard[] = collectCards({ "Notlar/Coğrafya.md": NOTE }, CFG.syntax, []);
const big: ReviewList = {
  ...LIST,
  id: "big",
  direction: "front",
  newPerDay: 5,
  rows: Array.from({ length: 1000 }, (_, i) => ({ front: `kelime ${i}`, back: `word ${i}` })),
};
const allCards = [...noteCards, ...collectListCards([big])];
const fresh: Record<string, SrsState> = matchStates(allCards, {}).states;
const NOW = new Date(2026, 9, 29, 10, 0, 0);
const caps = listNewCaps([big], undefined, CFG);
check("liste hakkı = min(liste, genel)", caps[listPath("big")] === 5);
check("liste hakkı genel sınırı aşmıyor", listNewCaps([{ ...big, newPerDay: 50 }], undefined, CFG)[listPath("big")] === 10);
check("null liste sınırı genel sınıra düşüyor", listNewCaps([{ ...big, newPerDay: null }], undefined, CFG)[listPath("big")] === 10);
check("bugün gösterilen düşülüyor", listNewCaps([big], { n: 4, r: 4, ms: 0, lists: { big: 4 } }, CFG)[listPath("big")] === 1);
check("eski gün kaydında (lists yok) hak tam", listNewCaps([big], { n: 4, r: 4, ms: 0 }, CFG)[listPath("big")] === 5);

const q = buildQueue(allCards, fresh, {}, CFG, NOW, 15, caps);
const fromList = q.items.filter((i) => isListFile(i.card.file)).length;
const fromNotes = q.items.filter((i) => !isListFile(i.card.file)).length;
check("liste kartları liste sınırını aşmıyor", fromList === 5, `liste=${fromList}`);
check("not kartları yine geliyor", fromNotes === 3, `not=${fromNotes}`);
check("genel yeni sınırı aşılmıyor", q.new <= CFG.newPerDay, `yeni=${q.new}`);
const qTight = buildQueue(allCards, fresh, {}, { ...CFG, newPerDay: 4 }, NOW, 15, listNewCaps([big], undefined, { newPerDay: 4 }));
check("genel sınır dar iken toplam onu aşmıyor", qTight.new === 4);
const qOld = buildQueue(allCards, fresh, {}, CFG, NOW, 15);
const qOld2 = buildQueue(allCards, fresh, {}, CFG, NOW, 15, undefined);
check("hak verilmezse eski davranış (ilk N yeni)", qOld.items.length === 10 &&
  JSON.stringify(qOld.items.map((i) => i.card.id)) === JSON.stringify(qOld2.items.map((i) => i.card.id)));
const qUsed = buildQueue(allCards, fresh, { [isoToday()]: { n: 5, r: 5, ms: 0, lists: { big: 5 } } }, CFG, NOW, 15,
  listNewCaps([big], { n: 5, r: 5, ms: 0, lists: { big: 5 } }, CFG));
check("liste hakkı bitince yalnız not kartları", qUsed.items.every((i) => !isListFile(i.card.file)) && qUsed.new === 3);

function isoToday(): string {
  return `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}-${String(NOW.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- durumların korunması

const listFile = listPath(LIST.id);
const withNote: Record<string, SrsState> = { ...saved, n1: freshState("n1", "Notlar/a.md", "x") };
const dropped = dropListStates(withNote, listFile);
check("liste silinince yalnız onun durumları gidiyor", Object.keys(dropped).length === 1 && !!dropped.n1);
const kept = keepListStates({}, saved, []);
check("okunamayan listenin ilerlemesi korunuyor", Object.keys(kept).length === 8);
const notKept = keepListStates({}, saved, [LIST]);
check("yüklü listenin satırları matchStates'ten sonra korunuyor", Object.keys(notKept).length === 8);
const removedRow = keepListStates({}, saved, [{ ...LIST, rows: LIST.rows.slice(1) }]);
check("yüklü listeden silinen satırın durumu geri gelmiyor", Object.keys(removedRow).length === 6);
const frontOnly = { ...LIST, direction: "front" as const };
const afterDir = keepListStates(matchStates(listCards(frontOnly), saved).states, saved, [frontOnly]);
check("yön değişince öbür yönün geçmişi duruyor", Object.keys(afterDir).length === 8 &&
  Object.values(afterDir).every((s) => s.reps === 5));

// Notlar yüklenmeden yalnız liste kartları varken not geçmişi silinmemeli (inceleme bulgusu).
const lc = listCards(LIST);
const onlyLists = keepNoteStatesWithoutNotes(
  keepListStates(matchStates(lc, withNote).states, withNote, [LIST]), withNote, lc);
check("not kartı yokken not geçmişi korunuyor", !!onlyLists.n1 && Object.keys(onlyLists).length === 9);
const noteCard: SrsCard = { ...lc[0], id: "n2", file: "Notlar/b.md" };
const withNotes = keepNoteStatesWithoutNotes(
  keepListStates(matchStates([...lc, noteCard], withNote).states, withNote, [LIST]), withNote, [...lc, noteCard]);
check("notlar yüklüyken silinen notun durumu eskisi gibi düşüyor", !withNotes.n1 && !!withNotes.n2);

// ---------------------------------------------------------------- kasada okuma/yazma

function fakeVault(init: Record<string, string>) {
  const files = new Map(Object.entries(init));
  const writes: string[] = [];
  const trashed: string[] = [];
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

const fv = fakeVault({
  [listPath("ingilizce")]: text,
  [`${LISTS_DIR}/bozuk.txt`]: "başlıksız :: dosya\n",
  [`${LISTS_DIR}/Büyük Harf.txt`]: text,
  [`${LISTS_DIR}/buyuk.TXT`]: text,
  [`${LISTS_DIR}/not.md`]: "# dokunma",
  "Notlar/a.md": "Başkent :: Ankara",
});
const loaded = await loadLists(fv.backend);
check("geçerli liste yükleniyor", loaded.lists.length === 1 && loaded.lists[0].id === "ingilizce");
check("bozuk ve adı uyumsuz dosya broken'a giriyor",
  loaded.broken.includes("bozuk.txt") && loaded.broken.includes("Büyük Harf.txt"), loaded.broken.join(", "));
check("büyük harf uzantı ve .md okunmuyor", !loaded.broken.includes("buyuk.TXT") && !loaded.broken.includes("not.md"));
check("listDir olmayan arka uçta boş", (await loadLists({ ...fv.backend, listDir: undefined })).lists.length === 0);

check("değişmeyen liste yeniden yazılmıyor", (await saveList(fv.backend, loaded.lists[0], loaded)) === false && fv.writes.length === 0);
let threw = false;
try {
  await saveList(fv.backend, { ...LIST, id: "bozuk" }, loaded);
} catch {
  threw = true;
}
check("bozuk dosyanın üstüne yazılmıyor", threw && fv.files.get(`${LISTS_DIR}/bozuk.txt`) === "başlıksız :: dosya\n");
fv.files.set(listPath("senkron"), "---\nad: Başka cihaz\n---\nx :: y\n");
threw = false;
try {
  await saveList(fv.backend, { ...LIST, id: "senkron" }, loaded);
} catch {
  threw = true;
}
check("yüklenmemiş dosyanın üstüne yazılmıyor", threw && fv.files.get(listPath("senkron"))!.includes("Başka cihaz"));
threw = false;
try {
  await saveList(fv.backend, { ...LIST, id: "../Notlar/a" }, loaded);
} catch {
  threw = true;
}
check("geçersiz kimlik reddediliyor", threw);
check("yeni liste yazılıyor", await saveList(fv.backend, { ...LIST, id: "yeni" }, loaded));
check("düzenlenen liste yazılıyor", await saveList(fv.backend, { ...loaded.lists[0], name: "Değişti" }, loaded));
check("yazılan geri okunuyor", decodeList("yeni", fv.files.get(listPath("yeni"))!)?.rows.length === 4);
await removeList(fv.backend, "yeni", loaded);
check("silme çöp kutusuna", fv.trashed.includes(listPath("yeni")) && loaded.raw.yeni === undefined);

check("NOTE_SAFETY: yazılan her yol Tekrar/Listeler/ altında",
  fv.writes.length > 0 && fv.writes.every((p) => p.startsWith("Tekrar/Listeler/")), fv.writes.join(", "));
check("NOTE_SAFETY: hiçbir .md dosyasına yazılmıyor", !fv.writes.some((p) => p.toLowerCase().endsWith(".md")));
check("NOTE_SAFETY: not dosyası aynen duruyor", fv.files.get("Notlar/a.md") === "Başkent :: Ankara");

const tmpNow = Date.UTC(2026, 9, 29);
check("liste dosyasının artık yan dosyası temizlenecekler arasında",
  isStaleTmpName(tmpNameFor("ingilizce.txt", tmpNow - 2 * STALE_TMP_AGE_MS, 1), tmpNow));

console.log(fails === 0 ? "\nHepsi geçti." : `\n${fails} test başarısız.`);
process.exit(fails === 0 ? 0 : 1);

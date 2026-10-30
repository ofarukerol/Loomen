// Tekrar listeleri ekran yardımcılarının (LOM-66) node testi.
//   npx esbuild src/core/__test__/srsListViewTest.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/srsListViewTest.mjs && node /tmp/srsListViewTest.mjs
import {
  LIST_EMOJIS,
  addRows,
  decodeList,
  encodeList,
  findDuplicates,
  freshState,
  isoDay,
  listCards,
  listProgress,
  parsePasted,
  removeRow,
  rowExists,
  searchRows,
  updateRow,
  type ListRow,
  type ReviewList,
  type SrsState,
} from "../srs";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const NOW = new Date(2026, 9, 30, 12, 0, 0);
const TODAY = isoDay(NOW);
const at = (h: number, dayOffset = 0) => new Date(2026, 9, 30 + dayOffset, h, 0, 0).toISOString();

const LIST: ReviewList = {
  id: "kelime",
  name: "Kelimeler",
  emoji: "📚",
  color: "teal",
  direction: "front",
  newPerDay: null,
  createdAt: 1767225600000,
  rows: [
    { front: "apple", back: "elma" },
    { front: "book", back: "kitap", note: "I read a BOOK." },
    { front: "cat", back: "kedi" },
    { front: "dog", back: "köpek" },
    { front: "egg", back: "yumurta" },
    { front: "fish", back: "balık" },
    { front: "girl", back: "kız" },
    { front: "house", back: "ev" },
  ],
};

// ——— listProgress ———
console.log("\n— listProgress —");
const empty = listProgress({ ...LIST, rows: [] }, {}, NOW);
check("boş liste: her şey 0", Object.values(empty).every((v) => v === 0), JSON.stringify(empty));

const cards = listCards(LIST);
const st = (i: number, patch: Partial<SrsState>): [string, SrsState] => {
  const c = cards[i];
  return [c.id, { ...freshState(c.id, c.file, c.key, NOW), ...patch }];
};
const states: Record<string, SrsState> = Object.fromEntries([
  // 0 apple: durum yok → yeni
  st(1, { phase: "new" }), // book: yeni
  st(2, { phase: "learning", due: at(11) }), // cat: öğreniliyor, vadesi geldi
  st(3, { phase: "relearning", due: at(10, 3) }), // dog: öğreniliyor, vadesi gelmedi
  st(4, { phase: "review", due: at(8, -5) }), // egg: öğrenildi, vadesi geçmiş → bugün
  st(5, { phase: "review", due: at(23) }), // fish: öğrenildi, bugün akşam → bugün
  st(6, { phase: "review", due: at(9, -1), frozen: true, leech: true }), // girl: dondurulmuş, zor
  st(7, { phase: "review", due: at(9, -1), postponed: TODAY }), // house: bugünlük ertelendi
]);
const p = listProgress(LIST, states, NOW);
check("toplam kart = satır sayısı (tek yön)", p.total === 8, String(p.total));
check("yeni: durumu yok + new", p.fresh === 2, String(p.fresh));
check("öğreniliyor: learning + relearning", p.learning === 2, String(p.learning));
check("öğrenildi: review (dondurulmuş ve ertelenmiş dahil)", p.learned === 4, String(p.learned));
check("bugün: vadesi geçmiş + bugün + vadesi gelen öğrenme; dondurulmuş/ertelenmiş yok", p.due === 3, String(p.due));
check("zor kart sayısı", p.leech === 1, String(p.leech));
check("yüzde = öğrenilen / toplam", p.percent === 50, String(p.percent));
check("yeni + öğreniliyor + öğrenildi = toplam", p.fresh + p.learning + p.learned === p.total);

const yesterday = isoDay(new Date(2026, 9, 29));
const st7 = states[cards[7].id];
const p2 = listProgress(LIST, { ...states, [cards[7].id]: { ...st7, postponed: yesterday } }, NOW);
check("dünkü erteleme bugünü engellemez", p2.due === 4, String(p2.due));

const st2 = states[cards[2].id];
const p3 = listProgress(LIST, { ...states, [cards[2].id]: { ...st2, due: at(13) } }, NOW);
check("öğrenme adımı vakti gelmemişse bugün sayılmaz (buildQueue ile aynı)", p3.due === 2, String(p3.due));

const both: ReviewList = { ...LIST, direction: "both" };
check("iki yönlü listede satır başına iki kart", listProgress(both, {}, NOW).total === 16);
check("geri yönlü listede satır başına bir kart", listProgress({ ...LIST, direction: "back" }, {}, NOW).total === 8);
check("başka listenin durumu sayılmaz",
  listProgress({ ...LIST, id: "baska" }, states, NOW).fresh === 8);

// ——— searchRows ———
console.log("\n— searchRows —");
check("boş sorgu: hepsi", searchRows(LIST.rows, "  ").length === LIST.rows.length);
check("ön yüzde, büyük/küçük harf duyarsız", JSON.stringify(searchRows(LIST.rows, "APPLE")) === "[0]");
check("arka yüzde", JSON.stringify(searchRows(LIST.rows, "köpek")) === "[3]");
check("Türkçe büyük harf (KIZ → kız)", JSON.stringify(searchRows(LIST.rows, "KIZ")) === "[6]");
check("notun içinde", JSON.stringify(searchRows(LIST.rows, "read a book")) === "[1]");
check("parça eşleşme", JSON.stringify(searchRows(LIST.rows, "ba")) === "[5]", JSON.stringify(searchRows(LIST.rows, "ba")));
check("eşleşme yok", searchRows(LIST.rows, "zzz").length === 0);

// ——— addRows ———
console.log("\n— addRows —");
const r1 = addRows(LIST, [
  { front: "Apple", back: "elma 2" }, // listede var (büyük harf farkı)
  { front: "ice", back: "buz" },
  { front: "ice", back: "buz 2" }, // aynı eklemede tekrar
  { front: "jam", back: "reçel", note: "Tatlı" },
  { front: "  ", back: "boş" }, // boş ön yüz düşer
]);
check("eklenen sayısı", r1.added === 2, String(r1.added));
check("tekrar sayısı (listede + metin içi)", r1.duplicates === 2, String(r1.duplicates));
check("yeni satırlar sona eklendi", r1.list.rows.length === 10 && r1.list.rows[8].front === "ice" && r1.list.rows[9].note === "Tatlı");
check("girdi listesi değişmedi", LIST.rows.length === 8 && r1.list !== LIST);
const r2 = addRows(LIST, [{ front: "apple", back: "elma" }]);
check("eklenecek satır yoksa aynı liste döner", r2.list === LIST && r2.added === 0 && r2.duplicates === 1);
const r3 = addRows(LIST, [{ front: "apple", back: "elma" }, { front: "apple", back: "x" }], false);
check("skipExisting kapalı: listede olan eklenir, metin içi tekrar yine atlanır", r3.added === 1 && r3.duplicates === 1);
const r4 = addRows(LIST, [{ front: "a::b", back: "c\nd" }]);
check("eklenen satır normalize edilir", r4.list.rows[8].front === "a: :b" && r4.list.rows[8].back === "c d");

const big: ListRow[] = Array.from({ length: 1000 }, (_, i) => ({ front: `word${i}`, back: `kelime${i}` }));
const t0 = Date.now();
const rBig = addRows({ ...LIST, rows: [] }, big);
const ms = Date.now() - t0;
check("1000 satır eklenir", rBig.added === 1000 && rBig.list.rows.length === 1000);
check("1000 satır hızlı (< 200 ms)", ms < 200, `${ms} ms`);
const round = decodeList(rBig.list.id, encodeList(rBig.list));
check("1000 satır: yaz→oku satır sayısını korur", round?.rows.length === 1000);
check("1000 satır: ilerleme hesabı", listProgress(rBig.list, {}, NOW).fresh === 1000);

const pasted = parsePasted(big.map((r) => `${r.front} - ${r.back}`).join("\n") + "\nword5 - tekrar\nayıraçsız satır");
check("1000 satır yapıştırma: tanınan/tekrar/atlanan", pasted.rows.length === 1000 && pasted.duplicates === 1 && pasted.skipped === 1);
check("listede olanlar uyarı için bulunur", findDuplicates(pasted.rows, rBig.list.rows.slice(0, 10)).length === 10);
check("listede olanlar eklemede atlanır", addRows(rBig.list, pasted.rows.slice(0, 5)).duplicates === 5);

// ——— updateRow / removeRow ———
console.log("\n— updateRow / removeRow —");
const u = updateRow(LIST, 1, { front: "book", back: "defter", note: "" });
check("satır güncellenir, not boşsa kalkar", u.rows[1].back === "defter" && u.rows[1].note === undefined);
check("güncelleme girdi listesini değiştirmez", LIST.rows[1].back === "kitap" && u !== LIST);
check("kart kimliği ön yüz aynı kalınca değişmez", listCards(u)[1].id === cards[1].id);
check("geçersiz indeks: aynı liste", updateRow(LIST, 99, { front: "x", back: "y" }) === LIST && updateRow(LIST, -1, { front: "x", back: "y" }) === LIST);
check("ön ya da arkası boş güncelleme reddedilir", updateRow(LIST, 0, { front: "apple", back: "  " }) === LIST);
check("ön yüzü başka satırla aynı düzenleme reddedilir", updateRow(LIST, 1, { front: "Apple", back: "x" }) === LIST);
check("satır kendi ön yüzünü koruyarak düzenlenebilir", updateRow(LIST, 0, { front: "APPLE", back: "elma!" }) !== LIST);
check("rowExists: başka satırda var / kendisi hariç / yok",
  rowExists(LIST.rows, " Book ") && !rowExists(LIST.rows, "book", 1) && !rowExists(LIST.rows, "zebra") && !rowExists(LIST.rows, "  "));
const d = removeRow(LIST, 0);
check("satır silinir", d.rows.length === 7 && d.rows[0].front === "book" && LIST.rows.length === 8);
check("geçersiz indeks silmede: aynı liste", removeRow(LIST, 8) === LIST && removeRow(LIST, 1.5) === LIST);

// ——— CSV ———
console.log("\n— parsePasted csv —");
const csv = parsePasted('apple,elma\n"book","kitap","I read a book."\n"hello, world",merhaba dünya\n"say ""hi""",selam\nfoo;bar\nyalnız', { csv: true });
check("csv: virgül ayıraç", csv.rows[0].front === "apple" && csv.rows[0].back === "elma");
check("csv: tırnaklı alanlar ve not", csv.rows[1].front === "book" && csv.rows[1].back === "kitap" && csv.rows[1].note === "I read a book.");
check("csv: tırnak içindeki virgül korunur", csv.rows[2].front === "hello, world" && csv.rows[2].back === "merhaba dünya", JSON.stringify(csv.rows[2]));
check("csv: çift tırnak kaçışı", csv.rows[3].front === 'say "hi"', JSON.stringify(csv.rows[3]));
check("csv: daha öncelikli ayıraç (;) yine tanınır", csv.rows[4].front === "foo" && csv.rows[4].back === "bar");
check("csv: ayıraçsız satır atlanır", csv.rows.length === 5 && csv.skipped === 1);
const csvQ = parsePasted('"well - known",bilinen\n"a; b",c\n"x = y","z, w"', { csv: true });
check("csv: tırnak içindeki başka ayıraçlar da bölmez",
  csvQ.rows.length === 3 && csvQ.rows[0].front === "well - known" && csvQ.rows[1].front === "a; b" &&
    csvQ.rows[2].front === "x = y" && csvQ.rows[2].back === "z, w", JSON.stringify(csvQ.rows));
const plain = parsePasted("hello, world\nI see, she said - gördüm, dedi");
check("düz yapıştırmada virgül ayıraç değil", plain.skipped === 1 && plain.rows.length === 1);
check("düz yapıştırmada virgüllü cümle korunur", plain.rows[0].front === "I see, she said" && plain.rows[0].back === "gördüm, dedi");
check("düz yapıştırmada tırnak sıyrılmaz", parsePasted('"a" - "b"').rows[0].front === '"a"');

// ——— LIST_EMOJIS ———
check("simge listesi dolu, tekrarsız, varsayılanı içerir",
  LIST_EMOJIS.length >= 8 && new Set(LIST_EMOJIS).size === LIST_EMOJIS.length && LIST_EMOJIS.includes("📚"));

console.log(fails === 0 ? "\nHepsi geçti." : `\n${fails} test başarısız.`);
process.exit(fails === 0 ? 0 : 1);

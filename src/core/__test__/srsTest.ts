// Tekrar (aralıklı tekrar) çekirdeğinin node testi.
//   npx esbuild src/core/__test__/srsTest.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/srsTest.mjs && node /tmp/srsTest.mjs
import {
  DEFAULT_SETTINGS,
  apply,
  appendLog,
  balanceDays,
  buildQueue,
  cardId,
  collectCards,
  dailyDemand,
  elapsedDays,
  freshState,
  futureLoad,
  humanInterval,
  intervalFor,
  matchStates,
  migratePath,
  parseCards,
  retrievability,
  saveStates,
  schedule,
  spreadBacklog,
  type Grade,
  type SrsSettings,
  type SrsState,
} from "../srs";
import type { VaultBackend } from "../vault/types";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const CFG: SrsSettings = { ...DEFAULT_SETTINGS, enabled: true };

// ---------------------------------------------------------------- ayrıştırma

const NOTE = [
  "# Tarih",
  "",
  "Osmanlı Devleti ne zaman kuruldu :: 1299",
  "- kitap ::: book",
  "Başkent ==Ankara==, en kalabalık şehir ==İstanbul==",
  "",
  "Malazgirt neden önemlidir?",
  "Kısaca.",
  "?",
  "Anadolu'nun kapıları açıldı.",
  "",
  "```js",
  "const a = 1; // burada :: var, kart olmamalı",
  "```",
  "",
  "#tekrar",
].join("\n");

const cards = parseCards("Notlar/Tarih.md", NOTE, CFG.syntax);
const kinds = cards.map((c) => c.kind).join(",");
check("beş işaretleme biçimi ayrıştırılıyor", cards.length === 6, kinds);
check("kod bloğundaki :: kart sayılmıyor", !cards.some((c) => c.question.includes("const a")));
check("çift yönlü iki kart üretiyor", cards.filter((c) => c.answer === "kitap" || c.question === "kitap").length === 2);
check("gizlenen kelime iki ayrı kart", cards.filter((c) => c.kind === "cloze").length === 2);

const shifted = parseCards("Notlar/Tarih.md", "\n\n\n" + NOTE, CFG.syntax);
check(
  "satır kayınca kimlik değişmiyor",
  JSON.stringify(cards.map((c) => c.id)) === JSON.stringify(shifted.map((c) => c.id)),
);

const withNote = collectCards({ "Notlar/Tarih.md": NOTE }, CFG.syntax, []);
check("#tekrar notu tek okuma kartı ekliyor", withNote.length === cards.length + 1);
check("hariç tutulan klasör taranmıyor", collectCards({ "Gizli/a.md": "x :: y" }, CFG.syntax, ["Gizli"]).length === 0);

// ---------------------------------------------------------------- aralık hesabı

check("R(S,S) = %90", Math.abs(retrievability(10, 10) - 0.9) < 1e-6, retrievability(10, 10).toFixed(6));
check("hedef %90 iken aralık = oturmuşluk", Math.abs(intervalFor(10, 0.9) - 10) < 1e-6);
check(
  "hedef düşürünce aralık uzuyor",
  intervalFor(10, 0.85) > intervalFor(10, 0.9) && intervalFor(10, 0.9) > intervalFor(10, 0.95),
  `${intervalFor(10, 0.85).toFixed(1)} > ${intervalFor(10, 0.9).toFixed(1)} > ${intervalFor(10, 0.95).toFixed(1)}`,
);

// "bildim" zinciri: aralık her adımda uzamalı
let st = freshState("x", "a.md", "k");
let day = new Date(2026, 0, 1, 9, 0, 0);
const chain: number[] = [];
for (let i = 0; i < 6; i++) {
  const next = schedule(st, 3, CFG, day);
  st = apply(st, 3, next, day);
  chain.push(next.days);
  day = new Date(day.getTime() + Math.max(next.minutes, 1) * 60000);
}
check("aralık her doğru cevapta uzuyor", chain.slice(2).every((v, i) => v > chain[i + 1]), chain.join(" → "));

// unutma: oturmuşluk sıfırlanmamalı
const settled: SrsState = { ...freshState("y", "a.md", "k"), phase: "review", stability: 40, difficulty: 5, reps: 8, last: new Date(2026, 0, 1).toISOString() };
const lapsed = schedule(settled, 1, CFG, new Date(2026, 1, 10));
check("unutunca oturmuşluk sıfırlanmıyor", lapsed.stability > 1 && lapsed.stability < 40, lapsed.stability.toFixed(2));
check("unutunca yeniden öğrenmeye düşüyor", lapsed.phase === "relearning");

// zorluk ortalamaya dönüyor (eski yöntemin "bir kez zorlaştı, hep zor" derdi yok)
let hard: SrsState = { ...settled, difficulty: 9.5 };
for (let i = 0; i < 8; i++) hard = apply(hard, 4, schedule(hard, 4, CFG, new Date(2026, 0, 1)), new Date(2026, 0, 1));
check("zorluk geri çekilebiliyor", hard.difficulty < 9.5, hard.difficulty.toFixed(2));

check("aralık insan diline çevriliyor", humanInterval(10) === "10 dk" && humanInterval(45 * 1440).includes("ay"));
check("geçen gün sayısı doğru", elapsedDays({ ...settled, last: new Date(2026, 0, 1).toISOString() }, new Date(2026, 0, 11)) === 10);

// ---------------------------------------------------------------- eşleştirme ve göç

const saved: Record<string, SrsState> = {};
for (const c of cards) saved[c.id] = { ...freshState(c.id, c.file, c.key), phase: "review", stability: 12, reps: 4 };

// soru metni düzenlendi → geçmiş taşınmalı
const edited = NOTE.replace("Osmanlı Devleti ne zaman kuruldu", "Osmanlı Devleti hangi yılda kuruldu");
const editedCards = parseCards("Notlar/Tarih.md", edited, CFG.syntax);
const m = matchStates(editedCards, saved);
check("soru düzenlenince geçmiş korunuyor", m.recovered === 1, `kurtarılan: ${m.recovered}`);
const moved = Object.values(m.states).find((s) => s.key.includes("hangi yılda"));
check("taşınan geçmiş dolu geliyor", !!moved && moved.reps === 4);

// alakasız yeni soru → yeni kart olmalı, geçmiş çalınmamalı
const added = NOTE + "\nTamamen alakasız bambaşka bir soru :: cevap";
const m2 = matchStates(parseCards("Notlar/Tarih.md", added, CFG.syntax), saved);
check("alakasız yeni soru sıfırdan başlıyor", m2.recovered === 0 && Object.keys(m2.states).length === cards.length + 1);

// not yeniden adlandırıldı → kimlik yeniden hesaplanmalı, geçmiş korunmalı
const renamed = migratePath(saved, "Notlar/Tarih.md", "Notlar/Osmanlı Tarihi.md");
const rvals = Object.values(renamed);
check("yeniden adlandırınca yol taşınıyor", rvals.every((s) => s.file === "Notlar/Osmanlı Tarihi.md"));
check("yeniden adlandırınca kimlik yeniden hesaplanıyor", rvals.every((s) => s.id === cardId(s.file, s.key)));
check("yeniden adlandırınca geçmiş korunuyor", rvals.every((s) => s.reps === 4));

// ---------------------------------------------------------------- günlük yük

function makeVault(n: number) {
  const contents: Record<string, string> = {};
  for (let i = 0; i < n / 10; i++) {
    contents[`N/${i}.md`] = Array.from({ length: 10 }, (_, j) => `S${i}-${j} :: C${i}-${j}`).join("\n");
  }
  return collectCards(contents, CFG.syntax, []);
}

const many = makeVault(300);
const fresh: Record<string, SrsState> = {};
for (const c of many) fresh[c.id] = freshState(c.id, c.file, c.key);

const q1 = buildQueue(many, fresh, {}, { ...CFG, newPerDay: 10, maxPerDay: 60 });
check("yeni kart tavanı tutuyor", q1.new === 10, `${q1.new} yeni`);

// birikme kur: 200 kartı geçmişe düşür
const backlog: Record<string, SrsState> = {};
many.forEach((c, i) => {
  backlog[c.id] =
    i < 200
      ? { ...freshState(c.id, c.file, c.key), phase: "review", stability: 10, reps: 3, due: new Date(Date.now() - 5 * 86400000).toISOString(), last: new Date(Date.now() - 15 * 86400000).toISOString() }
      : freshState(c.id, c.file, c.key);
});
const q2 = buildQueue(many, backlog, {}, { ...CFG, newPerDay: 10, maxPerDay: 60, minutesPerDay: 0 });
check("tekrar tavanı tutuyor", q2.items.length <= 60, `${q2.items.length} kart`);
check("birikme varken yeni kart durdu", q2.new === 0, `${q2.new} yeni`);
check("dışarıda kalan sayılıyor", q2.deferred === 140, `${q2.deferred}`);

const q3 = buildQueue(many, backlog, {}, { ...CFG, newPerDay: 10, maxPerDay: 60, minutesPerDay: 0, newIgnoresLimit: true });
check("yeni kart tavanı yok sayabiliyor", q3.new === 10, `${q3.new} yeni`);

const q4 = buildQueue(many, backlog, {}, { ...CFG, maxPerDay: 500, minutesPerDay: 5 }, new Date(), 15);
check("süre bütçesi kuyruğu kırpıyor", q4.items.length <= 20, `${q4.items.length} kart · ${q4.minutes} dk`);

const q5 = buildQueue(many, backlog, {}, { ...CFG, vacationUntil: "2099-01-01" });
check("tatilde hiç kart çıkmıyor", q5.items.length === 0 && q5.vacation);

const off = [1, 1, 1, 1, 1, 1, 1];
off[new Date().getDay()] = 0;
const q6 = buildQueue(many, backlog, {}, { ...CFG, weekLoad: off });
check("kapalı günde hiç kart çıkmıyor", q6.items.length === 0 && q6.eased);

const half = [1, 1, 1, 1, 1, 1, 1];
half[new Date().getDay()] = 0.5;
const q7 = buildQueue(many, backlog, {}, { ...CFG, weekLoad: half, maxPerDay: 60, minutesPerDay: 0 });
check("yarım günde tavan yarıya iniyor", q7.items.length === 30, `${q7.items.length} kart`);

// dondurulmuş ve ertelenmiş kartlar çıkmamalı
const frozen = { ...backlog };
const firstId = many[0].id;
frozen[firstId] = { ...frozen[firstId], frozen: true };
check("dondurulan kart kuyruğa girmiyor", !buildQueue(many, frozen, {}, CFG).items.some((i) => i.card.id === firstId));

// yığmama: kart en boş güne kayıyor
const load = new Map<string, number>();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const base = new Date();
for (let d = 8; d <= 12; d++) load.set(iso(new Date(base.getTime() + d * 86400000)), d === 11 ? 0 : 99);
check("yığmama en boş günü seçiyor", balanceDays(10, CFG, load, base) === 11, String(balanceDays(10, CFG, load, base)));
check("yığmama kapalıyken aralık değişmiyor", balanceDays(10, { ...CFG, balance: false }, load, base) === 10);

// birikeni yayma
const spread = spreadBacklog(backlog, 10);
const lateAfter = Object.values(spread).filter((s) => s.phase === "review" && new Date(s.due).getTime() < Date.now() - 86400000);
check("birikeni yayınca gecikmiş kalmıyor", lateAfter.length === 0, `${lateAfter.length} gecikmiş`);
check("gelecek yükü hesaplanıyor", futureLoad(spread).size > 1);

// canlı tahmin hedefe ve yeni kart hızına tepki vermeli
const dLow = dailyDemand({}, { ...CFG, retention: 0.8 }, 1000).cards;
const dHigh = dailyDemand({}, { ...CFG, retention: 0.95 }, 1000).cards;
check("tahmin hatırlama hedefine tepki veriyor", dHigh > dLow * 1.15, `%80: ${dLow.toFixed(0)} · %95: ${dHigh.toFixed(0)}`);
const nLow = dailyDemand({}, { ...CFG, newPerDay: 3 }, 1000).cards;
const nHigh = dailyDemand({}, { ...CFG, newPerDay: 20 }, 1000).cards;
check("tahmin yeni kart hızına tepki veriyor", nHigh > nLow * 2, `3/gün: ${nLow.toFixed(0)} · 20/gün: ${nHigh.toFixed(0)}`);
check("tahmin aynı ayarla aynı çıkıyor", dailyDemand({}, CFG, 1000).cards === dailyDemand({}, CFG, 1000).cards);

// ---------------------------------------------------------------- NOTE_SAFETY

const writes: string[] = [];
const fake: VaultBackend = {
  listNotes: async () => [],
  readNote: async () => "",
  writeNote: async (p) => {
    writes.push(p);
  },
  readBinary: async () => new Uint8Array(),
  writeBinary: async () => {},
  exists: async () => false,
  ensureDir: async () => {},
  rename: async () => {},
  trashNote: async () => {},
  listTrash: async () => [],
  restoreFromTrash: async () => "",
  purgeTrashItem: async () => {},
};

await saveStates(fake, backlog, { "2026-01-01": { n: 1, r: 5, ms: 1000 } });
await appendLog(fake, [{ id: "a", t: 1, g: 3 as Grade, p: "review", s: 10, d: 5, i: 10, pi: 8, ms: 1200 }]);
check(
  "NOTE_SAFETY: yalnız Tekrar/ klasörüne yazılıyor",
  writes.length > 0 && writes.every((p) => p.startsWith("Tekrar/")),
  writes.join(", "),
);
check("NOTE_SAFETY: hiçbir .md dosyasına yazılmıyor", !writes.some((p) => p.toLowerCase().endsWith(".md")));

console.log(fails === 0 ? "\nHepsi geçti." : `\n${fails} test başarısız.`);
process.exit(fails === 0 ? 0 : 1);

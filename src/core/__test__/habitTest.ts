// Alışkanlık çekirdeğinin node testi (LOM-54).
//   npx esbuild src/core/__test__/habitTest.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/habitTest.mjs && node /tmp/habitTest.mjs
//
// Yaz saati olan bir dilim sabitlenir (Türkiye'de yaz saati yok; orada test anlamsız kalırdı).
// Tarihler yalnız fonksiyon çağrılınca üretildiği için modül içe aktarımından sonra ayarlamak yeter.
process.env.TZ = "Europe/Berlin";

import {
  HABIT_DIR,
  addDays,
  cellState,
  dayIndex,
  dayKey,
  dayList,
  decodeHabit,
  editHabit,
  encodeHabit,
  endKey,
  isFinished,
  loadHabits,
  newHabit,
  newRound,
  outcome,
  quitHabit,
  removeHabit,
  restart,
  saveHabit,
  setExcused,
  stats,
  toggleDay,
  type Habit,
} from "../habit";
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

const NOW = Date.UTC(2026, 9, 26, 10);
const base = (o: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Okuma",
  emoji: "📖",
  color: "teal",
  days: 21,
  start: "2026-10-01",
  round: 1,
  lineageId: "h1",
  status: "active",
  done: [],
  excused: [],
  half: [],
  createdAt: NOW,
  ...o,
});

// ---------------------------------------------------------------- gün dizisi

check("saat dilimi yaz saatli", new Date(2026, 6, 1).getTimezoneOffset() !== new Date(2026, 0, 1).getTimezoneOffset());
check("gün anahtarı yerel (gece yarısına yakın saat kaymaz)", dayKey(new Date(2026, 9, 26, 0, 30)) === "2026-10-26");

const d21 = dayList({ start: "2026-10-01", days: 21 });
check("21 günlük dizi 21 gün", d21.length === 21);
check("21 günlük dizi doğru başlayıp bitiyor", d21[0] === "2026-10-01" && d21[20] === "2026-10-21", `${d21[0]} → ${d21[20]}`);
const d41 = dayList({ start: "2026-10-01", days: 41 });
check("41 günlük dizi 41 gün", d41.length === 41);
check("41 günlük dizi 10 Kasım'da bitiyor", d41[40] === "2026-11-10", d41[40]);
check("endKey son günle aynı", endKey({ start: "2026-10-01", days: 41 }) === "2026-11-10");

const month = dayList({ start: "2026-01-25", days: 21 });
check("ay geçişi (Ocak → Şubat)", month[6] === "2026-01-31" && month[7] === "2026-02-01" && month[20] === "2026-02-14");
const leap = dayList({ start: "2028-02-27", days: 4 });
check("artık yıl 29 Şubat", leap.join(",") === "2028-02-27,2028-02-28,2028-02-29,2028-03-01");
const year = dayList({ start: "2026-12-20", days: 21 });
check("yıl geçişi", year[11] === "2026-12-31" && year[12] === "2027-01-01" && year[20] === "2027-01-09");

function consecutive(keys: string[]): boolean {
  for (let i = 1; i < keys.length; i++) {
    const a = new Date(`${keys[i - 1]}T12:00:00Z`).getTime();
    const b = new Date(`${keys[i]}T12:00:00Z`).getTime();
    if (b - a !== 86_400_000) return false;
  }
  return new Set(keys).size === keys.length;
}
const march = dayList({ start: "2026-03-20", days: 21 });
check("Mart yaz saati geçişinde gün kaymıyor", consecutive(march) && march.includes("2026-03-29") && march.includes("2026-03-30"));
const october = dayList({ start: "2026-10-15", days: 21 });
check("Ekim yaz saati dönüşünde gün tekrarlanmıyor", consecutive(october) && october.includes("2026-10-25") && october.includes("2026-10-26"));
check("yaz saati günü sonrası gün numarası doğru", dayIndex({ start: "2026-10-15", days: 21 }, "2026-10-26") === 12);
check("addDays geriye de çalışıyor", addDays("2026-03-30", -2) === "2026-03-28");
check("tur dışı gün numarası 0", dayIndex({ start: "2026-10-01", days: 21 }, "2026-10-22") === 0);

// ---------------------------------------------------------------- hücre ve istatistik

const TODAY = "2026-10-10"; // 10. gün
let h = base();
for (const k of ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"]) {
  h = toggleDay(h, k, TODAY);
}
h = setExcused(h, "2026-10-07", true, TODAY);
// 1,2,3 yapıldı · 4 kaçtı · 5,6 yapıldı · 7 mazeretli · 8,9 yapıldı · 10 bugün (boş)
check("hücre: yapıldı", cellState(h, "2026-10-01", TODAY) === "done");
check("hücre: kaçırıldı", cellState(h, "2026-10-04", TODAY) === "missed");
check("hücre: mazeretli", cellState(h, "2026-10-07", TODAY) === "excused");
check("hücre: bugün", cellState(h, TODAY, TODAY) === "today");
check("hücre: gelecek", cellState(h, "2026-10-11", TODAY) === "future");
check("hücre: tur dışı null", cellState(h, "2026-09-30", TODAY) === null);

let s = stats(h, TODAY);
check("tamamlanan gün", s.completed === 7, String(s.completed));
check("mazeretli gün paydaya girmiyor, bugün işaretsizken sayılmıyor", s.elapsed === 8, String(s.elapsed));
check("başarı yüzdesi", s.percent === 88, `${s.percent}`);
check("mazeret seriyi bozmuyor (dünden geriye 4)", s.currentStreak === 4, String(s.currentStreak));
check("en uzun seri", s.longestStreak === 4, String(s.longestStreak));
check("kalan gün (bugün dahil)", s.remaining === 12, String(s.remaining));

h = toggleDay(h, TODAY, TODAY);
s = stats(h, TODAY);
check("bugün yapılınca seri ve payda artıyor", s.currentStreak === 5 && s.elapsed === 9 && s.remaining === 11);
check("tekrar tıklayınca çentik kalkıyor (yarıma geçer)", !toggleDay(h, TODAY, TODAY).done.includes(TODAY));
check("gelecek güne çentik atılamıyor", toggleDay(h, "2026-10-11", TODAY) === h);
check("gelecek gün mazeretli yapılamıyor", setExcused(h, "2026-10-11", true, TODAY) === h);
check("tur dışı güne çentik atılamıyor", toggleDay(h, "2026-09-30", TODAY) === h);
const ex = setExcused(h, TODAY, true, TODAY);
check("mazeretli işaretlenen gün yapıldıdan düşüyor", ex.excused.includes(TODAY) && !ex.done.includes(TODAY));
check("mazeretli güne çentik atınca mazeret kalkıyor", toggleDay(ex, TODAY, TODAY).done.includes(TODAY) && !toggleDay(ex, TODAY, TODAY).excused.includes(TODAY));
check("saf fonksiyon: eski nesne değişmiyor", !h.excused.includes(TODAY));
check("bırakılmış turda değişiklik yok", toggleDay(quitHabit(h, NOW), "2026-10-04", TODAY).done.length === h.done.length);
// ---------------------------------------------------------------- yarım gün (LOM-70)

const cyc0 = base();
const cyc1 = toggleDay(cyc0, TODAY, TODAY);
const cyc2 = toggleDay(cyc1, TODAY, TODAY);
const cyc3 = toggleDay(cyc2, TODAY, TODAY);
check("döngü: boş → yapıldı", cyc1.done.includes(TODAY) && !cyc1.half.includes(TODAY) && cellState(cyc1, TODAY, TODAY) === "done");
check("döngü: yapıldı → yarım", !cyc2.done.includes(TODAY) && cyc2.half.includes(TODAY) && cellState(cyc2, TODAY, TODAY) === "half");
check("döngü: yarım → boş", !cyc3.done.includes(TODAY) && !cyc3.half.includes(TODAY) && cellState(cyc3, TODAY, TODAY) === "today");
check("döngü: geçmiş günde de aynı", cellState(toggleDay(toggleDay(cyc0, "2026-10-04", TODAY), "2026-10-04", TODAY), "2026-10-04", TODAY) === "half");
check("döngü: saf fonksiyon, eski nesne değişmiyor", cyc1.half.length === 0 && cyc0.done.length === 0);
const excH = setExcused(cyc2, TODAY, true, TODAY);
check("yarım gün mazeretli yapılınca yarımdan düşer", excH.excused.includes(TODAY) && !excH.half.includes(TODAY) && !excH.done.includes(TODAY));
const excT = toggleDay(excH, TODAY, TODAY);
check("mazeretli güne dokunuş yapıldıya geçer", excT.done.includes(TODAY) && !excT.excused.includes(TODAY) && !excT.half.includes(TODAY));
check("mazeret kaldırmak yarımı geri getirmez", setExcused(excH, TODAY, false, TODAY).half.length === 0);
check("gelecek günde döngü yok", toggleDay(cyc1, "2026-10-11", TODAY) === cyc1);
check("bırakılmış turda yarım değişmez", toggleDay(quitHabit(cyc2, NOW), TODAY, TODAY).half.includes(TODAY));

// 1,2,3 yapıldı · 4 yarım · 5,6 yapıldı · 7 mazeretli · 8 yarım · 9 yapıldı · 10 bugün boş
let hh = base({
  done: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-09"],
  excused: ["2026-10-07"],
  half: ["2026-10-04", "2026-10-08"],
});
let hs = stats(hh, TODAY);
check("yarım: tamamlanana girmiyor", hs.completed === 6 && hs.half === 2, `${hs.completed}/${hs.half}`);
check("yarım: paydaya giriyor", hs.elapsed === 8 && hs.percent === 75, `${hs.elapsed} %${hs.percent}`);
check("yarım: seriyi bozmuyor, uzatmıyor (güncel 6 = 9,6,5,3,2,1)", hs.currentStreak === 6, String(hs.currentStreak));
check("yarım: en uzun seri yarımın iki yanını birleştiriyor (1,2,3,5,6,9 → 6)", hs.longestStreak === 6, String(hs.longestStreak));
check("yarım: kalan gün bugün dahil", hs.remaining === 12, String(hs.remaining));
hh = { ...hh, half: [...hh.half, TODAY] };
hs = stats(hh, TODAY);
check("bugün yarım: paydaya girer, kalandan düşer, seri bugünden sayılır", hs.elapsed === 9 && hs.remaining === 11 && hs.currentStreak === 6);
check("yalnız yarımlarla seri 0, yüzde 0", stats(base({ half: ["2026-10-01", "2026-10-02"] }), TODAY).currentStreak === 0 && stats(base({ half: ["2026-10-01"] }), TODAY).percent === 0);

const w7 = base({ days: 7, start: "2026-10-01" });
let w7full = w7;
for (const k of dayList(w7)) w7full = toggleDay(w7full, k, "2026-10-07");
const w7half = toggleDay(w7full, "2026-10-04", "2026-10-07");
const oh = outcome(w7half, "2026-10-08");
check("yarım gün varsa tur Tamamlandı değil", oh?.kind === "ended" && oh.done === 6 && oh.total === 7, JSON.stringify(oh));

const hEnc = encodeHabit(w7half);
const hBack = decodeHabit(hEnc);
check("yarım dosyaya yazılıyor", hEnc.includes('"half": [\n      "2026-10-04"\n    ]'));
check("yarım gidiş-dönüş", !!hBack && hBack.half.join() === "2026-10-04" && encodeHabit(hBack) === hEnc);
check("yarım alan sırası: excused'dan sonra, createdAt'ten önce", hEnc.indexOf('"excused"') < hEnc.indexOf('"half"') && hEnc.indexOf('"half"') < hEnc.indexOf('"createdAt"'));
check("yarım boşken alan yazılmıyor", !encodeHabit(w7full).includes('"half"'));
const oldRaw = JSON.stringify(
  { v: 1, habit: { id: "eski1", name: "Eski", emoji: "🌱", color: "terra", days: 21, start: "2026-10-01", round: 1, lineageId: "eski1", status: "active", done: ["2026-10-01"], excused: [], createdAt: 5 } },
  null,
  2,
) + "\n";
const oldBack = decodeHabit(oldRaw);
check("yarım alanı olmayan eski dosya açılıyor, yarım boş", !!oldBack && Array.isArray(oldBack.half) && oldBack.half.length === 0 && oldBack.done.join() === "2026-10-01");
check("eski dosya yeniden yazılınca metni aynı kalıyor", !!oldBack && encodeHabit(oldBack) === oldRaw);
const clash = decodeHabit(
  JSON.stringify({ v: 1, habit: { id: "c1", name: "x", days: 21, start: "2026-10-01", lineageId: "c1", done: ["2026-10-01"], excused: ["2026-10-02"], half: ["2026-10-01", "2026-10-02", "2026-10-03", "bozuk", "2026-10-03"] } }),
);
check("okumada yapıldı/mazeretli ile çakışan yarım düşüyor", !!clash && clash.half.join() === "2026-10-03" && clash.done.join() === "2026-10-01" && clash.excused.join() === "2026-10-02", clash?.half.join());
check("yazımda da çakışan yarım düşüyor", !encodeHabit(base({ done: ["2026-10-01"], half: ["2026-10-01"] })).includes('"half"'));
check("bozuk yarım alanı boş listeye düşüyor", decodeHabit(JSON.stringify({ v: 1, habit: { id: "c2", name: "x", days: 21, start: "2026-10-01", lineageId: "c2", half: "x" } }))?.half.length === 0);

check("henüz bir şey yokken yüzde 0", stats(base({ start: TODAY }), TODAY).percent === 0);

// ---------------------------------------------------------------- bitiş sonucu

const all = base({ days: 7, start: "2026-10-01" });
let full = all;
for (const k of dayList(all)) full = toggleDay(full, k, "2026-10-07");
check("süre bitmeden sonuç yok", outcome(full, "2026-10-07") === null && !isFinished(full, "2026-10-07"));
check("süre dolunca bitmiş", isFinished(full, "2026-10-08"));
check("hepsi yapıldı → Tamamlandı", outcome(full, "2026-10-08")?.kind === "completed");
const withExc = setExcused(full, "2026-10-03", true, "2026-10-07");
check("mazeretli gün tamamlanmış sayılıyor", outcome(withExc, "2026-10-08")?.kind === "completed");
const partial = toggleDay(toggleDay(full, "2026-10-02", "2026-10-07"), "2026-10-05", "2026-10-07");
const o = outcome(partial, "2026-10-20");
check("eksik → Bitti x/y", o?.kind === "ended" && o.done === 5 && o.total === 7, JSON.stringify(o));
check("bitmiş turda seri son günden sayılıyor", stats(full, "2026-11-01").currentStreak === 7);
const q = quitHabit(base(), NOW);
check("bırakılan → Bırakıldı", outcome(q, TODAY)?.kind === "quit" && isFinished(q, TODAY) && q.quitAt === NOW);

// ---------------------------------------------------------------- oluşturma ve turlar

const nh = newHabit({ name: "  Su iç ", days: 21, start: "2026-10-25" }, "2026-10-26", NOW);
check("yeni alışkanlık: ad kırpılıyor, tur 1, soy kendisi", nh.name === "Su iç" && nh.round === 1 && nh.lineageId === nh.id);
check("kimlik dosya adına uygun", /^[a-z0-9]+$/.test(nh.id), nh.id);
check("kimlikler benzersiz", newHabit({ name: "a", days: 7, start: "2026-10-26" }, "2026-10-26", NOW).id !== nh.id);
check("ileri başlangıç reddediliyor", throws(() => newHabit({ name: "x", days: 21, start: "2026-10-27" }, "2026-10-26", NOW)));
check("0 gün reddediliyor", throws(() => newHabit({ name: "x", days: 0, start: "2026-10-26" }, "2026-10-26", NOW)));
check("366 gün reddediliyor", throws(() => newHabit({ name: "x", days: 366, start: "2026-10-26" }, "2026-10-26", NOW)));
check("boş ad reddediliyor", throws(() => newHabit({ name: "  ", days: 21, start: "2026-10-26" }, "2026-10-26", NOW)));
check("geçersiz tarih reddediliyor", throws(() => newHabit({ name: "x", days: 21, start: "2026-02-30" }, "2026-10-26", NOW)));

const r1 = { ...nh, intent: "Daha dinç olmak", done: ["2026-10-25"] };
const r2 = newRound(r1, { days: 41, start: "2026-10-26" }, "2026-10-26", NOW);
check("yeni tur: numara bir artıyor", r2.round === 2);
check("yeni tur: önceki tura ve soya bağlı", r2.prevId === r1.id && r2.lineageId === r1.lineageId && r2.id !== r1.id);
check("yeni tur: ad/simge/renk/niyet aynı, günler boş", r2.name === r1.name && r2.emoji === r1.emoji && r2.color === r1.color && r2.intent === r1.intent && r2.done.length === 0 && r2.days === 41);
check("yeni alışkanlık ve yeni tur yarımsız başlıyor", nh.half.length === 0 && newRound({ ...r1, half: ["2026-10-24"] }, { days: 21, start: "2026-10-26" }, "2026-10-26", NOW).half.length === 0);
const r3 = newRound(r2, { days: 21, start: "2026-10-26" }, "2026-10-26", NOW);
check("üçüncü tur aynı soyda", r3.round === 3 && r3.lineageId === r1.id && r3.prevId === r2.id);
const rs = restart(quitHabit(r2, NOW), "2026-10-26", NOW);
check("yeniden başlat: bugünden, aktif, aynı tur, öncekine bağlı", rs.start === "2026-10-26" && rs.status === "active" && rs.quitAt === undefined && rs.round === 2 && rs.prevId === r2.id);
check("yeniden başlat: yarımsız", restart({ ...r2, half: ["2026-10-26"] }, "2026-10-26", NOW).half.length === 0);

// ---------------------------------------------------------------- düzenleme (LOM-62)

const FIXED = ["id", "days", "start", "round", "prevId", "lineageId", "status", "done", "excused", "half", "createdAt", "quitAt"] as const;
const fixedOf = (x: Habit) => JSON.stringify(FIXED.map((k) => [k, x[k] ?? null]));
const marked = base({
  id: "e2",
  lineageId: "e1",
  prevId: "e1",
  round: 2,
  intent: "Her gün biraz",
  done: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"],
  excused: ["2026-10-04"],
  half: ["2026-10-09"],
});
const ed = editHabit(marked, { name: "  Kitap oku ", emoji: "🧠", color: "purple", intent: " Daha sakin olmak " });
check("düzenle: yeni ad/simge/renk/niyet geliyor", ed.name === "Kitap oku" && ed.emoji === "🧠" && ed.color === "purple" && ed.intent === "Daha sakin olmak");
check("düzenle: kimlik, süre, başlangıç, tur, soy, durum, çentikler birebir aynı", fixedOf(ed) === fixedOf(marked), fixedOf(ed));
check("düzenle: 7 çentik + 1 mazeret korunuyor", ed.done.length === 7 && ed.excused.join() === "2026-10-04" && stats(ed, TODAY).completed === stats(marked, TODAY).completed);
check("düzenle: yeni alan eklenmiyor", Object.keys(ed).sort().join() === Object.keys(marked).sort().join());
check("düzenle: girdi nesnesi değişmiyor", marked.name === "Okuma" && marked.color === "teal");
check("düzenle: boş ad hata atar", throws(() => editHabit(marked, { name: "   " })));
check("düzenle: geçersiz renk hata atar", throws(() => editHabit(marked, { name: "x", color: "pembe" as Habit["color"] })));
const noIntent = editHabit(marked, { name: "Okuma", intent: "  " });
check("düzenle: niyet boşaltılınca alan kalkar", !("intent" in noIntent) && fixedOf(noIntent) === fixedOf(marked));
check("düzenle: boş simge mevcut simgeyi korur", editHabit(marked, { name: "Yeni", emoji: " " }).emoji === "📖");
check("düzenle: değişiklik yoksa aynı nesne", editHabit(marked, { name: " Okuma ", emoji: "📖", color: "teal", intent: "Her gün biraz" }) === marked);
check("düzenle: renk verilmezse mevcut kalır", editHabit(marked, { name: "Yeni" }).color === "teal");
const edBack = decodeHabit(encodeHabit(ed));
check("düzenle: dosyaya yazılıp geri okunuyor", !!edBack && encodeHabit(edBack) === encodeHabit(ed) && edBack.name === "Kitap oku" && fixedOf(edBack) === fixedOf(marked));
const quitted = quitHabit(marked, NOW);
const edQuit = editHabit(quitted, { name: "Bırakılan", emoji: quitted.emoji, color: quitted.color, intent: quitted.intent });
check("düzenle: bırakılmış turda yalnız ad değişir", edQuit.name === "Bırakılan" && edQuit.status === "quit" && edQuit.quitAt === NOW && fixedOf(edQuit) === fixedOf(quitted) && edQuit.color === "teal");

// ---------------------------------------------------------------- kodek

const enc = encodeHabit(r2);
const back = decodeHabit(enc);
check("kodek gidiş-dönüş", !!back && encodeHabit(back) === enc && back.intent === r2.intent && back.prevId === r2.prevId);
check("yazım deterministik", encodeHabit({ ...r2 }) === enc && enc.endsWith("}\n") && enc.startsWith('{\n  "v": 1,'));
check("bozuk JSON null", decodeHabit("{ bozuk") === null);
check("eski sürüm (v:0) null", decodeHabit(enc.replace('"v": 1', '"v": 0')) === null);
check("ileri sürüm (v:2) null", decodeHabit(enc.replace('"v": 1', '"v": 2')) === null);
check("zorunlu alan eksikse null", decodeHabit(JSON.stringify({ v: 1, habit: { id: "a", name: "x", start: "2026-10-01", lineageId: "a" } })) === null);
check("yanlış türse null", decodeHabit(JSON.stringify({ v: 1, habit: { id: "a", name: "x", days: "21", start: "2026-10-01", lineageId: "a" } })) === null);
check("yol taşıyan kimlik null", decodeHabit(JSON.stringify({ v: 1, habit: { id: "../a", name: "x", days: 21, start: "2026-10-01", lineageId: "a" } })) === null);
const loose = decodeHabit(
  JSON.stringify({ v: 1, habit: { id: "a", name: "x", days: 21, start: "2026-10-01", lineageId: "a", color: "pembe", status: "?", round: 0, done: "x", excused: ["bozuk", "2026-10-02"] } }),
);
check(
  "isteğe bağlı alanlar güvenli varsayılanla doluyor",
  !!loose && loose.color === "terra" && loose.status === "active" && loose.round === 1 && loose.done.length === 0 && loose.excused.join() === "2026-10-02" && !!loose.emoji,
);

// ---------------------------------------------------------------- kasa katmanı

function fakeVault(seed: Record<string, string>) {
  const files = new Map(Object.entries(seed));
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

const NFD = HABIT_DIR.normalize("NFD");
check("NFD ad gerçekten farklı bayt", NFD !== HABIT_DIR);
const good = base({ id: "iyi1", lineageId: "iyi1" });
const fv = fakeVault({
  [`${NFD}/iyi1.json`]: encodeHabit(good),
  [`${NFD}/bozuk.json`]: "{ yarım",
  [`${NFD}/eski.json`]: encodeHabit(base({ id: "eski", lineageId: "eski" })).replace('"v": 1', '"v": 0'),
  [`${NFD}/ileri.json`]: encodeHabit(base({ id: "ileri", lineageId: "ileri" })).replace('"v": 1', '"v": 2'),
  [`${NFD}/yanlis.json`]: encodeHabit(base({ id: "baska", lineageId: "baska" })),
  [`${NFD}/not.md`]: "# dokunma",
  "Günlük/2026-10-26.md": "# gün",
});
const loaded = await loadHabits(fv.backend);
check("NFD klasör adı eşleşiyor", loaded.dirName === NFD);
check("geçerli kayıt yükleniyor", loaded.habits.length === 1 && loaded.habits[0].id === "iyi1");
check(
  "bozuk, eski/ileri sürüm ve kimliği uymayan dosyalar broken",
  loaded.broken.join(",") === "bozuk.json,eski.json,ileri.json,yanlis.json",
  loaded.broken.join(","),
);

check("aynı içerik yeniden yazılmıyor", (await saveHabit(fv.backend, good, loaded)) === false && fv.writes.length === 0);
const changed = toggleDay(good, "2026-10-02", TODAY);
check("değişen içerik yazılıyor", (await saveHabit(fv.backend, changed, loaded)) === true && fv.writes.length === 1);
check("yazma NFD klasörüne gidiyor", fv.writes[0] === `${NFD}/iyi1.json`, fv.writes[0]);
check("aynı içerik ikinci kez yazılmıyor", (await saveHabit(fv.backend, changed, loaded)) === false && fv.writes.length === 1);

const before = fv.files.get(`${NFD}/bozuk.json`);
check("bozuk dosyanın üstüne yazılmıyor", await rejects(saveHabit(fv.backend, base({ id: "bozuk", lineageId: "bozuk" }), loaded)));
check("ileri sürüm dosyanın üstüne yazılmıyor", await rejects(saveHabit(fv.backend, base({ id: "ileri", lineageId: "ileri" }), loaded)));
check("bozuk dosya aynen duruyor", fv.files.get(`${NFD}/bozuk.json`) === before && fv.writes.length === 1);
fv.files.set(`${NFD}/sonradan.json`, encodeHabit(base({ id: "sonradan", lineageId: "sonradan" })));
check("yüklenmemiş dosyanın üstüne yazılmıyor", await rejects(saveHabit(fv.backend, base({ id: "sonradan", lineageId: "sonradan" }), loaded)));

await saveHabit(fv.backend, r2, loaded);
await removeHabit(fv.backend, "iyi1", loaded);
check("silme çöp kutusuna taşıyor", fv.trashed.join() === `${NFD}/iyi1.json` && !fv.files.has(`${NFD}/iyi1.json`) && !("iyi1" in loaded.raw));

const reloaded = await loadHabits(fv.backend);
check("yeni tur diskten geri okunuyor", reloaded.habits.some((x) => x.id === r2.id && x.prevId === r1.id && x.round === 2));

const empty = fakeVault({ "Notlar/a.md": "x" });
const el = await loadHabits(empty.backend);
check("klasör yokken boş liste, varsayılan ad", el.habits.length === 0 && el.dirName === HABIT_DIR);
await saveHabit(empty.backend, nh, el);
check("klasör yokken yeni kayıt Alışkanlık/ altına", empty.writes[0] === `${HABIT_DIR}/${nh.id}.json`);

const allWrites = [...fv.writes, ...empty.writes];
check("NOTE_SAFETY: hiçbir .md dosyasına yazılmıyor", allWrites.length > 0 && !allWrites.some((p) => p.toLowerCase().endsWith(".md")));
check("NOTE_SAFETY: not dosyaları yerinde", fv.files.get(`${NFD}/not.md`) === "# dokunma" && fv.files.get("Günlük/2026-10-26.md") === "# gün");

console.log(fails === 0 ? "\nHepsi geçti." : `\n${fails} test başarısız.`);
process.exit(fails === 0 ? 0 : 1);

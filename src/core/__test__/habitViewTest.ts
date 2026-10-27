// Alışkanlık ekranının görünüm yardımcıları — node testi (LOM-55).
//   npx esbuild src/core/__test__/habitViewTest.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/habitViewTest.mjs && node /tmp/habitViewTest.mjs
process.env.TZ = "Europe/Berlin";

import {
  activeHabits,
  allDoneToday,
  historyGroups,
  isHistoryFilter,
  isMilestone,
  isSealed,
  keepOrder,
  lastSevenStrip,
  markedToday,
  quitDayNo,
  type Habit,
} from "../habit";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const TODAY = "2026-10-27";
let seq = 0;
const mk = (o: Partial<Habit> = {}): Habit => {
  seq++;
  const id = o.id ?? `h${seq}`;
  return {
    id,
    name: `A${seq}`,
    emoji: "🌱",
    color: "terra",
    days: 21,
    start: "2026-10-20",
    round: 1,
    lineageId: o.lineageId ?? id,
    status: "active",
    done: [],
    excused: [],
    createdAt: 1000 + seq,
    ...o,
  };
};

// ---------------------------------------------------------------- Aktif liste

const a = mk({ id: "a" }); // bugün işaretsiz
const b = mk({ id: "b", done: [TODAY] }); // bugün yapıldı
const c = mk({ id: "c", excused: [TODAY] }); // bugün mazeretli
const d = mk({ id: "d" }); // bugün işaretsiz, a'dan sonra
const quit = mk({ id: "q", status: "quit", quitAt: Date.now() });
const ended = mk({ id: "e", start: "2026-09-01", days: 21 }); // 21 Eylül'de bitti

const act = activeHabits([b, quit, c, a, ended, d], TODAY);
check("aktif liste: bırakılan ve süresi dolan yok", act.length === 4 && !act.some((h) => h.id === "q" || h.id === "e"));
check("aktif liste: işaretsizler üstte, sıra korunur", act.map((h) => h.id).join(",") === "a,d,b,c", act.map((h) => h.id).join(","));
check("markedToday: mazeretli de işaretli sayılır", markedToday(c, TODAY) && !markedToday(a, TODAY));

check("hepsi tamam: işaretsiz varken hayır", !allDoneToday([a, b], TODAY));
check("hepsi tamam: hepsi işaretliyken evet", allDoneToday([b, c, quit, ended], TODAY));
check("hepsi tamam: hiç aktif yokken hayır (boş durum ayrı)", !allDoneToday([quit, ended], TODAY) && !allDoneToday([], TODAY));

// Son günü bugün olan tur: aktif listede kalır, ertesi gün Geçmiş'e iner.
const lastDay = mk({ id: "l", start: "2026-10-21", days: 7 }); // 21-27 Ekim
const allDays = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", TODAY];
const sealed = { ...lastDay, done: allDays.filter((k) => k !== "2026-10-23"), excused: ["2026-10-23"] };
check("mühür: bütün günler işaretli ve son gün bugün", isSealed(sealed, TODAY));
check("mühür: bugün eksikse yok", !isSealed({ ...sealed, done: sealed.done.filter((k) => k !== TODAY) }, TODAY));
check("mühür: arada kaçırılan gün varsa yok", !isSealed({ ...sealed, excused: [] }, TODAY));
check("mühür: son gün bugün değilse yok", !isSealed(mk({ done: allDays }), TODAY));
check("mühür: bırakılan tur mühürlenmez", !isSealed({ ...sealed, status: "quit" }, TODAY));
check("mühürlü tur bugün aktif listede", activeHabits([sealed], TODAY).length === 1);
check("mühürlü tur ertesi gün aktif listeden çıkar", activeHabits([sealed], "2026-10-28").length === 0);
check("mühürlü tur ertesi gün Geçmiş'te Tamamlandı", historyGroups([sealed], "2026-10-28")[0]?.items[0]?.outcome.kind === "completed");

// ---------------------------------------------------------------- son 7 gün şeridi

const s1 = lastSevenStrip(mk({ start: "2026-10-24", done: ["2026-10-24", "2026-10-26"], excused: ["2026-10-25"] }), TODAY);
check("şerit 7 gün, bugünde biter", s1.length === 7 && s1[6].key === TODAY && s1[0].key === "2026-10-21");
check(
  "şerit: başlangıçtan önceki günler tur dışı",
  s1.slice(0, 3).every((x) => x.state === null),
  s1.map((x) => x.state).join(","),
);
check(
  "şerit durumları: yapıldı, mazeretli, yapıldı, bugün",
  s1.slice(3).map((x) => x.state).join(",") === "done,excused,done,today",
  s1.slice(3).map((x) => x.state).join(","),
);
const s2 = lastSevenStrip(mk({ start: "2026-09-01", days: 21, done: ["2026-09-21"] }), TODAY);
check("bitmiş turun şeridi son günde biter", s2[6].key === "2026-09-21" && s2[6].state === "done" && s2[5].state === "missed");

const s3 = lastSevenStrip(
  mk({ start: "2026-10-10", days: 21, done: ["2026-10-14"], status: "quit", quitAt: new Date(2026, 9, 15, 20).getTime() }),
  TODAY,
);
check("bırakılan turun şeridi bırakma gününde biter", s3[6].key === "2026-10-15" && s3[5].state === "done", s3[6].key);

// ---------------------------------------------------------------- dönüm noktası

check("dönüm: 7, 14, 21", isMilestone(7, 41) && isMilestone(14, 41) && isMilestone(21, 41));
check("dönüm: son gün", isMilestone(41, 41) && isMilestone(30, 30));
check("dönüm değil: 1, 8, 40", !isMilestone(1, 41) && !isMilestone(8, 41) && !isMilestone(40, 41));
check("dönüm: tur dışı numara değil", !isMilestone(0, 21) && !isMilestone(28, 21));

// ---------------------------------------------------------------- Geçmiş

check("süzgeç doğrulama", isHistoryFilter("all") && isHistoryFilter("quit") && !isHistoryFilter("x") && !isHistoryFilter(null));

const fullDays = (start: string, n: number) => {
  const out: string[] = [];
  const [y, m, dd] = start.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const t = new Date(y, m - 1, dd + i);
    out.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
  }
  return out;
};

// Soy L: 1. tur 21 gün tamam (1-21 Eylül), 2. tur 41 gün süren (bugün aktif).
const r1 = mk({ id: "r1", lineageId: "r1", start: "2026-09-01", days: 21, done: fullDays("2026-09-01", 21) });
const r2 = mk({ id: "r2", lineageId: "r1", prevId: "r1", round: 2, start: "2026-10-01", days: 41 });
// Soy M: 1. tur 17/21 bitti (Ağustos), 2. tur bırakıldı (Ekim başı).
const m1 = mk({ id: "m1", lineageId: "m1", start: "2026-08-01", days: 21, done: fullDays("2026-08-01", 17) });
const m2 = mk({
  id: "m2",
  lineageId: "m1",
  prevId: "m1",
  round: 2,
  start: "2026-10-01",
  days: 21,
  status: "quit",
  quitAt: new Date(2026, 9, 5, 9).getTime(),
});

const all = historyGroups([r2, m2, r1, m1, a], TODAY);
check("geçmiş: iki soy grubu", all.length === 2, all.map((g) => g.lineageId).join(","));
check("geçmiş: en son kapanan grup başta (5 Eki bırakma > 21 Eyl)", all[0]?.lineageId === "m1", all.map((g) => g.lineageId).join(","));
check("geçmiş: tur turları en yenisi başta", all[0]?.items.map((i) => i.habit.id).join(",") === "m2,m1");
check("geçmiş: bırakılan tur Bırakıldı", all[0]?.items[0]?.outcome.kind === "quit");
check("geçmiş: bırakma günü kapanış günü", all[0]?.items[0]?.finishedOn === "2026-10-05", all[0]?.items[0]?.finishedOn);
const ended17 = all[0]?.items[1]?.outcome;
check("geçmiş: 17/21 bitti", ended17?.kind === "ended" && ended17.done === 17 && ended17.total === 21);
check("geçmiş: süren tur Geçmiş'te yok ama soy grubunda kimliği var", all[1]?.items.length === 1 && all[1]?.activeId === "r2");
check("geçmiş: süren turu olmayan soyda activeId null", all[0]?.activeId === null);
check("geçmiş: aktif tek turlu alışkanlık Geçmiş'te yok", !all.some((g) => g.lineageId === "a"));

const onlyDone = historyGroups([r2, m2, r1, m1], TODAY, "completed");
check("süzgeç Tamamlanan: yalnız tam biten", onlyDone.length === 1 && onlyDone[0].items.map((i) => i.habit.id).join(",") === "r1");
const onlyQuit = historyGroups([r2, m2, r1, m1], TODAY, "quit");
check("süzgeç Bırakılan: 17/21 düşer, bırakılan kalır", onlyQuit.length === 1 && onlyQuit[0].items.map((i) => i.habit.id).join(",") === "m2");

// Yeniden başlat aynı tur numarasını taşır: oluşturulma anı sıralar.
const x1 = mk({ id: "x1", lineageId: "x1", start: "2026-09-01", days: 7, status: "quit", quitAt: new Date(2026, 8, 3).getTime() });
const x2 = mk({ id: "x2", lineageId: "x1", prevId: "x1", start: "2026-09-03", days: 7 });
const xs = historyGroups([x1, x2], TODAY);
check("yeniden başlatılan tur aynı grupta, yenisi başta", xs.length === 1 && xs[0].items.map((i) => i.habit.id).join(",") === "x2,x1");

// Bozuk bırakma anı kapanışı son günün ötesine taşımaz.
const late = mk({ id: "z", start: "2026-09-01", days: 7, status: "quit", quitAt: new Date(2026, 9, 1).getTime() });
check("bırakma anı son günden sonraysa son gün", historyGroups([late], TODAY)[0]?.items[0]?.finishedOn === "2026-09-07");

// Bırakma günü sırası (LOM-58).
const q41 = mk({ start: "2026-10-01", days: 41, status: "quit", quitAt: new Date(2026, 9, 11, 15).getTime() });
check("quitDayNo: 41 günlük tur 11 Ekim'de bırakıldı → 11", quitDayNo(q41) === 11, String(quitDayNo(q41)));
const qLate = mk({ start: "2026-09-01", days: 7, status: "quit", quitAt: new Date(2026, 9, 1).getTime() });
check("quitDayNo: bırakma anı son günden sonra → days", quitDayNo(qLate) === 7, String(quitDayNo(qLate)));
const qNone = mk({ start: "2026-09-01", days: 21, status: "quit" });
check("quitDayNo: quitAt yoksa → days", quitDayNo(qNone) === 21, String(quitDayNo(qNone)));
const qEarly = mk({ start: "2026-10-10", days: 21, status: "quit", quitAt: new Date(2026, 9, 5).getTime() });
check("quitDayNo: bırakma başlangıçtan önce → 1", quitDayNo(qEarly) === 1, String(quitDayNo(qEarly)));
check("quitDayNo: aktif tur → null", quitDayNo(mk()) === null);

// Sabit kart sırası (LOM-58).
const o1 = mk({ id: "o1" });
const o2 = mk({ id: "o2" });
const o3 = mk({ id: "o3" });
const o2b = { ...o2, done: [TODAY] };
const ko1 = keepOrder(["o1", "o2", "o3"], [o1, o3, o2b]);
check(
  "keepOrder: aynı küme farklı sırada → önceki sıra, güncel nesne",
  ko1.map((h) => h.id).join(",") === "o1,o2,o3" && ko1[1] === o2b,
  ko1.map((h) => h.id).join(","),
);
const o4 = mk({ id: "o4" });
const ko2 = keepOrder(["o2", "o1"], [o4, o1, o2]);
check("keepOrder: yeni kimlik sona eklenir", ko2.map((h) => h.id).join(",") === "o2,o1,o4", ko2.map((h) => h.id).join(","));
const ko3 = keepOrder(["o1", "o2", "o3"], [o3, o1]);
check("keepOrder: listeden çıkan düşer", ko3.map((h) => h.id).join(",") === "o1,o3", ko3.map((h) => h.id).join(","));
const nx = [o3, o1];
check("keepOrder: boş önceki sıra → next aynen", keepOrder([], nx) === nx);

console.log(fails === 0 ? "\nHepsi geçti." : `\n${fails} test başarısız.`);
process.exit(fails === 0 ? 0 : 1);

// Google Takvim açıklama maddeleri (LOM-42) — ayrıştırma, yerinde yama ve sanal görev üretimi.
// `npm test` ile koşar (scripts/run-tests.mjs). Yalnız saf çekirdek modülü çağrılır.

import {
  GCAL_FILE_PREFIX,
  isGcalTaskFile,
  gcalEventIdOf,
  gcalTaskId,
  parseDescriptionItems,
  patchDescriptionItem,
  eventDateISO,
  eventTimeHHMM,
  gcalEventTasks,
} from "../gcalItems";
import type { GEvent } from "../google";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const eq = (name: string, actual: unknown, expected: unknown): void =>
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    JSON.stringify(actual) === JSON.stringify(expected)
      ? ""
      : `beklenen ${JSON.stringify(expected)}, gelen ${JSON.stringify(actual)}`
  );

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const ev = (over: Partial<GEvent>): GEvent => ({
  id: "ev1",
  summary: "Toplantı",
  start: "2026-10-16",
  end: "2026-10-17",
  all_day: true,
  html_link: "https://calendar.google.com/event?eid=1",
  loomen: false,
  description: null,
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
section("Kimlik yardımcıları");

eq("Önek", GCAL_FILE_PREFIX, "gcal://");
eq("gcalTaskId biçimi", gcalTaskId("abc", 2), "gcal://abc:2");
check("isGcalTaskFile: gcal yolu", isGcalTaskFile("gcal://abc"));
check("isGcalTaskFile: kasa yolu değil", !isGcalTaskFile("Daily/2026-10-16.md"));
eq("gcalEventIdOf", gcalEventIdOf("gcal://abc_123"), "abc_123");
eq("gcalEventIdOf: kasa yolu → null", gcalEventIdOf("Notlar/a.md"), null);

// ─────────────────────────────────────────────────────────────────────────────
section("Ayrıştırma — düz metin ve HTML");

eq(
  "Düz metin: üç madde (liste imli, imsiz, işaretli)",
  parseDescriptionItems("Gündem:\n- [ ] süt al\n[ ] ekmek\n* [x] faturayı öde"),
  [
    { index: 0, text: "süt al", done: false },
    { index: 1, text: "ekmek", done: false },
    { index: 2, text: "faturayı öde", done: true },
  ]
);
eq(
  "span + br",
  parseDescriptionItems("<span>[ ] a</span><br><span>[x] b</span>"),
  [
    { index: 0, text: "a", done: false },
    { index: 1, text: "b", done: true },
  ]
);
eq(
  "ul/li",
  parseDescriptionItems("<ul><li>[ ] a</li><li>[ ] b</li></ul>"),
  [
    { index: 0, text: "a", done: false },
    { index: 1, text: "b", done: false },
  ]
);
eq("p + &nbsp; işareti", parseDescriptionItems("<p>- [&nbsp;] a</p>"), [{ index: 0, text: "a", done: false }]);
eq(
  "Varlıklar çözülür",
  parseDescriptionItems("[ ] Tom &amp; Jerry &lt;3"),
  [{ index: 0, text: "Tom & Jerry <3", done: false }]
);
eq(
  "CRLF",
  parseDescriptionItems("[ ] bir\r\n[X] iki\r\n"),
  [
    { index: 0, text: "bir", done: false },
    { index: 1, text: "iki", done: true },
  ]
);
eq(
  "Madde olmayan satırlar ve satır ortası [ ] atlanır",
  parseDescriptionItems("Not: [ ] bu madde değil\n[] boş\n[ ]metin bitişik\n- [ ] gerçek\n[ ]   "),
  [{ index: 0, text: "gerçek", done: false }]
);
eq(
  "Düz metinde bilinmeyen <yazı> etiket sayılmaz",
  parseDescriptionItems("[ ] a <tamam> b"),
  [{ index: 0, text: "a <tamam> b", done: false }]
);
eq("Boş/null açıklama", [parseDescriptionItems(null), parseDescriptionItems(""), parseDescriptionItems(undefined)], [[], [], []]);

// ─────────────────────────────────────────────────────────────────────────────
section("Yama — işaretleme yerinde");

const plain = "Gündem:\n- [ ] süt al\n[ ] ekmek\n\nSon satır";
eq(
  "İşaretleme yalnız o işareti değiştirir",
  patchDescriptionItem(plain, 1, { done: true }),
  "Gündem:\n- [ ] süt al\n[x] ekmek\n\nSon satır"
);
eq(
  "Geri alma ilk hale döner",
  patchDescriptionItem(patchDescriptionItem(plain, 1, { done: true })!, 1, { done: false }),
  plain
);
const html = '<b>Gündem</b><br><span style="x">[&nbsp;] a</span><br><span>[x] b</span>';
eq(
  "HTML: &nbsp; işaret [x] olur, kalan bayt bayt aynı",
  patchDescriptionItem(html, 0, { done: true }),
  '<b>Gündem</b><br><span style="x">[x] a</span><br><span>[x] b</span>'
);
eq(
  "HTML li: ikinci madde işaretlenir",
  patchDescriptionItem("<ul><li>[ ] a</li><li>[ ] b</li></ul>", 1, { done: true }),
  "<ul><li>[ ] a</li><li>[x] b</li></ul>"
);
eq(
  "CRLF korunur",
  patchDescriptionItem("[ ] bir\r\n[ ] iki\r\n", 0, { done: true }),
  "[x] bir\r\n[ ] iki\r\n"
);
eq("Aynı durum → değişmez", patchDescriptionItem(plain, 0, { done: false }), plain);
eq(
  "Bayat expected → null",
  patchDescriptionItem(plain, 0, { done: true }, { text: "eski metin", done: false }),
  null
);
eq(
  "Bayat expected (işaret) → null",
  patchDescriptionItem(plain, 0, { done: true }, { text: "süt al", done: true }),
  null
);
eq(
  "Uyuşan expected → yazılır",
  patchDescriptionItem(plain, 0, { done: true }, { text: "süt al", done: false }),
  "Gündem:\n- [x] süt al\n[ ] ekmek\n\nSon satır"
);
eq("index dışı → null", patchDescriptionItem(plain, 5, { done: true }), null);

// ─────────────────────────────────────────────────────────────────────────────
section("Yama — metin düzenleme");

eq(
  "Düz metin: yalnız madde metni değişir",
  patchDescriptionItem(plain, 0, { text: "yoğurt al" }),
  "Gündem:\n- [ ] yoğurt al\n[ ] ekmek\n\nSon satır"
);
eq(
  "HTML: kapanış etiketleri korunur",
  patchDescriptionItem("<ul><li><span>[ ] a</span></li><li>[ ] b</li></ul>", 0, { text: "yeni" }),
  "<ul><li><span>[ ] yeni</span></li><li>[ ] b</li></ul>"
);
eq(
  "HTML: metin kaçışlanır",
  patchDescriptionItem("<p>[ ] a</p>", 0, { text: "x & <y>" }),
  "<p>[ ] x &amp; &lt;y&gt;</p>"
);
eq(
  "İşaret + metin birlikte",
  patchDescriptionItem("<p>- [&nbsp;] a</p><p>son</p>", 0, { done: true, text: "b" }),
  "<p>- [x] b</p><p>son</p>"
);
eq(
  "HTML: metinle silinen açılışın kapanışı da gider",
  patchDescriptionItem("<span>[ ] foo <b>bar</b></span><br>x", 0, { text: "yeni" }),
  "<span>[ ] yeni</span><br>x"
);
eq(
  "HTML: bağlantıyla biten madde",
  patchDescriptionItem('<p>[ ] a <a href="u">link</a></p>', 0, { text: "yeni" }),
  "<p>[ ] yeni</p>"
);
eq(
  "HTML: metni saran etiket korunur",
  patchDescriptionItem("<p>[ ] <b>kalın</b></p>", 0, { text: "yeni" }),
  "<p>[ ] <b>yeni</b></p>"
);
eq("Boş metin → null", patchDescriptionItem(plain, 0, { text: "   " }), null);

// ─────────────────────────────────────────────────────────────────────────────
section("Round-trip: parse(patch(desc))");

for (const [name, desc] of [
  ["düz", plain],
  ["html", html],
  ["li", "<ul><li>[ ] a</li><li>[x] b</li></ul>"],
] as const) {
  const items = parseDescriptionItems(desc);
  const patched = patchDescriptionItem(desc, 0, { done: !items[0].done, text: "değişti & <tamam>" })!;
  const after = parseDescriptionItems(patched);
  eq(`${name}: ilk madde güncel`, after[0], { index: 0, text: "değişti & <tamam>", done: !items[0].done });
  eq(`${name}: diğer maddeler aynı`, after.slice(1), items.slice(1));
}

// ─────────────────────────────────────────────────────────────────────────────
section("Etkinlik tarihi / saati");

eq("Tüm-gün → başlangıç tarihi", eventDateISO(ev({})), "2026-10-16");
eq("Tüm-gün → saat yok", eventTimeHHMM(ev({})), undefined);
const timed = ev({ all_day: false, start: "2026-10-16T09:30:00", end: "2026-10-16T10:30:00" });
eq("Saatli → yerel gün", eventDateISO(timed), "2026-10-16");
eq("Saatli → HH:MM", eventTimeHHMM(timed), "09:30");
eq("Bozuk tarih → null", eventDateISO(ev({ all_day: false, start: "bozuk" })), null);

// ─────────────────────────────────────────────────────────────────────────────
section("gcalEventTasks");

const tasks = gcalEventTasks([
  ev({ id: "a", description: "- [ ] süt al<br>[x] ekmek" }),
  ev({ id: "b", description: "madde yok" }),
  ev({ id: "c", loomen: true, description: "[ ] Loomen'in kendi etkinliği" }),
  { ...timed, id: "d", summary: "Doktor", html_link: null, description: "[ ] tahlil" },
]);
eq("Loomen ve maddesiz etkinlik atlanır; 3 madde", tasks.length, 3);
eq("Dosya kimliği", tasks.map((t) => `${t.file}:${t.line}`), ["gcal://a:0", "gcal://a:1", "gcal://d:0"]);
eq(
  "Tüm-gün madde alanları",
  tasks[0],
  {
    file: "gcal://a",
    line: 0,
    raw: "- [ ] süt al",
    indent: 0,
    done: false,
    description: "süt al",
    due: "2026-10-16",
    tags: [],
    pomos: 0,
    external: { kind: "gcal", eventId: "a", summary: "Toplantı", link: "https://calendar.google.com/event?eid=1" },
  }
);
eq("İşaretli madde", [tasks[1].done, tasks[1].raw], [true, "- [x] ekmek"]);
eq("Saatli: due + time", [tasks[2].due, tasks[2].time], ["2026-10-16", "09:30"]);
eq("Saatli: external", tasks[2].external, { kind: "gcal", eventId: "d", summary: "Doktor", link: null });

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${fails === 0 ? `✅ ${ran} testin tümü geçti` : `❌ ${ran} testten ${fails} tanesi başarısız`}`);
process.exit(fails === 0 ? 0 : 1);

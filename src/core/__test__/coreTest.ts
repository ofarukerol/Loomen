// Çekirdek mantığın node testi — görev parser'ı, bağlantılar, arama, tarih ve çöp kutusu.
// Çalıştırma (yeni bağımlılık yok; esbuild vite ile zaten kurulu):
//
//   node_modules/.bin/esbuild src/core/__test__/coreTest.ts --bundle --platform=node \
//     --format=esm '--define:import.meta.env={}' --outfile=/tmp/coreTest.mjs && node /tmp/coreTest.mjs
//
// `--define:import.meta.env={}` gerekir: google.ts Vite ortam değişkeni okur, node'da yoktur.
// Yalnız saf çekirdek modülleri çağrılır (i18n/React kurulumu istemez).

import {
  parseTasks,
  parseTaskLine,
  applyTaskPatch,
  toggleTaskInContent,
  serializeTaskLine,
  getSubtasks,
  getTaskNotes,
  setTaskChildren,
  appendTaskToContent,
  buildTaskLine,
} from "../markdown/taskParser";
import {
  extractWikiLinks,
  extractTags,
  normalizeLinkTarget,
  resolveLink,
  rewriteWikiLinks,
  excerptForLink,
  sameTarget,
} from "../markdown/links";
import { foldTr, searchNotes } from "../search/search";
import { addDaysISO, localDateTime, taskToEventPayload } from "../google";
import { encodeTrashName, toTrashEntry, isExpired, daysLeft } from "../vault/trash";
import type { VaultNote } from "../vault/types";

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

// ─────────────────────────────────────────────────────────────────────────────
section("Görev satırı — CRLF");

// Windows'ta yazılmış bir vault: satır sonundaki \r eskiden TASK_RE'yi bozuyordu
// ve dosyadaki bütün görevler kayboluyordu.
const crlf = "# Başlık\r\n- [ ] Birinci 📅 2026-06-17 #İş\r\n- [x] İkinci ✅ 2026-06-16\r\n";
const crlfTasks = parseTasks("win.md", crlf);
eq("CRLF dosyada iki görev bulundu", crlfTasks.length, 2);
eq("CRLF görev metni temiz", crlfTasks[0].description, "Birinci");
eq("CRLF due okundu", crlfTasks[0].due, "2026-06-17");
eq("CRLF satır indeksleri doğru", crlfTasks.map((t) => t.line), [1, 2]);
eq("CRLF etiket okundu", crlfTasks[0].tags, ["İş"]);

const crlfToggled = toggleTaskInContent(crlf, 1, "2026-06-18");
check("CRLF yazımda satır sonu korunur", crlfToggled.includes("\r\n") && !/[^\r]\n/.test(crlfToggled), JSON.stringify(crlfToggled.slice(0, 20)));
check("CRLF toggle doğru satırı işaretledi", crlfToggled.includes("- [x] Birinci"));
eq("CRLF satır sayısı değişmedi", crlfToggled.split("\r\n").length, crlf.split("\r\n").length);

// Eski CR-only (klasik Mac) içerik de bölünebilmeli.
eq("CR-only içerik parse edilir", parseTasks("mac.md", "- [ ] A\r- [ ] B").length, 2);

// LF dosyalar CRLF'e terfi etmemeli.
const lf = "- [ ] A\n- [ ] B\n";
check("LF dosya LF kalır", !toggleTaskInContent(lf, 0, "2026-06-17").includes("\r"));

// ─────────────────────────────────────────────────────────────────────────────
section("Görev satırı — # etiket ayrımı");

const tricky = parseTaskLine(
  "n.md",
  0,
  "- [ ] Bak https://github.com/a/b#readme ve Issue #123 sonra C# öğren #Gerçek/alt"
)!;
eq("URL çapası etiket sayılmaz, 'Issue #123' etiket sayılmaz", tricky.tags, ["Gerçek/alt"]);
check("URL açıklamada bozulmadan durur", tricky.description.includes("https://github.com/a/b#readme"), tricky.description);
check("'Issue #123' açıklamada korunur", tricky.description.includes("Issue #123"), tricky.description);
eq("Başlık işareti etiket değil", extractTags("## Başlık\n#gerçek"), ["gerçek"]);
eq("Rakamla başlayan etiket yok sayılır", extractTags("#123 #abc"), ["abc"]);

// Etiketler round-trip'te kaybolmamalı ve URL parçalanmamalı.
const rt = parseTaskLine("n.md", 0, "- [ ] Rapor #İş #Acil 📅 2026-06-20")!;
eq("Etiketler sırayla korunur", rt.tags, ["İş", "Acil"]);
eq("Round-trip serileştirme", serializeTaskLine(rt), "- [ ] Rapor #İş #Acil 📅 2026-06-20");

// ─────────────────────────────────────────────────────────────────────────────
section("Görev satırı — geçersiz tarih");

// "2026-13-45" desene uyar ama takvimde yoktur; eskiden gruplama sırasında
// RangeError atıp kasanın açılmasını engelliyordu.
const badDate = parseTaskLine("n.md", 0, "- [ ] Bozuk 📅 2026-13-45")!;
eq("Geçersiz tarih tarihsiz sayılır", badDate.due, undefined);
check("Geçersiz tarih metni kaybolmaz", badDate.description.includes("2026-13-45"), badDate.description);
eq("Var olmayan gün (31 Nisan) reddedilir", parseTaskLine("n.md", 0, "- [ ] X 📅 2026-04-31")!.due, undefined);
eq("Artık yıl olmayan 29 Şubat reddedilir", parseTaskLine("n.md", 0, "- [ ] X 📅 2026-02-29")!.due, undefined);
eq("Artık yıldaki 29 Şubat kabul edilir", parseTaskLine("n.md", 0, "- [ ] X 📅 2028-02-29")!.due, "2028-02-29");
eq("Geçerli tarih hâlâ okunur", parseTaskLine("n.md", 0, "- [ ] X 📅 2026-06-17")!.due, "2026-06-17");

// ─────────────────────────────────────────────────────────────────────────────
section("Görev satırı — kaymış satır yaması");

const doc = ["- [ ] Alfa 📅 2026-06-17", "- [ ] Beta", "- [ ] Gama"].join("\n");
const alfa = parseTasks("d.md", doc)[0];

const patched = applyTaskPatch(doc, 0, alfa, { due: "2026-06-20" });
check("Doğru satırda yama uygulanır", patched.startsWith("- [ ] Alfa 📅 2026-06-20"), patched.split("\n")[0]);

// Dosya dışarıdan değişti: başa bir satır eklendi, artık 0. satır Alfa değil.
const shifted = "# Yeni başlık\n" + doc;
eq("Satır kaymışsa yama reddedilir (içerik aynen döner)", applyTaskPatch(shifted, 0, alfa, { due: "2026-06-20" }), shifted);
// Aynı görev yeni satırında hâlâ yamalanabilmeli.
check(
  "Kayma sonrası doğru satır hâlâ yamalanır",
  applyTaskPatch(shifted, 1, alfa, { due: "2026-06-20" }).split("\n")[1] === "- [ ] Alfa 📅 2026-06-20"
);
eq("Aralık dışı satır reddedilir", applyTaskPatch(doc, 99, alfa, { due: "2026-06-20" }), doc);

// ─────────────────────────────────────────────────────────────────────────────
section("Görev satırı — alt görev ve not bloğu");

const withKids = [
  "- [ ] Üst görev 📅 2026-06-17",
  "    - [ ] Alt bir",
  "    - [x] Alt iki",
  "    Serbest not satırı",
  "- [ ] Başka görev",
].join("\n");
eq("Alt görevler okunur", getSubtasks(withKids, 0).map((s) => [s.text, s.done]), [["Alt bir", false], ["Alt iki", true]]);
eq("Not bloğu okunur", getTaskNotes(withKids, 0), "Serbest not satırı");
const rewritten = setTaskChildren(withKids, 0, [{ text: "Tek alt", done: false }], "Yeni not");
eq(
  "Çocuk bloğu yeniden yazılır, kardeş görev korunur",
  rewritten.split("\n"),
  ["- [ ] Üst görev 📅 2026-06-17", "    - [ ] Tek alt", "    Yeni not", "- [ ] Başka görev"]
);
eq("Çok satırlı not bloğu", getTaskNotes(setTaskChildren(withKids, 0, [], "A\nB"), 0), "A\nB");

// Blok yazımı da satır kaymasına karşı kilitli: hedef satır görev değilse dokunulmaz.
const prose = "# Başlık\nDüz paragraf\n    Girintili satır";
eq("Görev olmayan satıra çocuk bloğu yazılmaz", setTaskChildren(prose, 1, [{ text: "X", done: false }], ""), prose);
eq("Aralık dışı satırda blok yazılmaz", setTaskChildren(withKids, 99, [], "X"), withKids);

eq("buildTaskLine", buildTaskLine("Yeni görev", "2026-06-17"), "- [ ] Yeni görev 📅 2026-06-17");
eq("appendTaskToContent", appendTaskToContent("# X\n", "- [ ] Y"), "# X\n- [ ] Y\n");

// ─────────────────────────────────────────────────────────────────────────────
section("Türkçe harf katlama");

eq("İ ve I aynı harfe katlanır", foldTr("İstanbul"), foldTr("Istanbul"));
eq("ı ve i aynı harfe katlanır", foldTr("kıs"), foldTr("kis"));
eq("Katlama küçük harfe indirir", foldTr("İSTANBUL"), "istanbul");
eq("NFC: ayrıştırılmış İ birleşir", foldTr("I\u0307stanbul"), foldTr("İstanbul"));
eq("NFC: ayrıştırılmış ş birleşir", foldTr("s\u0327arkı"), foldTr("şarkı"));
check("Türkçe'ye özgü diğer harfler korunur", foldTr("ÇÖĞÜŞ") === "çöğüş", foldTr("ÇÖĞÜŞ"));

const notes: VaultNote[] = [
  { path: "Notlar/İstanbul.md", name: "İstanbul", folder: "Notlar", kind: "note" },
  { path: "Notlar/Şarkılar.md", name: "Şarkılar", folder: "Notlar", kind: "note" },
];
const contents: Record<string, string> = {
  "Notlar/İstanbul.md": "# İstanbul\nBoğaz kenarında.",
  "Notlar/Şarkılar.md": "Dinlenecek şarkılar: ISTANBUL turu.",
};
// "İstanbul" (başlık, dotlu İ) ve "ISTANBUL turu" (gövde, noktasız I) — ikisi de bulunmalı.
eq("Arama: noktasız I ile dotlu İ eşleşir", searchNotes(notes, contents, "istanbul").map((h) => h.path).sort(), ["Notlar/İstanbul.md", "Notlar/Şarkılar.md"]);
eq("Arama: başlık eşleşmesi önce gelir", searchNotes(notes, contents, "istanbul")[0].inTitle, true);
eq("Arama: büyük harfli sorgu da bulur", searchNotes(notes, contents, "ŞARKI").map((h) => h.name), ["Şarkılar"]);
eq("Arama: boş sorgu sonuç vermez", searchNotes(notes, contents, "   "), []);

// ─────────────────────────────────────────────────────────────────────────────
section("Wiki bağlantıları");

eq("Takma ad atılır", normalizeLinkTarget("Not|görünen ad"), "Not");
eq("Başlık çapası atılır", normalizeLinkTarget("Not#Bölüm"), "Not");
eq("Başlık + takma ad birlikte", normalizeLinkTarget("Not#Bölüm|ad"), "Not");
eq(".md uzantısı atılır", normalizeLinkTarget("Not.md"), "Not");
eq("Aynı nota başlık çapası boş hedef", normalizeLinkTarget("#Bölüm"), "");

const body = "Bkz [[İstanbul]] ve [[Şarkılar#Rock|rock listesi]].\n![[İstanbul]] gömülü.\n[[#Yerel başlık]]";
eq("Bağlantılar normalize edilir, gömü ve yerel çapa hariç", extractWikiLinks(body), ["İstanbul", "Şarkılar"]);

eq("resolveLink: tam ad", resolveLink("İstanbul", notes)?.path, "Notlar/İstanbul.md");
eq("resolveLink: başlık çapasıyla", resolveLink("İstanbul#Boğaz", notes)?.path, "Notlar/İstanbul.md");
eq("resolveLink: takma adla", resolveLink("İstanbul|şehir", notes)?.path, "Notlar/İstanbul.md");
eq("resolveLink: yol ile", resolveLink("Notlar/Şarkılar", notes)?.path, "Notlar/Şarkılar.md");
eq("resolveLink: harf katlamasıyla", resolveLink("istanbul", notes)?.path, "Notlar/İstanbul.md");
eq("resolveLink: NFC ayrıştırılmış ad", resolveLink("I\u0307stanbul", notes)?.path, "Notlar/İstanbul.md");
eq("resolveLink: kırık bağlantı undefined", resolveLink("Yok Böyle Not", notes), undefined);
eq("resolveLink: boş hedef undefined", resolveLink("#Bölüm", notes), undefined);

check("sameTarget farklı yazımları eşitler", sameTarget("İstanbul", "istanbul"));
check("sameTarget farklı notları ayırır", !sameTarget("İstanbul", "Ankara"));

eq("excerptForLink başlık çapalı bağlantıyı bulur", excerptForLink("- Bkz [[Şarkılar#Rock|liste]]", "Şarkılar"), "Bkz [[Şarkılar#Rock|liste]]");
eq("excerptForLink gömüyü atlar", excerptForLink("![[Şarkılar]]", "Şarkılar"), "");

// Yeniden adlandırma: takma ad, başlık ve gömü korunmalı; ilgisiz metin değişmemeli.
const before = "[[İstanbul]] · [[İstanbul#Boğaz]] · [[İstanbul|şehir]] · ![[İstanbul]] · [[Ankara]] · istanbul sözcüğü";
eq(
  "rewriteWikiLinks tüm biçimleri korur",
  rewriteWikiLinks(before, "İstanbul", "İzmir"),
  "[[İzmir]] · [[İzmir#Boğaz]] · [[İzmir|şehir]] · ![[İzmir]] · [[Ankara]] · istanbul sözcüğü"
);
eq("rewriteWikiLinks ilgisiz içeriği değiştirmez", rewriteWikiLinks("[[Ankara]]", "İstanbul", "İzmir"), "[[Ankara]]");
eq("rewriteWikiLinks aynı ada çevirmez", rewriteWikiLinks(before, "İstanbul", "İstanbul"), before);

// ─────────────────────────────────────────────────────────────────────────────
section("Tarih yardımcıları (yerel saat dilimi)");

// toISOString() UTC'ye çevirdiğinden UTC+3'te tüm-gün etkinliğin bitişi
// başlangıcına eşit çıkıyordu (Google Calendar bunu reddeder / günü kaydırır).
eq("addDaysISO bir gün ekler", addDaysISO("2026-06-25", 1), "2026-06-26");
eq("addDaysISO ay sınırını geçer", addDaysISO("2026-06-30", 1), "2026-07-01");
eq("addDaysISO yıl sınırını geçer", addDaysISO("2026-12-31", 1), "2027-01-01");
eq("addDaysISO artık günü tanır", addDaysISO("2028-02-28", 1), "2028-02-29");
eq("addDaysISO geriye gider", addDaysISO("2026-01-01", -1), "2025-12-31");
eq("addDaysISO sıfır gün aynı günü verir", addDaysISO("2026-06-25", 0), "2026-06-25");
eq("localDateTime yerel naif biçim", localDateTime("2026-06-25", "09:00"), "2026-06-25T09:00:00");
eq("localDateTime dakika ekler", localDateTime("2026-06-25", "09:00", 60), "2026-06-25T10:00:00");

const allDay = taskToEventPayload({
  summary: "Tüm gün",
  due: "2026-06-25",
  loomenKey: "k",
  timeZone: "Europe/Istanbul",
}) as { start: { date: string }; end: { date: string } };
eq("Tüm gün etkinlik başlangıcı", allDay.start.date, "2026-06-25");
eq("Tüm gün etkinlik bitişi (end exclusive)", allDay.end.date, "2026-06-26");
check("Tüm gün etkinlikte bitiş başlangıçtan sonra", allDay.end.date > allDay.start.date);

// ─────────────────────────────────────────────────────────────────────────────
section("Çöp kutusu");

const now = Date.UTC(2026, 5, 17);
const name = encodeTrashName("Notlar/İş Planı.md", now);
const entry = toTrashEntry(name)!;
eq("Türkçe karakterli yol round-trip", entry.originalPath, "Notlar/İş Planı.md");
eq("Ad uzantısız", entry.name, "İş Planı");
eq("Klasör çözüldü", entry.folder, "Notlar");
eq("Tür: not", entry.kind, "note");
eq("Çizim türü tanınır", toTrashEntry(encodeTrashName("a.excalidraw", now))!.kind, "draw");

// `.trash` klasörüne elle bırakılmış / senkronla gelmiş bir dosya vault dışına yazdırmamalı.
eq("Yukarı çıkan yol reddedilir", toTrashEntry(encodeTrashName("../../.ssh/config", now)), null);
eq("Gizli üst yol reddedilir", toTrashEntry(encodeTrashName("Notlar/../../dışarı.md", now)), null);
eq("Mutlak POSIX yol reddedilir", toTrashEntry(encodeTrashName("/etc/passwd", now)), null);
eq("Windows sürücü yolu reddedilir", toTrashEntry(encodeTrashName("C:/Windows/x.md", now)), null);
eq("Ters bölü ile yukarı çıkış reddedilir", toTrashEntry(encodeTrashName("..\\..\\x.md", now)), null);
eq("Bozuk biçim reddedilir", toTrashEntry("rastgele-dosya.md"), null);
check("'..' içeren ad yasak değil (yalnız yol parçası)", toTrashEntry(encodeTrashName("Notlar/a..b.md", now)) !== null);

eq("30 günden yeni kayıt dolmamış", isExpired(now - 29 * 86400000, now), false);
eq("31 günlük kayıt dolmuş", isExpired(now - 31 * 86400000, now), true);
eq("Kalan gün", daysLeft(now - 10 * 86400000, now), 20);
eq("Dolmuş kayıtta kalan gün 0", daysLeft(now - 40 * 86400000, now), 0);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${fails === 0 ? `✅ ${ran} testin tümü geçti` : `❌ ${ran} testten ${fails} tanesi başarısız`}`);
process.exit(fails === 0 ? 0 : 1);

/**
 * Seçim çubuğu (LOM-110) node testi — `npm test` ile koşar.
 *
 * Kapsam: kart satırı üretimi ve nereye yazıldığı, üretilen satırın elle yazılmış kartla aynı
 * kartı vermesi, bağlantı metni ve hedefi, not süzme, kart düğmesinin ne zaman görüneceği,
 * çubuğun ekrana yerleşimi, görünürlük kuralı ve metinlerin üç dilde eksiksiz olması.
 * DOM gerektirmez.
 */
import {
  barVisible,
  canMakeCard,
  cardLine,
  filterNotes,
  linkReplacement,
  linkTargetFor,
  placeBar,
  planCardInsert,
  selectionInTable,
  wikiLinkText,
  type NoteRef,
  type TextEdit,
} from "../../screens/Editor/selectionActions";
import { parseCards } from "../srs/parser";
import { DEFAULT_SETTINGS } from "../srs/types";
import { parseWikiLinks, resolveLink } from "../markdown/links";
import tr from "../../i18n/locales/tr/translation.json";
import en from "../../i18n/locales/en/translation.json";
import ar from "../../i18n/locales/ar/translation.json";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  check(name, g === w, g === w ? "" : `beklenen ${w}, gelen ${g}`);
}

/** "[...]" ile işaretli seçimi çıkar: belge + aralık + seçili metin. */
function sel(marked: string) {
  const a = marked.indexOf("[");
  const b = marked.indexOf("]", a);
  const doc = marked.slice(0, a) + marked.slice(a + 1, b) + marked.slice(b + 1);
  return { doc, from: a, to: b - 1, text: marked.slice(a + 1, b) };
}
function apply(doc: string, e: TextEdit | null): string {
  if (!e) return "<null>";
  return doc.slice(0, e.from) + e.insert + doc.slice(e.to);
}
const SYNTAX = DEFAULT_SETTINGS.syntax;

// — cardLine —
eq("cardLine: düz", cardLine("Başkent", "Ankara"), "Başkent :: Ankara");
eq("cardLine: boşluk sadeleşir", cardLine("  Baş\n kent ", "An\r\nkara"), "Baş kent :: An kara");
eq("cardLine: '::' kaçar", cardLine("a::b", "c:::d"), "a: :b :: c: : :d");
eq("cardLine: boş ön null", cardLine("  ", "x"), null);
eq("cardLine: boş arka null", cardLine("x", "\n"), null);

// — planCardInsert —
{
  const s = sel("Giriş\n[Başkent neresi]\nSon\n");
  const out = apply(s.doc, planCardInsert(s.doc, s.from, s.to, s.text, "Ankara"));
  eq("plan: tam satır kart satırına döner", out, "Giriş\nBaşkent neresi :: Ankara\nSon\n");
}
{
  const s = sel("- [Elma]\n- Armut\n");
  const out = apply(s.doc, planCardInsert(s.doc, s.from, s.to, s.text, "apple"));
  eq("plan: liste maddesi işaretini korur", out, "- Elma :: apple\n- Armut\n");
}
{
  const s = sel("  * [Elma ]\n");
  const out = apply(s.doc, planCardInsert(s.doc, s.from, s.to, "Elma", "apple"));
  eq("plan: girintili liste maddesi", out, "  * Elma :: apple\n");
}
{
  const s = sel("Türkiye'nin [başkenti] Ankara'dır.\nİkinci satır\n\nSonraki paragraf\n");
  const out = apply(s.doc, planCardInsert(s.doc, s.from, s.to, s.text, "Ankara"));
  eq(
    "plan: paragraf içi seçimde blok altına ayrı satır",
    out,
    "Türkiye'nin başkenti Ankara'dır.\nİkinci satır\n\nbaşkenti :: Ankara\n\nSonraki paragraf\n",
  );
}
{
  const s = sel("[Başkent]\n");
  const out = apply(s.doc, planCardInsert(s.doc, s.from, s.to, "Türkiye'nin başkenti", "Ankara"));
  eq("plan: ön yüz değiştiyse satır korunur, kart alta", out, "Başkent\n\nTürkiye'nin başkenti :: Ankara\n");
}
{
  const s = sel("# [Başlık]\n");
  const out = apply(s.doc, planCardInsert(s.doc, s.from, s.to, s.text, "x"));
  eq("plan: başlık satırı bozulmaz", out, "# Başlık\n\nBaşlık :: x\n");
}
{
  const s = sel("| A | B |\n| --- | --- |\n| [bir] | iki |\n");
  const out = apply(s.doc, planCardInsert(s.doc, s.from, s.to, s.text, "one"));
  eq("plan: tablo içinden seçim tablonun altına", out, "| A | B |\n| --- | --- |\n| bir | iki |\n\nbir :: one\n");
}
{
  const s = sel("```\n[kod]\n```\nsonra\n");
  const out = apply(s.doc, planCardInsert(s.doc, s.from, s.to, s.text, "code"));
  eq("plan: kod bloğundan seçim bloğun altına", out, "```\nkod\n```\n\nkod :: code\n\nsonra\n");
}
{
  const s = sel("Satır [bir\nsatır] iki\n");
  const out = apply(s.doc, planCardInsert(s.doc, s.from, s.to, s.text, "çok"));
  eq("plan: çok satırlı seçim tek satır kart olur", out, "Satır bir\nsatır iki\n\nbir satır :: çok\n");
}
{
  const s = sel("[Son satır]");
  const out = apply(s.doc, planCardInsert(s.doc, s.from, s.to, s.text, "x"));
  eq("plan: belge sonu (satır sonu yok)", out, "Son satır :: x");
  eq("plan: boş arka null", planCardInsert(s.doc, s.from, s.to, s.text, " "), null);
}
{
  const doc = "Giriş\nBaşkent\n";
  const e = planCardInsert(doc, 6, 13, "Başkent", "Ankara")!;
  eq("plan: imleç kart satırının sonunda", e.caret, 6 + "Başkent :: Ankara".length);
}

// — Üretilen satır elle yazılmış kartla aynı —
{
  const s = sel("[Başkent neresi]\n");
  const made = apply(s.doc, planCardInsert(s.doc, s.from, s.to, s.text, "Ankara"));
  const a = parseCards("N.md", made, SYNTAX);
  const b = parseCards("N.md", "Başkent neresi :: Ankara\n", SYNTAX);
  eq("kart: tek kart", a.length, 1);
  eq("kart: elle yazılanla aynı kimlik/soru/cevap", a.map((c) => [c.id, c.kind, c.question, c.answer]), b.map((c) => [c.id, c.kind, c.question, c.answer]));
}
{
  const s = sel("Bir [paragraf] içinde ==gizli== kelime.\n");
  const made = apply(s.doc, planCardInsert(s.doc, s.from, s.to, s.text, "cevap"));
  const basic = parseCards("N.md", made, SYNTAX).filter((c) => c.kind === "basic");
  eq("kart: paragraf satırı soru olmaz, yeni satır tek kart", basic.map((c) => [c.question, c.answer]), [["paragraf", "cevap"]]);
}
{
  const line = cardLine("a::b", "c:::d")!;
  const cards = parseCards("N.md", line, SYNTAX);
  eq("kart: kaçışlı '::' tek kart, doğru ayrım", cards.map((c) => [c.kind, c.question, c.answer]), [["basic", "a: :b", "c: : :d"]]);
}

// — wikiLinkText / linkReplacement —
eq("link: aynı ad", wikiLinkText("Proje X", "Proje X"), "[[Proje X]]");
eq("link: takma ad", wikiLinkText("Proje X", "bu proje"), "[[Proje X|bu proje]]");
eq("link: yasak karakterler atılır", wikiLinkText("Not", "a [b] | c"), "[[Not|a b c]]");
eq("link: çok satır tek satır", wikiLinkText("Not", "bir\niki\r\n üç"), "[[Not|bir iki üç]]");
eq("link: yalnız yasak karakter → hedef", wikiLinkText("Not", "[|]"), "[[Not]]");
eq("link: baştaki/sondaki boşluk dışarıda", linkReplacement(" kelime ", "Not"), " [[Not|kelime]] ");
{
  const [l] = parseWikiLinks(wikiLinkText("Klasör/Not", "şu not"));
  eq("link: parseWikiLinks hedef/etiket", [l.target, l.label, l.embed], ["Klasör/Not", "şu not", false]);
  const [m] = parseWikiLinks(wikiLinkText("Not", "Not"));
  eq("link: takma adsız çözümlenir", [m.target, m.label], ["Not", "Not"]);
}

// — linkTargetFor / resolveLink —
const NOTES: (NoteRef & { folder: string })[] = [
  { path: "İş/Plan.md", name: "Plan", folder: "İş", kind: "note" },
  { path: "Ev/Plan.md", name: "Plan", folder: "Ev", kind: "note" },
  { path: "Istanbul gezisi.md", name: "Istanbul gezisi", folder: "", kind: "note" },
  { path: "Notlar/Gezi planı.md", name: "Gezi planı", folder: "Notlar", kind: "note" },
  { path: "Çizim.excalidraw", name: "Çizim", folder: "", kind: "draw" },
  { path: "Tekil.md", name: "Tekil", folder: "", kind: "note" },
];
eq("hedef: tekil ad", linkTargetFor(NOTES[5], NOTES), "Tekil");
eq("hedef: aynı adlı iki not → uzantısız yol", linkTargetFor(NOTES[1], NOTES), "Ev/Plan");
eq("hedef: yol bağlantısı doğru nota çözülür", resolveLink(linkTargetFor(NOTES[1], NOTES), NOTES)?.path, "Ev/Plan.md");
eq("hedef: ad bağlantısı doğru nota çözülür", resolveLink(linkTargetFor(NOTES[5], NOTES), NOTES)?.path, "Tekil.md");

// — filterNotes —
eq("süz: boş sorgu, çizim yok, alfabetik", filterNotes(NOTES, "").map((n) => n.path), [
  "Notlar/Gezi planı.md",
  "Istanbul gezisi.md",
  "Ev/Plan.md",
  "İş/Plan.md",
  "Tekil.md",
]);
eq("süz: Türkçe harf katlama (i/İ)", filterNotes(NOTES, "istan").map((n) => n.name), ["Istanbul gezisi"]);
eq("süz: başta eşleşen önce", filterNotes(NOTES, "gezi").map((n) => n.name), ["Gezi planı", "Istanbul gezisi"]);
eq("süz: yolda eşleşen", filterNotes(NOTES, "notlar").map((n) => n.name), ["Gezi planı"]);
eq("süz: sınır", filterNotes(NOTES, "", 2).length, 2);
eq("süz: açık not hariç", filterNotes(NOTES, "plan", 50, "Ev/Plan.md").map((n) => n.path), ["İş/Plan.md", "Notlar/Gezi planı.md"]);
eq("süz: sonuç yok", filterNotes(NOTES, "zzz"), []);

// — canMakeCard —
{
  const on = { ...DEFAULT_SETTINGS, enabled: true };
  check("kart düğmesi: Tekrar açık", canMakeCard(on, "Notlar/A.md"));
  check("kart düğmesi: Tekrar kapalı → yok", !canMakeCard(DEFAULT_SETTINGS, "Notlar/A.md"));
  check("kart düğmesi: '::' biçimi kapalı → yok", !canMakeCard({ ...on, syntax: { ...on.syntax, basic: false } }, "A.md"));
  check("kart düğmesi: hariç klasör → yok", !canMakeCard({ ...on, excluded: ["Notlar"] }, "Notlar/A.md"));
  check("kart düğmesi: benzer adlı klasör hariç değil", canMakeCard({ ...on, excluded: ["Not"] }, "Notlar/A.md"));
}

// — placeBar —
{
  const base = { selTop: 300, selBottom: 320, selLeft: 100, barW: 200, barH: 36, vw: 800, vh: 600, touch: false };
  eq("çubuk: seçimin üstü", placeBar(base), { left: 100, top: 256, side: "above" });
  eq("çubuk: üstte yer yoksa alta", placeBar({ ...base, selTop: 20, selBottom: 40 }), { left: 100, top: 48, side: "below" });
  eq("çubuk: dokunmatikte alta", placeBar({ ...base, touch: true }), { left: 100, top: 328, side: "below" });
  eq("çubuk: dokunmatikte altta yer yoksa üste", placeBar({ ...base, touch: true, selTop: 560, selBottom: 580 }), {
    left: 100,
    top: 516,
    side: "above",
  });
  eq("çubuk: sağ kenara kenetlenir", placeBar({ ...base, selLeft: 750 }).left, 596);
  eq("çubuk: sol kenara kenetlenir", placeBar({ ...base, selLeft: -30 }).left, 4);
  const tall = placeBar({ ...base, selTop: 10, selBottom: 590 });
  check("çubuk: iki tarafa da sığmazsa ekranda kalır", tall.top >= 4 && tall.top + 36 <= 596, JSON.stringify(tall));
  const narrow = placeBar({ ...base, vw: 150 });
  eq("çubuk: ekrandan geniş çubuk sola yaslanır", narrow.left, 4);
}

// — barVisible / selectionInTable —
check("görünür: düzenlemede dolu seçim", barVisible({ empty: false, text: "x", inTable: false, editing: true }));
check("görünmez: boş seçim", !barVisible({ empty: true, text: "", inTable: false, editing: true }));
check("görünmez: yalnız boşluk", !barVisible({ empty: false, text: "  \n ", inTable: false, editing: true }));
check("görünmez: tabloda", !barVisible({ empty: false, text: "x", inTable: true, editing: true }));
check("görünmez: okuma modu", !barVisible({ empty: false, text: "x", inTable: false, editing: false }));
{
  const doc = "Önce\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nSonra\n";
  const ti = doc.indexOf("| 1");
  check("tablo: içindeki seçim", selectionInTable(doc, ti, ti + 3));
  check("tablo: dışındaki seçim", !selectionInTable(doc, 0, 4));
  check("tablo: tabloya taşan seçim", selectionInTable(doc, 0, ti + 2));
  check("tablo: borusuz belge", !selectionInTable("düz metin", 0, 4));
}

// — Metinler üç dilde —
{
  const KEYS = ["barLabel", "makeCard", "addLink", "cardTitle", "front", "back", "backPlaceholder", "save", "cancel", "linkTitle", "searchPlaceholder", "noResult", "stale"];
  for (const [lang, data] of [["tr", tr], ["en", en], ["ar", ar]] as const) {
    const sb = (data as unknown as Record<string, Record<string, unknown>>).selbar ?? {};
    const missing = KEYS.filter((k) => typeof sb[k] !== "string" || String(sb[k]).trim() === "");
    eq(`${lang}: selbar metinleri eksiksiz (${KEYS.length} anahtar)`, missing, []);
    eq(`${lang}: fazladan anahtar yok`, Object.keys(sb).filter((k) => !KEYS.includes(k)), []);
  }
}

console.log(`\n${fails === 0 ? "✅ TÜM TESTLER GEÇTİ" : `❌ ${fails} test başarısız`}`);
process.exit(fails === 0 ? 0 : 1);

// Tekrar metinleri testi — LOM-66: tr, en, ar için `review` anahtarları (listeler dahil) birebir aynı
// olmalı; Yardım'daki kart biçimleri listeyi anlatmalı. `npm test` ile koşar (scripts/run-tests.mjs).
// Yalnız JSON dosyalarını okur.

import tr from "../../i18n/locales/tr/translation.json";
import en from "../../i18n/locales/en/translation.json";
import ar from "../../i18n/locales/ar/translation.json";
import { LISTS_DIR, listCards, parsePasted } from "../srs";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** İç içe nesneyi "a.b.0.c" -> metin biçiminde düzleştir. */
function flatten(v: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof v === "string") {
    out[prefix] = v;
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => flatten(x, prefix ? `${prefix}.${i}` : String(i), out));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix] = `<${typeof v}>`;
  }
  return out;
}

interface Locale {
  review: unknown;
  help: { s: { review: { cards: { p: string; formats: HelpFormat[] } } } };
}
interface HelpFormat {
  name: string;
  writeLabel?: string;
  write: string;
  file?: string;
  cards: { front: string; back?: string }[];
}
const locales = { tr, en, ar } as unknown as Record<string, Locale>;
const LANGS = ["tr", "en", "ar"] as const;
const flat: Record<string, Record<string, string>> = {};
for (const lang of LANGS) flat[lang] = flatten(locales[lang].review);

const placeholders = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort().join(",");
const ARABIC = /[؀-ۿ]/;
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
/** Bilerek boş bırakılmış metinler (ekranda alt yazı göstermemek için). */
const ALLOWED_EMPTY = new Set(["set.orderSub"]);

// ─────────────────────────────────────────────────────────────────────────────
section("(a) Anahtarlar üç dilde eşit");

const trKeys = Object.keys(flat.tr).sort();
check("tr review anahtarları boş değil", trKeys.length > 100, `${trKeys.length} anahtar`);
for (const lang of ["en", "ar"]) {
  const keys = Object.keys(flat[lang]).sort();
  const missing = trKeys.filter((k) => !(k in flat[lang]));
  const extra = keys.filter((k) => !(k in flat.tr));
  check(`${lang}: tr'de olup ${lang}'de eksik anahtar yok`, missing.length === 0, missing.slice(0, 5).join(", "));
  check(`${lang}: ${lang}'de olup tr'de olmayan fazla anahtar yok`, extra.length === 0, extra.slice(0, 5).join(", "));
}

// Ekranın kullandığı liste anahtarları (LOM-66 planı) her dilde var.
const LIST_KEYS = [
  "tabLists", "tabNotes", "newList", "notesCount", "emptyTitle", "emptyBody", "emptyExample", "emptyCta",
  ...["title", "editTitle", "name", "namePlaceholder", "nameRequired", "icon", "color", "direction", "dirFront",
    "dirBack", "dirBoth", "newPerDay", "newPerDayGeneral", "newPerDayHint", "create", "save"].map((k) => `form.${k}`),
  ...["learned", "learning", "fresh", "dueToday", "rows", "study", "nothingToday", "percent"].map((k) => `card.${k}`),
  ...["backToLists", "search", "addRow", "frontPh", "backPh", "notePh", "add", "paste", "importFile", "edit",
    "deleteList", "deleteRow", "rowExists", "noRows", "noMatch", "showMore", "hard", "hardOnly", "count",
    "deleteTitle", "deleteBody", "deleteConfirm", "deleteRowTitle", "deleteRowBody", "saveError", "cancel"].map((k) => `detail.${k}`),
  ...["title", "importTitle", "hint", "placeholder", "recognized", "skipped", "dupInText", "dupInList", "skipDup",
    "more", "add", "none", "fileError"].map((k) => `paste.${k}`),
  "session.listLabel",
].map((k) => `lists.${k}`);
for (const lang of LANGS) {
  const missing = LIST_KEYS.filter((k) => !(k in flat[lang]));
  check(`${lang}: liste ekranının bütün anahtarları var`, missing.length === 0, missing.slice(0, 5).join(", "));
}

// Sayı alan metinler doğru değişkeni taşıyor (ekranda ham {{n}} ya da eksik sayı kalmasın).
const NEEDS: Record<string, string> = {
  "lists.notesCount": "{{n}}",
  "lists.card.rows": "{{n}}",
  "lists.card.percent": "{{pct}}",
  "lists.detail.showMore": "{{n}}",
  "lists.detail.count": "{{n}}",
  "lists.detail.deleteTitle": "{{name}}",
  "lists.paste.recognized": "{{n}}",
  "lists.paste.skipped": "{{n}}",
  "lists.paste.dupInText": "{{n}}",
  "lists.paste.dupInList": "{{n}}",
  "lists.paste.more": "{{n}}",
  "lists.paste.add": "{{n}}",
  "lists.session.listLabel": "{{name}}",
};
for (const lang of LANGS) {
  const bad = Object.entries(NEEDS).filter(([k, ph]) => placeholders(flat[lang][k] ?? "") !== ph).map(([k]) => k);
  check(`${lang}: liste metinlerinde yer tutucular doğru`, bad.length === 0, bad.slice(0, 5).join(", "));
}

// ─────────────────────────────────────────────────────────────────────────────
section("(b) Metinler dolu ve tutarlı");

for (const lang of LANGS) {
  const empty = Object.entries(flat[lang])
    .filter(([k, v]) => v.trim() === "" && !ALLOWED_EMPTY.has(k))
    .map(([k]) => k);
  check(`${lang}: boş metin yok`, empty.length === 0, empty.slice(0, 5).join(", "));
  const nonString = Object.entries(flat[lang]).filter(([, v]) => /^<\w+>$/.test(v)).map(([k]) => k);
  check(`${lang}: bütün değerler metin`, nonString.length === 0, nonString.slice(0, 5).join(", "));
}
for (const lang of ["en", "ar"]) {
  const bad = trKeys.filter((k) => k in flat[lang] && placeholders(flat.tr[k]) !== placeholders(flat[lang][k]));
  check(`${lang}: {{değişken}} yer tutucuları tr ile aynı`, bad.length === 0, bad.slice(0, 5).join(", "));
}

// ─────────────────────────────────────────────────────────────────────────────
section("(c) Dil doğru");

{
  const noArabic = Object.entries(flat.ar)
    .filter(([k, v]) => v.trim() !== "" && !ALLOWED_EMPTY.has(k) && !ARABIC.test(v))
    .map(([k]) => k);
  check("ar: bütün review metinleri Arapça harf içeriyor", noArabic.length === 0, noArabic.slice(0, 5).join(", "));
  const turkish = Object.entries(flat.en).filter(([, v]) => TURKISH.test(v)).map(([k]) => k);
  check("en: review metinlerinde Türkçe harf yok", turkish.length === 0, turkish.slice(0, 5).join(", "));
  // Örnek satırlar ("apple :: elma") bilerek iki dilde aynı.
  const EXAMPLES = new Set(["lists.emptyExample", "lists.paste.placeholder"]);
  const same = LIST_KEYS.filter((k) => !EXAMPLES.has(k) && flat.tr[k] === flat.en[k]);
  check("en: liste metinleri Türkçeden kopyalanmamış", same.length === 0, same.slice(0, 5).join(", "));
}

// ─────────────────────────────────────────────────────────────────────────────
section("(d) Yardım: kart biçimlerinde liste");

/** Boşlukları tek boşluğa indir: kart arkasındaki not ayrımı (\n\n) yardımda tek satır sonudur. */
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

for (const lang of LANGS) {
  const { formats } = locales[lang].help.s.review.cards;
  const lists = formats.filter((f) => f.file === LISTS_DIR);
  check(`${lang}: kart biçimlerinde tek bir liste biçimi var`, lists.length === 1, `${lists.length}`);
  const list = lists[0];
  if (!list) continue;
  check(`${lang}: liste biçiminin kendi etiketi var`, !!list.writeLabel?.trim());
  const others = formats.filter((f) => f !== list && f.writeLabel !== undefined).length;
  check(`${lang}: not biçimleri ortak "notuna yaz" etiketini kullanıyor`, others === 0);

  // Yardımdaki örnek, gerçek ayrıştırıcı ve kart üreticisiyle aynı kartları anlatıyor.
  const parsed = parsePasted(list.write);
  const made = listCards({
    id: "ornek", name: list.name, emoji: "📚", color: "teal", direction: "both", newPerDay: null, createdAt: 0,
    rows: parsed.rows,
  });
  const want = list.cards.map((c) => `${squash(c.front)} → ${squash(c.back ?? "")}`);
  const got = made.map((c) => `${squash(c.question)} → ${squash(c.answer)}`);
  check(`${lang}: yardım örneği gerçek kartlarla aynı`, JSON.stringify(want) === JSON.stringify(got), got.join(" | "));
}
{
  const counts = LANGS.map((l) => locales[l].help.s.review.cards.formats.length);
  check("üç dilde kart biçimi sayısı aynı", new Set(counts).size === 1, counts.join("/"));
}

console.log(`\n${ran - fails}/${ran} geçti`);
if (fails > 0) {
  console.log(`\n❌ ${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\n✅ Tekrar metni testleri geçti");

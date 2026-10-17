// Yardım metinleri testi — LOM-38: tr, en, ar için `help` anahtarları birebir aynı olmalı.
// `npm test` ile koşar (scripts/run-tests.mjs). Yalnız JSON dosyalarını okur.

import tr from "../../i18n/locales/tr/translation.json";
import en from "../../i18n/locales/en/translation.json";
import ar from "../../i18n/locales/ar/translation.json";

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

const locales = { tr, en, ar } as Record<string, { help: unknown }>;
const flat: Record<string, Record<string, string>> = {};
for (const [name, data] of Object.entries(locales)) flat[name] = flatten(data.help);

const placeholders = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort().join(",");
const ticks = (s: string) => (s.match(/`/g) ?? []).length;

// ─────────────────────────────────────────────────────────────────────────────
section("(a) Anahtarlar üç dilde eşit");

const trKeys = Object.keys(flat.tr).sort();
check("tr help anahtarları boş değil", trKeys.length > 100, `${trKeys.length} anahtar`);
for (const lang of ["en", "ar"]) {
  const keys = Object.keys(flat[lang]).sort();
  const missing = trKeys.filter((k) => !(k in flat[lang]));
  const extra = keys.filter((k) => !(k in flat.tr));
  check(`${lang}: tr'de olup ${lang}'de eksik anahtar yok`, missing.length === 0, missing.slice(0, 5).join(", "));
  check(`${lang}: ${lang}'de olup tr'de olmayan fazla anahtar yok`, extra.length === 0, extra.slice(0, 5).join(", "));
}

// ─────────────────────────────────────────────────────────────────────────────
section("(b) Metinler dolu ve biçimleri tutarlı");

for (const lang of ["tr", "en", "ar"]) {
  const empty = Object.entries(flat[lang]).filter(([, v]) => v.trim() === "").map(([k]) => k);
  check(`${lang}: boş metin yok`, empty.length === 0, empty.slice(0, 5).join(", "));
  const odd = Object.entries(flat[lang]).filter(([, v]) => ticks(v) % 2 !== 0).map(([k]) => k);
  check(`${lang}: ters tırnak (\`) çift sayıda`, odd.length === 0, odd.slice(0, 5).join(", "));
}
for (const lang of ["en", "ar"]) {
  const bad = trKeys.filter((k) => k in flat[lang] && placeholders(flat.tr[k]) !== placeholders(flat[lang][k]));
  check(`${lang}: {{değişken}} yer tutucuları tr ile aynı`, bad.length === 0, bad.slice(0, 5).join(", "));
  // Kod/örnek rozetleri (`...`) sayısı çeviride değişmemeli.
  const tickBad = trKeys.filter((k) => k in flat[lang] && ticks(flat.tr[k]) !== ticks(flat[lang][k]));
  check(`${lang}: kod rozeti sayısı tr ile aynı`, tickBad.length === 0, tickBad.slice(0, 5).join(", "));
}

// ─────────────────────────────────────────────────────────────────────────────
section("(c) Bölümler ve başlıklar");

const SECTION_IDS = ["start", "notes", "planner", "review", "mobile", "draw", "gcal", "github", "safety"];
for (const lang of ["tr", "en", "ar"]) {
  const missing = SECTION_IDS.filter((id) => !flat[lang][`s.${id}.title`] || !flat[lang][`s.${id}.summary`]);
  check(`${lang}: her bölümde başlık ve özet var`, missing.length === 0, missing.join(", "));
}
check("tr: Tekrar bölümü var ve ayrıntılı", Object.keys(flat.tr).filter((k) => k.startsWith("s.review.")).length >= 40);
check(
  "ar: arayüz dili Arapça harf içeriyor",
  /[؀-ۿ]/.test(flat.ar["title"]) && /[؀-ۿ]/.test(flat.ar["s.review.what.p"]),
);
check("en: İngilizce metin Türkçe harf içermiyor", !/[çğıöşüÇĞİÖŞÜ]/.test(flat.en["s.review.what.p"]));

console.log(`\n${ran - fails}/${ran} geçti`);
if (fails > 0) {
  console.log(`\n❌ ${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\n✅ Yardım metni testleri geçti");

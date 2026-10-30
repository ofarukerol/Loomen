// Sağ blok kart sırası testi (LOM-72): sıra hesabı ve Ayarlar metinlerinin üç dilde eşitliği.
import tr from "../../i18n/locales/tr/translation.json";
import en from "../../i18n/locales/en/translation.json";
import ar from "../../i18n/locales/ar/translation.json";
import {
  DEFAULT_SIDE_CARD_ORDER,
  isDefaultSideCardOrder,
  moveSideCard,
  normalizeSideCardOrder,
  reorderSideCards,
  type SideCardId,
} from "../layout/sideCards";

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
const eq = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const D: SideCardId[] = ["pomodoro", "calendar", "focus", "review", "habits"];

section("Varsayılan ve temizleme");
check("Varsayılan sıra: Pomodoro, Takvim, Bugüne Odaklan, Tekrar, Alışkanlıklar", eq(DEFAULT_SIDE_CARD_ORDER, D));
check(
  "Bozuk kayıt varsayılana döner",
  [null, undefined, "pomodoro", 42, {}, [1, 2, 3]].every((v) => eq(normalizeSideCardOrder(v), D)),
);
check(
  "Bilinmeyen kimlik atılır",
  eq(normalizeSideCardOrder(["habits", "weather", "pomodoro", "calendar", "focus", "review"]), [
    "habits", "pomodoro", "calendar", "focus", "review",
  ]),
);
check(
  "Tekrar eden kimlik tekilleşir",
  eq(normalizeSideCardOrder(["review", "review", "habits", "pomodoro", "habits", "calendar", "focus"]), [
    "review", "habits", "pomodoro", "calendar", "focus",
  ]),
);
check(
  "Eksik kart sona eklenir (eski dört kartlı kayıt)",
  eq(normalizeSideCardOrder(["focus", "calendar", "pomodoro", "review"]), ["focus", "calendar", "pomodoro", "review", "habits"]),
);
check("Normalize yeni dizi döner (varsayılanı değiştirmez)", normalizeSideCardOrder(null) !== DEFAULT_SIDE_CARD_ORDER);

section("Yukarı / aşağı");
check("Takvim yukarı → başa geçer", eq(moveSideCard(D, "calendar", -1), ["calendar", "pomodoro", "focus", "review", "habits"]));
check("Tekrar aşağı → sona geçer", eq(moveSideCard(D, "review", 1), ["pomodoro", "calendar", "focus", "habits", "review"]));
check("İlk kart yukarı → değişmez", eq(moveSideCard(D, "pomodoro", -1), D));
check("Son kart aşağı → değişmez", eq(moveSideCard(D, "habits", 1), D));
check("Girdi dizisi yerinde değişmez", moveSideCard(D, "calendar", -1) !== D && eq(D, DEFAULT_SIDE_CARD_ORDER));

section("Sürükle-bırak");
check("İleri taşıma (0 → 3)", eq(reorderSideCards(D, 0, 3), ["calendar", "focus", "review", "pomodoro", "habits"]));
check("Geri taşıma (4 → 1)", eq(reorderSideCards(D, 4, 1), ["pomodoro", "habits", "calendar", "focus", "review"]));
check("Aynı yere bırakma değişmez", eq(reorderSideCards(D, 2, 2), D));
check("Geçersiz sıra numarası değişmez", eq(reorderSideCards(D, -1, 2), D) && eq(reorderSideCards(D, 1, 9), D) && eq(reorderSideCards(D, 0.5, 2), D));

section("Varsayılan mı");
check("Varsayılan sıra → doğru", isDefaultSideCardOrder(D));
check("Değişmiş sıra → yanlış", !isDefaultSideCardOrder(moveSideCard(D, "habits", -1)));
check("Eksik sıra → yanlış", !isDefaultSideCardOrder(["pomodoro", "calendar", "focus", "review"]));

section("Ayarlar metinleri üç dilde eşit");
function flatten(v: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof v === "string") out[prefix] = v;
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = `<${typeof v}>`;
  return out;
}
const KEYS = [
  "sideCards", "sideCardsSub", "sideCardHabitsSub", "sideCardOff", "moveUp", "moveDown", "sideCardReset",
  ...D.map((id) => `sideCard.${id}`),
];
const locales = { tr, en, ar } as unknown as Record<string, { settings: unknown }>;
const ARABIC = /[؀-ۿ]/;
for (const lang of ["tr", "en", "ar"]) {
  const flat = flatten(locales[lang].settings);
  const missing = KEYS.filter((k) => typeof flat[k] !== "string" || flat[k].trim() === "");
  check(`${lang}: kart sırası metinleri eksiksiz`, missing.length === 0, missing.join(", "));
  const sideKeys = Object.keys(flat).filter((k) => k.startsWith("sideCard"));
  const extra = sideKeys.filter((k) => !KEYS.includes(k));
  check(`${lang}: fazla kart sırası anahtarı yok`, extra.length === 0, extra.join(", "));
  if (lang === "ar") check("ar: metinler Arapça", KEYS.every((k) => ARABIC.test(flat[k] ?? "")));
}

console.log(`\n${ran - fails}/${ran} geçti`);
process.exit(fails === 0 ? 0 : 1);

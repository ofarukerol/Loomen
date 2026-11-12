// Ayarlar özellik kartları testi (LOM-82): bayraklar, temizleme, kaynak çözümü, üç dilde metinler
// ve ekranların koşullu çizimi (kaynak denetimi).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import tr from "../../i18n/locales/tr/translation.json";
import en from "../../i18n/locales/en/translation.json";
import ar from "../../i18n/locales/ar/translation.json";
import {
  DEFAULT_FEATURES,
  FEATURE_IDS,
  isFeatureId,
  isFeatureOn,
  normalizeFeatures,
  type FeatureFlags,
} from "../settings/features";

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
const same = (a: FeatureFlags, b: FeatureFlags) =>
  Object.keys(a).length === 4 &&
  Object.keys(b).length === 4 &&
  a.github === b.github &&
  a.calendar === b.calendar &&
  a.habits === b.habits &&
  a.library === b.library;
const ALL_ON: FeatureFlags = { github: true, calendar: true, habits: true, library: true };

section("Kart sırası ve varsayılan");
check(
  "Kart sırası: Yedekleme, Takvim, Tekrar, Asistan, Alışkanlık, Kütüphane",
  FEATURE_IDS.join(",") === "github,calendar,review,assistant,habits,library",
);
check("Varsayılanlar açık", same(DEFAULT_FEATURES, ALL_ON));
check("Kimlik denetimi", isFeatureId("habits") && !isFeatureId("pomodoro") && !isFeatureId(3));

section("Kayıt temizleme");
check(
  "Bozuk kayıt varsayılana döner",
  [null, undefined, "x", 42, true, [], [false]].every((v) => same(normalizeFeatures(v), ALL_ON)),
);
check(
  "Eksik alan varsayılan (açık)",
  same(normalizeFeatures({ github: false }), { github: false, calendar: true, habits: true, library: true }),
);
check(
  "Eski kayıtta Kütüphane alanı yok → açık",
  normalizeFeatures({ github: true, calendar: true, habits: false }).library === true,
);
check(
  "Boolean olmayan alan varsayılan",
  same(normalizeFeatures({ github: "false", calendar: 0, habits: null, library: "no" }), ALL_ON),
);
check(
  "Kayıtlı seçim korunur",
  same(normalizeFeatures({ github: false, calendar: false, habits: false, library: false }), {
    github: false,
    calendar: false,
    habits: false,
    library: false,
  }),
);
const extra = normalizeFeatures({ habits: false, review: false, weather: true }) as unknown as Record<string, unknown>;
check("Fazla alan atılır", Object.keys(extra).sort().join(",") === "calendar,github,habits,library" && extra.habits === false);
check("Normalize yeni nesne döner (varsayılanı değiştirmez)", normalizeFeatures(null) !== DEFAULT_FEATURES);

section("Kaynak çözümü");
const off: FeatureFlags = { github: false, calendar: false, habits: false, library: false };
check("Yedekleme/Takvim/Alışkanlık/Kütüphane bayraktan okunur", ["github", "calendar", "habits", "library"].every(
  (id) => isFeatureOn(id as "github", { features: ALL_ON, srsEnabled: false, aiEnabled: false }) &&
    !isFeatureOn(id as "github", { features: off, srsEnabled: true, aiEnabled: true }),
));
check(
  "Tekrar srsSettings.enabled'dan okunur",
  isFeatureOn("review", { features: off, srsEnabled: true, aiEnabled: false }) &&
    !isFeatureOn("review", { features: ALL_ON, srsEnabled: false, aiEnabled: true }),
);
check(
  "Asistan aiEnabled'dan okunur",
  isFeatureOn("assistant", { features: off, srsEnabled: false, aiEnabled: true }) &&
    !isFeatureOn("assistant", { features: ALL_ON, srsEnabled: true, aiEnabled: false }),
);

section("Metinler üç dilde eşit");
function flatten(v: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof v === "string") out[prefix] = v;
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = `<${typeof v}>`;
  return out;
}
const KEYS = [
  "title", "sub", "notConnected", "connected", "connectedAs", "loading", "readError", "retry",
  "cards", "providers", "appOnly", "habitsCount", "booksCount", "on", "off",
  ...FEATURE_IDS.flatMap((id) => [`${id}.name`, `${id}.desc`]),
].sort();
const locales = { tr, en, ar } as unknown as Record<string, { settings: { features?: unknown } }>;
const ARABIC = /[؀-ۿ]/;
for (const lang of ["tr", "en", "ar"]) {
  const flat = flatten(locales[lang].settings.features ?? {});
  const keys = Object.keys(flat).sort();
  check(`${lang}: anahtar seti beklenenle aynı`, keys.join(",") === KEYS.join(","), keys.filter((k) => !KEYS.includes(k)).concat(KEYS.filter((k) => !keys.includes(k))).join(", "));
  const empty = KEYS.filter((k) => typeof flat[k] !== "string" || flat[k].trim() === "");
  check(`${lang}: boş metin yok`, empty.length === 0, empty.join(", "));
  for (const k of ["connectedAs", "cards", "providers", "habitsCount", "booksCount"]) {
    const v = k === "connectedAs" ? "{{name}}" : "{{n}}";
    if (!(flat[k] ?? "").includes(v)) check(`${lang}: ${k} ${v} içerir`, false);
  }
  if (lang === "ar") {
    const plain = KEYS.filter((k) => !ARABIC.test(flat[k] ?? ""));
    check("ar: metinler Arapça", plain.length === 0, plain.join(", "));
  }
}

section("Ekranlar (kaynak denetimi)");
const root = process.cwd(); // run-tests depo kökünden koşturur
const src = (p: string) => readFileSync(join(root, p), "utf8");
const settings = src("src/screens/Settings/SettingsScreen.tsx");
const titleAt = settings.indexOf('className="lo-set__title"');
const cardsAt = settings.indexOf("<FeatureCards />");
const firstSection = settings.indexOf("<Section", titleAt);
check("Ayarlar: özellik kartları başlığın altında, ilk bölümden önce", titleAt > 0 && cardsAt > titleAt && cardsAt < firstSection);
check("Ayarlar: GitHub bölümü yalnız açıkken", /features\.github && <GitHubSync \/>/.test(settings));
check("Ayarlar: Takvim bölümü yalnız açıkken", /features\.calendar && <GoogleCalendarSync \/>/.test(settings));
check("Ayarlar: Asistan bölümü yalnız açıkken", /aiEnabled && <AiSettings \/>/.test(settings));
check("Ayarlar: Tekrar bölümü yalnız okunmuş ve açıkken", /srsReady && srsEnabled && <ReviewSettings \/>/.test(settings));
check("Ayarlar: koşulsuz bölüm kalmadı", !/^\s*<(GitHubSync|GoogleCalendarSync|AiSettings|ReviewSettings) \/>/m.test(settings));

const store = src("src/store/useAppStore.ts");
check("Kayıt: features kalıcı (partialize)", /partialize:[\s\S]*\n\s+features: s\.features,/.test(store));
check("Kayıt: açılışta temizlenir (merge)", /features:\s*p\.features === undefined \? current\.features : normalizeFeatures\(p\.features\)/.test(store));
check("Kayıt: Tekrar düğmesi okunmadan yazmaz", /if \(s\.srsSettingsStatus !== "ready"\) return;/.test(store));

const ai = src("src/screens/Settings/AiSettings.tsx");
const review = src("src/screens/Settings/ReviewSettings.tsx");
check("Asistan bölümünde eski açma satırı yok", !ai.includes('t("ai.enable")') && !ai.includes("aiSetEnabled"));
check("Tekrar bölümünde eski açma satırı yok", !review.includes('t("review.set.enable")') && !review.includes("cfg.enabled"));

const app = src("src/App.tsx");
// GitHub otomatik senkronu App.tsx'ten useAutoSync kancasına taşındı (LOM-105).
const autoSyncHook = src("src/hooks/useAutoSync.ts");
check("Yedekleme kapalıyken otomatik eşitleme yok", /if \(!ghOn \|\| !ghAutoSync/.test(autoSyncHook));
check("Takvim kapalıyken otomatik eşitleme yok", /if \(!gcalOn \|\| !gcalAutoSync/.test(app));
check("Şerit: alışkanlık düğmesi yalnız açıkken", /habitsOn && btn\("habits"/.test(src("src/components/Ribbon.tsx")));
check("Telefon menüsü: Alışkanlıklar yalnız açıkken", /habitsOn && \(\s*<button className="lo-mtop__item" onClick=\{onHabits\}/.test(src("src/components/MobileTopBar.tsx")));
check("Şerit: kütüphane düğmesi yalnız açıkken", /libraryOn && btn\("library"/.test(src("src/components/Ribbon.tsx")));
check("Telefon menüsü: Kütüphane yalnız açıkken", /libraryOn && \(\s*<button className="lo-mtop__item" onClick=\{onLibrary\}/.test(src("src/components/MobileTopBar.tsx")));
check("Kütüphane kapanınca ekranından çıkılır", /library: \["library", "reader"\]/.test(store));
check("Sağ blok: alışkanlık kartı kapalıyken çizilmez", /if \(!on \|\| list\.length === 0\) return null;/.test(src("src/screens/Planner/HabitsTodayCard.tsx")));

console.log(`\n${ran - fails}/${ran} geçti`);
process.exit(fails === 0 ? 0 : 1);

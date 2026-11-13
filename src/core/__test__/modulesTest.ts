// Modüller sayfası testi (LOM-112): kurulu sayılma kuralı, kayıt temizleme, kart eylemi, detay,
// sayaç, üç dilde metinler ve ekranların bağlantısı (kaynak denetimi).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import tr from "../../i18n/locales/tr/translation.json";
import en from "../../i18n/locales/en/translation.json";
import ar from "../../i18n/locales/ar/translation.json";
import { FEATURE_IDS, type FeatureId } from "../settings/features";
import {
  canOpenDetail,
  isModuleInstalled,
  moduleCounts,
  moduleCta,
  normalizeModulesInstalled,
  normalizeModulesView,
} from "../settings/modules";

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

section("Görünüm kaydı");
check("liste korunur", normalizeModulesView("list") === "list");
check("ızgara korunur", normalizeModulesView("grid") === "grid");
check(
  "bozuk/eksik görünüm ızgaraya döner",
  [undefined, null, "", "LIST", 3, {}, ["list"]].every((v) => normalizeModulesView(v) === "grid"),
);

section("Kurulu kaydı");
check(
  "nesne değilse boş",
  [null, undefined, "x", 4, true, [], ["github"]].every((v) => Object.keys(normalizeModulesInstalled(v)).length === 0),
);
const cleaned = normalizeModulesInstalled({ github: true, review: false, assistant: "true", weather: true, library: 1, habits: true });
check(
  "yalnız bilinen kimlik ve true tutulur",
  Object.keys(cleaned).sort().join(",") === "github,habits",
  JSON.stringify(cleaned),
);
const src0 = { review: true };
check("yeni nesne döner", normalizeModulesInstalled(src0) !== (src0 as unknown));

section("Kurulu sayılma kuralı");
check("açık modül her zaman kurulu", FEATURE_IDS.every((id) => isModuleInstalled(id, {}, true)));
check("kapalı ve bayraksız: kurulu değil", FEATURE_IDS.every((id) => !isModuleInstalled(id, {}, false)));
check("kapalı ve bayraklı: kurulu", FEATURE_IDS.every((id) => isModuleInstalled(id, { [id]: true }, false)));
check("başka modülün bayrağı saymaz", !isModuleInstalled("review", { assistant: true }, false));

section("Kart eylemi");
check("hiç kurulmamış kapalı modül → Kur", moduleCta("assistant", { installed: {}, on: false, locked: false }) === "install");
check("açık modül → anahtar", moduleCta("assistant", { installed: {}, on: true, locked: false }) === "switch");
check("pasife alınmış modül → anahtar (Kur'a dönmez)", moduleCta("review", { installed: { review: true }, on: false, locked: false }) === "switch");
check("kilitli → locked", moduleCta("review", { installed: { review: true }, on: false, locked: true }) === "locked");

section("Detay ve sayaç");
check("kurulu ve aktif → detay açılır", canOpenDetail(true, true));
check("pasif → detay yok", !canOpenDetail(true, false));
check("kurulu değil → detay yok", !canOpenDetail(false, false) && !canOpenDetail(false, true));
const onSet = new Set<FeatureId>(["github", "habits"]);
const c = moduleCounts((id) => onSet.has(id));
check("sayaç: 6 modülden 2 aktif", c.total === 6 && c.active === 2, JSON.stringify(c));
check("sayaç: hiçbiri aktif değil", moduleCounts(() => false).active === 0);

section("Metinler üç dilde eşit");
function flatten(v: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof v === "string") out[prefix] = v;
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = `<${typeof v}>`;
  return out;
}
const KEYS = [
  "title", "sub", "summary", "viewGrid", "viewList", "install", "active", "passive", "notInstalled",
  "open", "back", "details", "openScreen", "settingsLink", "settingsLinkSub", "lockedHint", "openHint",
].sort();
const locales = { tr, en, ar } as unknown as Record<string, { modules?: unknown; ribbon: Record<string, string> }>;
const ARABIC = /[؀-ۿ]/;
for (const lang of ["tr", "en", "ar"]) {
  const flat = flatten(locales[lang].modules ?? {});
  const keys = Object.keys(flat).sort();
  check(`${lang}: anahtar seti beklenenle aynı`, keys.join(",") === KEYS.join(","), keys.filter((k) => !KEYS.includes(k)).concat(KEYS.filter((k) => !keys.includes(k))).join(", "));
  const empty = KEYS.filter((k) => typeof flat[k] !== "string" || flat[k].trim() === "");
  check(`${lang}: boş metin yok`, empty.length === 0, empty.join(", "));
  check(`${lang}: summary yer tutucuları`, (flat.summary ?? "").includes("{{active}}") && (flat.summary ?? "").includes("{{total}}"));
  const rib = locales[lang].ribbon.modules;
  check(`${lang}: ribbon.modules var`, typeof rib === "string" && rib.trim() !== "");
  if (lang === "ar") {
    const plain = KEYS.filter((k) => !ARABIC.test(flat[k] ?? ""));
    check("ar: metinler Arapça", plain.length === 0 && ARABIC.test(rib ?? ""), plain.join(", "));
  }
}

section("Ekranlar (kaynak denetimi)");
const root = process.cwd(); // run-tests depo kökünden koşturur
const src = (p: string) => readFileSync(join(root, p), "utf8");
const store = src("src/store/useAppStore.ts");
check("Screen tipinde modules", /export type Screen = [^;]*"modules"/.test(store));
check("Kayıt: modulesView ve modulesInstalled kalıcı", /partialize:[\s\S]*\n\s+modulesView: s\.modulesView,\n\s+modulesInstalled: s\.modulesInstalled,/.test(store));
check("Kayıt: modulesView açılışta temizlenir", /modulesView: p\.modulesView === undefined \? current\.modulesView : normalizeModulesView\(p\.modulesView\)/.test(store));
check("Kayıt: modulesInstalled açılışta temizlenir", /normalizeModulesInstalled\(p\.modulesInstalled\)/.test(store));
const setFeature = store.slice(store.indexOf("setFeatureOn: (id, on) => {"), store.indexOf("setModulesView: (v) =>"));
check("setFeatureOn modülü kurulu yazar", /modulesInstalled: \{ \.\.\.get\(\)\.modulesInstalled, \[id\]: true \}/.test(setFeature));
check("setFeatureOn Tekrar okunmadan kurulu yazmaz", setFeature.indexOf('if (s.srsSettingsStatus !== "ready") return;') > 0 &&
  setFeature.indexOf('if (s.srsSettingsStatus !== "ready") return;') < setFeature.indexOf("modulesInstalled"));
check("Pasife alınan modülün detayı kapanır", /if \(!on && get\(\)\.moduleDetailId === id\) set\(\{ moduleDetailId: null \}\)/.test(setFeature));
check("installModule Tekrar okunmadan bir şey yapmaz", /installModule: \(id\) => \{[\s\S]*?if \(id === "review" && s\.srsSettingsStatus !== "ready"\) return;/.test(store));

const app = src("src/App.tsx");
check("App: Modüller ekranı çizilir", /screen === "modules" && <ModulesScreen \/>/.test(app));
check("App: geri tuşu detayı kapatır", /screen === "modules" && moduleDetailId\) closers\.push\(\(\) => moduleOpenDetail\(null\)\)/.test(app));
check("Şerit: Modüller düğmesi her zaman", /\n\s+\{btn\("modules", t\("ribbon\.modules"\)/.test(src("src/components/Ribbon.tsx")));
const mtop = src("src/components/MobileTopBar.tsx");
check("Telefon menüsü: Modüller maddesi", /onClick=\{onModules\}/.test(mtop) && /setScreen\("modules"\)/.test(mtop) && /t\("ribbon\.modules"\)/.test(mtop));
check("Telefon menüsü: ⋮ her zaman görünür", !/hasMenu/.test(mtop));
const detail = src("src/screens/Modules/ModuleDetail.tsx");
check("Detay: dört ayar bileşeni", ["<GitHubSync />", "<GoogleCalendarSync />", "<ReviewSettings />", "<AiSettings />"].every((x) => detail.includes(x)));
const card = src("src/screens/Modules/ModuleCard.tsx");
check("Kart: Kur düğmesi", card.includes('t("modules.install")'));
check("Kart: Aktif/Pasif anahtarı", card.includes('role="switch"') && card.includes("aria-checked"));
check("Kart: anahtar ve Kur detayı açmaz", (card.match(/e\.stopPropagation\(\)/g) ?? []).length >= 2);
check("Ayarlar: FeatureCards dosyası kaldırıldı", (() => { try { src("src/screens/Settings/FeatureCards.tsx"); return false; } catch { return true; } })());

console.log(`\n${ran - fails}/${ran} geçti`);
process.exit(fails === 0 ? 0 : 1);

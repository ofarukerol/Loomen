// Sol panel (gezgin) genişlik hesabının node testi (LOM-80).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır; cwd depo köküdür.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import tr from "../../i18n/locales/tr/translation.json";
import en from "../../i18n/locales/en/translation.json";
import ar from "../../i18n/locales/ar/translation.json";
import {
  clampLeftWidth,
  LEFT_PANEL_DEFAULT,
  LEFT_PANEL_MAX,
  LEFT_PANEL_MIN,
  LEFT_PANEL_STEP,
  leftDragStartWidth,
  leftWidthForKey,
  nextLeftWidth,
} from "../layout/leftPanel";

let fails = 0;
let ran = 0;
function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

check("Sınırlar 200-480, varsayılan 248", LEFT_PANEL_MIN === 200 && LEFT_PANEL_MAX === 480 && LEFT_PANEL_DEFAULT === 248);
check("Aralıktaki değer korunur", clampLeftWidth(300) === 300);
check("Alt sınır", clampLeftWidth(10) === LEFT_PANEL_MIN && clampLeftWidth(-500) === LEFT_PANEL_MIN);
check("Üst sınır", clampLeftWidth(99999) === LEFT_PANEL_MAX);
check(
  "Bozuk kayıt varsayılana döner",
  [NaN, Infinity, "300", null, undefined, {}].every((v) => clampLeftWidth(v) === LEFT_PANEL_DEFAULT),
);
check("Küsurat yuvarlanır", clampLeftWidth(260.6) === 261);

// Soldan-sağa: panel solda, tutamak sağ kenarında; sağa çekmek genişletir.
check("LTR sağa çek → genişler", nextLeftWidth(248, 50, false) === 298);
check("LTR sola çek → daralır", nextLeftWidth(248, -30, false) === 218);
check("LTR aşırı daraltma alt sınırda durur", nextLeftWidth(248, -500, false) === LEFT_PANEL_MIN);
check("LTR aşırı genişletme üst sınırda durur", nextLeftWidth(248, 1000, false) === LEFT_PANEL_MAX);

// Sağdan-sola (Arapça): panel sağda, tutamak sol kenarında; sola çekmek genişletir.
check("RTL sola çek → genişler", nextLeftWidth(248, -50, true) === 298);
check("RTL sağa çek → daralır", nextLeftWidth(248, 30, true) === 218);
check("Hareketsiz sürükleme değiştirmez", nextLeftWidth(300, 0, false) === 300 && nextLeftWidth(300, 0, true) === 300);

// Başlangıç ekranda görünen genişlikten alınır (dar pencerede kayıtlı değer daha büyük).
check("Ölçülen genişlik kayıtlı değere üstün gelir", leftDragStartWidth(230, 400) === 230);
check("Ölçüm küsuratı yuvarlanır", leftDragStartWidth(231.4, 400) === 231);
check("Ölçüm yoksa kayıtlı değer", leftDragStartWidth(NaN, 320) === 320 && leftDragStartWidth(0, 320) === 320);
check(
  "Ölçüm sınır dışıysa sınıra çekilir",
  leftDragStartWidth(150, 400) === LEFT_PANEL_MIN && leftDragStartWidth(900, 300) === LEFT_PANEL_MAX,
);
check("Dar pencerede ilk adım hemen etki eder", nextLeftWidth(leftDragStartWidth(230, 400), -10, false) === 220);

// Klavye — Home en dar, End en geniş, Enter varsayılan, oklar adım.
check("Home → en küçük", leftWidthForKey("Home", 300, false, false) === LEFT_PANEL_MIN);
check("End → en büyük", leftWidthForKey("End", 300, false, false) === LEFT_PANEL_MAX);
check("Enter → varsayılan", leftWidthForKey("Enter", 400, false, true) === LEFT_PANEL_DEFAULT);
check("LTR sağ ok genişletir", leftWidthForKey("ArrowRight", 248, false, false) === 248 + LEFT_PANEL_STEP);
check("LTR sol ok daraltır, Shift dört adım", leftWidthForKey("ArrowLeft", 400, true, false) === 400 - 4 * LEFT_PANEL_STEP);
check("RTL sol ok genişletir", leftWidthForKey("ArrowLeft", 248, false, true) === 248 + LEFT_PANEL_STEP);
check("RTL sağ ok daraltır", leftWidthForKey("ArrowRight", 248, false, true) === 248 - LEFT_PANEL_STEP);
check("Ok sınırda durur", leftWidthForKey("ArrowLeft", LEFT_PANEL_MIN, true, false) === LEFT_PANEL_MIN);
check("Başka tuş → null", [" ", "a", "ArrowUp", "Escape"].every((k) => leftWidthForKey(k, 248, false, false) === null));

// CSS ile sabit senkron; mobil çekmece kendi genişliğini korur.
const css = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");
const rule = (sel: string) => {
  const i = css.indexOf(sel + " {");
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
};
const explorer = rule(".lo-explorer");
check("CSS .lo-explorer genişliği --left-w'den gelir", explorer.includes("var(--left-w"));
check("CSS .lo-explorer alt sınırı sabitle aynı", explorer.includes(`max(${LEFT_PANEL_MIN}px`));
check("Mobil çekmecede gezgin genişliği auto kalır", /\.lo-drawer \.lo-explorer \{ width: auto/.test(css));
check("Tutamak kuralı tanımlı", rule(".lo-left__grip").includes("inset-inline-end"));

// Tutamak ipucu üç dilde dolu.
const tip = (j: unknown) => (j as { planner?: { resizeLeft?: unknown } }).planner?.resizeLeft;
check(
  "planner.resizeLeft üç dilde dolu",
  [tr, en, ar].every((j) => typeof tip(j) === "string" && (tip(j) as string).trim().length > 0),
);

console.log(`\n${ran - fails}/${ran} geçti`);
process.exit(fails === 0 ? 0 : 1);

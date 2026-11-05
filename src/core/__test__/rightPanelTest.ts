// Sağ blok genişlik hesabının node testi (LOM-63, LOM-80).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clampRightWidth,
  dragStartWidth,
  nextRightWidth,
  RIGHT_PANEL_DEFAULT,
  RIGHT_PANEL_MAX,
  RIGHT_PANEL_MIN,
  RIGHT_PANEL_STEP,
  rightWidthForKey,
} from "../layout/rightPanel";

let fails = 0;
let ran = 0;
function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

check("Sınırlar 300-560, varsayılan 312", RIGHT_PANEL_MIN === 300 && RIGHT_PANEL_MAX === 560 && RIGHT_PANEL_DEFAULT === 312);
check("Aralıktaki değer korunur", clampRightWidth(400) === 400);
check("Alt sınır", clampRightWidth(10) === RIGHT_PANEL_MIN && clampRightWidth(-500) === RIGHT_PANEL_MIN);
check("Üst sınır", clampRightWidth(99999) === RIGHT_PANEL_MAX && clampRightWidth(Infinity) === RIGHT_PANEL_DEFAULT);
check("Bozuk kayıt varsayılana döner", [NaN, "400", null, undefined, {}].every((v) => clampRightWidth(v) === RIGHT_PANEL_DEFAULT));
check("Küsurat yuvarlanır", clampRightWidth(320.6) === 321);

// Soldan-sağa: tutamak bloğun sol kenarında; sola çekmek genişletir.
check("LTR sola çek → genişler", nextRightWidth(312, -50, false) === 362);
check("LTR sağa çek → daralır", nextRightWidth(342, 30, false) === 312);
check("LTR aşırı daraltma alt sınırda durur", nextRightWidth(312, 500, false) === RIGHT_PANEL_MIN);
check("LTR aşırı genişletme üst sınırda durur", nextRightWidth(312, -1000, false) === RIGHT_PANEL_MAX);

// Sağdan-sola (Arapça): blok solda, tutamak sağ kenarında; sağa çekmek genişletir.
check("RTL sağa çek → genişler", nextRightWidth(312, 50, true) === 362);
check("RTL sola çek → daralır", nextRightWidth(342, -30, true) === 312);
check("Hareketsiz sürükleme değiştirmez", nextRightWidth(420, 0, false) === 420 && nextRightWidth(420, 0, true) === 420);

// LOM-67: başlangıç ekranda görünen genişlikten alınır (dar pencerede kayıtlı değer daha büyük).
check("Ölçülen genişlik kayıtlı değere üstün gelir", dragStartWidth(320, 500) === 320);
check("Ölçülen genişlik alt sınırın altındaysa sınıra çekilir", dragStartWidth(280, 500) === RIGHT_PANEL_MIN);
check("Ölçüm küsuratı yuvarlanır", dragStartWidth(327.4, 500) === 327);
check("Ölçüm yoksa kayıtlı değer", dragStartWidth(NaN, 420) === 420 && dragStartWidth(0, 420) === 420);
check("Ölçüm sınır dışıysa sınıra çekilir", dragStartWidth(200, 500) === RIGHT_PANEL_MIN && dragStartWidth(900, 300) === RIGHT_PANEL_MAX);
check("Dar pencerede ilk adım hemen etki eder", nextRightWidth(dragStartWidth(320, 500), 10, false) === 310);

// LOM-67: klavye — Home en dar, End en geniş, Enter varsayılan, oklar adım.
check("Home → en küçük", rightWidthForKey("Home", 400, false, false) === RIGHT_PANEL_MIN);
check("End → en büyük", rightWidthForKey("End", 400, false, false) === RIGHT_PANEL_MAX);
check("Enter → varsayılan", rightWidthForKey("Enter", 500, false, true) === RIGHT_PANEL_DEFAULT);
check("LTR sol ok genişletir", rightWidthForKey("ArrowLeft", 312, false, false) === 312 + RIGHT_PANEL_STEP);
check("LTR sağ ok daraltır, Shift dört adım", rightWidthForKey("ArrowRight", 400, true, false) === 400 - 4 * RIGHT_PANEL_STEP);
check("RTL sağ ok genişletir", rightWidthForKey("ArrowRight", 312, false, true) === 312 + RIGHT_PANEL_STEP);
check("Ok sınırda durur", rightWidthForKey("ArrowRight", RIGHT_PANEL_MIN, true, false) === RIGHT_PANEL_MIN);
check("Başka tuş → null", [" ", "a", "ArrowUp", "Escape"].every((k) => rightWidthForKey(k, 312, false, false) === null));

// LOM-80: CSS formülü sabitle aynı alt sınırı kullanır; sağ panel sol panelin genişliğini hesaba katar.
const css = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");
const sideRule = css.slice(css.indexOf(".lo-side {"), css.indexOf("}", css.indexOf(".lo-side {")));
check("CSS .lo-side alt sınırı sabitle aynı", sideRule.includes(`max(${RIGHT_PANEL_MIN}px`), sideRule.split("\n").find((l) => l.includes("width:")) ?? "");
check("CSS .lo-side sol panel genişliğini düşer", sideRule.includes("var(--left-w"));
const stats = css.slice(css.indexOf(".lo-stats--compact {"), css.indexOf("}", css.indexOf(".lo-stats--compact {")));
check("Sayaç kartları sığmazsa alt satıra geçer", stats.includes("flex-wrap: wrap"));

console.log(`\n${ran - fails}/${ran} geçti`);
process.exit(fails === 0 ? 0 : 1);

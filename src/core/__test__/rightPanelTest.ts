// Sağ blok genişlik hesabının node testi (LOM-63).
import {
  clampRightWidth,
  nextRightWidth,
  RIGHT_PANEL_DEFAULT,
  RIGHT_PANEL_MAX,
  RIGHT_PANEL_MIN,
} from "../layout/rightPanel";

let fails = 0;
let ran = 0;
function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

check("Sınırlar 260-560, varsayılan 312", RIGHT_PANEL_MIN === 260 && RIGHT_PANEL_MAX === 560 && RIGHT_PANEL_DEFAULT === 312);
check("Aralıktaki değer korunur", clampRightWidth(400) === 400);
check("Alt sınır", clampRightWidth(10) === RIGHT_PANEL_MIN && clampRightWidth(-500) === RIGHT_PANEL_MIN);
check("Üst sınır", clampRightWidth(99999) === RIGHT_PANEL_MAX && clampRightWidth(Infinity) === RIGHT_PANEL_DEFAULT);
check("Bozuk kayıt varsayılana döner", [NaN, "400", null, undefined, {}].every((v) => clampRightWidth(v) === RIGHT_PANEL_DEFAULT));
check("Küsurat yuvarlanır", clampRightWidth(300.6) === 301);

// Soldan-sağa: tutamak bloğun sol kenarında; sola çekmek genişletir.
check("LTR sola çek → genişler", nextRightWidth(312, -50, false) === 362);
check("LTR sağa çek → daralır", nextRightWidth(312, 30, false) === 282);
check("LTR aşırı daraltma alt sınırda durur", nextRightWidth(312, 500, false) === RIGHT_PANEL_MIN);
check("LTR aşırı genişletme üst sınırda durur", nextRightWidth(312, -1000, false) === RIGHT_PANEL_MAX);

// Sağdan-sola (Arapça): blok solda, tutamak sağ kenarında; sağa çekmek genişletir.
check("RTL sağa çek → genişler", nextRightWidth(312, 50, true) === 362);
check("RTL sola çek → daralır", nextRightWidth(312, -30, true) === 282);
check("Hareketsiz sürükleme değiştirmez", nextRightWidth(420, 0, false) === 420 && nextRightWidth(420, 0, true) === 420);

console.log(`\n${ran - fails}/${ran} geçti`);
process.exit(fails === 0 ? 0 : 1);

// Kasa açılamadı şeridinin yapı testi (LOM-25): Yeniden dene düğmesi, mobil metin, dir=ltr ve
// aria-controls. Ayrıntılar kapalı başlar; açık hali için React durumu gerekir, bu yüzden
// kapalı HTML'de aria-controls ve düğmeler denenir. `npm test` bu dosyayı run-tests.mjs'ten alır.

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { VaultOpenErrorBarBody } from "../../components/VaultOpenErrorBar";
import type { VaultOpenError } from "../vault/openError";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const error: VaultOpenError = { path: "/Users/x/Notlar", code: "permission", detail: "Operation not permitted (os error 1)" };
const t = (k: string) => k;
const noop = () => {};

const desktop = renderToString(
  createElement(VaultOpenErrorBarBody, { error, name: "Notlar", t, mobile: false, onRepick: noop, onRetry: noop, onDismiss: noop }),
);
check("masaüstü: Klasörü yeniden seç var", desktop.includes("vaultBar.repick"));
check("masaüstü: Yeniden dene var", desktop.includes("vaultBar.retry"));
check("masaüstü: sade metin anahtarı", desktop.includes("errors.vaultNoAccess"));
check("Ayrıntılar düğmesinde aria-controls", /aria-controls="[^"]+"/.test(desktop));
const ctl = /aria-controls="([^"]+)"/.exec(desktop)?.[1];
check("aria-controls gösterdiği id DOM'da var (kapalıyken de)", !!ctl && desktop.includes(`id="${ctl}"`));
check("Ayrıntılar kapalıyken hidden", /<code[^>]*hidden/.test(desktop));
check("Ayrıntılarda dir=ltr", /<code[^>]*dir="ltr"/.test(desktop));

const mobile = renderToString(
  createElement(VaultOpenErrorBarBody, { error, name: "Notlar", t, mobile: true, onRepick: null, onRetry: noop, onDismiss: noop }),
);
check("mobil: yeniden seç düğmesi yok", !mobile.includes("vaultBar.repick"));
check("mobil: Yeniden dene var", mobile.includes("vaultBar.retry"));
check("mobil: metin 'yeniden seçin' demez (mobil anahtar)", mobile.includes("vaultBar.mobileMessage") && !mobile.includes("errors.vaultNoAccess"));

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

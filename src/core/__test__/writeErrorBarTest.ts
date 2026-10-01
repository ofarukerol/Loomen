// Kayıt hatası şeridinin yapı testi (LOM-21): X üst satırda, Ayrıntılar kapalı başlar.
// JSX yok; react-dom/server ile HTML'e çizilir. Gerçek genişlik davranışı canlı denemede bakılır.
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { WriteErrorBarBody } from "../../components/WriteErrorBar";
import type { WriteErrorState } from "../vault/writeError";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const error: WriteErrorState = {
  code: "permission",
  detail: "Access is denied. (os error 5)",
  kind: "note",
  path: "a.md",
  count: 2,
  firstAt: 1,
  lastAt: 2,
  dismissed: false,
};

const html = renderToString(
  createElement(WriteErrorBarBody, { error, t: (k: string) => k, onRetry: () => {}, onDismiss: () => {} })
);

check('role="alert" var', html.includes('role="alert"'));
check(
  "kapat düğmesi aria-label ile var",
  /<button[^>]*aria-label="writeBar\.dismiss"/.test(html)
);
const head = html.indexOf("lo-writebar__head");
const close = html.indexOf("lo-writebar__close");
const actions = html.indexOf("lo-writebar__actions");
check("X üst satırda (head içinde, düğme satırından önce)", head >= 0 && close > head && actions > close);
check("Yeniden dene ve Ayrıntılar alt satırda", html.indexOf("writeBar.retry") > actions && html.indexOf("writeBar.details") > actions);
check("Ayrıntılar kapalı başlar (hidden)", /<code[^>]*hidden/.test(html));
check('Ayrıntılar düğmesi aria-expanded="false"', html.includes('aria-expanded="false"'));
check("ham hata metni yalnız hidden ayrıntıda", !html.replace(/<code[^>]*hidden[^>]*>[\s\S]*?<\/code>/, "").includes("Access is denied"));
check("sade metin anahtarı geçer", html.includes("errors.writePermission"));
check("kaydedilmedi satırı geçer", html.includes("writeBar.notSaved"));

{
  const open = renderToString(createElement(WriteErrorBarBody, { error, t: (k: string) => k, onRetry: () => {}, onDismiss: () => {} }));
  const id = /aria-controls="([^"]+)"/.exec(open)?.[1];
  check("Ayrıntılar düğmesinde aria-controls var", !!id);
  check("aria-controls id'si kapalıyken de DOM'da", !!id && open.includes(`id="${id}"`));
  check("Ayrıntılarda dir=ltr", /<code[^>]*dir="ltr"/.test(open));
}

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

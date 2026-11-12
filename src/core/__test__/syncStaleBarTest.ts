// Senkron uyarı şeridinin yapı testi (LOM-105). JSX yok; react-dom/server ile HTML'e çizilir.
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { SyncStaleBarBody } from "../../components/SyncStaleBar";
import type { SyncHealth } from "../sync/autoSync";

let fails = 0;
let ran = 0;
function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const t = (k: string, o?: Record<string, unknown>) => (o?.when ? `${k}|${o.when}` : k);
const draw = (health: SyncHealth, extra: { detail?: string | null; busy?: boolean } = {}) =>
  renderToString(
    createElement(SyncStaleBarBody, {
      health,
      lastSyncText: "2 gün önce",
      detail: extra.detail ?? null,
      t,
      onRetry: () => {},
      busy: extra.busy ?? false,
    })
  );

{
  const html = draw("ok");
  check("ok iken hiçbir şey çizilmez", html === "");
}
{
  const html = draw("stale");
  check("stale: şerit var", html.includes("lo-syncbar"));
  check("stale: eskime metni", html.includes("syncBar.stale"));
  check("stale: son senkron zamanı", html.includes("syncBar.lastSync|2 gün önce"));
  check("stale: Şimdi dene düğmesi", /<button[^>]*>syncBar\.retry<\/button>/.test(html));
  check("stale: düğme etkin", !/<button[^>]*disabled[^>]*>syncBar\.retry/.test(html));
  check("stale: hata sınıfı yok", !html.includes("lo-syncbar--error"));
  check("stale: Ayrıntılar yok", !html.includes("syncBar.details"));
}
{
  const html = draw("error", { detail: "error sending request: operation timed out" });
  check("error: hata metni", html.includes("syncBar.failed"));
  check("error: hata sınıfı", html.includes("lo-syncbar--error"));
  check("error: Şimdi dene düğmesi", html.includes("syncBar.retry"));
  check("error: Ayrıntılar düğmesi", html.includes("syncBar.details"));
  check("error: ayrıntı kapalı başlar", /<code[^>]*hidden/.test(html));
  check("error: ayrıntıda dir=ltr", /<code[^>]*dir="ltr"/.test(html));
  check(
    "error: ham hata yalnız gizli ayrıntıda",
    html.includes("operation timed out") && !html.replace(/<code[^>]*hidden[^>]*>[\s\S]*?<\/code>/, "").includes("operation timed out")
  );
  const id = /aria-controls="([^"]+)"/.exec(html)?.[1];
  check("error: aria-controls id DOM'da", !!id && html.includes(`id="${id}"`));
}
{
  const html = draw("error", { busy: true });
  check("senkron sürerken düğme pasif", /<button[^>]*disabled[^>]*>syncBar\.retry/.test(html));
  check("ayrıntı yoksa Ayrıntılar düğmesi yok", !html.includes("syncBar.details"));
}

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

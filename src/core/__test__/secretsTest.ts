// Google girişinin anahtar zincirine yazılan hali (LOM-46). `npm test` ile koşar.

import { decodeGoogle, encodeGoogle } from "../secrets";

let fails = 0;
let ran = 0;
function eq(name: string, got: unknown, want: unknown): void {
  ran++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — beklenen ${JSON.stringify(want)}, gelen ${JSON.stringify(got)}`}`);
  if (!ok) fails++;
}

const T = { access_token: "a", refresh_token: "r", expires_in: 3599, scope: "s", token_type: "Bearer" };
eq("gidiş-dönüş aynı", decodeGoogle(encodeGoogle(T)), T);
eq(
  "fazladan alanlar yazılmaz",
  JSON.parse(encodeGoogle({ ...T, id_token: "x".repeat(3000) } as typeof T)),
  T
);
eq("refresh_token yoksa null", decodeGoogle(JSON.stringify({ access_token: "a" }))?.refresh_token, null);
eq("boş kayıt", decodeGoogle(null), null);
eq("bozuk JSON", decodeGoogle("{"), null);
eq("access_token yok", decodeGoogle(JSON.stringify({ refresh_token: "r" })), null);
{
  // Google access token tipik ~250 karakter, refresh ~105. Windows kaydı UTF-16 tutulsa bile sığmalı.
  const real = encodeGoogle({ ...T, access_token: "y".repeat(400), refresh_token: "z".repeat(120), scope: "s".repeat(120) });
  eq("tipik boyut Windows sınırının altında (UTF-16, 2560 bayt)", real.length * 2 < 2560, true);
}

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

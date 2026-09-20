// Loomen — asistanın gerçek uygulamada uçtan uca testi (Windows, CDP 9224).
//
//   1) npm run win-test:build          (test sürümünü derler; CDP portunu açar)
//   2) node scripts/win-test/sahte-saglayici.mjs      (ayrı pencerede bırak)
//   3) uygulamayı aç, sonra: node scripts/win-test/asistan-testi.mjs
//
// Sahte sağlayıcı (sahte-saglayici.mjs, 127.0.0.1:8799) önce çalışıyor olmalı: gerçek bir API
// anahtarı olmadan sohbet akışını, not önerisini ve ses yüklemesini uçtan uca denemek için.
// Playwright DathaDesktop'ın node_modules'ünden alınır; Loomen'e bağımlılık eklenmez.
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
// Playwright komşu bir depodan ödünç alınır; Loomen'e test bağımlılığı eklenmez.
const require = createRequire(process.env.LOOMEN_PW ?? "C:/Github/DathaDesktop/package.json");
const { chromium } = require("playwright");

/** Testin üzerinde çalıştığı kasa. İçindekiler değişir — GERÇEK kasanı verme. */
const KASA = process.env.LOOMEN_TEST_KASA ?? "C:\\Github\\_bakim\\loomen-kasa";
const SUNUCU = process.env.LOOMEN_TEST_SAGLAYICI ?? "http://127.0.0.1:8799/v1";
const CDP = process.env.LOOMEN_CDP ?? "http://127.0.0.1:9224";

let fails = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
};
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
console.log("bağlanıldı:", page.url());
page.on("console", (m) => {
  if (m.type() === "error") console.log("   [konsol hatası]", m.text().slice(0, 160));
});

try {
  await ctx.grantPermissions(["microphone"]);
  console.log("mikrofon izni verildi (CDP)");
} catch (e) {
  console.log("mikrofon izni verilemedi:", String(e).slice(0, 120));
}

const gorunur = async (sel) =>
  (await page.locator(sel).count()) > 0 && (await page.locator(sel).first().isVisible());

// ---------------------------------------------------------------- 0. Temiz başlangıç + kasa
await page.evaluate((kasa) => {
  localStorage.clear();
  localStorage.setItem("loomen.vaultPath", kasa);
}, KASA);
await page.reload({ waitUntil: "domcontentloaded" });
await bekle(4000);
ok("Uygulama kasayla açıldı", await gorunur(".lo-ribbon"));

// ---------------------------------------------------------------- 1. Asistanı aç
await page.click('button[title="Ayarlar"]');
await bekle(500);
const aiRow = page.locator(".lo-set__row", { hasText: "Asistanı aç" }).first();
ok("Asistan ayarı bulundu", (await aiRow.count()) > 0);
if ((await page.locator('button[title="Asistan"]').count()) === 0) {
  await aiRow.locator(".lo-switch").click();
  await bekle(800);
}
ok("Asistan modülü açıldı", (await page.locator('button[title="Asistan"]').count()) > 0);
ok("Ses modeli alanı var", await gorunur(".lo-ai__flabel >> text=Ses modeli"));
ok("Not önerisi ayarı var", (await page.getByText("Asistan not önerebilsin").count()) > 0);
ok("Doğrudan gönder ayarı var", (await page.getByText("Sesi çevirince doğrudan gönder").count()) > 0);

// ---------------------------------------------------------------- 2. Sahte sağlayıcı kur
// Açılışta kendiliğinden eklenen Gemini satırı silinir: tek sağlayıcı kalsın ki aktif olan o olsun.
const satirlar = page.locator(".lo-ai__prow");
while ((await satirlar.count()) > 1 || (await page.locator(".lo-ai__kind", { hasText: "Gemini" }).count()) > 0) {
  const gemini = page.locator(".lo-ai__prow").filter({ has: page.locator(".lo-ai__kind", { hasText: "Gemini" }) });
  if ((await gemini.count()) === 0) break;
  await gemini.first().locator(".lo-ai__del").click();
  await bekle(600);
}

const ekleSatiri = page.locator(".lo-gh__createrow");
await ekleSatiri.locator("select").selectOption({ label: "Kendi sunucum (Ollama, LM Studio)" });
await ekleSatiri.locator("button").click();
await bekle(700);

const satir = page.locator(".lo-ai__prow").first();
// Etikete göre erişim: "Model" ile "Ses modeli" aynı kapsayıcı metnini paylaşıyor,
// bu yüzden tam ad eşleşmesi kullanılır.
const alan = (etiket, tam = true) => satir.getByRole("textbox", { name: etiket, exact: tam });
await alan("Model").fill("test-model");
await alan("Sunucu adresi").fill(SUNUCU);
await alan("Ses modeli").fill("test-ses");
await satir.locator('input[type="password"]').fill("test-anahtar");
await satir.getByText("Kaydet", { exact: true }).click();
await bekle(900);
ok("Anahtar kaydedildi", (await satir.locator(".lo-ai__badge").count()) > 0);

// Bağlantı testi — Rust tarafının akışsız isteği gerçekten atıp cevabı okuduğunu gösterir.
await satir.locator(".lo-ai__pactions button").first().click();
await bekle(2500);
const testSonuc = (await page.locator(".lo-ai__result").count())
  ? await page.locator(".lo-ai__result").first().innerText()
  : "(sonuç yok)";
ok("Sağlayıcı testi geçti", testSonuc.toLowerCase().includes("pong"), testSonuc);

// ---------------------------------------------------------------- 3. Sohbet + not önerisi
await page.click('button[title="Asistan"]');
await bekle(600);
await page.locator(".lo-ai__ta").fill("süt ve ekmek al diye not et");
await page.keyboard.press("Enter");
await bekle(4000);

const cevap = await page.locator(".lo-ai__msg:not(.is-user) .lo-ai__text").last().innerText().catch(() => "");
ok("Cevap akışı geldi", cevap.includes("nota yazabilirim"), cevap.slice(0, 60));
ok("Ham JSON bloğu kullanıcıya gösterilmedi", !cevap.includes("loomen-note") && !cevap.includes("action"));
ok("Öneri kartı çıktı", await gorunur(".lo-ai__prop"));
const kartBasligi = (await page.locator(".lo-ai__proptitle").first().innerText().catch(() => "")) || "";
ok("Kart ne yapılacağını yazıyor", kartBasligi.includes("Asistan Denemesi.md"), kartBasligi);

// Onaydan ÖNCE diske hiçbir şey yazılmamalı — öneri tek başına bir niyet beyanıdır.
const oncekiler = readdirSync(KASA);
ok("Onay öncesi kasaya dosya eklenmedi", !oncekiler.includes("Asistan Denemesi 2.md"), oncekiler.join(", "));
const eskiIcerik = existsSync(`${KASA}\\Asistan Denemesi.md`)
  ? readFileSync(`${KASA}\\Asistan Denemesi.md`, "utf8")
  : null;

await page.locator(".lo-ai__propactions .lo-gh__connect").first().click();
await bekle(2500);
ok("Öneri uygulandı", await gorunur(".lo-ai__propdone"));

// Aynı ada ikinci kez yazılırsa ÜZERİNE YAZILMAZ: sıradaki boş ad kullanılır.
if (eskiIcerik !== null) {
  const yazilan = await page.locator(".lo-ai__proptitle").first().innerText();
  ok("Var olan notun üzerine yazılmadı", yazilan.includes("Asistan Denemesi 2.md"), yazilan);
  ok(
    "Eski notun içeriği değişmedi",
    readFileSync(`${KASA}\\Asistan Denemesi.md`, "utf8") === eskiIcerik,
  );
  ok("Yeni not diske yazıldı", existsSync(`${KASA}\\Asistan Denemesi 2.md`));
} else {
  ok("Not diske yazıldı", existsSync(`${KASA}\\Asistan Denemesi.md`));
}

// ---------------------------------------------------------------- 4. Sesle sorma
const mic = page.locator('button[title="Sesle sor"]');
ok("Mikrofon düğmesi var", (await mic.count()) > 0);
await mic.click();
await bekle(2500);
const kayitta = await gorunur(".lo-ai__reclive");
ok("Mikrofon açıldı, kayıt sürüyor", kayitta);
if (kayitta) {
  console.log("   kayıt süresi:", await page.locator(".lo-ai__rectime").first().innerText());
  await page.locator('button[title="Kaydı bitir"]').click();
  await bekle(6000);
  const hata = (await page.locator(".lo-ai__voiceerr").count())
    ? await page.locator(".lo-ai__voiceerr").innerText()
    : "";
  const kutu = await page.locator(".lo-ai__ta").inputValue().catch(() => "");
  console.log("   sonuç →", hata ? `hata: ${hata}` : `kutuya yazıldı: "${kutu}"`);
  ok("Ses sağlayıcıya ulaştı ve metin döndü", kutu.startsWith("ses alindi"), hata || kutu);
  ok("Kayıt durumu kapandı", !(await gorunur(".lo-ai__reclive")));
}

await page.screenshot({ path: process.env.LOOMEN_TEST_PNG ?? "loomen-asistan.png" });
console.log(fails === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fails} ADIM KALDI`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);

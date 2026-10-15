// Loomen — editörün sağ tık / uzun basma menüsünün uçtan uca testi (LOM-36).
//
// İki modda koşar:
//   Tarayıcı modu (Mac'te hızlı yeniden üretme; örnek kasa, diske hiçbir şey yazılmaz):
//     npm run dev -- --port 5199
//     LOOMEN_URL=http://localhost:5199 LOOMEN_PW=$HOME/Github/DathaDesktop/package.json \
//       node scripts/win-test/menu-testi.mjs
//   CDP modu (Excalibur'daki paketli uygulama, port 9224; açık kasada "Yeni not" oluşturur):
//     npm run win-test:build   → uygulamayı konsol oturumunda aç → node scripts\win-test\menu-testi.mjs
//
// Mobil görünüm dar ekran + dokunma taklidiyle denenir: uzun basma gerçek dokunma olayıyla
// (Input.dispatchTouchEvent) yapılır. Gerçek Android klavyesinin kapanması ekranın yalnız
// YÜKSEKLİĞİNİN değişmesi olarak taklit edilir.
// Playwright DathaDesktop'ın node_modules'ünden alınır; Loomen'e bağımlılık eklenmez.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(process.env.LOOMEN_PW ?? "C:/Github/DathaDesktop/package.json");
const { chromium, devices } = require("playwright");

const ADRES = process.env.LOOMEN_URL; // verilirse tarayıcı modu
const CDP = process.env.LOOMEN_CDP ?? "http://127.0.0.1:9224";

/** Menü metinleri Türkçe çeviri dosyasından okunur — metin değişse de betik bozulmasın. */
const TR = JSON.parse(readFileSync(new URL("../../src/i18n/locales/tr/translation.json", import.meta.url), "utf8"));
const L = {
  link: TR.ctx.addLink,
  ext: TR.ctx.addExternal,
  fmt: TR.ctx.format,
  para: TR.ctx.paragraph,
  ins: TR.ctx.insert,
  bold: TR.fmt.bold,
  italic: TR.fmt.italic,
  strike: TR.fmt.strike,
  hl: TR.fmt.highlight,
  code: TR.fmt.code,
  clear: TR.ctx.clearFormat,
  ul: TR.ctx.bulletList,
  ol: TR.ctx.numberedList,
  cl: TR.ctx.checklist,
  h: (n) => TR.ctx.heading.replace("{{n}}", String(n)),
  h0: TR.ctx.noHeading,
  quote: TR.fmt.quote,
  table: TR.ctx.table,
  callout: TR.ctx.callout,
  hr: TR.ctx.hr,
  cb: TR.ctx.codeBlock,
  cut: TR.ctx.cut,
  copy: TR.ctx.copy,
  paste: TR.ctx.paste,
  all: TR.ctx.selectAll,
};

let fails = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
};
const bilgi = (s) => console.log("   · " + s);
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const goster = (s) => JSON.stringify(s);

// ---------------------------------------------------------------- Sayfa yardımcıları
/** Aktif sayfa üzerinde çalışan yardımcılar; mod değişince yeniden kurulur. */
function araclar(page, cdp) {
  const MENU = ".lo-ctxmenu--editor";
  const menuAcik = async () => (await page.locator(MENU).count()) > 0;
  /** Görünür, metni tam eşleşen menü öğesi (alt panel dahil). */
  const oge = (ad) =>
    page
      .locator(`${MENU} button.lo-ctxmenu__item`)
      .filter({ hasText: new RegExp(`^\\s*${esc(ad)}\\s*$`) })
      .first();
  const gorunur = async (ad) => {
    const o = oge(ad);
    return (await o.count()) > 0 && (await o.isVisible());
  };

  /** CodeMirror görünümü sayfadan bulunur (CM sürümüne göre cmTile ya da cmView). */
  const VIEW = `(() => { const c = document.querySelector(".lo-cm .cm-content");
    const t = c && (c.cmTile || c.cmView); return t && (t.view || (t.rootView && t.rootView.view)); })()`;

  const belgeKur = (doc, anchor, head = anchor) =>
    page.evaluate(
      ([VIEW, doc, anchor, head]) => {
        const v = eval(VIEW);
        v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc }, selection: { anchor, head } });
      },
      [VIEW, doc, anchor, head]
    );
  const secimKur = (anchor, head = anchor) =>
    page.evaluate(([VIEW, anchor, head]) => eval(VIEW).dispatch({ selection: { anchor, head } }), [VIEW, anchor, head]);
  const durum = () =>
    page.evaluate((VIEW) => {
      const v = eval(VIEW);
      const r = v.state.selection.main;
      const a = document.activeElement;
      return {
        doc: v.state.doc.toString(),
        from: r.from,
        to: r.to,
        odakEditorde: !!(a && a.closest && a.closest(".cm-editor")),
        odak: a ? a.tagName + "." + String(a.className).slice(0, 40) : "-",
      };
    }, VIEW);
  const odakla = () => page.evaluate((VIEW) => eval(VIEW).focus(), VIEW);
  /** Belgedeki bir konumun ekran koordinatı (satırın ortası). */
  const konum = (pos) =>
    page.evaluate(
      ([VIEW, pos]) => {
        const c = eval(VIEW).coordsAtPos(pos);
        return { x: Math.round(c.left + 2), y: Math.round((c.top + c.bottom) / 2) };
      },
      [VIEW, pos]
    );

  // Dokunma — CDP olaylarıyla gerçek touch → pointer → click zinciri.
  const dokunBasla = (x, y) => cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  const dokunBitir = () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const dokun = async (x, y) => {
    await dokunBasla(x, y);
    await bekle(60);
    await dokunBitir();
    await bekle(250);
  };
  const ogeyeDokun = async (ad) => {
    const kutu = await oge(ad).boundingBox();
    if (!kutu) throw new Error(`öğe ekranda değil: ${ad}`);
    await dokun(Math.round(kutu.x + kutu.width / 2), Math.round(kutu.y + kutu.height / 2));
  };
  /** Uzun basma: parmak 650 ms ekranda kalır (eşik 500 ms), sonra kalkar. */
  const uzunBas = async (x, y) => {
    await dokunBasla(x, y);
    await bekle(650);
    const acikkenParmakEkranda = await menuAcik();
    await dokunBitir();
    await bekle(300);
    return acikkenParmakEkranda;
  };
  const kapat = async () => {
    if (!(await menuAcik())) return;
    await page.keyboard.press("Escape").catch(() => {});
    if (await menuAcik()) await page.mouse.click(5, 5).catch(() => {});
    await bekle(150);
  };
  return { MENU, menuAcik, oge, gorunur, belgeKur, secimKur, durum, odakla, konum, dokun, ogeyeDokun, uzunBas, kapat };
}

// ---------------------------------------------------------------- Komut beklentileri
const D = "merhaba dünya\n";
const SEC = [8, 13]; // "dünya"
const IMLEC = [13, 13]; // satır sonu, seçim yok
const pano = { deger: null };

/**
 * Her yaprak öğe: hangi grupta, hangi belge/seçimle başlar ve sonuç ne olmalı.
 * `beklenen` belge metnidir ya da (durum) => [geçti, ayrıntı] döndüren fonksiyon.
 */
const BLOK = (govde) => D + "\n" + govde + "\n";
const OGELER = [
  { ad: L.link, secili: "merhaba [[dünya]]\n", secimsiz: "merhaba dünya[[]]\n" },
  { ad: L.ext, secili: "merhaba [dünya](url)\n", secimsiz: "merhaba dünya[metin](url)\n" },
  { grup: L.fmt, ad: L.bold, secili: "merhaba **dünya**\n", secimsiz: "merhaba dünya****\n" },
  { grup: L.fmt, ad: L.italic, secili: "merhaba *dünya*\n", secimsiz: "merhaba dünya**\n" },
  { grup: L.fmt, ad: L.strike, secili: "merhaba ~~dünya~~\n", secimsiz: "merhaba dünya~~~~\n" },
  { grup: L.fmt, ad: L.hl, secili: "merhaba ==dünya==\n", secimsiz: "merhaba dünya====\n" },
  { grup: L.fmt, ad: L.code, secili: "merhaba `dünya`\n", secimsiz: "merhaba dünya``\n" },
  {
    grup: L.fmt,
    ad: L.clear,
    doc: "merhaba **dünya**\n",
    sec: [8, 17],
    imlec: [17, 17],
    secili: "merhaba dünya\n",
    secimsiz: "merhaba **dünya**\n",
  },
  { grup: L.para, ad: L.ul, secili: "- " + D, secimsiz: "- " + D },
  { grup: L.para, ad: L.ol, secili: "1. " + D, secimsiz: "1. " + D },
  { grup: L.para, ad: L.cl, secili: "- [ ] " + D, secimsiz: "- [ ] " + D },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    grup: L.para,
    ad: L.h(n),
    secili: "#".repeat(n) + " " + D,
    secimsiz: "#".repeat(n) + " " + D,
  })),
  { grup: L.para, ad: L.h0, doc: "## " + D, sec: [11, 16], imlec: [16, 16], secili: D, secimsiz: D },
  { grup: L.para, ad: L.quote, secili: "> " + D, secimsiz: "> " + D },
  {
    grup: L.ins,
    ad: L.table,
    secili: (s) => [s.doc.startsWith(D + "\n|") && s.doc.includes("| --- | --- |"), goster(s.doc)],
    secimsiz: (s) => [s.doc.startsWith(D + "\n|") && s.doc.includes("| --- | --- |"), goster(s.doc)],
  },
  { grup: L.ins, ad: L.callout, secili: BLOK("> [!note]\n> "), secimsiz: BLOK("> [!note]\n> ") },
  { grup: L.ins, ad: L.hr, secili: BLOK("---"), secimsiz: BLOK("---") },
  { grup: L.ins, ad: L.cb, secili: BLOK("```\n\n```"), secimsiz: BLOK("```\n\n```") },
  {
    ad: L.cut,
    secili: (s) => [s.doc === "merhaba \n" && pano.deger === "dünya", `belge ${goster(s.doc)}, pano ${goster(pano.deger)}`],
    // Seçim yokken pano da değişmemeli (çalışmadan önce boşaltılıyor).
    secimsiz: (s) => [s.doc === D && !pano.deger, `belge ${goster(s.doc)}, pano ${goster(pano.deger)}`],
  },
  {
    ad: L.copy,
    secili: (s) => [s.doc === D && pano.deger === "dünya", `belge ${goster(s.doc)}, pano ${goster(pano.deger)}`],
    secimsiz: (s) => [s.doc === D && !pano.deger, `belge ${goster(s.doc)}, pano ${goster(pano.deger)}`],
  },
  { ad: L.paste, panoyaYaz: "YAPIŞ", secili: "merhaba YAPIŞ\n", secimsiz: "merhaba dünyaYAPIŞ\n" },
  {
    ad: L.all,
    secili: (s) => [s.from === 0 && s.to === s.doc.length && s.doc === D, `seçim ${s.from}-${s.to}`],
    secimsiz: (s) => [s.from === 0 && s.to === s.doc.length && s.doc === D, `seçim ${s.from}-${s.to}`],
  },
];

const beklenenMi = (beklenen, s) =>
  typeof beklenen === "function" ? beklenen(s) : [s.doc === beklenen, `beklenen ${goster(beklenen)}, çıkan ${goster(s.doc)}`];

/** Panoyu sayfa içinde okunur/yazılır kıl. Gerçek pano kullanılamıyorsa bellek içi taklit. */
async function panoHazirla(page) {
  const gercek = await page
    .evaluate(async () => {
      try {
        await navigator.clipboard.writeText("pano-deneme");
        return (await navigator.clipboard.readText()) === "pano-deneme";
      } catch {
        return false;
      }
    })
    .catch(() => false);
  if (!gercek) {
    await page.evaluate(() => {
      let m = "";
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (t) => void (m = t), readText: async () => m },
      });
    });
  }
  bilgi(gercek ? "gerçek pano kullanılıyor" : "pano izni yok — bellek içi pano taklidi kuruldu");
}
const panoOku = (page) => page.evaluate(() => navigator.clipboard.readText().catch(() => null));
const panoYaz = (page, t) => page.evaluate((t) => navigator.clipboard.writeText(t), t);

// ---------------------------------------------------------------- Ortak: tek öğeyi çalıştır
/**
 * Menüyü açar (masaüstünde sağ tık, mobilde uzun basma), seçimi geri kurar, grubu açar ve öğeyi
 * çalıştırır. Seçim menü AÇILDIKTAN sonra yeniden kurulur: sağ tık / uzun basmanın seçimi
 * değiştirip değiştirmediği ayrı adımda denetleniyor; burada komutun kendisi sınanıyor.
 */
async function ogeCalistir(page, A, mobil, o, secili) {
  const doc = o.doc ?? D;
  const [a, h] = secili ? o.sec ?? SEC : o.imlec ?? IMLEC;
  await A.kapat();
  await A.belgeKur(doc, a, h);
  await A.odakla();
  if (o.panoyaYaz) await panoYaz(page, o.panoyaYaz);
  else await panoYaz(page, "");
  const k = await A.konum(2);
  if (mobil) await A.uzunBas(k.x, k.y);
  else {
    await page.mouse.click(k.x, k.y, { button: "right" });
    await bekle(200);
  }
  if (!(await A.menuAcik())) return [false, "menü açılmadı"];
  await A.secimKur(a, h);
  if (o.grup) {
    if (mobil) await A.ogeyeDokun(o.grup);
    else await A.oge(o.grup).hover();
    await bekle(200);
    if (!(await A.gorunur(o.ad))) return [false, `"${o.grup}" açıldı ama "${o.ad}" görünmüyor (menü ${await A.menuAcik() ? "açık" : "kapandı"})`];
  }
  if (mobil) await A.ogeyeDokun(o.ad);
  else await A.oge(o.ad).click();
  await bekle(300);
  pano.deger = await panoOku(page);
  const s = await A.durum();
  const [gecti, ayrinti] = beklenenMi(secili ? o.secili : o.secimsiz, s);
  const kapandi = !(await A.menuAcik());
  return [gecti && kapandi, `${kapandi ? "" : "menü kapanmadı; "}${ayrinti}${s.odakEditorde ? "" : `; odak editörde değil (${s.odak})`}`];
}

async function tumOgeler(page, A, mobil, etiket) {
  for (const secili of [true, false]) {
    for (const o of OGELER) {
      const yol = (o.grup ? o.grup + " › " : "") + o.ad;
      let sonuc;
      try {
        sonuc = await ogeCalistir(page, A, mobil, o, secili);
      } catch (e) {
        sonuc = [false, String(e).slice(0, 140)];
      }
      ok(`${etiket} ${secili ? "seçili" : "seçimsiz"}: ${yol}`, sonuc[0], sonuc[0] ? "" : sonuc[1]);
    }
  }
}

/** Yapıştır panoya erişemezse belge değişmemeli ve kullanıcı bir mesaj görmeli (K6). */
async function panoReddi(page, A, mobil, etiket) {
  await A.kapat();
  await A.belgeKur(D, ...SEC);
  await A.odakla();
  const once = await page.evaluate(() => document.body.innerText);
  let diyalog = "";
  const dinle = (d) => {
    diyalog = d.message();
    d.dismiss().catch(() => {});
  };
  page.on("dialog", dinle);
  await page.evaluate(() => {
    const red = () => Promise.reject(new DOMException("izin yok", "NotAllowedError"));
    try {
      navigator.clipboard.readText = red;
    } catch {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { ...navigator.clipboard, readText: red } });
    }
  });
  const k = await A.konum(2);
  if (mobil) await A.uzunBas(k.x, k.y);
  else await page.mouse.click(k.x, k.y, { button: "right" });
  await bekle(200);
  if (mobil) await A.ogeyeDokun(L.paste);
  else await A.oge(L.paste).click();
  await bekle(600);
  const s = await A.durum();
  ok(`${etiket} pano reddedilince Yapıştır belgeyi değiştirmedi`, s.doc === D, goster(s.doc));
  const sonra = await page.evaluate(() => document.body.innerText);
  const mesaj = TR.ctx.pasteUnavailable;
  const yeniMetin = sonra.length > once.length ? sonra.replace(once, "").trim() : "";
  const gorundu = !!diyalog || (mesaj ? sonra.includes(mesaj) : /pano/i.test(yeniMetin));
  ok(`${etiket} pano reddedilince kullanıcıya mesaj gösterildi`, gorundu, diyalog || (gorundu ? "" : "hiçbir mesaj çıkmadı (sessiz kaldı)"));
  page.off("dialog", dinle);
  await panoHazirla(page);
}

// ---------------------------------------------------------------- Masaüstü senaryosu
async function masaustu(page, cdp, boyut) {
  console.log("\n— MASAÜSTÜ (fare) —");
  const A = araclar(page, cdp);
  await panoHazirla(page);

  // Sağ tık → menü; gruplar fareyle üstüne gelince yana açılır.
  await A.belgeKur(D, ...IMLEC);
  await A.odakla();
  const k = await A.konum(2);
  await page.mouse.click(k.x, k.y, { button: "right" });
  await bekle(250);
  ok("Masaüstü sağ tıkla menü açıldı", await A.menuAcik());
  for (const [grup, ilk] of [
    [L.fmt, L.bold],
    [L.para, L.ul],
    [L.ins, L.table],
  ]) {
    await A.oge(grup).hover();
    await bekle(200);
    ok(`Masaüstü "${grup}" üstüne gelince alt menü açıldı`, await A.gorunur(ilk));
  }
  const s0 = await A.durum();
  ok("Masaüstü menüde gezinmek belgeyi değiştirmedi", s0.doc === D, goster(s0.doc));

  // Yalnız yükseklik değişince menü kapanmamalı; genişlik değişince kapanmalı (K2).
  await boyut(1280, 680);
  await bekle(300);
  ok("Masaüstü yalnız yükseklik değişince menü açık kaldı", await A.menuAcik());
  // Genişlik adımı için menü yeniden açılır: önceki adımda kapandıysa boşuna geçmesin.
  await A.kapat();
  await page.mouse.click(k.x, k.y, { button: "right" });
  await bekle(250);
  if (await A.menuAcik()) {
    await boyut(1180, 680);
    await bekle(300);
    ok("Masaüstü genişlik değişince menü kapandı", !(await A.menuAcik()));
  } else ok("Masaüstü genişlik denemesi için menü açıldı", false);
  await boyut(1280, 800);
  await bekle(300);
  await A.kapat();

  await tumOgeler(page, A, false, "Masaüstü");
  await panoReddi(page, A, false, "Masaüstü");
  await A.kapat();
}

// ---------------------------------------------------------------- Mobil senaryosu
async function mobil(page, cdp, boyut) {
  console.log("\n— MOBİL (dokunma, 375×667) —");
  const A = araclar(page, cdp);
  await boyut(375, 667);
  await bekle(500);
  await panoHazirla(page);

  await A.belgeKur(D, ...IMLEC);
  const k = await A.konum(2);
  // Önce kısa dokunuş: imleç yerleşir, editör odaklanır (telefonda klavye açılır).
  await A.dokun(k.x, k.y);
  const s0 = await A.durum();
  bilgi(`kısa dokunuştan sonra odak: ${s0.odakEditorde ? "editörde" : s0.odak}`);
  await A.belgeKur(D, ...IMLEC);
  await A.odakla();

  const parmakEkrandayken = await A.uzunBas(k.x, k.y);
  ok("Mobil uzun basınca menü açıldı", parmakEkrandayken || (await A.menuAcik()));
  const s1 = await A.durum();
  ok("Mobil parmak kalkınca menü açık kaldı", await A.menuAcik());
  ok("Mobil parmak kalkınca ilk öğe (Bağlantı ekle) çalışmadı", s1.doc === D, goster(s1.doc));

  for (const [grup, alt] of [
    [L.fmt, [L.bold, L.italic, L.strike, L.hl, L.code, L.clear]],
    [L.para, [L.ul, L.ol, L.cl, L.h(1), L.h(6), L.h0, L.quote]],
    [L.ins, [L.table, L.callout, L.hr, L.cb]],
  ]) {
    if (!(await A.menuAcik())) {
      ok(`Mobil "${grup}" için menü hâlâ açık`, false, "menü önceki adımda kapandı");
      break;
    }
    await A.ogeyeDokun(grup);
    await bekle(200);
    const acik = await A.menuAcik();
    ok(`Mobil "${grup}"a dokununca menü kapanmadı`, acik);
    const eksik = [];
    for (const ad of alt) if (!acik || !(await A.gorunur(ad))) eksik.push(ad);
    ok(`Mobil "${grup}" alt öğeleri görünüyor`, eksik.length === 0, eksik.length ? "eksik: " + eksik.join(", ") : "");
    const s = await A.durum();
    ok(`Mobil "${grup}"a dokunmak editörün odağını almadı`, s.odakEditorde, s.odakEditorde ? "" : `odak: ${s.odak}`);
  }

  // Klavye kapanışı taklidi: yalnız yükseklik 667 → 360. Ekle akordeonu açıkken menü kapanmamalı.
  if (await A.menuAcik()) {
    await boyut(375, 360);
    await bekle(400);
    ok("Mobil yükseklik 667→360 olunca menü açık kaldı", await A.menuAcik());
    ok("Mobil boyut değişince Ekle alt öğeleri görünür kaldı", await A.gorunur(L.table));
    if ((await A.menuAcik()) && (await A.gorunur(L.table))) {
      const kutu = await A.oge(L.table).boundingBox();
      ok("Mobil Tablo öğesi ekranın içinde", !!kutu && kutu.y >= 0 && kutu.y + kutu.height <= 360, kutu ? `y=${Math.round(kutu.y)}` : "");
      await A.ogeyeDokun(L.table);
      await bekle(300);
      const s = await A.durum();
      ok("Mobil Tablo'ya dokununca belgeye tablo eklendi", s.doc.includes("| --- | --- |"), goster(s.doc.slice(0, 80)));
      ok("Mobil Tablo'dan sonra menü kapandı", !(await A.menuAcik()));
    }
  }
  await boyut(375, 667);
  await bekle(400);

  // Genişlik değişince (döndürme / pencere) menü kapanmalı.
  await A.kapat();
  await A.belgeKur(D, ...IMLEC);
  await A.uzunBas(k.x, k.y);
  if (await A.menuAcik()) {
    await boyut(667, 375);
    await bekle(400);
    ok("Mobil genişlik değişince menü kapandı", !(await A.menuAcik()));
    await boyut(375, 667);
    await bekle(400);
  } else ok("Mobil genişlik denemesi için menü açıldı", false);

  // Seçili metin üzerinde uzun basma seçimi korumalı; yoksa seçili metne komut uygulanamaz.
  await A.kapat();
  await A.belgeKur(D, ...SEC);
  await A.odakla();
  const ks = await A.konum(10);
  await A.uzunBas(ks.x, ks.y);
  const s2 = await A.durum();
  ok(
    "Mobil seçili metne uzun basınca seçim korundu",
    s2.from === SEC[0] && s2.to === SEC[1],
    `seçim ${s2.from}-${s2.to} (beklenen ${SEC.join("-")})`
  );
  await A.kapat();

  await tumOgeler(page, A, true, "Mobil");
  await panoReddi(page, A, true, "Mobil");
  await A.kapat();
}

// ---------------------------------------------------------------- Kurulum
/**
 * Üzerinde çalışılacak notu açar; betik bu notun içeriğini baştan yazar.
 * Masaüstü düzeninde her zaman YENİ bir not açılır (CDP modunda kasaya "Adsız" bir not ekler).
 * "Günün Notu" yalnız tarayıcı modunun bellekteki örnek kasasında kullanılır: gerçek kasada
 * bugünün notunu ezer ve otomatik kayıt bunu diske yazardı.
 */
async function notAc(page, ornekKasa) {
  const dar = await page.evaluate(() => window.matchMedia("(max-width: 768px)").matches);
  if (!dar) {
    await page.locator(`.lo-explorer__open[title="${TR.explorer.newNote}"]`).first().click();
  } else if (ornekKasa) {
    // Dar ekranda gezgin çekmecede gizli: üst çubuktaki "Günün Notu".
    await page.locator(`.lo-mtop__btn[title="${TR.ribbon.dayNote}"]`).first().click();
  } else {
    throw new Error("gerçek kasada dar ekranla not açılmaz (günün notu ezilirdi) — pencere geniş olmalı");
  }
  await page.locator(".lo-cm .cm-content").first().waitFor({ timeout: 8000 });
  await bekle(500);
}

let browser;
/** CDP modunda ekran/dokunma taklidi; hata olsa da sonda kapatılır, uygulama telefon kılığında kalmasın. */
let cdpTemizle = async () => {};
try {
  if (ADRES) {
    browser = await chromium.launch();
    console.log("tarayıcı modu:", ADRES);
    // Masaüstü
    const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "tr-TR" });
    await dctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ADRES }).catch(() => {});
    const dp = await dctx.newPage();
    dp.on("pageerror", (e) => console.log("   [sayfa hatası]", String(e).slice(0, 160)));
    await dp.goto(ADRES);
    await bekle(2500);
    await notAc(dp, true);
    await masaustu(dp, await dctx.newCDPSession(dp), (w, h) => dp.setViewportSize({ width: w, height: h }));
    await dctx.close();
    // Mobil — Pixel 5 profili (dokunma + mobil görünüm)
    const mctx = await browser.newContext({ ...devices["Pixel 5"], locale: "tr-TR" });
    await mctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ADRES }).catch(() => {});
    const mp = await mctx.newPage();
    mp.on("pageerror", (e) => console.log("   [sayfa hatası]", String(e).slice(0, 160)));
    await mp.goto(ADRES);
    await bekle(2500);
    await notAc(mp, true);
    await mobil(mp, await mctx.newCDPSession(mp), (w, h) => mp.setViewportSize({ width: w, height: h }));
    await mp.screenshot({ path: process.env.LOOMEN_TEST_PNG ?? "loomen-menu.png" });
  } else {
    browser = await chromium.connectOverCDP(CDP);
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0];
    console.log("bağlanıldı:", page.url());
    page.on("console", (m) => {
      if (m.type() === "error") console.log("   [konsol hatası]", m.text().slice(0, 160));
    });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    const cdp = await ctx.newCDPSession(page);
    cdpTemizle = async () => {
      await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false }).catch(() => {});
    };
    // Masaüstü bölümü sabit 1280×800 görünümde: pencere dar olsa da "Yeni not" kullanılır.
    const masaustuBoyut = (w, h) =>
      cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await masaustuBoyut(1280, 800);
    await bekle(500);
    await notAc(page, false);
    await masaustu(page, cdp, masaustuBoyut);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    const boyut = (w, h) =>
      cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await mobil(page, cdp, boyut);
    await page.screenshot({ path: process.env.LOOMEN_TEST_PNG ?? "loomen-menu.png" });
  }
} catch (e) {
  ok("Betik sonuna kadar koştu", false, String(e).slice(0, 300));
} finally {
  await cdpTemizle();
}

console.log(fails === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fails} ADIM KALDI`);
await browser?.close();
process.exit(fails === 0 ? 0 : 1);

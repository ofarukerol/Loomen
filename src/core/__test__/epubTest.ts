// EPUB yapısı ve çizim yeri eşlemesi testi (LOM-83, EPUB parçası; K5).
import { deflateRawSync } from "node:zlib";
import {
  EpubError,
  chapterTitle,
  cssUnescape,
  decodeEntities,
  epubProgress,
  findAll,
  idToAttr,
  isExternalHref,
  parseEpub,
  parseXml,
  resolveHref,
  scopeCss,
  spineIndexOf,
  xmlText,
} from "../library/epub";
import { locateOffset, normalizeWithMap, paintSegments, prefixOffsets, relocateRange, trimRange } from "../library/epubAnchor";
import { crc32, readZip } from "../library/zip";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
const enc = new TextEncoder();
const J = (v: unknown) => JSON.stringify(v);

/** En küçük ZIP kurucu: her girdi deflate (mimetype ham). */
function makeZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const out: number[] = [];
  const cd: number[] = [];
  const w16 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff);
  const w32 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  let count = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? enc.encode(content) : content;
    const method = name === "mimetype" ? 0 : 8;
    const body = method ? new Uint8Array(deflateRawSync(data)) : data;
    const nb = enc.encode(name);
    const off = out.length;
    const head = (a: number[], central: boolean) => {
      w32(a, central ? 0x02014b50 : 0x04034b50);
      if (central) w16(a, 20);
      w16(a, 20);
      w16(a, 0x800);
      w16(a, method);
      w32(a, 0);
      w32(a, crc32(data));
      w32(a, body.length);
      w32(a, data.length);
      w16(a, nb.length);
      w16(a, 0);
      if (central) {
        w16(a, 0);
        w16(a, 0);
        w16(a, 0);
        w32(a, 0);
        w32(a, off);
      }
      a.push(...nb);
    };
    head(out, false);
    out.push(...body);
    head(cd, true);
    count++;
  }
  const cdOff = out.length;
  const end: number[] = [];
  w32(end, 0x06054b50);
  w16(end, 0);
  w16(end, 0);
  w16(end, count);
  w16(end, count);
  w32(end, cd.length);
  w32(end, cdOff);
  w16(end, 0);
  return new Uint8Array([...out, ...cd, ...end]);
}

const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const opf3 = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Kürk  Mantolu
      Madonna</dc:title>
    <dc:creator id="c1">Sabahattin Ali</dc:creator>
    <meta refines="#c1" property="role" scheme="marc:relators">aut</meta>
    <dc:creator id="c2">Bir Çevirmen</dc:creator>
    <meta refines="#c2" property="role" scheme="marc:relators">trl</meta>
    <dc:language>tr</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles/kitap.css" media-type="text/css"/>
    <item id="c" href="images/kapak.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="ch1" href="Text/b%C3%B6l%C3%BCm1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="notes" href="Text/notes.xhtml" media-type="application/xhtml+xml"/>
    <item id="gone" href="Text/missing.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine page-progression-direction="ltr">
    <itemref idref="ch1"/>
    <itemref idref="gone"/>
    <itemref idref="ch2"/>
    <itemref idref="notes" linear="no"/>
  </spine>
</package>`;

const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <nav epub:type="landmarks"><ol><li><a href="Text/ch2.xhtml">Yanlış liste</a></li></ol></nav>
  <nav epub:type="toc" id="toc"><h1>İçindekiler</h1>
    <ol>
      <li><a href="Text/b%C3%B6l%C3%BCm1.xhtml">Birinci&nbsp;Bölüm</a>
        <ol><li><a href="Text/b%C3%B6l%C3%BCm1.xhtml#s2">Alt <em>başlık</em></a></li></ol>
      </li>
      <li><span>Başlıksız grup</span>
        <ol><li><a href="Text/ch2.xhtml">İkinci &amp; Son</a></li></ol>
      </li>
    </ol>
  </nav>
</body></html>`;

const ch1 = "<html><body><p>Birinci bölüm metni.</p></body></html>";
const ch2 = "<html><body><p>İkinci bölüm, biraz daha uzun bir metin.</p></body></html>";

const epub3 = makeZip({
  mimetype: "application/epub+zip",
  "META-INF/container.xml": container,
  "OEBPS/content.opf": opf3,
  "OEBPS/nav.xhtml": nav,
  "OEBPS/styles/kitap.css": "p{}",
  "OEBPS/images/kapak.jpg": new Uint8Array([0xff, 0xd8, 0xff]),
  "OEBPS/Text/bölüm1.xhtml": ch1,
  "OEBPS/Text/ch2.xhtml": ch2,
  "OEBPS/Text/notes.xhtml": "<html><body>Notlar</body></html>",
});

const s3 = parseEpub(readZip(epub3));
check("OPF yolu", s3.opfPath === "OEBPS/content.opf");
check("başlık sadeleşir", s3.title === "Kürk Mantolu Madonna", String(s3.title));
check("yazar: yalnız 'aut' rolü", s3.author === "Sabahattin Ali", String(s3.author));
check("dil ve yön", s3.language === "tr" && s3.direction === "ltr");
check(
  "spine sırası, eksik dosya atlanır, yüzde kodlu yol çözülür",
  J(s3.spine.map((x) => x.path)) === J(["OEBPS/Text/bölüm1.xhtml", "OEBPS/Text/ch2.xhtml", "OEBPS/Text/notes.xhtml"]),
  J(s3.spine.map((x) => x.path))
);
check("spine sıraları ardışık", J(s3.spine.map((x) => x.index)) === J([0, 1, 2]));
check("linear=no okunur", s3.spine[2].linear === false && s3.spine[0].linear === true);
check("bölüm boyutu", s3.spine[0].size === enc.encode(ch1).length);
check("kapak (cover-image)", s3.coverPath === "OEBPS/images/kapak.jpg" && s3.coverType === "image/jpeg");
check(
  "içindekiler: toc nav'ı, derinlik, parça, varlık çözme",
  J(s3.toc.map((e) => [e.label, e.depth, e.spine, e.fragment ?? null])) ===
    J([
      ["Birinci Bölüm", 0, 0, null],
      ["Alt başlık", 1, 0, "s2"],
      ["İkinci & Son", 1, 1, null],
    ]),
  J(s3.toc.map((e) => [e.label, e.depth, e.spine, e.fragment ?? null]))
);
check("bölüm adı: aynı bölümün en üst maddesi", chapterTitle(s3, 0) === "Birinci Bölüm");
check("bölüm adı: içindekilerde yoksa öncekinin adı", chapterTitle(s3, 2) === "İkinci & Son");
check("spine: yoldan bulunur (sıra kaymış olsa da)", spineIndexOf(s3, "OEBPS/Text/ch2.xhtml", 7) === 1);
check("spine: yol yoksa sıra (sınırlı)", spineIndexOf(s3, "x.xhtml", 9) === 2 && spineIndexOf(s3, "x", -3) === 0);
const p0 = epubProgress(s3, 0, 0);
const pMid = epubProgress(s3, 1, 0.5);
const pEnd = epubProgress(s3, 2, 1);
check("ilerleme baştan sona artar", p0 === 0 && pMid > 0 && pMid < 1 && Math.abs(pEnd - 1) < 1e-9, J([p0, pMid, pEnd]));

// EPUB 2: toc.ncx, meta name=cover, opf:role.
const opf2 = `<package xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Eski Kitap</dc:title>
    <dc:creator opf:role="edt">Editör</dc:creator>
    <dc:creator opf:role="aut">Yazar Bir</dc:creator>
    <dc:creator>Yazar İki</dc:creator>
    <meta name="cover" content="cov"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cov" href="c.png" media-type="image/png"/>
    <item id="a" href="a.html" media-type="application/xhtml+xml"/>
    <item id="b" href="sub/b.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx" page-progression-direction="rtl"><itemref idref="a"/><itemref idref="b"/></spine>
</package>`;
const ncx = `<ncx><navMap>
  <navPoint id="n1"><navLabel><text>Giriş</text></navLabel><content src="a.html"/>
    <navPoint id="n2"><navLabel><text>Derin</text></navLabel><content src="sub/b.html#x%20y"/></navPoint>
  </navPoint>
</navMap></ncx>`;
const epub2 = makeZip({
  mimetype: "application/epub+zip",
  "META-INF/container.xml": container.replace("OEBPS/content.opf", "content.opf"),
  "content.opf": opf2,
  "toc.ncx": ncx,
  "c.png": new Uint8Array([1]),
  "a.html": "<html><body>a</body></html>",
  "sub/b.html": "<html><body>b</body></html>",
});
const s2 = parseEpub(readZip(epub2));
check("EPUB 2 başlık", s2.title === "Eski Kitap");
check("EPUB 2 yazar: aut ve rolsüz", s2.author === "Yazar Bir, Yazar İki", String(s2.author));
check("EPUB 2 kapak (meta name=cover)", s2.coverPath === "c.png");
check("sağdan sola yön", s2.direction === "rtl");
check(
  "NCX içindekiler",
  J(s2.toc.map((e) => [e.label, e.depth, e.spine, e.fragment ?? null])) === J([["Giriş", 0, 0, null], ["Derin", 1, 1, "x y"]]),
  J(s2.toc)
);

// container.xml yok: ilk .opf bulunur.
const noContainer = makeZip({ mimetype: "application/epub+zip", "x/p.opf": opf2.replace(/toc.ncx/, "yok.ncx"), "x/a.html": "a", "x/sub/b.html": "b" });
const sN = parseEpub(readZip(noContainer));
check("container.xml yoksa .opf aranır", sN.opfPath === "x/p.opf" && sN.spine.length === 2 && sN.toc.length === 0);

const errCode = (data: Uint8Array): string => {
  try {
    parseEpub(readZip(data));
    return "ok";
  } catch (e) {
    return e instanceof EpubError ? e.code : "other:" + String(e);
  }
};
check("OPF yok → notEpub", errCode(makeZip({ mimetype: "application/epub+zip", "a.txt": "x" })) === "notEpub");
check(
  "spine boş → broken",
  errCode(makeZip({ "META-INF/container.xml": container, "OEBPS/content.opf": "<package><manifest/><spine/></package>" })) === "broken"
);
const drmEnc = `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>
  <enc:CipherData><enc:CipherReference URI="OEBPS/Text/ch2.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>`;
const fontEnc = drmEnc
  .replace("http://www.w3.org/2001/04/xmlenc#aes128-cbc", "http://www.idpf.org/2008/embedding")
  .replace("OEBPS/Text/ch2.xhtml", "OEBPS/f.otf");
const withEnc = (xml: string) =>
  makeZip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": container,
    "META-INF/encryption.xml": xml,
    "OEBPS/content.opf": opf3,
    "OEBPS/Text/bölüm1.xhtml": ch1,
    "OEBPS/Text/ch2.xhtml": ch2,
  });
check("DRM şifreli içerik → drm", errCode(withEnc(drmEnc)) === "drm");
check("yalnız yazı tipi gizleme → açılır", errCode(withEnc(fontEnc)) === "ok");

// ─── XML okuyucu ─────────────────────────────────────────────────────────────────

const x = parseXml(`<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><!-- yorum --><r a='1' b="x > y" c=z d><![CDATA[<ham>]]><s/>t&#x131;&#305;&lt;<u>v</u></r>`);
check("XML kök ve öznitelikler", x.local === "r" && J(x.attrs) === J({ a: "1", b: "x > y", c: "z", d: "" }), J(x.attrs));
check("XML metin: CDATA, varlıklar, iç içe", xmlText(x) === "<ham>tıı<v", J(xmlText(x)));
check("XML kendini kapatan öğe", findAll(x, "s").length === 1 && findAll(x, "s")[0].children.length === 0);
const loose = parseXml("<a><b><c>1</a><d/>");
check("kapanmamış etiket hoş görülür", loose.local === "a" && findAll(loose, "c").length === 1);
check("varlık çözme", decodeEntities("&amp;&nbsp;&#65;&#x42;&bilinmez;") === "& AB&bilinmez;");

// ─── Yollar ──────────────────────────────────────────────────────────────────────

check("göreli yol", J(resolveHref("OEBPS/Text/a.xhtml", "../images/k.png")) === J({ path: "OEBPS/images/k.png" }));
check("parça", J(resolveHref("OEBPS/Text/a.xhtml", "b.xhtml#n%C3%B6t")) === J({ path: "OEBPS/Text/b.xhtml", fragment: "nöt" }));
check("yalnız parça aynı dosya", J(resolveHref("OEBPS/a.xhtml", "#x")) === J({ path: "OEBPS/a.xhtml", fragment: "x" }));
check("kökü aşan yol null", resolveHref("a.xhtml", "../../x") === null);
check("dış adres null", resolveHref("a.xhtml", "https://ornek.com/a") === null && resolveHref("a", "//x.com/y") === null);
check("dış adres tanıma", isExternalHref("mailto:a@b") && isExternalHref("javascript:alert(1)") && !isExternalHref("a/b.html"));

// ─── CSS kapsamlama ──────────────────────────────────────────────────────────────

const urls = (u: string) => (u.startsWith("http") ? null : "blob:" + u);
const css = scopeCss(
  `@charset "utf-8"; @import url(x.css);
  /* yorum { } */
  @font-face { font-family: X; src: url(f.otf); }
  html, body { margin: 0; font-size: 12pt; }
  body.dark > p, h1 { color: red; background: url("../i/a.png") }
  .x { background-image: url(http://iz.ci/p.gif); color: blue; }
  p::after { content: "a{b}c;d"; position: fixed; line-height: 18px }
  @media (min-width: 600px) { p { font-size: 1.2em } }
  @keyframes k { from { opacity: 0 } }
  :root{--a:1}`,
  ".lo-epub__body",
  urls
);
check("@import, @font-face, @keyframes atılır", !/@import|@font-face|@keyframes|f\.otf|@charset/.test(css), css);
check("html/body kabın kendisi", css.includes(".lo-epub__body { margin: 0; font-size: calc(12pt * var(--lo-epub-scale, 1)) }"), css);
check("body.sınıf > p", css.includes(".lo-epub__body.dark > p, .lo-epub__body h1 { color: red; background: url(\"blob:../i/a.png\") }"), css);
check("dış url'li bildirim atılır, diğerleri kalır", css.includes(".lo-epub__body .x { color: blue }"), css);
check("dizgi içindeki parantezler bozmaz; fixed atılır; px ölçeklenir", css.includes('.lo-epub__body p::after { content: "a{b}c;d"; line-height: calc(18px * var(--lo-epub-scale, 1)) }'), css);
check("@media içi kapsamlanır", /@media \(min-width: 600px\) \{\n\.lo-epub__body p \{ font-size: 1\.2em \}\n\}/.test(css), css);
check(":root kabın kendisi", css.includes(".lo-epub__body { --a: 1 }"), css);
check("ifade/js atılır", scopeCss("p{width:expression(alert(1));color:red;background:url(javascript:x)}", ".s", () => "ok") === ".s p { color: red }");
const blob = (u: string) => (/^(https?:|\/\/)/i.test(u) ? null : "blob:" + u);
check("kaçışla gizlenmiş url atılır", scopeCss("p{background:u\\72l(https://t.example/p.gif);color:red}", ".s", blob) === ".s p { color: red }");
check("image-set atılır", scopeCss('p{background-image:image-set("https://t/p.gif" 1x);color:red}', ".s", blob) === ".s p { color: red }");
check("zararsız kaçış kalır", scopeCss('q::before{content:"\\201C"}', ".s", blob) === '.s q::before { content: "\\201C" }');
check("cssUnescape", cssUnescape("u\\72l(") === "url(" && cssUnescape("\\201C") === "\u201c");
check("url çıktısında ters bölü kaçar", scopeCss("p{background:url(a.png)}", ".s", () => 'blob:x\\y"z') === '.s p { background: url("blob:x%5Cy%22z") }');
check("#kimlik → veri özniteliği", scopeCss("#cover img, body#x p, a[href='#y']{color:red}", ".s", blob) === ".s [data-epub-id=\"cover\"] img, .s[data-epub-id=\"x\"] p, .s a[href='#y'] { color: red }");
check("url(#iç) olduğu gibi kalır", scopeCss("rect{fill:url(#g)}", ".s", () => "blob:YANLIS") === '.s rect { fill: url("#g") }');
check("idToAttr dizgi içine dokunmaz", idToAttr('p[title="#a"] #b') === 'p[title="#a"] [data-epub-id="b"]');

// ─── Çizim yeri eşlemesi ─────────────────────────────────────────────────────────

const lens = [5, 0, 3, 4];
const st = prefixOffsets(lens);
check("başlangıçlar", J(st) === J([0, 5, 5, 8, 12]));
check("konum: düğüm içi", J(locateOffset(st, 6)) === J({ node: 2, offset: 1 }));
check("sınır (başlangıç): sonraki dolu düğüm", J(locateOffset(st, 5, "start")) === J({ node: 2, offset: 0 }));
check("sınır (bitiş): önceki düğümün sonu", J(locateOffset(st, 5, "end")) === J({ node: 0, offset: 5 }));
check("metin sonu", J(locateOffset(st, 12, "start")) === J({ node: 3, offset: 4 }) && J(locateOffset(st, 99)) === J({ node: 3, offset: 4 }));
check("metin başı (bitiş)", J(locateOffset(st, 0, "end")) === J({ node: 0, offset: 0 }));
check("boş liste null", locateOffset([0], 3) === null);
check("baştaki boş düğüm atlanır", J(locateOffset(prefixOffsets([0, 0, 2]), 0, "end")) === J({ node: 2, offset: 0 }));
check("sondaki boş düğüm atlanır", J(locateOffset(prefixOffsets([2, 0]), 2, "start")) === J({ node: 0, offset: 2 }));

const segs = paintSegments(lens, [
  { id: "a", start: 3, end: 7 },
  { id: "b", start: 6, end: 10 },
  { id: "bos", start: 4, end: 4 },
  { id: "tasan", start: 11, end: 50 },
]);
check(
  "boyama parçaları: çakışma, boş düğüm, taşma",
  J(segs) ===
    J([
      { node: 0, from: 3, to: 5, ids: ["a"] },
      { node: 2, from: 0, to: 1, ids: ["a"] },
      { node: 2, from: 1, to: 2, ids: ["a", "b"] },
      { node: 2, from: 2, to: 3, ids: ["b"] },
      { node: 3, from: 0, to: 2, ids: ["b"] },
      { node: 3, from: 3, to: 4, ids: ["tasan"] },
    ]),
  J(segs)
);
check("boyanacak yoksa boş", paintSegments([3], []).length === 0);

const chapter = "  Bir  gün\n  dedi ki: «ok­u».  Sonra   bir gün daha.  ";
check("seçim kırpılır", J(trimRange(chapter, 0, 9)) === J([2, 9]) && trimRange(chapter, 0, 2) === null);
const nm = normalizeWithMap(chapter);
check("normalleştirme", nm.norm === "Bir gün dedi ki: «oku». Sonra bir gün daha." && nm.map.length === nm.norm.length + 1, J(nm.norm));
check("normal → ham eşleme", chapter[nm.map[nm.norm.indexOf("dedi")]] === "d" && nm.map[nm.norm.length] === chapter.length);
const s1 = chapter.indexOf("dedi");
const e1 = chapter.indexOf("».") + 1;
check("aralık doğruysa aynen", J(relocateRange(chapter, s1, e1, "dedi ki: «oku»")) === J([s1, e1]));
const shifted = "Önsöz eklendi. " + chapter;
const rel = relocateRange(shifted, s1, e1, "dedi ki: «oku»");
check("metin kaydıysa alıntıdan bulunur", !!rel && shifted.slice(rel[0], rel[1]).replace(/­/g, "") === "dedi ki: «oku»", J(rel));
const two = chapter.indexOf("bir gün daha");
const near = relocateRange("x" + chapter, two, two + 7, "bir gün");
check("birden çok eşleşmede en yakını", !!near && near[0] === two + 1, J(near));
check("bulunamazsa null", relocateRange(chapter, 0, 3, "yok böyle bir şey") === null && relocateRange(chapter, 0, 3, "  ") === null);

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nEPUB yapısı ve çizim yeri: tüm kontroller geçti");

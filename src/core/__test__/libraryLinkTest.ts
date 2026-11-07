// Kitap bağlantılarının testi (LOM-83, K4).
import { bookLink, findBookLinks, highlightBlockLines, isHighlightMarkerLine, parseBookLink, type Highlight } from "../library";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const id = "0123456789abcdef";
check("yalnız kitap", bookLink({ bookId: id }) === `loomen://book/${id}`);
check("çizimli", bookLink({ bookId: id, highlightId: "h1" }) === `loomen://book/${id}?hl=h1`);
check("sayfalı", bookLink({ bookId: id, page: 12 }) === `loomen://book/${id}?page=12`);
check("geçersiz kimlik hata", throws(() => bookLink({ bookId: "../x" })));

const p = parseBookLink(`loomen://book/${id}?hl=h1&page=3`);
check("çözüm", p?.bookId === id && p.highlightId === "h1" && p.page === 3);
check("büyük harf şema", parseBookLink(`LOOMEN://book/${id}`)?.bookId === id);
check("başka şema null", parseBookLink("https://example.com") === null);
check("bozuk kimlik null", parseBookLink("loomen://book/a b") === null);
check("bozuk parametre atlanır", JSON.stringify(parseBookLink(`loomen://book/${id}?hl=<x>&page=-1`)) === JSON.stringify({ bookId: id }));
check("yaz-çöz", parseBookLink(bookLink({ bookId: id, highlightId: "x_Y-1" }))?.highlightId === "x_Y-1");

const line = `🟨 [s. 5](loomen://book/${id}?hl=h1) ve [web](https://a.b) ve [bozuk](loomen://book/a%20b)`;
const found = findBookLinks(line);
check("satırda yalnız geçerli kitap bağlantısı", found.length === 1 && found[0].label === "s. 5" && found[0].link.highlightId === "h1");
check("konumlar doğru", line.slice(found[0].from, found[0].to) === `[s. 5](loomen://book/${id}?hl=h1)`);
check("iki bağlantı", findBookLinks(`[a](loomen://book/${id}) [b](loomen://book/${id}?hl=z)`).length === 2);
check("ardışık çağrı aynı sonuç", findBookLinks(line).length === 1);
const esc = findBookLinks(`[Bölüm \\[2\\] Giriş](loomen://book/${id}?hl=h2)`);
check("kaçışlı köşeli parantezli etiket", esc.length === 1 && esc[0].label === "Bölüm [2] Giriş" && esc[0].link.highlightId === "h2");
// Yazan (not eşitleme) ile okuyan aynı kaçışı kullanır: ters bölüyle biten bölüm adı bağlantıyı bozmasın.
const hl: Highlight = {
  id: "h3",
  color: "blue",
  text: "alıntı",
  chapter: "Ek \\ [A]\\",
  anchor: { kind: "epub", spine: 2, href: "c.xhtml", start: 0, end: 6 },
  createdAt: 1,
  updatedAt: 1,
};
const linkLine = highlightBlockLines({ id }, hl).find((l) => l.includes("loomen://book/")) ?? "";
const round = findBookLinks(linkLine);
check("ters bölülü etiket gidiş-dönüş", round.length === 1 && round[0].label === "Ek \\ [A]\\" && round[0].link.highlightId === "h3", linkLine);

check("işaret satırı tanınır", isHighlightMarkerLine("<!-- loomen:hl h1 -->") && isHighlightMarkerLine("  <!-- /loomen:hl h1 -->"));
check("sıradan yorum işaret değil", !isHighlightMarkerLine("<!-- not -->"));

if (fails) {
  console.error(`\n${fails} kontrol başarısız`);
  process.exit(1);
}
console.log("\nKitap bağlantıları: tüm kontroller geçti");

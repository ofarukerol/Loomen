// Graf kenar üretiminin node testi — yalnız açık bağlantılar kenar olur (LOM-43).
//   npm test   (ya da: npx esbuild src/core/__test__/graphTest.ts --bundle --platform=node \
//     --format=esm --outfile=/tmp/graphTest.mjs && node /tmp/graphTest.mjs)
import { buildGraphModel, GRAPH_OPTION_DEFAULTS, type GraphNoteInput, type GraphOptions } from "../../screens/Graph/graphModel";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const eq = (name: string, actual: unknown, expected: unknown): void =>
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    JSON.stringify(actual) === JSON.stringify(expected)
      ? ""
      : `beklenen ${JSON.stringify(expected)}, gelen ${JSON.stringify(actual)}`,
  );

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const note = (path: string, kind: "note" | "draw" = "note"): GraphNoteInput => ({
  path,
  name: path.split("/").pop()!.replace(/\.(md|excalidraw)$/i, ""),
  kind,
});

/** Grafı kur, kenarları "kaynak→hedef:tür" biçiminde sıralı döndür. */
function edges(
  notes: GraphNoteInput[],
  contents: Record<string, string>,
  opts: Partial<GraphOptions> = {},
): string[] {
  const g = buildGraphModel(notes, contents, { ...GRAPH_OPTION_DEFAULTS, ...opts });
  return g.links.map((l) => `${l.source}→${l.target}:${l.kind}`).sort();
}

const A = note("A.md");
const B = note("Notlar/B.md");
const C = note("Notlar/Alt/C.md");

// ─────────────────────────────────────────────────────────────────────────────
section("Varsayılanlar");

eq("Varsayılan: etiket kapalı, hayalet kapalı, yetim açık, günlük kapalı", GRAPH_OPTION_DEFAULTS, {
  tags: false,
  orphans: true,
  ghosts: false,
  journal: false,
});

{
  const g = buildGraphModel([A, B], { "A.md": "Bkz [[B]] #proje [[Yok]]" }, GRAPH_OPTION_DEFAULTS);
  eq("Varsayılanda yalnız açık bağlantı kenarı", g.links.map((l) => l.kind), ["wiki"]);
  eq("Varsayılanda düğümler yalnız notlar", g.nodes.map((n) => n.kind), ["note", "note"]);
  eq("Sayaçlar", [g.noteCount, g.tagCount, g.ghostCount], [2, 0, 0]);
}

// ─────────────────────────────────────────────────────────────────────────────
section("Kod içi bağlantılar");

eq("Çitli kod bloğundaki [[ ]] kenar üretmez", edges([A, B], { "A.md": "```\n[[B]]\n```\n" }), []);
eq("~~~ bloğu da sayılmaz", edges([A, B], { "A.md": "~~~js\nx = [[B]]\n~~~" }), []);
eq("Kapanmayan çit dosya sonuna kadar sürer", edges([A, B], { "A.md": "```\n[[B]]" }), []);
eq("Satır içi kod sayılmaz", edges([A, B], { "A.md": "örnek: `[[B]]` yazılır" }), []);
eq("Çift ters tırnaklı satır içi kod sayılmaz", edges([A, B], { "A.md": "``a ` [[B]]``" }), []);
eq(
  "Kod bloğundan sonraki gerçek bağlantı sayılır",
  edges([A, B], { "A.md": "```\n[[Yok]]\n```\nBkz [[B]]" }),
  ["A.md→Notlar/B.md:wiki"],
);
eq(
  "Liste içindeki kod bloğu kalanı yutmaz",
  edges([A, B, C], { "A.md": "- ```\n  [[C]]\n  ```\n[[B]]\n1. ~~~\n   [[C]]\n   ~~~\n> ```\n> [[C]]\n>\n> ```\n" }),
  ["A.md→Notlar/B.md:wiki"],
);
{
  const t0 = Date.now();
  edges([A, B], { "A.md": "-   ".repeat(60) + "x\n" + "> ".repeat(60) + "[[B]]\n" + "1. ".repeat(60) + "```\n" });
  check("Çok önekli satırlar takılmaz", Date.now() - t0 < 500, `${Date.now() - t0} ms`);
}
eq("Kod içindeki `- ```` satırı bloğu kapatmaz", edges([A, B, C], { "A.md": "```\n- ```\n[[C]]\n```\n[[B]]" }), [
  "A.md→Notlar/B.md:wiki",
]);
eq("Görev satırı çit açmaz", edges([A, B], { "A.md": "- [ ] görev\n> alıntı\n[[B]]" }), ["A.md→Notlar/B.md:wiki"]);
eq("Kod içindeki #etiket düğüm olmaz", edges([A], { "A.md": "`#gizli`\n```\n#kod\n```\n#açık" }, { tags: true }), [
  "A.md→#açık:tag",
]);

// ─────────────────────────────────────────────────────────────────────────────
section("Tablo ve takma ad");

eq("Tablo hücresinde [[Not\\|ad]] doğru nota çözülür", edges([A, B], { "A.md": "| a | [[B\\|bee]] |" }), [
  "A.md→Notlar/B.md:wiki",
]);
eq("[[Not#Başlık|ad]] nota çözülür", edges([A, B], { "A.md": "[[B#Bölüm|ad]]" }), ["A.md→Notlar/B.md:wiki"]);
eq("Gömü ![[ ]] kenar üretmez", edges([A, B], { "A.md": "![[B]]" }), []);
eq("Yerel çapa [[#Başlık]] kenar üretmez", edges([A, B], { "A.md": "[[#Başlık]]" }), []);

// ─────────────────────────────────────────────────────────────────────────────
section("Markdown bağlantıları");

eq("İç markdown bağlantısı (kökten yol)", edges([A, B], { "A.md": "[bee](Notlar/B.md)" }), [
  "A.md→Notlar/B.md:markdown",
]);
eq("URL kodlu ve başlık çapalı", edges([A, note("Notlar/Proje X.md")], { "A.md": "[p](Notlar/Proje%20X.md#Hedef)" }), [
  "A.md→Notlar/Proje X.md:markdown",
]);
eq("<> sarmalı ve boşluklu yol", edges([A, note("Notlar/Proje X.md")], { "A.md": "[p](<Notlar/Proje X.md>)" }), [
  "A.md→Notlar/Proje X.md:markdown",
]);
eq("Göreli yol (aynı klasör)", edges([B, C, note("Notlar/D.md")], { "Notlar/B.md": "[d](D.md)" }), [
  "Notlar/B.md→Notlar/D.md:markdown",
]);
eq("Göreli yol (../)", edges([A, B, C], { "Notlar/Alt/C.md": "[b](../B.md) [a](../../A.md)" }), [
  "Notlar/Alt/C.md→A.md:markdown",
  "Notlar/Alt/C.md→Notlar/B.md:markdown",
]);
eq("Uzantısız markdown hedefi", edges([A, B], { "A.md": "[b](Notlar/B)" }), ["A.md→Notlar/B.md:markdown"]);
eq(
  "Dış adres, mailto, protokolsüz ve obsidian: kenar üretmez",
  edges([A, B], {
    "A.md": "[w](https://ornek.com/B.md) [m](mailto:a@b.co) [p](//ornek.com/B) [o](obsidian://open?file=B)",
  }),
  [],
);
eq("Resim gömüsü kenar üretmez", edges([A, B], { "A.md": "![resim](Notlar/B.md) ![f](foto.png)" }), []);
eq("Yalnız çapa kenar üretmez", edges([A, B], { "A.md": "[yukarı](#Başlık)" }), []);
eq("[[Not]](yol) markdown kenarı üretmez", edges([A, B, C], { "A.md": "[[B]](Notlar/Alt/C.md)" }), ["A.md→Notlar/B.md:wiki"]);
eq("İki noktalı not adı şema sanılmaz", edges([A, note("Meeting: Q3.md")], { "A.md": "[m](<Meeting: Q3.md>)" }), [
  "A.md→Meeting: Q3.md:markdown",
]);
eq("Rozet bağlantısı: resim içindeki bağlantı notu gösterir", edges([A, B], { "A.md": "[![r](r.png)](Notlar/B.md)" }), [
  "A.md→Notlar/B.md:markdown",
]);
eq("Kod içindeki markdown bağlantısı sayılmaz", edges([A, B], { "A.md": "`[b](Notlar/B.md)`" }), []);
eq("E-posta ve köşeli parantezli metin kenar değil", edges([A, B], { "A.md": "a@b.co [not] [B] (B)" }), []);
eq(
  "Aynı nota wiki + markdown tek kenar (ilk tür kalır)",
  edges([A, B], { "A.md": "[[B]] [b](Notlar/B.md)" }),
  ["A.md→Notlar/B.md:wiki"],
);

// ─────────────────────────────────────────────────────────────────────────────
section("Hayalet (var olmayan) notlar");

{
  const off = buildGraphModel([A], { "A.md": "[[Yok Not]] [y](Yok%20Not.md)" }, GRAPH_OPTION_DEFAULTS);
  eq("Hayalet kapalıyken kenar ve düğüm yok", [off.links.length, off.ghostCount], [0, 0]);
  const on = buildGraphModel([A], { "A.md": "[[Yok Not]] [y](Yok%20Not.md)" }, { ...GRAPH_OPTION_DEFAULTS, ghosts: true });
  eq("Hayalet açıkken wiki ve markdown aynı hayalete bağlanır", on.links.map((l) => `${l.target}:${l.kind}`), [
    "?yok not:wiki",
  ]);
  eq("Hayalet düğüm adı ve türü", on.nodes.filter((n) => n.kind === "ghost").map((n) => n.name), ["Yok Not"]);
  eq("Hub hayalet olamaz", on.hubId, "A.md");
}
eq(
  "Not olmayan markdown hedefi hayalet olmaz, aynı ad tek hayalet",
  edges([A, B], { "A.md": "[s](www.site.com) [r](src/main.rs) [u](..)", "Notlar/B.md": "[[Foo]] [f](./x/Foo.md)" }, { ghosts: true }),
  ["Notlar/B.md→?foo:wiki"],
);
eq(
  "Ek dosyasına bağlantı hayalet açıkken de düğüm olmaz",
  edges([A], { "A.md": "[[rapor.pdf]] [s](ses.m4a)" }, { ghosts: true }),
  [],
);

// ─────────────────────────────────────────────────────────────────────────────
section("Etiketler");

eq("Etiket kapalıyken etiket kenarı yok", edges([A, B], { "A.md": "#ortak", "Notlar/B.md": "#ortak" }), []);
{
  const g = buildGraphModel(
    [A, B],
    { "A.md": "#ortak #ortak", "Notlar/B.md": "#ortak ## Başlık https://x.co/#readme Issue #123" },
    { ...GRAPH_OPTION_DEFAULTS, tags: true },
  );
  eq("Etiket açıkken notlar etikete bağlanır", g.links.map((l) => `${l.source}→${l.target}`).sort(), [
    "A.md→#ortak",
    "Notlar/B.md→#ortak",
  ]);
  eq("Etiket sayacı", g.tagCount, 1);
  eq("Hub etiket olamaz", g.nodes.find((n) => n.id === g.hubId)?.kind, "note");
}

// ─────────────────────────────────────────────────────────────────────────────
section("Ad çözümü");

eq("NFD yazılmış bağlantı NFC nota çözülür", edges([A, note("İstanbul.md")], { "A.md": "[[İstanbul]]" }), [
  "A.md→İstanbul.md:wiki",
]);
eq("Türkçe harf katlamasıyla çözülür", edges([A, note("İstanbul.md")], { "A.md": "[[istanbul]]" }), [
  "A.md→İstanbul.md:wiki",
]);
eq("NFD dosya adı da çözülür", edges([A, note("Şarkılar.md".normalize("NFD"))], { "A.md": "[[Şarkılar]]" }), [
  `A.md→${"Şarkılar.md".normalize("NFD")}:wiki`,
]);
eq("Yol ile [[Klasör/Not]]", edges([A, B], { "A.md": "[[Notlar/B]]" }), ["A.md→Notlar/B.md:wiki"]);
eq("Kısmi yol [[Alt/C]]", edges([A, C], { "A.md": "[[Alt/C]]" }), ["A.md→Notlar/Alt/C.md:wiki"]);
eq(
  "Aynı adlı iki not: kaynakla aynı klasördeki seçilir",
  edges([note("X/Ad.md"), note("Y/Ad.md"), note("Y/Kaynak.md")], { "Y/Kaynak.md": "[[Ad]]" }),
  ["Y/Kaynak.md→Y/Ad.md:wiki"],
);
eq(
  "Aynı adlı iki not: başka klasörden en kısa yol seçilir",
  edges([note("Derin/Klasör/Ad.md"), note("Ad.md"), note("Z/Kaynak.md")], { "Z/Kaynak.md": "[[Ad]]" }),
  ["Z/Kaynak.md→Ad.md:wiki"],
);
eq("Çizime [[ ]] bağlantısı kenar", edges([A, note("Çizim.excalidraw", "draw")], { "A.md": "[[Çizim]]" }), [
  "A.md→Çizim.excalidraw:wiki",
]);

// ─────────────────────────────────────────────────────────────────────────────
section("Çizim, yetim, tekrar");

eq(
  "Çizim JSON'u bağlantı kaynağı değil",
  edges([A, note("Ç.excalidraw", "draw")], { "Ç.excalidraw": '{"text":"[[A]] #etiket [x](A.md)"}' }, { tags: true, ghosts: true }),
  [],
);
{
  const notes = [A, B, C];
  const contents = { "A.md": "[[B]]" };
  const shown = buildGraphModel(notes, contents, GRAPH_OPTION_DEFAULTS);
  eq("Yetim açıkken bağlantısız not görünür", shown.nodes.map((n) => n.id), ["A.md", "Notlar/B.md", "Notlar/Alt/C.md"]);
  const hidden = buildGraphModel(notes, contents, { ...GRAPH_OPTION_DEFAULTS, orphans: false });
  eq("Yetim kapalıyken bağlantısız not gizlenir", hidden.nodes.map((n) => n.id), ["A.md", "Notlar/B.md"]);
  eq("Yetim kapalıyken sayaç yine bütün notları sayar", hidden.noteCount, 3);
  const tagOnly = buildGraphModel([A, C], { "A.md": "#x" }, { ...GRAPH_OPTION_DEFAULTS, orphans: false });
  eq("Etiket kapalıyken yalnız etiketli not yetim sayılır", tagOnly.nodes.length, 0);
}
{
  const g = buildGraphModel(
    [A, B],
    { "A.md": "[[B]] [[B]] [[b]] [[A]] [a](A.md)", "Notlar/B.md": "[[A]]" },
    GRAPH_OPTION_DEFAULTS,
  );
  eq("Tekrar ve karşılıklı bağlantı tek kenar, kendine kenar yok", g.links.length, 1);
  eq("Dereceler", g.nodes.map((n) => n.deg), [1, 1]);
  eq("Komşuluk iki yönlü", [...(g.neighbors.get("Notlar/B.md") ?? [])], ["A.md"]);
}
eq("Boş kasa", buildGraphModel([], {}, GRAPH_OPTION_DEFAULTS).hubId, null);

// ─────────────────────────────────────────────────────────────────────────────
section("Günlük ve şablonlar gizli (LOM-50)");
{
  const D = note("Günlük/2026/10-Ekim/2026-10-18-Pazar.md");
  const W = note("Günlük/2026/Haftalık Plan/2026-W12.md");
  const T = note("Şablonlar/Günlük.md");
  const K = note("Şablonlar/Günlük (çakışma).md");
  const G = note("Günlükler/Benim.md"); // benzer adlı kullanıcı klasörü gizlenmez
  const all = [A, B, D, W, T, K, G];
  const contents = {
    "A.md": "[[B]] [[2026-10-18-Pazar]] [d](Günlük/2026/10-Ekim/2026-10-18-Pazar.md)",
    "Günlük/2026/10-Ekim/2026-10-18-Pazar.md": "[[A]] [[B]]",
    "Şablonlar/Günlük.md": "[[A]]",
  };
  const ids = (o: Partial<GraphOptions> = {}) =>
    buildGraphModel(all, contents, { ...GRAPH_OPTION_DEFAULTS, ...o }).nodes.map((n) => n.id).sort();
  eq("Varsayılanda Günlük/ ve Şablonlar/ notu düğüm olmaz", ids(), ["A.md", "Günlükler/Benim.md", "Notlar/B.md"].sort());
  eq("Gizli nota giden ve gizli nottan çıkan kenar yok", edges(all, contents), ["A.md→Notlar/B.md:wiki"]);
  eq("Gizli nota giden bağlantı hayalet de olmaz", ids({ ghosts: true }), ["A.md", "Günlükler/Benim.md", "Notlar/B.md"].sort());
  eq("Hub ve not sayısı yalnız görünenlerden", buildGraphModel(all, contents, GRAPH_OPTION_DEFAULTS).noteCount, 3);
  eq("Ayrışık NFD yol da gizlenir", ids().length, buildGraphModel([...all, note("Günlük/x.md".normalize("NFD"))], contents, GRAPH_OPTION_DEFAULTS).nodes.length);
  eq("Seçenek açıkken hepsi görünür", ids({ journal: true }).length, 7);
  eq("Seçenek açıkken günlük kenarları geri gelir", edges(all, contents, { journal: true }).length, 4);
}

console.log(`\n${ran - fails}/${ran} geçti`);
process.exit(fails === 0 ? 0 : 1);

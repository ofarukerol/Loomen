// AI çekirdeğinin node testi (esbuild ile bundle edilip çalıştırılır).
//   npx esbuild src/core/__test__/aiTest.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/aiTest.mjs && node /tmp/aiTest.mjs "<kasa yolu>"
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { chunkNote } from "../ai/chunk";
import { tokenize, expand, buildBm25, bm25Search } from "../ai/bm25";
import { retrieve, rrfFuse, isExcluded, resetIndex } from "../ai/retrieve";
import { buildContext, buildSystemPrompt } from "../ai/context";
import { safePath, parseProposal, splitProposals } from "../ai/proposal";
import { bytesToBase64 } from "../ai/stt";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

// ---------------------------------------------------------------- bölümleme

const SAMPLE = `---
title: Deneme
tags: [a, b]
---

Giriş paragrafı.

# Kurulum

Sunucuya bağlan.

## Sunucu

\`\`\`bash
# bu bir yorum, BAŞLIK DEĞİL
ssh sunucu
\`\`\`

| a | b |
|---|---|
| 1 | 2 |

# Bakım

Haftalık temizlik yapılır.
`;

const cs = chunkNote("klasor/Deneme.md", SAMPLE);
check("Frontmatter parçalara girmedi", !cs.some((c) => c.text.includes("tags: [a, b]")));
check("Not adı türetildi", cs[0]?.title === "Deneme", cs[0]?.title);
check("Başlıksız giriş var", cs.some((c) => c.heading === "" && c.text.includes("Giriş")));
check(
  "Başlık hiyerarşisi zincirlendi",
  cs.some((c) => c.heading === "Kurulum > Sunucu"),
  cs.map((c) => c.heading).join(" | ")
);
check(
  "Kod bloğu içindeki # başlık sayılmadı",
  !cs.some((c) => c.heading.includes("bu bir yorum")),
);
const fenceChunk = cs.find((c) => c.text.includes("ssh sunucu"));
check("Kod bloğu bütün kaldı", !!fenceChunk && fenceChunk.text.includes("```"));
const tableChunk = cs.find((c) => c.text.includes("| 1 | 2 |"));
check("Tablo satırları bir arada", !!tableChunk && tableChunk.text.includes("| a | b |"));
check("Son başlık kayıp değil", cs.some((c) => c.heading === "Bakım"));

// Uzun metin bölünmesi + örtüşme
const long = "# Uzun\n\n" + Array.from({ length: 40 }, (_, i) => `Cümle numarası ${i}.`).join(" ");
const lcs = chunkNote("Uzun.md", long, { maxChars: 200, overlap: 40 });
check("Uzun bölüm birden çok parçaya bölündü", lcs.length > 1, String(lcs.length));
check("Parçalar hedef uzunluğu aşırı aşmadı", lcs.every((c) => c.text.length <= 260), String(Math.max(...lcs.map((c) => c.text.length))));
check("Parça indeksleri sıralı", lcs.every((c, i) => c.index === i));

// ---------------------------------------------------------------- BM25

check("Türkçe küçültme (I → ı)", tokenize("IŞIK Işık")[0] === "ışık", tokenize("IŞIK Işık").join(","));
check("Durak sözcük elendi", !tokenize("bu ve veya kitap").includes("ve"), tokenize("bu ve veya kitap").join(","));
check("Tek harf elendi", !tokenize("a bc").includes("a"));

const idx = buildBm25([
  { path: "a.md", title: "Kahve", heading: "", text: "Espresso demleme süresi 25 saniyedir.", index: 0 },
  { path: "b.md", title: "Çay", heading: "", text: "Demlik suyu kaynatılır.", index: 0 },
  { path: "c.md", title: "Kahve", heading: "Öğütme", text: "Öğütme kalınlığı espresso için ince olmalı.", index: 1 },
]);
const hits = bm25Search(idx, "espresso demleme");
check("BM25 ilgili parçayı ilk sıraya koydu", idx.chunks[hits[0]?.i]?.path === "a.md", idx.chunks[hits[0]?.i]?.path);
check("BM25 alakasızı elemedi ama geriye attı", hits.every((h) => idx.chunks[h.i].path !== "b.md"));
check("Başlıkta geçen terim de bulunur", bm25Search(idx, "öğütme").length > 0);
check("Boş sorgu boş döner", bm25Search(idx, "   ").length === 0);

// Türkçe çekim: ek almış sözcük kökten bulunmalı
check("Kök: uzun sözcük iki biçim üretir", expand("toplantı").join(",") === "toplantı,topla", expand("toplantı").join(","));
check("Kök: kısa sözcük olduğu gibi kalır", expand("kahve").join(",") === "kahve");

const tidx = buildBm25([
  { path: "t1.md", title: "Ekip", heading: "", text: "Salı günkü toplantıda bütçe konuşuldu.", index: 0 },
  { path: "t2.md", title: "Mutfak", heading: "", text: "Bulaşık makinesi bozuldu.", index: 0 },
  { path: "t3.md", title: "Ekip", heading: "", text: "Toplantı notları burada tutulur.", index: 1 },
]);
const th = bm25Search(tidx, "toplantı");
check("Çekimli hâl kökten bulundu", th.some((h) => tidx.chunks[h.i].path === "t1.md"), th.map((h) => tidx.chunks[h.i].path).join(","));
check("Tam eşleşme çekimli hâlin üstünde", tidx.chunks[th[0].i].path === "t3.md", tidx.chunks[th[0].i].path);
check("Alakasız not gelmedi", !th.some((h) => tidx.chunks[h.i].path === "t2.md"));
check("Sorgu da çekimli olabilir", bm25Search(tidx, "toplantıların").length > 0);

// ---------------------------------------------------------------- RRF

const fused = rrfFuse([
  [{ i: 1, score: 9 }, { i: 2, score: 8 }, { i: 3, score: 7 }],
  [{ i: 3, score: 0.9 }, { i: 1, score: 0.8 }],
]);
check("RRF: iki listede de olan öne geçti", fused[0].i === 1 || fused[0].i === 3, String(fused[0].i));
check("RRF: yalnız tek listede olan geride", fused[fused.length - 1].i === 2, String(fused[fused.length - 1].i));
check(
  "RRF ağırlığı çalışıyor",
  rrfFuse([[{ i: 5, score: 1 }], [{ i: 6, score: 1 }]], [0.1, 5])[0].i === 6
);

// ---------------------------------------------------------------- dışlama

check("Dışlama: alt klasör yakalanır", isExcluded("Arsiv/2024/not.md", ["Arsiv"]));
check("Dışlama: benzer isim yakalanmaz", !isExcluded("Arsivim/not.md", ["Arsiv"]));
check("Dışlama: baştaki / önemsiz", isExcluded("Arsiv/n.md", ["/Arsiv/"]));
check("Dışlama: boş liste her şeyi geçirir", !isExcluded("a/b.md", []));

// ---------------------------------------------------------------- bağlam

const built = buildContext([
  { chunk: { path: "a.md", title: "Kahve", heading: "Demleme", text: "25 saniye.", index: 0 }, score: 1 },
  { chunk: { path: "c.md", title: "Kahve", heading: "", text: "İnce öğüt.", index: 1 }, score: 0.5 },
]);
check("Alıntılar 1'den numaralandı", built.citations[0].n === 1 && built.citations[1].n === 2);
check("Bağlamda numara etiketi var", built.text.includes("[1] Kahve › Demleme"), built.text.slice(0, 40));
const prompt = buildSystemPrompt({ activeNote: "klasor/Bugun.md", context: built });
check("İstem aktif nottan bahsediyor", prompt.includes("Bugun"));
check("İstem alıntı istiyor", prompt.includes("[1]"));
check("Bağlamsız istem uyarı içeriyor", buildSystemPrompt({ context: { text: "", citations: [] } }).includes("bulunamadı"));
const trimmed = buildContext(
  Array.from({ length: 20 }, (_, i) => ({
    chunk: { path: `n${i}.md`, title: `N${i}`, heading: "", text: "x".repeat(500), index: 0 },
    score: 1,
  })),
  1200
);
check("Bağlam bütçesi aşılmadı", trimmed.text.length <= 1400, String(trimmed.text.length));

// ---------------------------------------------------------------- gerçek kasa


// ---------------------------------------------------------------- not önerileri (yazma)
//
// Bu bölüm bir güvenlik testidir: asistanın önerdiği yol kasanın dışına çıkamaz, gizli
// klasöre giremez, uygulamanın kendi verisine (Tekrar/) dokunamaz.

console.log("\n---\n");

check("Basit yol kabul", safePath("Projeler/Toplantı.md") === "Projeler/Toplantı.md");
check("Uzantı yoksa .md eklenir", safePath("Fikirler") === "Fikirler.md");
check("Ters bölü düzeltilir", safePath("Projeler\\Not.md") === "Projeler/Not.md");
check("Baştaki ./ atılır", safePath("./Not.md") === "Not.md");
check("Üst klasöre tırmanma reddedilir", safePath("../../etc/passwd.md") === null);
check("Ortada .. reddedilir", safePath("Projeler/../../dışarı.md") === null);
check("Mutlak yol reddedilir", safePath("/etc/passwd.md") === null);
check("Sürücü harfi reddedilir", safePath("C:/Windows/not.md") === null);
check("Gizli klasör reddedilir", safePath(".trash/not.md") === null);
check("Gizli dosya reddedilir", safePath("Klasör/.gizli.md") === null);
check("Tekrar klasörü korunur", safePath("Tekrar/durum.json") === null);
check("tekrar (küçük harf) de korunur", safePath("tekrar/not.md") === null);
check("Boş yol reddedilir", safePath("   ") === null);
check("Yol string değilse reddedilir", safePath(42 as unknown) === null);

check(
  "Geçerli öneri ayrıştırıldı",
  parseProposal('{"action":"append","path":"Not.md","text":"satır"}')?.path === "Not.md",
);
check("Bilinmeyen işlem reddedilir", parseProposal('{"action":"delete","path":"a.md","text":"x"}') === null);
check("Boş metin reddedilir", parseProposal('{"action":"create","path":"a.md","text":"  "}') === null);
check("Bozuk JSON reddedilir", parseProposal("{bu json değil}") === null);
check("Güvensiz yollu öneri reddedilir", parseProposal('{"action":"append","path":"../a.md","text":"x"}') === null);

const answer = [
  "Tamam, şunu ekleyebilirim [1]:",
  "",
  "```loomen-note",
  '{ "action": "append", "path": "Günlük/2026-09-21.md", "text": "- Süt al" }',
  "```",
].join("\n");
const split = splitProposals(answer);
check("Öneri metinden ayrıldı", split.proposals.length === 1, String(split.proposals.length));
check("Görünür metinde ham JSON yok", !split.text.includes("action"), split.text);
check("Görünür metin korundu", split.text.startsWith("Tamam"), split.text);

const half = 'Ekliyorum:\n\n```loomen-note\n{ "action": "append", "path": "A.md"';
check("Yarım blok gizlenir", !splitProposals(half).text.includes("loomen-note"));
check("Yarım blok öneri üretmez", splitProposals(half).proposals.length === 0);

const two = [
  "```loomen-note",
  '{ "action": "create", "path": "A.md", "text": "bir" }',
  "```",
  "ve",
  "```loomen-note",
  '{ "action": "append", "path": "B.md", "text": "iki" }',
  "```",
].join("\n");
check("İki öneri de bulundu", splitProposals(two).proposals.length === 2);

check(
  "Yazma yönergesi istemde yalnız izin varken",
  buildSystemPrompt({ context: buildContext([]), canWrite: true }).includes("loomen-note") &&
    !buildSystemPrompt({ context: buildContext([]) }).includes("loomen-note"),
);

// ---------------------------------------------------------------- ses (base64 köprüsü)

const big = new Uint8Array(200_000);
for (let i = 0; i < big.length; i++) big[i] = i % 251;
const b64 = bytesToBase64(big);
check("Büyük ses base64'e çevrildi (yığın taşmadı)", b64.length > 0, `${b64.length} karakter`);
const back = Buffer.from(b64, "base64");
check("Base64 geri çözüldü, baytlar aynı", back.length === big.length && back[12345] === big[12345]);

const VAULT = process.argv[2];
if (VAULT) {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      if (e.startsWith(".")) return [];
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
    });
  const files = walk(VAULT);
  const contents: Record<string, string> = {};
  for (const f of files) contents[relative(VAULT, f)] = readFileSync(f, "utf8");

  resetIndex();
  const t0 = performance.now();
  const first = retrieve(contents, "toplantı notları", { k: 5 });
  const t1 = performance.now();
  const second = retrieve(contents, "proje planı", { k: 5 });
  const t2 = performance.now();

  const total = Object.values(contents).reduce((a, c) => a + chunkNote("x.md", c).length, 0);
  console.log(
    `\n=== ${files.length} not, ~${total} parça — ilk sorgu ${(t1 - t0).toFixed(0)}ms, ikinci ${(t2 - t1).toFixed(0)}ms ===`
  );
  check("Gerçek kasada indeks kuruldu", total > 0, String(total));
  check("İkinci sorgu önbellekten hızlı", t2 - t1 < Math.max(t1 - t0, 5), `${(t2 - t1).toFixed(1)}ms`);
  if (first.length) console.log("  örnek isabet:", first[0].chunk.path, "›", first[0].chunk.heading || "(giriş)");
  if (second.length) console.log("  örnek isabet:", second[0].chunk.path, "›", second[0].chunk.heading || "(giriş)");
}

console.log(fails === 0 ? "\nTümü geçti." : `\n${fails} test başarısız.`);
process.exit(fails === 0 ? 0 : 1);

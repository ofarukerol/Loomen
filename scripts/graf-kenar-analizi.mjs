#!/usr/bin/env node
// Graf kenar analizi — bir kasadaki graf çizgilerinin nereden geldiğini döker (LOM-43).
//
//   node scripts/graf-kenar-analizi.mjs <kasa-klasörü> [--ref <commit>] [--ornek 8]
//
// Eski kural: --ref'teki links.ts (varsayılan: links.ts'ye dokunan ilk "LOM-43:" commit'inin
// ebeveyni, yani değişiklik öncesi; bulunamazsa HEAD) + eski GraphScreen mantığı — [[ad]] yalnız
// birebir adla çözülür, kod blokları ayıklanmaz, çizim JSON'u da taranır, etiketler açık.
// Yeni kural: çalışma kopyasındaki graphModel.ts / links.ts, varsayılan graf seçenekleriyle.
// Dosya yazmaz; esbuild çıktısı bellekte derlenip data: adresiyle içe alınır.
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// — Argümanlar —
const argv = process.argv.slice(2);
let ref = null; // null → LOM-43 öncesi commit aranır
let sampleCount = 8;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--ref") ref = argv[++i];
  else if (argv[i] === "--ornek") sampleCount = Number(argv[++i]);
  else if (argv[i].startsWith("--")) ref = undefined; // bilinmeyen seçenek → kullanım
  else positional.push(argv[i]);
}
if (positional.length !== 1 || ref === undefined || ref === "" || !(sampleCount > 0)) {
  console.error("Kullanım: node scripts/graf-kenar-analizi.mjs <kasa-klasörü> [--ref <commit>] [--ornek 8]");
  process.exit(2);
}
const vault = resolve(positional[0]);
if (!existsSync(vault) || !statSync(vault).isDirectory()) {
  console.error(`Kasa klasörü bulunamadı: ${vault}`);
  process.exit(2);
}

// — Derleme (bellekte) —
async function load(contents, resolveDir, sourcefile) {
  const res = await build({
    stdin: { contents, resolveDir, sourcefile, loader: "ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "error",
  });
  const code = res.outputFiles[0].text;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

const cur = await load(
  `export { buildGraphModel, GRAPH_OPTION_DEFAULTS } from "./src/screens/Graph/graphModel";
   export { extractWikiLinks, extractMarkdownLinks, extractTags, stripCode } from "./src/core/markdown/links";`,
  root,
  "yeni-kural.ts",
);

// Varsayılan karşılaştırma tabanı: commit sonrası HEAD yeni kodu taşır, eski kural olamaz.
const refGiven = ref !== null;
if (!refGiven) {
  const log = spawnSync(
    "git",
    ["log", "--format=%H", "--grep=^LOM-43:", "--", "src/core/markdown/links.ts"],
    { cwd: root, encoding: "utf8" },
  );
  const first = log.status === 0 ? log.stdout.trim().split("\n").filter(Boolean).pop() : undefined;
  ref = first ? `${first}^` : "HEAD";
}

let old = null;
const show = spawnSync("git", ["show", `${ref}:src/core/markdown/links.ts`], { cwd: root, encoding: "utf8" });
if (show.status === 0) {
  old = await load(show.stdout, join(root, "src/core/markdown"), `links@${ref}.ts`);
} else if (refGiven) {
  console.error(`${ref}:src/core/markdown/links.ts okunamadı`);
  process.exit(2);
} else {
  console.error(`(Git deposu değil — eski kural karşılaştırması atlandı)`);
}

// — Kasayı dolaş (tauriBackend.walk ile aynı: nokta ile başlayanlar atlanır) —
const notes = [];
const contents = {};
function walk(dirAbs, relDir) {
  for (const e of readdirSync(dirAbs, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    if (e.isDirectory()) walk(join(dirAbs, e.name), rel);
    else if (/\.md$/i.test(e.name)) notes.push({ path: rel, name: e.name.replace(/\.md$/i, ""), kind: "note" });
    else if (/\.excalidraw$/i.test(e.name))
      notes.push({ path: rel, name: e.name.replace(/\.excalidraw$/i, ""), kind: "draw" });
  }
}
walk(vault, "");
for (const n of notes) contents[n.path] = readFileSync(join(vault, n.path), "utf8");

const pairKey = (a, b) => (a < b ? `${a}→${b}` : `${b}→${a}`);
const drawCount = notes.filter((n) => n.kind === "draw").length;

console.log(`\n# Graf kenar analizi — ${vault}`);
console.log(`Not: ${notes.length - drawCount} · çizim (.excalidraw): ${drawCount}`);

// — Eski kural (HEAD GraphScreen.buildGraph ile aynı) —
/** Kenar anahtarı → { kind, from, target, codeOnly, fromDraw } */
let oldEdges = null;
if (old) {
  oldEdges = new Map();
  const byName = new Map(notes.map((n) => [n.name, n.path]));
  const add = (a, b, info) => {
    if (a === b) return;
    const k = pairKey(a, b);
    const prev = oldEdges.get(k);
    // Aynı çift iki yönden gelebilir: kenar ancak her iki yönde de yalnız koddansa "kod içi".
    if (!prev) oldEdges.set(k, info);
    else if (prev.kind === "wiki") prev.codeOnly = prev.codeOnly && !!info.codeOnly;
  };
  for (const n of notes) {
    const raw = contents[n.path];
    // Kod dışında da geçen hedefler — kalanı yalnız koddan gelmiş demektir.
    const outside = new Set(n.kind === "note" ? old.extractWikiLinks(cur.stripCode(raw)) : []);
    for (const t of old.extractWikiLinks(raw)) {
      const to = byName.get(t);
      if (to) add(n.path, to, { kind: "wiki", from: n.path, target: t, fromDraw: n.kind === "draw", codeOnly: n.kind === "note" && !outside.has(t) });
    }
  }
  for (const n of notes)
    for (const tag of old.extractTags(contents[n.path])) add(n.path, "#" + tag, { kind: "tag", from: n.path, target: "#" + tag });

  const vals = [...oldEdges.values()];
  const count = (f) => vals.filter(f).length;
  console.log(`\n## Eski kural (${ref}, varsayılan: etiketler açık)`);
  console.log(`Toplam kenar: ${vals.length}`);
  console.log(`  [[wiki]] not→not: ${count((v) => v.kind === "wiki")}`);
  console.log(`    · yalnız kod bloğu/satır içi koddan: ${count((v) => v.kind === "wiki" && v.codeOnly)}`);
  console.log(`    · çizim (.excalidraw) JSON'undan: ${count((v) => v.kind === "wiki" && v.fromDraw)}`);
  const tagUse = new Map();
  for (const v of vals) if (v.kind === "tag") tagUse.set(v.target, (tagUse.get(v.target) ?? 0) + 1);
  console.log(`  not→#etiket: ${count((v) => v.kind === "tag")} (etiket düğümü: ${tagUse.size})`);
  const topTags = [...tagUse].sort((a, b) => b[1] - a[1]).slice(0, sampleCount);
  if (topTags.length) console.log(`    · en çok çizgi çeken: ${topTags.map(([t, c]) => `${t} ${c}`).join(", ")}`);
  const codeSamples = vals.filter((v) => v.codeOnly).slice(0, sampleCount);
  if (codeSamples.length) {
    console.log(`  Kod içinden gelen kenar örnekleri:`);
    for (const v of codeSamples) {
      const line = contents[v.from].split(/\r?\n/).findIndex((l) => l.includes("[[" + v.target));
      console.log(`    - ${v.from}${line >= 0 ? ":" + (line + 1) : ""} → [[${v.target}]]`);
    }
  }
}

// — Yeni kural —
const defaults = cur.GRAPH_OPTION_DEFAULTS;
const model = cur.buildGraphModel(notes, contents, defaults);
const withGhosts = cur.buildGraphModel(notes, contents, { ...defaults, ghosts: true });
const withTags = cur.buildGraphModel(notes, contents, { ...defaults, tags: true });
const newEdges = new Map(model.links.map((l) => [pairKey(l.source, l.target), l.kind]));
const byKind = (links, k) => links.filter((l) => l.kind === k).length;

console.log(`\n## Yeni kural (varsayılan: ${JSON.stringify(defaults)})`);
console.log(`Toplam kenar: ${model.links.length}`);
console.log(`  [[wiki]]: ${byKind(model.links, "wiki")}`);
console.log(`  markdown [metin](not.md): ${byKind(model.links, "markdown")}`);
console.log(`  etiket: ${byKind(model.links, "tag")}`);
console.log(`Bağlantısız not: ${model.nodes.filter((n) => n.kind === "note" && n.deg === 0).length}`);
console.log(`Anahtarla açılınca — "Var olmayan notlar": +${withGhosts.ghostCount} düğüm, +${withGhosts.links.length - model.links.length} kenar · "Etiketler": +${withTags.tagCount} düğüm, +${byKind(withTags.links, "tag")} kenar`);

// — Çözülemeyen hedefler (hayalet adayları) —
const ghostDeg = withGhosts.nodes.filter((n) => n.kind === "ghost").sort((a, b) => b.deg - a.deg);
console.log(`\n## Çözülemeyen hedefler (var olmayan not): ${ghostDeg.length}`);
for (const g of ghostDeg.slice(0, sampleCount)) console.log(`  - ${g.name} (${g.deg} not)`);
if (ghostDeg.length > sampleCount) console.log(`  … ${ghostDeg.length - sampleCount} tane daha`);

// — Aynı adlı notlar —
const names = new Map();
for (const n of notes) names.set(n.name, [...(names.get(n.name) ?? []), n.path]);
const dupes = [...names.values()].filter((p) => p.length > 1);
console.log(`\n## Aynı adlı notlar: ${dupes.length}`);
for (const p of dupes.slice(0, sampleCount)) console.log(`  - ${p.join(" · ")}`);

// — Markdown bağlantı türleri (kod dışı) —
const MD_ANY = /(!?)\[(?!\[)[^\]\n]*\]\(\s*<?([^)\s>]*)/g;
const md = { image: 0, external: 0, anchor: 0, note: 0 };
const isAttachment = (h) => /\.(png|jpe?g|gif|webp|svg|pdf|mp3|wav|m4a|mp4|mov)$/i.test(h);
let mdResolved = 0;
const schemes = new Map();
for (const n of notes) {
  if (n.kind !== "note") continue;
  for (const m of cur.stripCode(contents[n.path]).matchAll(MD_ANY)) {
    const href = m[2];
    if (m[1] === "!") md.image++;
    else if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) {
      md.external++;
      const s = href.startsWith("//") ? "//" : href.split(":")[0].toLowerCase();
      schemes.set(s, (schemes.get(s) ?? 0) + 1);
    } else if (href.startsWith("#")) md.anchor++;
    else if (href) md.note++;
  }
  mdResolved += cur.extractMarkdownLinks(contents[n.path]).filter((h) => !isAttachment(h)).length;
}
console.log(`\n## Markdown bağlantıları (kod dışı)`);
console.log(`  dış adres: ${md.external} (${[...schemes].map(([s, c]) => `${s}: ${c}`).join(", ") || "-"}) — kenar üretmez`);
console.log(`  resim gömüsü: ${md.image} · yalnız çapa: ${md.anchor} — kenar üretmez`);
console.log(`  göreli yol hedefli: ${md.note} (ek dosyası olmayan ${mdResolved}) — kasada notu bulunanlar kenar olur`);

// — İki kural arasındaki fark —
if (oldEdges) {
  const onlyOld = [...oldEdges].filter(([k]) => !newEdges.has(k));
  const onlyNew = [...newEdges].filter(([k]) => !oldEdges.has(k));
  const common = [...newEdges.keys()].filter((k) => oldEdges.has(k)).length;
  const cnt = (arr, f) => arr.filter(f).length;
  console.log(`\n## Fark (eski varsayılan → yeni varsayılan)`);
  console.log(`Ortak: ${common} · yalnız eskide (artık çizilmeyen): ${onlyOld.length} · yalnız yenide: ${onlyNew.length}`);
  console.log(`  Kalkanlar (ayrık): etiket ${cnt(onlyOld, ([, v]) => v.kind === "tag")} · kod içi [[ ]] ${cnt(onlyOld, ([, v]) => v.codeOnly)} · çizim JSON ${cnt(onlyOld, ([, v]) => v.fromDraw)} · diğer ${cnt(onlyOld, ([, v]) => v.kind === "wiki" && !v.codeOnly && !v.fromDraw)}`);
  console.log(`  Eklenenler: [[wiki]] ${cnt(onlyNew, ([, k]) => k === "wiki")} (Türkçe harf/yol/takma ad çözümü) · markdown ${cnt(onlyNew, ([, k]) => k === "markdown")}`);
  const otherOld = onlyOld.filter(([, v]) => v.kind === "wiki" && !v.codeOnly && !v.fromDraw).slice(0, sampleCount);
  if (otherOld.length) {
    console.log(`  Kalkan diğer kenar örnekleri:`);
    for (const [k, v] of otherOld) console.log(`    - ${k} ([[${v.target}]])`);
  }
  if (onlyNew.length) {
    console.log(`  Eklenen kenar örnekleri:`);
    for (const [k, kind] of onlyNew.slice(0, sampleCount)) console.log(`    - ${k} (${kind})`);
  }
}

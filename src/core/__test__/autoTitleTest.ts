// Adsız notun dosya adının ilk başlıktan otomatik gelmesinin node testi (LOM-76).
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır; cwd depo köküdür.
//
// Saf yardımcılar (autoTitle.ts) doğrudan çağrılır; depo ve editör bağlantısı kaynak metin
// üzerinden denetlenir (React/Tauri kurulumu gerektirmeden).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  autoNameTarget,
  firstHeading,
  freeName,
  headingFileName,
  isAutoName,
} from "../markdown/autoTitle";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/** `start` ile başlayan bloğu ilk `end`e kadar döndürür (yoksa boş). */
function block(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return j < 0 ? "" : src.slice(i, j + end.length);
}

// ── Saf yardımcılar ──
check("başlık: '# Linkler' → Linkler", autoNameTarget("Adsız", "# Linkler\n\nmetin") === "Linkler");
check("başlık: satır indeksi", firstHeading("a\n\n## İki")?.line === 2);
const fm = "---\ntitle: x\n# değil\n---\n# Gerçek\n";
check("frontmatter atlanır", firstHeading(fm)?.text === "Gerçek", JSON.stringify(firstHeading(fm)));
const code = "```\n# yorum\n```\n# Asıl\n";
check("kod bloğu atlanır", firstHeading(code)?.text === "Asıl", JSON.stringify(firstHeading(code)));
check("~~~ kod bloğu atlanır", firstHeading("~~~\n# x\n~~~\n# Y")?.text === "Y");
check("kapanış #'ları atılır", firstHeading("# Başlık ##")?.text === "Başlık");
check("#etiket başlık sayılmaz", firstHeading("#etiket\n# B")?.text === "B");
check("vurgu temizlenir", headingFileName("**Kalın** _eğik_ ~~çizik~~ `kod`") === "Kalın eğik çizik kod");
check("[[a|b]] → b", headingFileName("[[Hedef|Görünen]] not") === "Görünen not");
check("[[a]] → a", headingFileName("[[Hedef]]") === "Hedef");
check("[t](u) → t", headingFileName("[Site](https://x.y/z)") === "Site");
check(
  "yasak karakterler silinir",
  headingFileName('a/b\\c:d*e?f"g<h>i|j') === "abcdefghij",
  headingFileName('a/b\\c:d*e?f"g<h>i|j'),
);
check("baş/son nokta kırpılır", headingFileName("..gizli.") === "gizli");
check("boşluklar tekleşir", headingFileName("  a   b  ") === "a b");
const long = "x".repeat(120);
check("80 karakterde kesilir", headingFileName(long).length === 80);
check("yalnız yasak karakter → ad değişmez", autoNameTarget("Adsız", "# ///:::") === null);
check("başlıksız içerik → null", autoNameTarget("Adsız", "yalnız metin\n") === null);
check("boş başlık → null", autoNameTarget("Adsız", "#\n") === null);
check("aynı ad → null", autoNameTarget("Linkler", "# Linkler") === null);
check("yeni not içeriği (# Adsız) → null", autoNameTarget("Adsız", "# Adsız\n\n") === null);
check("isAutoName('Adsız')", isAutoName("Adsız"));
check("isAutoName('Adsız 3')", isAutoName("Adsız 3"));
check("isAutoName('Linkler') yanlış", !isAutoName("Linkler"));
check("isAutoName('Adsız not') yanlış", !isAutoName("Adsız not"));
const taken = new Set(["Linkler"]);
check("freeName boşsa aynı", freeName("Yeni", (n) => taken.has(n)) === "Yeni");
check("freeName çakışmada 'Linkler 2'", freeName("Linkler", (n) => taken.has(n)) === "Linkler 2");
taken.add("Linkler 2");
check("freeName 'Linkler 3'", freeName("Linkler", (n) => taken.has(n)) === "Linkler 3");

// ── Depo (useAppStore) ──
const store = read("src/store/useAppStore.ts");
const newNote = block(store, "newNote: async (folder) => {", "\n    },");
check("newNote autoNamed.add çağırır", newNote.includes("autoNamed.add("));
const newFolder = block(store, "newFolder: async () => {", "\n    },");
check("newFolder autoNamed.add çağırır", newFolder.includes("autoNamed.add("));
const rename = block(store, "renameNote: async (path, newName, opts) => {", "\n    },");
check("renameNote auto seçeneğini tanır", /opts\?\.auto === true/.test(rename));
check("renameNote elle adda takibi bitirir", /if \(!auto\) autoNamed\.delete\(path\)/.test(rename));
check(
  "renameNote auto'da çakışma penceresi açmaz",
  /if \(!auto\) await notifyError\(i18n\.t\("errors\.noteExists"/.test(rename),
);
check("renameNote yeni yolu döndürür", rename.includes("return to;"));
const movedAt = rename.indexOf("activeNote: st.activeNote === path ? to : st.activeNote");
const linksAt = rename.indexOf("rewriteWikiLinks(c, note.name, clean)");
check(
  "renameNote durumu bağlantı yazımından önce taşır (eski yola kayıt olmaz)",
  movedAt > 0 && linksAt > movedAt,
);
check("renameNote listeyi de hemen günceller", rename.includes("notes: st.notes.map((n) => (n.path === path ? { ...n, path: to, name: clean } : n))"));
const autoName = block(store, "autoNameNote: async (path, onBeforeRename) => {", "\n    },");
check("autoNameNote bulundu", autoName.length > 0);
check("autoNameNote draftConflict'te bekler", /draftConflict\?\.path === path\) return null/.test(autoName));
check(
  "autoNameNote kaydedilmemiş taslakta bekler",
  /s\.draftPath === path && s\.draft !== s\.noteContents\[path\]\) return null/.test(autoName),
);
check("autoNameNote yalnız Adsız/takipli notta", /!autoNamed\.has\(path\) && !isAutoName\(note\.name\)/.test(autoName));
check("autoNameNote diskte de çakışma arar", autoName.includes("backend.exists("));
check("autoNameNote auto ile adlandırır", autoName.includes("renameNote(path, name, { auto: true })"));
check("autoNameNote şablonlara dokunmaz", autoName.includes("TEMPLATES_DIR"));
check("kasa değişince takip temizlenir", store.includes("autoNamed.clear()"));
const renameFolder = block(store, "renameFolder: async (folderPath, newName) => {", "\n    },");
check("renameFolder takibi taşır", /if \(autoNamed\.delete\(n\.path\)\) autoNamed\.add\(np\)/.test(renameFolder));

// ── Editör ──
const ed = read("src/screens/Editor/EditorScreen.tsx");
check("editör 1500 ms sonra dener", /autoNameNote\(activeNote,[\s\S]*?\}, 1500\)/.test(ed));
check("editör başlık satırındayken bekler", ed.includes("lineAt(head).number - 1 === h.line) return;"));
check("editör mobilde odaklıyken bekler", /view\.hasFocus\) \{\s*if \(isMobile\) return;/.test(ed));
check("editör nottan ayrılınca dener", ed.includes("autoNameNote(left)"));
check("okuma moduna geçince dener", /await saveNote\(\);[\s\S]{0,200}autoNameNote\(activeNote\)/.test(ed));
check("imleç geri verilir", ed.includes("restore ? restore.pos"));
check("imleç kurulumdan önce canlı okunur", ed.includes("restore.pos = old.state.selection.main.head;"));
check("odak geri verilir", ed.includes("focusOnMount={restore ? restore.focus : true}"));
const cm = read("src/screens/Editor/CodeMirrorEditor.tsx");
check("CodeMirrorEditor focusOnMount'u uygular", cm.includes("!mobileRef.current && focusOnMount"));
check("CodeMirrorEditor imleci seçim olarak koyar", cm.includes("selection: { anchor: caret }"));

console.log(`\n${ran - fails}/${ran} kontrol geçti`);
if (fails > 0) process.exit(1);

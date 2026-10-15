/**
 * Editör bağlam menüsünün (sağ tık / uzun basma) node testi — `npm test` ile koşar (LOM-36).
 *
 * Kapsam: menüdeki her komutun seçili ve seçimsiz durumda ürettiği metin (sahte görünümle,
 * gerçek CodeMirror EditorState üzerinde), pano komutlarının sahte panoyla davranışı ve panoya
 * erişilemeyince kullanıcıya haber vermesi, menü modeli (alt öğeler, yeniden boyutlanma kuralı,
 * ekrana kenetleme, dokunma kapısı, activate) ve menü metinlerinin üç dilde eksiksiz olması.
 * DOM gerektirmez.
 */
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import * as cmd from "../../screens/Editor/editorCommands";
import type { ClipboardIO } from "../../screens/Editor/editorCommands";
import {
  MENU,
  subItems,
  findNode,
  runCommand,
  viewportChangeAction,
  clampMenuPosition,
  createActivationGate,
  activate,
  type MenuNode,
} from "../../screens/Editor/contextMenuModel";
import tr from "../../i18n/locales/tr/translation.json";
import en from "../../i18n/locales/en/translation.json";
import ar from "../../i18n/locales/ar/translation.json";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  check(name, g === w, g === w ? "" : `beklenen ${w}, gelen ${g}`);
}

/**
 * Sahte görünüm. Metindeki "[...]" seçimi, "|" imleci gösterir (işaretler belgeden çıkarılır).
 * Komutlar yalnız state / dispatch / focus kullanır.
 */
function mk(marked: string) {
  let from: number;
  let to: number;
  let doc: string;
  const bar = marked.indexOf("|");
  if (bar >= 0) {
    doc = marked.slice(0, bar) + marked.slice(bar + 1);
    from = to = bar;
  } else {
    const a = marked.indexOf("[");
    const b = marked.lastIndexOf("]");
    if (a < 0 || b < 0) throw new Error("işaret yok: " + marked);
    doc = marked.slice(0, a) + marked.slice(a + 1, b) + marked.slice(b + 1);
    from = a;
    to = b - 1;
  }
  let state = EditorState.create({ doc, selection: EditorSelection.single(from, to) });
  let focused = 0;
  const v = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
    focus() {
      focused++;
    },
  } as unknown as EditorView;
  return {
    v,
    doc: () => state.doc.toString(),
    sel: () => [state.selection.main.from, state.selection.main.to],
    focused: () => focused,
  };
}

/** Komutu çalıştır, belge + seçimi döndür. */
function run(marked: string, f: (v: EditorView) => unknown) {
  const t = mk(marked);
  f(t.v);
  return { doc: t.doc(), sel: t.sel(), focused: t.focused() };
}

/** Komutu iki kez çalıştır (aç-kapa). */
function twice(marked: string, f: (v: EditorView) => unknown) {
  const t = mk(marked);
  f(t.v);
  f(t.v);
  return { doc: t.doc(), sel: t.sel() };
}

/** Sahte pano. */
function fakeClip(opts: { text?: string; readFails?: boolean; writeFails?: boolean; execOk?: boolean } = {}) {
  const log = { clip: opts.text ?? "", writes: 0, execs: 0, notes: [] as string[] };
  const io: ClipboardIO = {
    readText: () => (opts.readFails ? Promise.reject(new Error("izin yok")) : Promise.resolve(log.clip)),
    writeText: (s) => {
      log.writes++;
      if (opts.writeFails) return Promise.reject(new Error("izin yok"));
      log.clip = s;
      return Promise.resolve();
    },
    execCopy: () => {
      log.execs++;
      return opts.execOk ?? false;
    },
    notify: (k) => {
      log.notes.push(k);
    },
  };
  return { io, log };
}

async function main() {
  // --- Biçimlendirme: seçili ---
  for (const [name, f, m] of [
    ["Kalın", cmd.bold, "**"],
    ["İtalik", cmd.italic, "*"],
    ["Üstü çizili", cmd.strike, "~~"],
    ["Vurgu", cmd.highlight, "=="],
    ["Kod", cmd.inlineCode, "`"],
  ] as const) {
    const r = run("a [bc] d", f);
    eq(`${name} seçili: sarar`, r.doc, `a ${m}bc${m} d`);
    eq(`${name} seçili: seçim içte kalır`, r.sel, [2 + m.length, 4 + m.length]);
    check(`${name} seçili: editöre odak döner`, r.focused > 0);
    const back = twice("a [bc] d", f);
    eq(`${name} seçili: ikinci basış geri alır`, back.doc, "a bc d");
    eq(`${name} seçili: geri alınca seçim yerinde`, back.sel, [2, 4]);
    // Seçim işaretleri de içeriyorsa: içten kaldırır.
    eq(`${name} seçim işaretleri içeriyor: kaldırır`, run(`a [${m}bc${m}] d`, f).doc, "a bc d");
    // Seçimsiz: boş işaret çifti, imleç ortada.
    const e = run("a | d", f);
    eq(`${name} seçimsiz: boş işaret çifti`, e.doc, `a ${m}${m} d`);
    eq(`${name} seçimsiz: imleç işaretlerin arasında`, e.sel, [2 + m.length, 2 + m.length]);
  }

  // --- Kalın içinde italik (eskiden "**metin**" → "*metin*" oluyordu) ---
  eq("Kalın içinde italik: kalın+italik olur", run("**[metin]**", cmd.italic).doc, "***metin***");
  eq("Kalın içinde italik: seçim metinde", run("**[metin]**", cmd.italic).sel, [3, 8]);
  eq("Kalın+italikte italik: yalnız italik kalkar", run("***[metin]***", cmd.italic).doc, "**metin**");
  eq("Kalın+italikte kalın: yalnız kalın kalkar", run("***[metin]***", cmd.bold).doc, "*metin*");
  eq("İtalik içinde kalın: kalın+italik olur", run("*[metin]*", cmd.bold).doc, "***metin***");
  eq("Seçim kalını içeriyor, italik: kalın korunur", run("[**metin**]", cmd.italic).doc, "***metin***");
  eq("Seçim kalın+italik içeriyor, italik: kalın kalır", run("[***metin***]", cmd.italic).doc, "**metin**");
  eq("Seçim italik içeriyor, italik: kaldırır", run("[*metin*]", cmd.italic).doc, "metin");
  eq("Seçim kalın içeriyor, kalın: kaldırır", run("[**metin**]", cmd.bold).doc, "metin");
  eq("Kalın içinde italik iki kez: kalına döner", twice("**[metin]**", cmd.italic).doc, "**metin**");
  eq("Düz italik hâlâ geri alınır", run("x *[y]* z", cmd.italic).doc, "x y z");

  // --- Biçimlendirmeyi temizle ---
  eq("Temizle seçili: işaretler gider", run("[**a** *b* ~~c~~ ==d== `e`]", cmd.clearFormat).doc, "a b c d e");
  eq("Temizle seçili: seçim temiz metni kapsar", run("x [**a**] y", cmd.clearFormat).sel, [2, 3]);
  eq("Temizle seçimsiz: belge değişmez", run("**a**| b", cmd.clearFormat).doc, "**a** b");

  // --- Paragraf: başlıklar ---
  for (let n = 1; n <= 6; n++) {
    const h = "#".repeat(n) + " ";
    eq(`Başlık ${n} seçimsiz`, run("met|in", (v) => cmd.heading(v, n)).doc, `${h}metin`);
    eq(`Başlık ${n} seçili (iki satır)`, run("[a\nb]", (v) => cmd.heading(v, n)).doc, `${h}a\n${h}b`);
    eq(`Başlık ${n} var olan başlığın yerine`, run("## met|in", (v) => cmd.heading(v, n)).doc, `${h}metin`);
  }
  eq("Başlıksız: başlık işaretini kaldırır", run("### met|in", (v) => cmd.heading(v, 0)).doc, "metin");
  eq("Başlıksız seçili iki satır", run("[# a\n## b]", (v) => cmd.heading(v, 0)).doc, "a\nb");
  eq("Başlıksız: başlık olmayan satıra dokunmaz", run("met|in", (v) => cmd.heading(v, 0)).doc, "metin");
  eq("Boş satıra Başlık 1", run("|", (v) => cmd.heading(v, 1)).doc, "# ");

  // --- Paragraf: listeler ve alıntı (aç-kapa) ---
  for (const [name, f, p] of [
    ["Madde listesi", cmd.bulletList, "- "],
    ["Numaralı liste", cmd.numberedList, "1. "],
    ["İşaretli liste", cmd.checklist, "- [ ] "],
    ["Alıntı", cmd.quote, "> "],
  ] as const) {
    eq(`${name} seçimsiz`, run("met|in", f).doc, `${p}metin`);
    eq(`${name} seçimsiz iki kez: geri alır`, twice("met|in", f).doc, "metin");
    eq(`${name} seçili iki satır`, run("[a\nb]", f).doc, `${p}a\n${p}b`);
    eq(`${name} seçili iki satır iki kez`, twice("[a\nb]", f).doc, "a\nb");
    eq(`${name} boş satır`, run("|", f).doc, p);
  }

  // --- Bağlantılar ---
  eq("Bağlantı seçili", run("x [y] z", cmd.wikilink).doc, "x [[y]] z");
  eq("Bağlantı seçili: seçim adda", run("x [y] z", cmd.wikilink).sel, [4, 5]);
  eq("Bağlantı seçimsiz", run("x | z", cmd.wikilink).doc, "x [[]] z");
  eq("Bağlantı seçimsiz: imleç köşeli parantezlerin içinde", run("x | z", cmd.wikilink).sel, [4, 4]);
  eq("Dış bağlantı seçili", run("x [abc] z", cmd.externalLink).doc, "x [abc](url) z");
  eq("Dış bağlantı seçili: seçim metinde", run("x [abc] z", cmd.externalLink).sel, [3, 6]);
  eq("Dış bağlantı seçimsiz: yer tutucu", run("x | z", cmd.externalLink).doc, "x [metin](url) z");
  eq("Dış bağlantı seçimsiz: yer tutucu seçili", run("x | z", cmd.externalLink).sel, [3, 8]);

  // --- Ekle ---
  const TBL = "| Başlık | Başlık |\n| --- | --- |\n|  |  |";
  for (const [name, f, text, caretIn] of [
    ["Tablo", cmd.table, TBL, undefined],
    ["Yatay çizgi", cmd.hr, "---", undefined],
    ["Kod bloğu", cmd.codeBlock, "```\n\n```", 4],
    ["Çağrı", cmd.callout, "> [!note]\n> ", 12],
  ] as const) {
    const want = `metin\n\n${text}\n`;
    const caret = caretIn == null ? want.length : "metin\n\n".length + caretIn;
    const a = run("metin|", f);
    eq(`${name} seçimsiz (paragraf sonu): paragrafın altına`, a.doc, want);
    eq(`${name} seçimsiz: imleç yerinde`, a.sel, [caret, caret]);
    const b = run("met|in", f);
    eq(`${name} paragraf ortasında: paragrafı bölmez`, b.doc, want);
    const c = run("[metin]", f);
    eq(`${name} seçili: seçili metin silinmez, blok altına`, c.doc, want);
    eq(`${name} seçili: imleç yerinde`, c.sel, [caret, caret]);
    const d = run("|", f);
    eq(`${name} boş belge`, d.doc, `${text}\n`);
  }

  // --- Tümünü seç ---
  eq("Tümünü seç seçimsiz", run("ab|c\nd", cmd.selectAll).sel, [0, 5]);
  eq("Tümünü seç seçili", run("a[b]c", cmd.selectAll).sel, [0, 3]);
  eq("Tümünü seç belgeyi değiştirmez", run("a[b]c", cmd.selectAll).doc, "abc");

  // --- Pano ---
  {
    const { io, log } = fakeClip();
    const t = mk("a [bc] d");
    eq("Kopyala seçili: sonuç", await cmd.copy(t.v, io), "ok");
    eq("Kopyala seçili: panoda seçim", log.clip, "bc");
    eq("Kopyala seçili: belge değişmez", t.doc(), "a bc d");
    check("Kopyala seçili: odak editörde", t.focused() > 0);
  }
  {
    const { io, log } = fakeClip({ text: "eski" });
    const t = mk("a | d");
    eq("Kopyala seçimsiz: sonuç empty", await cmd.copy(t.v, io), "empty");
    eq("Kopyala seçimsiz: pano değişmez", log.clip, "eski");
    eq("Kopyala seçimsiz: panoya yazılmaz", log.writes, 0);
  }
  {
    const { io, log } = fakeClip({ writeFails: true, execOk: true });
    const t = mk("a [bc] d");
    eq("Kopyala: API reddedince eski yol dener", await cmd.copy(t.v, io), "ok");
    eq("Kopyala: eski yol bir kez çağrıldı", log.execs, 1);
    eq("Kopyala: eski yol çalışınca haber yok", log.notes, []);
  }
  {
    const { io, log } = fakeClip({ writeFails: true, execOk: false });
    const t = mk("a [bc] d");
    eq("Kopyala: pano yoksa unavailable", await cmd.copy(t.v, io), "unavailable");
    eq("Kopyala: pano yoksa kullanıcıya haber", log.notes, ["copyUnavailable"]);
  }
  {
    const { io, log } = fakeClip();
    const t = mk("a [bc] d");
    eq("Kes seçili: sonuç", await cmd.cut(t.v, io), "ok");
    eq("Kes seçili: panoda seçim", log.clip, "bc");
    eq("Kes seçili: belgeden silinir", t.doc(), "a  d");
  }
  {
    const { io, log } = fakeClip({ text: "eski" });
    const t = mk("a | d");
    eq("Kes seçimsiz: sonuç empty", await cmd.cut(t.v, io), "empty");
    eq("Kes seçimsiz: belge değişmez", t.doc(), "a  d");
    eq("Kes seçimsiz: pano değişmez", log.clip, "eski");
  }
  {
    const { io, log } = fakeClip({ writeFails: true, execOk: false });
    const t = mk("a [bc] d");
    eq("Kes: pano yoksa unavailable", await cmd.cut(t.v, io), "unavailable");
    eq("Kes: pano yoksa metin silinmez (veri kaybı yok)", t.doc(), "a bc d");
    eq("Kes: pano yoksa kullanıcıya haber", log.notes, ["copyUnavailable"]);
  }
  {
    const { io } = fakeClip({ writeFails: true, execOk: true });
    const t = mk("a [bc] d");
    eq("Kes: eski yolla kopyalanınca siler", await cmd.cut(t.v, io), "ok");
    eq("Kes: eski yolla belge", t.doc(), "a  d");
  }
  {
    const { io } = fakeClip({ text: "XY" });
    const t = mk("a [bc] d");
    eq("Yapıştır seçili: sonuç", await cmd.paste(t.v, io), "ok");
    eq("Yapıştır seçili: seçimin yerine", t.doc(), "a XY d");
    eq("Yapıştır seçili: imleç sonda", t.sel(), [4, 4]);
  }
  {
    const { io } = fakeClip({ text: "XY" });
    const t = mk("a | d");
    eq("Yapıştır seçimsiz: sonuç", await cmd.paste(t.v, io), "ok");
    eq("Yapıştır seçimsiz: imlece eklenir", t.doc(), "a XY d");
    eq("Yapıştır seçimsiz: imleç sonda", t.sel(), [4, 4]);
  }
  {
    const { io, log } = fakeClip({ readFails: true });
    const t = mk("a [bc] d");
    eq("Yapıştır izin yok: unavailable", await cmd.paste(t.v, io), "unavailable");
    eq("Yapıştır izin yok: belge değişmez", t.doc(), "a bc d");
    eq("Yapıştır izin yok: kullanıcıya haber (sessiz değil)", log.notes, ["pasteUnavailable"]);
  }
  {
    const { io, log } = fakeClip({ text: "" });
    const t = mk("a | d");
    eq("Yapıştır boş pano: empty", await cmd.paste(t.v, io), "empty");
    eq("Yapıştır boş pano: belge değişmez", t.doc(), "a  d");
    eq("Yapıştır boş pano: hata mesajı yok", log.notes, []);
  }
  {
    // Node'da navigator.clipboard yok: varsayılan adaptör patlamamalı, unavailable dönmeli.
    const notes: string[] = [];
    const t = mk("a | d");
    eq("Yapıştır API yok: unavailable", await cmd.paste(t.v, { notify: (k) => notes.push(k) }), "unavailable");
    eq("Yapıştır API yok: haber", notes, ["pasteUnavailable"]);
    const t2 = mk("a [bc] d");
    eq("Kopyala API yok: unavailable", await cmd.copy(t2.v, { notify: (k) => notes.push(k) }), "unavailable");
  }

  // --- Model: menü ağacı ---
  eq("Ekle alt öğeleri", subItems("ins"), ["tbl", "cal", "hr", "cb"]);
  eq("Biçimlendirme alt öğeleri", subItems("fmt"), ["b", "i", "st", "hl", "code", "clr"]);
  eq("Paragraf alt öğeleri", subItems("para"), ["ul", "ol", "cl", "h1", "h2", "h3", "h4", "h5", "h6", "h0", "q"]);
  eq("Yaprak öğenin alt öğesi yok", subItems("cut"), []);
  eq(
    "Üst düzey sıra",
    MENU.filter((n) => !n.sep).map((n) => n.id),
    ["wlink", "elink", "fmt", "para", "ins", "cut", "copy", "paste", "selall"]
  );
  const leaves: MenuNode[] = [];
  const walk = (ns: MenuNode[]) =>
    ns.forEach((n) => (n.children ? walk(n.children) : !n.sep && leaves.push(n)));
  walk(MENU);
  check("Her yaprak öğenin komutu var", leaves.every((n) => !!n.command), leaves.filter((n) => !n.command).map((n) => n.id).join(","));
  check("Grupların komutu yok", MENU.filter((n) => n.children).every((n) => !n.command));
  const ids = [...MENU, ...MENU.flatMap((n) => n.children ?? [])].map((n) => n.id);
  eq("Kimlikler tekil", ids.length, new Set(ids).size);

  // runCommand: menüdeki her yaprak öğe gerçekten bir komut çalıştırır.
  const expected: Record<string, string> = {
    wlink: "[[metin]]",
    elink: "[metin](url)",
    b: "**metin**",
    i: "*metin*",
    st: "~~metin~~",
    hl: "==metin==",
    code: "`metin`",
    clr: "metin",
    ul: "- metin",
    ol: "1. metin",
    cl: "- [ ] metin",
    h1: "# metin",
    h2: "## metin",
    h3: "### metin",
    h4: "#### metin",
    h5: "##### metin",
    h6: "###### metin",
    h0: "metin",
    q: "> metin",
    tbl: `metin\n\n${TBL}\n`,
    cal: "metin\n\n> [!note]\n> \n",
    hr: "metin\n\n---\n",
    cb: "metin\n\n```\n\n```\n",
    cut: "",
    copy: "metin",
    paste: "PANO",
    selall: "metin",
  };
  for (const n of leaves) {
    const { io } = fakeClip({ text: "PANO" });
    const t = mk("[metin]");
    await runCommand(t.v, n, io);
    eq(`Menü öğesi '${n.id}' komutu`, t.doc(), expected[n.id]);
  }
  check("Beklenen tablo her yaprağı kapsar", leaves.every((n) => n.id in expected));
  eq("findNode alt öğeyi bulur", findNode("tbl")?.command, "table");
  eq("findNode başlık düzeyi", findNode("h4")?.arg, 4);

  // --- Model: yeniden boyutlanma ---
  eq("Yalnız yükseklik (klavye) değişince kapanmaz", viewportChangeAction({ w: 375, h: 667 }, { w: 375, h: 360 }), "reclamp");
  eq("Klavye kapanınca (yükseklik artar) kapanmaz", viewportChangeAction({ w: 375, h: 360 }, { w: 375, h: 667 }), "reclamp");
  eq("Genişlik değişince kapanır", viewportChangeAction({ w: 375, h: 667 }, { w: 667, h: 375 }), "close");
  eq("Değişiklik yoksa hiçbir şey", viewportChangeAction({ w: 375, h: 667 }, { w: 375, h: 667 }), "none");

  // --- Model: ekrana kenetleme ---
  eq(
    "Dar ekranda sağ alttan taşan menü içeri alınır",
    clampMenuPosition({ x: 300, y: 600, w: 220, h: 400, vw: 375, vh: 667 }),
    { left: 147, top: 259 }
  );
  eq("Sol üst kenarda boşluk korunur", clampMenuPosition({ x: 2, y: 1, w: 220, h: 300, vw: 375, vh: 667 }), { left: 8, top: 8 });
  eq("Sığan menü yerinde kalır", clampMenuPosition({ x: 50, y: 60, w: 220, h: 300, vw: 1200, vh: 800 }), { left: 50, top: 60 });
  {
    const p = clampMenuPosition({ x: 100, y: 500, w: 240, h: 900, vw: 375, vh: 667 });
    eq("Ekrandan uzun menünün üstü görünür kalır", p.top, 8);
  }
  {
    // Klavye açılınca (667 → 360) yeniden kenetleme menüyü yeni alanın içine alır.
    const p = clampMenuPosition({ x: 40, y: 300, w: 220, h: 200, vw: 375, vh: 360 });
    check("Klavye sonrası menü görünür alanda", p.top + 200 <= 360 - 8, JSON.stringify(p));
  }

  // --- Model: dokunma kapısı ---
  {
    let now = 1000;
    const g = createActivationGate({ openedBy: "touch", now: () => now });
    check("Dokunma: parmak kalkmadan tıklama yok sayılır", !g.ready());
    now = 1399;
    check("Dokunma: 399 ms'de hâlâ kapalı", !g.ready());
    g.release();
    check("Dokunma: parmak kalkınca açılır", g.ready());
  }
  {
    let now = 0;
    const g = createActivationGate({ openedBy: "touch", now: () => now });
    now = 400;
    check("Dokunma: kalkış kaçsa da 400 ms sonra açılır", g.ready());
  }
  {
    const g = createActivationGate({ openedBy: "mouse", now: () => 0 });
    check("Fare: hemen hazır", g.ready());
  }

  // --- Model: activate ---
  {
    const t = mk("[metin]");
    let closed = 0;
    let seen: EditorView | null = null;
    const out = activate((v) => ((seen = v), 7), () => t.v, () => closed++);
    check("activate: komut görünümle çalışır", seen === t.v);
    eq("activate: komutun dönüşü", out, 7);
    eq("activate: menü kapanır", closed, 1);
  }
  {
    let closed = 0;
    let ran = 0;
    activate(() => ran++, () => null, () => closed++);
    eq("activate: görünüm yoksa komut çalışmaz", ran, 0);
    eq("activate: görünüm yoksa da kapanır", closed, 1);
  }
  {
    let closed = 0;
    let threw = false;
    try {
      activate(
        () => {
          throw new Error("x");
        },
        () => mk("|").v,
        () => closed++
      );
    } catch {
      threw = true;
    }
    check("activate: komut hata atsa da menü kapanır", threw && closed === 1);
  }
  {
    const t = mk("[metin]");
    let closed = 0;
    activate((v) => runCommand(v, findNode("b")!), () => t.v, () => closed++);
    eq("activate + Kalın: belge", t.doc(), "**metin**");
    eq("activate + Kalın: kapanır", closed, 1);
  }

  // --- Çeviri: menü metinleri üç dilde ---
  const langs: Record<string, unknown> = { tr, en, ar };
  const keys = new Set<string>(["ctx.pasteUnavailable", "ctx.copyUnavailable"]);
  const collect = (ns: MenuNode[]) =>
    ns.forEach((n) => {
      if (n.labelKey) keys.add(n.labelKey);
      if (n.children) collect(n.children);
    });
  collect(MENU);
  const lookup = (obj: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
  for (const [lang, data] of Object.entries(langs)) {
    const missing = [...keys].filter((k) => {
      const s = lookup(data, k);
      return typeof s !== "string" || s.trim() === "";
    });
    eq(`${lang}: menü metinleri eksiksiz (${keys.size} anahtar)`, missing, []);
    check(`${lang}: başlık metni düzey içerir`, String(lookup(data, "ctx.heading")).includes("{{n}}"));
  }

  console.log(`\n${fails === 0 ? "✅ TÜM TESTLER GEÇTİ" : `❌ ${fails} test başarısız`}`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

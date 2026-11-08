// Paylaş menüsünden gelen alıntı — saf (LOM-96).
//
// Telefonda başka bir uygulamada seçilen metin Loomen'a bir bağlantıyla gelir:
//   loomen://share?text=<metin>&subject=<konu>&app=<gönderen>
// Android'de Paylaş menüsünden gelen metni uygulamanın Android tarafı bu adrese çevirir (subject =
// EXTRA_SUBJECT, app = gönderen paket adı). iPhone/iPad'de Kısayol aynı adresi yalnız `text` ile açar.
//
// Metinden alıntı, kitap adı ve yazar ayıklanır (`parseSharedText`). Tanınan biçimler (örnekler
// testlerde: shareTest.ts):
//  - Kindle:            “alıntı” from Başlık by Yazar. Start reading it for free: https://a.co/…
//                       ya da “alıntı” + "— Yazar, Başlık" satırı (+ tanıtım bağlantısı)
//  - Apple Kitaplar:    “alıntı” + "Excerpt From" / "Alıntı:" + başlık + yazar satırları (+ telif satırı);
//                       eski tek satırlık "Excerpt From: Yazar. “Başlık.” Apple Books." de tanınır.
//  - Google Play Kitap: “alıntı” + "Başlık by Yazar" (ya da "Başlık - Yazar") + play.google bağlantısı
// Tanınmayan metinde metnin TAMAMI alıntı sayılır; konu (subject) varsa kitap adı odur.
//
// Kimlikler deterministiktir (tekrar koruması):
//  - Çizim: 's' + SHA-256(alıntı anahtarı) ilk 10 hane. Anahtar: işaretsiz, küçük harf, yalnız harf/rakam
//    ve tek boşluk — tırnak/noktalama farkı aynı alıntıyı ikinci kez ekletmez. Çift kayıt denetimi
//    kitabın BÜTÜN çizimlerinde (Kindle'dan ya da okuyucudan gelenler dahil) bu anahtarla yapılır.
//  - Raftaki kitapla eşleşmeyen başlık için açılan dosyasız kayıt: özeti
//    SHA-256("shared|" + normalleştirilmiş "başlık|yazar"), kimlik ilk 16 hane.

import { kindleBookKey } from "./kindle";
import { addHighlight, cleanQuote, newBook, newHighlightId, sha256Hex } from "./model";
import { DEFAULT_HIGHLIGHT_COLOR, SHARE_APPS, type Book, type Highlight, type ShareApp, type SharedAnchor } from "./types";

/** Paylaşım adresinin şeması ve konağı. */
export const SHARE_URL_PREFIX = "loomen://share";

/** Çok uzun metin (yanlışlıkla bütün bölüm) kırpılır. */
export const SHARE_TEXT_MAX = 20000;
const META_MAX = 200;

export interface SharePayload {
  /** Gelen metin (boş olabilir: çağıran "metin yok" der). */
  text: string;
  subject?: string;
  /** Gönderen uygulama ipucu (Android paket adı ya da Kısayol'un yazdığı ad), ham. */
  app?: string;
}

export interface ParsedShare {
  quote: string;
  title?: string;
  author?: string;
  /** Biçim ya da gönderen tanındıysa. */
  app?: ShareApp;
  /** Metinde sayfa geçiyorsa. */
  page?: number;
}

// ─── Adres ────────────────────────────────────────────────────────────────────────

/**
 * `loomen://share?...` adresini çöz. Paylaşım adresi değilse (kitap bağlantısı, Google giriş
 * dönüşü…) null. Metin boş olabilir.
 */
export function parseShareUrl(url: string): SharePayload | null {
  if (typeof url !== "string") return null;
  const m = /^loomen:\/\/share\/?(?:\?([^#]*))?(?:#.*)?$/i.exec(url.trim());
  if (!m) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(m[1] ?? "");
  } catch {
    return { text: "" };
  }
  const out: SharePayload = { text: (params.get("text") ?? "").slice(0, SHARE_TEXT_MAX) };
  const subject = params.get("subject")?.trim();
  if (subject) out.subject = subject.slice(0, META_MAX * 2);
  const app = params.get("app")?.trim();
  if (app) out.app = app.slice(0, META_MAX);
  return out;
}

/** Gönderen ipucunu (paket adı, ad ya da bağlantı) uygulamaya eşle; tanınmazsa undefined. */
export function shareAppFromHint(hint: string | undefined): ShareApp | undefined {
  if (!hint) return undefined;
  const s = hint.toLowerCase();
  if ((SHARE_APPS as readonly string[]).includes(s)) return s as ShareApp;
  if (/kindle|amazon|amzn|\ba\.co\b/.test(s)) return "kindle";
  if (/ibooks|books\.apple|apple\.co|apple ?books|com\.apple/.test(s)) return "applebooks";
  if (/play\.google|books\.google|google\.android\.apps\.books|play ?books/.test(s)) return "playbooks";
  return undefined;
}

/** Okuma uygulamasının bağlantısı mı? Yalnız alan adına bakılır (yoldaki "amazon" sayılmaz). */
export function shareUrlApp(url: string): ShareApp | undefined {
  const m = /^https?:\/\/([^/?#\s]+)/i.exec(url);
  if (!m) return undefined;
  const host = m[1].toLowerCase().replace(/:\d+$/, "");
  const is = (d: string) => host === d || host.endsWith("." + d);
  if (is("a.co") || /(^|\.)amzn\.[a-z.]+$/.test(host) || /(^|\.)amazon\.[a-z.]+$/.test(host)) return "kindle";
  if (is("books.apple.com") || is("apple.co") || is("itunes.apple.com")) return "applebooks";
  if (is("play.google.com") || /(^|\.)books\.google\.[a-z.]+$/.test(host) || is("g.co")) return "playbooks";
  return undefined;
}

// ─── Metin ayıklama ───────────────────────────────────────────────────────────────

const OPEN_Q = "“\"«„‘'「";
const CLOSE_Q = "”\"»“’'」";
const URL_RE = /https?:\/\/[^\s<>"”»]+/gi;
/** Kindle/Play tanıtım cümleleri (bağlantıdan önce). */
const PROMO_RE = /(?:start reading (?:it )?for free|read it for free|read more|ücretsiz (?:okumaya başla\p{L}*|oku\p{L}*)|daha fazla oku\p{L}*)\s*:?\s*$/iu;
/** Apple Kitaplar'ın sona eklediği telif satırı (yalnız satırın tamamı bu cümleyse atılır). */
const COPYRIGHT_RE = /^(?:this material may be protected by copyright|bu (?:materyal|içerik) telif hakk\p{L}* (?:ile |tarafından )?korunuyor olabilir|dieses material ist möglicherweise urheberrechtlich geschützt)\.?$/iu;
const APPLE_MARK_RE = /^(?:excerpt from|alıntı kaynağı|alıntı yeri|şu kitaptan alıntı|alıntı(?=\s*:|\s*$))\s*:?\s*(.*)$/i;
const PAGE_RE = /(?:^|[\s,(·—–-])(?:page|pages|p\.|pg\.|sayfa|s\.)\s*(\d{1,5})\b\)?/i;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const meta = (s: string | undefined): string | undefined => {
  const t = oneLine(s ?? "")
    .replace(/^[\s—–\-:,.]+/, "")
    .replace(/[\s,.;:]+$/, "");
  const u = stripQuotes(t).replace(/[\s,.;:]+$/, "");
  return u ? u.slice(0, META_MAX) : undefined;
};

/** Baştaki ve sondaki eş tırnakları sök (yalnız iki uçta da varsa). */
function stripQuotes(s: string): string {
  let t = s.trim();
  for (let i = 0; i < 2 && t.length >= 2; i++) {
    const a = OPEN_Q.indexOf(t[0]);
    const b = CLOSE_Q.indexOf(t[t.length - 1]);
    if (a < 0 || b < 0) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** Görünmez işaretleri ve satır sonlarını düzle; NFC. */
function prepare(text: string): string {
  return text
    .normalize("NFC")
    .replace(/^﻿/, "")
    .replace(/[​-‍⁠]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ");
}

/**
 * Tırnak içi metin. İçinde kapanıp yeniden açılan tırnak varsa ("“bir” ve “iki”") birden çok tırnaklı
 * parça vardır: dış tırnaklar da korunur, alıntı yarım tırnakla kalmaz.
 */
function inner(q: RegExpExecArray): string {
  const s = q[2].trim();
  if (/[”»"][\s\S]*[“«„"]/.test(s)) {
    const open = q[0].slice(q[1].length, q[1].length + 1);
    const close = q[0].charAt(q[0].length - q[3].length - 1);
    return (open + q[2] + close).trim();
  }
  return s;
}

/** "Başlık by Yazar" / "— Yazar, Başlık" / "Başlık - Yazar" / yalnız başlık. */
function parseMetaLine(raw: string, dashLed: boolean): { title?: string; author?: string } {
  const s = oneLine(raw).replace(/^(?:from|kaynak)\s*:?\s+/i, "");
  if (dashLed) {
    // Kindle: "— Yazar, Başlık" (başlıkta "by" geçebilir: önce virgül).
    const d = s.replace(/^[\s—–-]+/, "");
    const c = /^([^,]+),\s*(.+)$/.exec(d);
    if (c) return { author: meta(c[1]), title: meta(c[2]) };
  }
  // Son "by"da bölünür: "Stand by Me by Stephen King" → "Stand by Me" + "Stephen King".
  const by = /^(.+),?\s+by\s+(.+)$/i.exec(s);
  if (by) return { title: meta(by[1]), author: meta(by[2]) };
  if (dashLed) return { author: meta(s) };
  const d = /^(.+?)\s+[—–-]\s+(.+)$/.exec(s);
  if (d) return { title: meta(d[1]), author: meta(d[2]) };
  return { title: meta(s) };
}

function takePage(s: string): { rest: string; page?: number } {
  const m = PAGE_RE.exec(s);
  if (!m) return { rest: s };
  const n = Number(m[1]);
  return { rest: (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).trim(), page: n >= 1 ? n : undefined };
}

function cleanSubject(subject: string | undefined, quote: string): string | undefined {
  if (!subject) return undefined;
  let s = oneLine(prepare(subject));
  s = s.replace(/^(?:excerpt from|notes? from|highlights? from|alıntı kaynağı|alıntı|notlar)\s*:?\s*/i, "");
  s = s.replace(URL_RE, "").trim();
  const t = meta(s);
  if (!t) return undefined;
  // Bazı uygulamalar konuya da alıntının başını yazar: kitap adı sayılmaz.
  const q = oneLine(quote).toLowerCase();
  if (q && (q.startsWith(t.toLowerCase()) || t.toLowerCase().startsWith(q.slice(0, 40)))) return undefined;
  return t;
}

/**
 * Paylaşılan metinden alıntı, kitap adı ve yazar çıkar. Alıntı boşsa null. `subject` ve `appHint`
 * Android'in verdiği ek bilgilerdir (yoksa yalnız metin).
 */
export function parseSharedText(text: string, subject?: string, appHint?: string): ParsedShare | null {
  let app = shareAppFromHint(appHint);
  let body = prepare(String(text ?? "")).slice(0, SHARE_TEXT_MAX);

  // Bağlantılar: uygulama ipucu olarak okunur, metinden atılır (tanıtım cümlesiyle birlikte).
  const lines: string[] = [];
  for (const line of body.split("\n")) {
    if (COPYRIGHT_RE.test(line.trim())) {
      app ??= "applebooks";
      continue;
    }
    // Yalnız okuma uygulamalarının bağlantıları atılır; alıntının içindeki başka bağlantı kalır.
    const urls = (line.match(URL_RE) ?? []).filter((u) => shareUrlApp(u));
    if (!urls.length) {
      lines.push(line.trimEnd());
      continue;
    }
    for (const u of urls) app ??= shareUrlApp(u);
    let rest = line;
    for (const u of urls) rest = rest.replace(u, "");
    rest = rest.trimEnd();
    rest = rest.replace(PROMO_RE, "").trimEnd();
    if (rest.trim() && !/^[\s:.\-—–]*$/.test(rest)) lines.push(rest);
  }
  body = lines.join("\n").trim();

  let quote = "";
  let title: string | undefined;
  let author: string | undefined;
  let page: number | undefined;

  // 1. Apple Kitaplar: "Excerpt From" işareti.
  const all = body.split("\n");
  const mark = all.findIndex((l) => APPLE_MARK_RE.test(l.trim()));
  const markRest = mark > 0 ? APPLE_MARK_RE.exec(all[mark].trim())![1].trim() : "";
  const after = mark > 0 ? all.slice(mark + 1).map((l) => l.trim()).filter(Boolean) : [];
  const oldApple = /^(.+?)\.\s*[“"«](.+?)[”"»]\s*(?:apple books|ibooks|kitaplar)?\.?$/i.exec(markRest);
  // İşaret ancak Apple düzeninde sayılır: eski tek satır, "Excerpt From: Başlık" ya da ayrı satırda
  // işaret + kısa başlık/yazar satırları; üstelik alıntı tırnaklı ya da Apple izi (bağlantı, telif
  // satırı) var. Metnin içindeki "Alıntı" satırı alıntıyı bölmez.
  const beforeText = mark > 0 ? all.slice(0, mark).join("\n").trim() : "";
  const quoted = beforeText.length >= 2 && OPEN_Q.includes(beforeText[0]) && CLOSE_Q.includes(beforeText[beforeText.length - 1]);
  const appleOk =
    mark > 0 &&
    (app === "applebooks" || quoted || /^excerpt from/i.test(all[mark].trim())) &&
    (markRest
      ? !!oldApple || (/^excerpt from/i.test(all[mark].trim()) && after.length <= 2)
      : after.length >= 1 && after.length <= 3 && after.every((l) => l.length <= META_MAX));
  if (appleOk) {
    const before = beforeText;
    const rest = markRest;
    if (rest) {
      // Eski biçim: "Excerpt From: Yazar. “Başlık.” Apple Books."
      const old = oldApple;
      if (old) {
        author = meta(old[1]);
        title = meta(old[2]);
      } else {
        title = meta(rest);
        author = meta(after[0]);
      }
    } else {
      title = meta(after[0]);
      author = meta(after[1]);
    }
    quote = stripQuotes(before);
    app ??= "applebooks";
  }

  // 2. Tırnaklı alıntı + çevresindeki kitap bilgisi.
  if (!quote) {
    const q = /^([\s\S]*?)[“"«„]([\s\S]+)[”"»]([\s\S]*)$/.exec(body);
    if (q) {
      const pre = q[1].trim();
      const post = q[3].trim();
      // Tırnak metnin içinde geçiyorsa ("dedi ki “…” ve…") alıntı bütün metindir: kitap bilgisi
      // ancak ayrı satırda ya da "from", tire, sayfa gibi bir bağlaçla başlıyorsa sayılır.
      const preOk = !pre || (pre.length <= 300 && /\n\s*$/.test(q[1]));
      const postOk = !post || (post.length <= 300 && (/^[^\S\n]*\n/.test(q[3]) || /^(?:from\s|kaynak|[—–\-,(]|page|sayfa|s\.|p\.)/i.test(post)));
      if (!preOk || !postOk) {
        // tanınmadı → aşağıdaki adımlara bırak
      } else if (q[2].trim() && (pre || post)) {
        quote = inner(q);
        let m = [pre, post].filter(Boolean).join(" ");
        const p = takePage(m);
        m = p.rest;
        page = p.page;
        const info = parseMetaLine(m, /^[—–-]/.test(post) || (!post && /^[—–-]/.test(pre)));
        title = info.title;
        author = info.author;
      } else if (q[2].trim() && !pre && !post) {
        quote = inner(q);
      }
    }
  }

  // 3. Tırnaksız: son paragraf "— Yazar, Başlık" ya da (gönderen biliniyorsa) "Başlık by Yazar".
  if (!quote) {
    const paras = body.split(/\n\s*\n|\n(?=\s*[—–]\s)/).map((p) => p.trim()).filter(Boolean);
    const last = paras[paras.length - 1] ?? "";
    if (paras.length >= 2 && last.length <= 250 && !last.includes("\n")) {
      const dash = /^[—–-]\s*\S/.test(last);
      const by = app !== undefined && /\sby\s/i.test(last);
      if (dash || by) {
        const p = takePage(last);
        page = p.page;
        const info = parseMetaLine(p.rest, dash);
        title = info.title;
        author = info.author;
        quote = paras.slice(0, -1).join("\n\n");
      }
    }
  }

  // 4. Tanınmayan metin: tamamı alıntı.
  if (!quote) quote = body;
  quote = quote.trim();
  if (!cleanQuote(quote)) return null;

  title ??= cleanSubject(subject, quote);
  const out: ParsedShare = { quote };
  if (title) out.title = title;
  if (author) out.author = author;
  if (app) out.app = app;
  if (page !== undefined) out.page = page;
  return out;
}

// ─── Eşleştirme ───────────────────────────────────────────────────────────────────

/**
 * Karşılaştırma için başlık/yazar: Latin harflerinin işaretleri atılır (ç→c, é→e; diğer yazılardaki
 * işaretler anlam taşır, korunur), Türkçe ı/İ düzlenir, küçük harf, noktalama boşluk olur.
 */
export function normalizeTitle(s: string | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

/** Ana başlık: alt başlık ayracından (":", "(", tire) önceki kısım. */
const mainTitle = (s: string | undefined) => normalizeTitle((s ?? "").split(/[:(—–]|\s-\s/)[0]);

function authorFits(book: Book, author: string): boolean {
  const a = normalizeTitle(author);
  const b = normalizeTitle(book.author);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Raftaki aday kitaplar. Başlık yoksa boş (çağıran bütün rafı sunar). Önce tam başlık eşleşmesi;
 * yoksa ana başlığı (alt başlık ayracından önceki kısım) aynı olanlar: "Sapiens: Hayvanlardan
 * Tanrılara" ↔ "Sapiens". Yalnız içerme eşleşmez ("Time" ≠ "A Brief History of Time"). Yazar biliniyorsa
 * ve daraltıyorsa adaylar yazara göre süzülür. Tek aday → doğrudan eklenir; değilse seçtirilir.
 */
export function matchBooks(books: readonly Book[], parsed: Pick<ParsedShare, "title" | "author">): Book[] {
  const t = normalizeTitle(parsed.title);
  if (!t) return [];
  const narrow = (list: Book[]) => {
    if (list.length < 2 || !parsed.author) return list;
    const by = list.filter((b) => authorFits(b, parsed.author!));
    return by.length ? by : list;
  };
  const exact = books.filter((b) => normalizeTitle(b.title) === t);
  if (exact.length) return narrow(exact);
  const main = mainTitle(parsed.title);
  if (!main) return [];
  // İki tarafta da alt başlık varsa ("Harry Potter: Felsefe Taşı" ↔ "Harry Potter: Sırlar Odası")
  // ayrı kitaplardır: ana başlık eşleşmesi yalnız bir taraf alt başlıksızsa geçerli.
  const hasSub = (s: string) => mainTitle(s) !== normalizeTitle(s);
  const shareSub = hasSub(parsed.title ?? "");
  return narrow(books.filter((b) => mainTitle(b.title) === main && !(shareSub && hasSub(b.title))));
}

// ─── Kimlikler ve kayda işleme ────────────────────────────────────────────────────

/** Çift kayıt anahtarı: başlıklarla aynı düzleme (işaretsiz, küçük harf, yalnız harf/rakam, tek boşluk). */
export function quoteKey(text: string): string {
  const t = cleanQuote(text);
  return normalizeTitle(t) || t.normalize("NFKC").toLowerCase();
}

const enc = (s: string) => new TextEncoder().encode(s);

/** Deterministik çizim kimliği: 's' + SHA-256(alıntı anahtarı) ilk 10 hane. */
export async function sharedHighlightId(text: string): Promise<string> {
  return "s" + (await sha256Hex(enc(quoteKey(text)))).slice(0, 10);
}

/** Dosyasız paylaşım kaydının özeti (64 hane): "shared|" + normalleştirilmiş "başlık|yazar". */
export function sharedBookHash(title: string, author?: string): Promise<string> {
  return sha256Hex(enc("shared|" + kindleBookKey(title, author)));
}

export function sharedAnchor(parsed: Pick<ParsedShare, "app" | "page">): SharedAnchor {
  const a: SharedAnchor = { kind: "shared" };
  if (parsed.app) a.app = parsed.app;
  if (parsed.page !== undefined && Number.isInteger(parsed.page) && parsed.page >= 1) a.page = parsed.page;
  return a;
}

/** Kitapta bu alıntı (anahtarı aynı herhangi bir çizim) zaten var mı? */
export function findSharedDuplicate(book: Book, quote: string): Highlight | undefined {
  const k = quoteKey(quote);
  return book.highlights.find((h) => quoteKey(h.text) === k);
}

export interface SharedNewBookInput {
  /** `sharedBookHash` sonucu. */
  hash: string;
  notePath: string;
}

export interface SharedApplyResult {
  /** Çift kayıtta verilen kitabın KENDİSİ (yazım gerekmez). */
  book: Book;
  created: boolean;
  /** Eklenen çizim; çift kayıtta null. */
  added: Highlight | null;
  duplicate: boolean;
}

/**
 * Paylaşılan alıntıyı kayda işle. `existing` herhangi bir biçimdeki raf kitabıdır; yoksa başlıktan
 * dosyasız `shared` kayıt açılır (`init` ve başlık zorunlu). Aynı alıntı kitapta varsa hiçbir şey
 * değişmez (`duplicate`). Renk varsayılan (sarı).
 */
export async function applySharedQuote(
  existing: Book | null,
  parsed: ParsedShare,
  now: number,
  init?: SharedNewBookInput,
): Promise<SharedApplyResult> {
  if (!cleanQuote(parsed.quote)) throw new Error("Boş alıntı eklenmez");
  let book: Book;
  let created = false;
  if (existing) {
    const dup = findSharedDuplicate(existing, parsed.quote);
    if (dup) return { book: existing, created: false, added: null, duplicate: true };
    book = existing;
  } else {
    const title = oneLine(parsed.title ?? "");
    if (!init || !title) throw new Error("Yeni paylaşım kaydı için başlık, özet ve not yolu gerekir");
    book = newBook({ hash: init.hash, size: 0, fileName: "", format: "shared", notePath: init.notePath, title: title.slice(0, META_MAX) }, now);
    const author = oneLine(parsed.author ?? "");
    if (author) book.author = author.slice(0, META_MAX);
    created = true;
  }
  let id = await sharedHighlightId(parsed.quote);
  if (book.highlights.some((h) => h.id === id)) id = newHighlightId(book.highlights.map((h) => h.id));
  const r = addHighlight(book, { text: parsed.quote, anchor: sharedAnchor(parsed), color: DEFAULT_HIGHLIGHT_COLOR }, now, id);
  return { book: r.book, created, added: r.highlight, duplicate: false };
}

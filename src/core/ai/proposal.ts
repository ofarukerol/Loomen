// Asistanın not önerileri — "öneri + onay" akışının çekirdeği.
//
// NEDEN ÖNERİ: NOTE_SAFETY_RULES.md gereği notların içeriğine dokunan her yol denetlenebilir
// olmalı. Asistan bu yüzden dosyaya kendi yazmaz; ne yapacağını bir blok hâlinde söyler,
// kullanıcı önizleyip onaylarsa uygulama yazar. Model yanlış anlasa bile diske bir şey
// gitmez.
//
// İKİ İŞLEM VAR: nota EKLEME ve YENİ not oluşturma. Üzerine yazma ve silme bilerek yoktur —
// böylece "asistan notumu bozdu" diye bir hikâye hiç mümkün olmaz; en kötü ihtimalle fazladan
// bir paragraf ya da fazladan bir not oluşur, ikisi de geri alınabilir.
//
// Modelden istenen blok biçimi (İngilizce anahtarlar: modeller bu şemaya daha sadık kalıyor):
//
//     ```loomen-note
//     { "action": "append", "path": "Projeler/Toplantı.md", "text": "- Kargo takibi" }
//     ```

/** Öneri türü: var olan notun SONUNA ekle, ya da yeni not oluştur. */
export type ProposalAction = "append" | "create";

export interface Proposal {
  action: ProposalAction;
  /** Kasa köküne göreli not yolu, `.md` ile biter. */
  path: string;
  /** Eklenecek / yazılacak markdown. */
  text: string;
}

/** Bir öneriye bağlı, mesaj içinde saklanan uygulama durumu. */
export interface ProposalState extends Proposal {
  /** Uygulandıysa oluşan/yazılan gerçek yol (çakışma yüzünden değişmiş olabilir). */
  appliedPath?: string;
  /** Uygulanamadıysa sebep. */
  error?: string;
}

/** Tek bir notun makul üst sınırı — modelin kaçak bir çıktısı diske yığılmasın. */
const MAX_TEXT = 100_000;

/** Kasada uygulamanın kendi verisini tuttuğu, asistanın yazamayacağı klasörler. */
const RESERVED = ["tekrar", ".trash", ".obsidian", ".git"];

const FENCE = /```loomen-note\s*\n([\s\S]*?)```/g;

/**
 * Yol güvenli mi? Kasa dışına çıkan, gizli klasöre giren ya da uygulamanın kendi verisine
 * dokunan hiçbir yol kabul edilmez. Temizlenmiş yolu döner, kabul edilmezse null.
 */
export function safePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Ters bölü Windows'tan gelebilir; iç gösterim her yerde düz bölüdür.
  let p = raw.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!p) return null;
  // Mutlak yol (POSIX ya da sürücü harfi) kasanın dışını gösterir.
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
  // Kontrol karakteri / satır sonu olan dosya adı yazılamaz.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(p)) return null;
  const parts = p.split("/").filter((s) => s !== "");
  if (parts.length === 0) return null;
  for (const seg of parts) {
    if (seg === "." || seg === "..") return null; // kasa dışına tırmanma
    if (seg.startsWith(".")) return null; // gizli klasör/dosya
    if (RESERVED.includes(seg.toLocaleLowerCase("tr"))) return null;
  }
  p = parts.join("/");
  // Uzantı serbest bırakılmaz: asistan yalnız markdown not yazabilir.
  if (!/\.md$/i.test(p)) p = `${p}.md`;
  return p;
}

/** Ham JSON'u öneriye çevir. Şemaya uymayan her şey sessizce elenir (null). */
export function parseProposal(raw: string): Proposal | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const action = o.action === "append" || o.action === "create" ? o.action : null;
  if (!action) return null;
  const path = safePath(o.path);
  if (!path) return null;
  const text = typeof o.text === "string" ? o.text : null;
  if (text === null || text.trim() === "") return null;
  if (text.length > MAX_TEXT) return null;
  return { action, path, text };
}

export interface SplitResult {
  /** Kullanıcıya gösterilecek metin — öneri blokları çıkarılmış hâli. */
  text: string;
  proposals: Proposal[];
}

/**
 * Cevabı, görünür metin ile öneriler olarak ayır.
 *
 * Akış sürerken de çağrılır: yarım kalmış bir blok (kapanış ``` gelmemiş) ayrıştırılmaz ama
 * görünür metinden de düşürülür — kullanıcı ekranda yarım JSON görmesin.
 */
export function splitProposals(content: string): SplitResult {
  const proposals: Proposal[] = [];
  const text = content.replace(FENCE, (_m, body: string) => {
    const p = parseProposal(body);
    if (p) proposals.push(p);
    return "";
  });
  // Kapanmamış blok: akış hâlâ sürüyor olabilir, açılıştan sonrasını gizle.
  const open = text.indexOf("```loomen-note");
  const visible = open >= 0 ? text.slice(0, open) : text;
  return { text: visible.trim(), proposals };
}

/** Sistem istemine eklenen yönerge — modelin bloğu ne zaman ve nasıl yazacağı. */
export const PROPOSAL_INSTRUCTION =
  "Kullanıcı bir şeyin not edilmesini, eklenmesini ya da yeni bir not oluşturulmasını isterse " +
  "cevabının sonuna şu blokla bir öneri koy:\n" +
  "```loomen-note\n" +
  '{ "action": "append", "path": "Klasör/Not.md", "text": "eklenecek markdown" }\n' +
  "```\n" +
  'Var olan bir notun sonuna eklemek için "append", yeni not için "create" kullan. ' +
  "Yol kasa köküne göreli olmalı ve .md ile bitmeli. " +
  "Bu bloğu yazman hiçbir şeyi değiştirmez: kullanıcı öneriyi görüp onaylamadıkça dosyaya " +
  "dokunulmaz, bunu cevabında da belirt. Kullanıcı bir şey yazmanı istemediyse blok koyma.";

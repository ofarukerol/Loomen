// Elle ad verilmemiş notun dosya adını ilk başlıktan türetme (LOM-76).
//
// Saf yardımcılar: dosya sistemi ve arayüz bilmez. Kasa deposu (useAppStore) hangi notun
// otomatik adlandırılabileceğine karar verir; burada yalnız ad üretilir.

/** Yeni notların varsayılan adı ("Adsız", "Adsız 2", …). */
export const AUTO_NAME_BASE = "Adsız";

const AUTO_NAME_RE = /^Adsız( \d+)?$/;

/** Ad, elle verilmemiş varsayılan ad desenine uyuyor mu? */
export function isAutoName(name: string): boolean {
  return AUTO_NAME_RE.test(name);
}

/** Dosya adında kullanılabilecek en uzun başlık. */
export const MAX_NAME_LEN = 80;

/**
 * İçerikteki ilk Markdown başlığı. YAML ön bilgisi ve ``` / ~~~ kod blokları atlanır.
 * `line` 0 tabanlı satır indeksidir; `text` kapanış #'larından arınmış ham başlıktır.
 */
export function firstHeading(content: string): { text: string; line: number } | null {
  const lines = content.split(/\r?\n/);
  let i = 0;
  // YAML ön bilgisi: yalnız ilk satır "---" ise ve kapanışı varsa.
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, k) => k > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) i = end + 1;
  }
  let fence: string | null = null;
  for (; i < lines.length; i++) {
    const l = lines[i];
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(l);
    if (f) {
      if (fence == null) fence = f[1][0].repeat(f[1].length);
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence != null) continue;
    const h = /^\s{0,3}#{1,6}(?:\s+(.*?))?\s*$/.exec(l);
    if (!h) continue;
    // Kapanış #'ları ("# Başlık ##") atılır.
    const text = (h[1] ?? "").replace(/\s+#+\s*$/, "").replace(/^#+$/, "").trim();
    return { text, line: i };
  }
  return null;
}

/** Başlık metnini dosya adına uygun hale getirir; boş kalabilir. */
export function headingFileName(text: string): string {
  let s = text;
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2"); // [[a|b]] → b
  s = s.replace(/\[\[([^\]]*)\]\]/g, "$1"); // [[a]] → a
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"); // [t](u) → t
  s = s.replace(/[*_~`]/g, ""); // vurgu işaretleri
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, ""); // dosya adında yasak karakterler
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[.\s]+|[.\s]+$/g, ""); // baş/son nokta (gizli dosya, Windows)
  if (s.length > MAX_NAME_LEN) s = s.slice(0, MAX_NAME_LEN).trim().replace(/[.\s]+$/, "");
  return s;
}

/** Notun başlığa göre alması gereken ad; değişiklik gerekmiyorsa null. */
export function autoNameTarget(currentName: string, content: string): string | null {
  const h = firstHeading(content);
  if (!h) return null;
  const name = headingFileName(h.text);
  if (!name || name === currentName) return null;
  return name;
}

/** `base`, `base 2`, `base 3`… içinden `taken` olmayan ilk ad. */
export function freeName(base: string, taken: (name: string) => boolean): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base} ${n}`;
    if (!taken(c)) return c;
  }
}

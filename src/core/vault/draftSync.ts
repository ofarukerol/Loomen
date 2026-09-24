// Açık notun taslağı ile diskteki dosyanın uzlaştırılması (LOM-5).
//
// Saf fonksiyonlar: store bunları kullanır, testler doğrudan çağırır.

/**
 * Diskten yeni okuma gelince açık notun taslağına ne olacağı:
 *  - "keep":      disk değişmemiş, taslağa dokunma.
 *  - "refresh":   disk değişmiş, kullanıcının yazılmamış değişikliği yok → taslağı tazele.
 *  - "converged": disk değişmiş ama taslakla aynı → yazılacak bir şey kalmadı.
 *  - "conflict":  disk DIŞARIDAN değişmiş VE taslakta yazılmamış değişiklik var.
 *                 İki sürüm de korunur; hangisinin kalacağını kullanıcı seçer.
 *                 (Eskiden taslak tutuluyor, sonraki otomatik kayıt dış değişikliği
 *                 sessizce eziyordu.)
 *
 * `prev` = son bilinen disk içeriği, `next` = yeni okunan, `draft` = editördeki metin.
 * `next === undefined` (dosya dışarıda silindi/taşındı) "keep" sayılır: taslak korunur.
 */
export type DraftReconcile = "keep" | "refresh" | "converged" | "conflict";

export function reconcileDraft(
  prev: string | undefined,
  next: string | undefined,
  draft: string
): DraftReconcile {
  if (next === undefined || next === prev) return "keep";
  if (draft === prev) return "refresh";
  if (draft === next) return "converged";
  return "conflict";
}

/**
 * Çakışma kopyası için benzersiz yol: "Klasör/Not.md" → "Klasör/Not (çakışma 2026-09-24 1430).md".
 * Aynı ad alınmışsa " 2", " 3"... eklenir. `taken` dosyanın (bellekte ya da diskte) var
 * olup olmadığını söyler — var olan bir dosyanın üzerine asla yazılmaz.
 */
export async function conflictCopyPath(
  path: string,
  stamp: string,
  taken: (p: string) => boolean | Promise<boolean>
): Promise<string> {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const file = path.slice(slash + 1);
  const dot = file.toLowerCase().endsWith(".md") ? file.length - 3 : file.length;
  const base = file.slice(0, dot);
  const ext = file.slice(dot);
  for (let i = 1; i < 1000; i++) {
    const suffix = i === 1 ? "" : ` ${i}`;
    const candidate = `${dir}${base} (çakışma ${stamp}${suffix})${ext}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error("Çakışma kopyası için boş ad bulunamadı");
}

/** "2026-09-24 1430" biçiminde yerel zaman damgası. */
export function conflictStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
}

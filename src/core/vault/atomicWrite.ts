// Notun yan dosya + rename ile güvenli yazılması (LOM-8, LOM-29).
//
// Saf modül: dosya işlemleri dışarıdan verilir, Tauri import etmez — node testinde koşar
// (bkz __test__/atomicWriteTest.ts). Gerçek işlemler tauriBackend.ts'te bağlanır.

export interface AtomicWriteDeps {
  writeTextFile: (path: string, content: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  warn?: (...args: unknown[]) => void;
}

/** Rename denemeleri arasındaki bekleme (ms); ilki beklemesiz. */
export const RENAME_WAITS = [0, 60, 200] as const;

/**
 * Kayıt tamamen başarısız olunca tam içeriğin saklandığı dosya: `Not.md` → `Not.kurtarma.md`.
 * Uzantı korunur ki kasada not/çizim olarak görünsün ve kullanıcı bulabilsin. Yan dosya
 * kalıbına (`*.tmp`) uymadığı için açılıştaki artık temizliği onu silmez. Hedef başına tek
 * dosya: kayıt üst üste düşerse her seferinde yeni kopya birikmez, en son içerik kalır.
 */
export function recoveryNameFor(target: string): string {
  const slash = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
  const dot = target.lastIndexOf(".");
  if (dot <= slash + 1) return `${target}.kurtarma`; // uzantısız ya da gizli dosya (".x")
  return `${target.slice(0, dot)}.kurtarma${target.slice(dot)}`;
}

/**
 * Yan dosyaya yaz, sonra yerine koy. Rename geçici olarak başarısız olabilir (Windows'ta
 * virüs tarayıcı/dizinleyici dosyayı kısa süre tutar) → birkaç kez denenir. Yine olmazsa
 * doğrudan yazılır; bu da başarısızsa yan dosya SİLİNMEZ (LOM-29): tam içerik
 * `recoveryNameFor` adıyla saklanır, ardından asıl hata fırlatılır. Doğrudan yazma hedefi
 * yarım bıraktıysa bile notun eksiksiz hali diskte kalır.
 */
export async function atomicWrite(target: string, tmp: string, c: string, deps: AtomicWriteDeps): Promise<void> {
  await deps.writeTextFile(tmp, c);
  let lastErr: unknown;
  for (const wait of RENAME_WAITS) {
    if (wait) await deps.sleep(wait);
    try {
      await deps.rename(tmp, target); // std::fs::rename — hedefin üzerine yazar
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  try {
    await deps.writeTextFile(target, c);
  } catch (err) {
    const recovery = recoveryNameFor(target);
    try {
      await deps.rename(tmp, recovery);
      deps.warn?.("Not yazılamadı, tam içerik kurtarma dosyasında:", recovery, err);
    } catch (renameErr) {
      // Yan dosya yerinde kalır (silinmez); yine de tam içerik diskte.
      deps.warn?.("Not yazılamadı, tam içerik yan dosyada kaldı:", tmp, err, renameErr);
    }
    throw err;
  }
  await deps.remove(tmp).catch(() => {});
  deps.warn?.("Atomik yazma rename'de başarısız, doğrudan yazıldı:", lastErr);
}

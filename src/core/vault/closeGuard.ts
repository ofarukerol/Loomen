/**
 * Pencere kapanış bekçisi (LOM-18) — platformdan bağımsız, saf mantık.
 *
 * Kapanış isteği gelince bekleyen kayıt diske yazılır. Yazılamazsa (disk dolu, izin,
 * kilit) ya da yazma asılı kalırsa pencere SESSİZCE kapanmaz: bir kez durdurulur ve
 * kullanıcıya sorulur. "Yine de kapat" → kapanır; "Açık kalsın" → pencere açık kalır,
 * sonraki X bir kez daha yazmayı dener ve SORMADAN kapatır (kapanış hiçbir zaman
 * kilitlenmez). Yazma en fazla `timeoutMs` beklenir; asılı bir yazma kapanışı
 * sonsuza kadar tutmaz.
 */

/** Yazma için beklenecek en uzun süre (ms). */
export const CLOSE_FLUSH_TIMEOUT_MS = 5000;

export interface CloseGuardDeps {
  /** Bekleyen kaydı yaz; `true` = yazıldı (ya da yazılacak bir şey yoktu). */
  flush: () => Promise<boolean>;
  /** "Yine de kapatılsın mı?" sorusu; `true` = kapat. */
  ask: () => Promise<boolean>;
  /** Pencereyi gerçekten kapat (bekçiden geçerek, bu sefer engellenmez). */
  close: () => Promise<void>;
  timeoutMs?: number;
}

/** Söz `ms` içinde bitmezse ya da hata verirse `false` döner. */
export async function flushWithTimeout(flush: () => Promise<boolean>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((r) => {
    timer = setTimeout(() => r(false), ms);
  });
  try {
    return await Promise.race([flush().catch(() => false), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Kapanış isteği işleyicisi döndürür. `prevent` kapanışı durdurur (Tauri'de
 * `event.preventDefault()`); işleyici bunu çağırmazsa pencere kapanır.
 */
export function createCloseGuard(deps: CloseGuardDeps): (prevent: () => void) => Promise<void> {
  const ms = deps.timeoutMs ?? CLOSE_FLUSH_TIMEOUT_MS;
  let allow = false; // true: bir sonraki kapanış isteği engellenmez
  let busy = false; // yazma/soru sürerken gelen ek X'ler yok sayılır
  let asked = false; // kullanıcıya bir kez soruldu → sonraki X sormadan kapatır

  const finish = async () => {
    allow = true;
    try {
      await deps.close();
    } catch {
      allow = false; // kapatılamadıysa sonraki X yeniden denesin
    }
  };

  return async (prevent) => {
    if (allow) return; // kendi `close()` çağrımız: bırak kapansın
    prevent();
    if (busy) return;
    busy = true;
    try {
      const ok = await flushWithTimeout(deps.flush, ms);
      if (ok || asked) {
        await finish();
        return;
      }
      asked = true;
      let yes = false;
      try {
        yes = await deps.ask();
      } catch {
        yes = false; // soru açılamadıysa pencere açık kalır; sonraki X kapatır
      }
      if (yes) await finish();
    } finally {
      busy = false;
    }
  };
}

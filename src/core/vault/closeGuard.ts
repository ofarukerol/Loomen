/**
 * Pencere kapanış bekçisi (LOM-18) — platformdan bağımsız, saf mantık.
 *
 * Kapanış isteği gelince bekleyen kayıt diske yazılır. Yazılamazsa (disk dolu, izin,
 * kilit) ya da yazma asılı kalırsa pencere SESSİZCE kapanmaz: bir kez durdurulur ve
 * kullanıcıya sorulur. "Yine de kapat" → kapanır; "Açık kalsın" → pencere açık kalır,
 * HEMEN ardından gelen X bir kez daha yazmayı dener ve SORMADAN kapatır (kapanış hiçbir
 * zaman kilitlenmez). Yazma en fazla `timeoutMs` beklenir; asılı bir yazma kapanışı
 * sonsuza kadar tutmaz.
 *
 * "Sormadan kapat" hakkı yalnız sorudan hemen sonraki X içindir: sorudan `graceMs`
 * geçtiyse (kullanıcı pencerede çalışmaya devam etti) ya da arada bir kayıt başarıyla
 * yazıldıysa (`reset()`) hak düşer; sonraki başarısız yazmada yeniden sorulur. Eskiden
 * hak kalıcıydı: "Açık kalsın"dan saatler sonra yazma yine başarısız olunca X sormadan
 * kapatıyor, son değişiklik sessizce kayboluyordu.
 */

/** Yazma için beklenecek en uzun süre (ms). */
export const CLOSE_FLUSH_TIMEOUT_MS = 5000;

/** Sorudan sonra "sormadan kapat" hakkının geçerli kaldığı süre (ms). */
export const CLOSE_ASK_GRACE_MS = 60_000;

export interface CloseGuardDeps {
  /** Bekleyen kaydı yaz; `true` = yazıldı (ya da yazılacak bir şey yoktu). */
  flush: () => Promise<boolean>;
  /** "Yine de kapatılsın mı?" sorusu; `true` = kapat. */
  ask: () => Promise<boolean>;
  /** Pencereyi gerçekten kapat (bekçiden geçerek, bu sefer engellenmez). */
  close: () => Promise<void>;
  timeoutMs?: number;
  graceMs?: number;
  /** Saat (test için değiştirilebilir). */
  now?: () => number;
}

/** Kapanış isteği işleyicisi; `reset()` başarılı bir kayıttan sonra çağrılır. */
export interface CloseGuard {
  (prevent: () => void): Promise<void>;
  /** "Sormadan kapat" hakkını düşürür: sonraki başarısız yazmada yeniden sorulur. */
  reset: () => void;
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
export function createCloseGuard(deps: CloseGuardDeps): CloseGuard {
  const ms = deps.timeoutMs ?? CLOSE_FLUSH_TIMEOUT_MS;
  const grace = deps.graceMs ?? CLOSE_ASK_GRACE_MS;
  const now = deps.now ?? Date.now;
  let allow = false; // true: bir sonraki kapanış isteği engellenmez
  let busy = false; // yazma/soru sürerken gelen ek X'ler yok sayılır
  // Soru ne zaman cevaplandı (ya da açılamadı); null = "sormadan kapat" hakkı yok.
  let askedAt: number | null = null;

  const finish = async () => {
    allow = true;
    try {
      await deps.close();
    } catch {
      allow = false; // kapatılamadıysa sonraki X yeniden denesin
    }
  };

  const guard = (async (prevent: () => void) => {
    if (allow) return; // kendi `close()` çağrımız: bırak kapansın
    prevent();
    if (busy) return;
    busy = true;
    try {
      // Hak yalnız bu X için: sorudan hemen sonra mı geldi? Kullanılınca düşer.
      const justAsked = askedAt !== null && now() - askedAt <= grace;
      askedAt = null;
      const ok = await flushWithTimeout(deps.flush, ms);
      if (ok || justAsked) {
        await finish();
        return;
      }
      let yes = false;
      try {
        yes = await deps.ask();
      } catch {
        yes = false; // soru açılamadıysa pencere açık kalır; hemen sonraki X kapatır
      }
      askedAt = now(); // cevap anından itibaren sayılır: kullanıcı soruda uzun durabilir
      if (yes) await finish();
    } finally {
      busy = false;
    }
  }) as CloseGuard;
  guard.reset = () => {
    askedAt = null;
  };
  return guard;
}

import {
  decideRepick,
  normalizeVaultPath,
  shouldAutoRetry,
  vaultLabel,
  type VaultOpenError,
} from "./openError";

/** Şeritteki Yeniden dene düğmesinin görünür durumu: boşta, deneniyor, yine açılamadı. */
export type RetryStatus = "idle" | "busy" | "failed";

/** Ne zaman açılışın kasa değişimi gibi yürütüleceği (LOM-25). */
export function isVaultSwitch(prevPath: string | null, path: string, backendOpened: boolean): boolean {
  if (prevPath !== path) return true;
  // Gerçek kasa hiç açılmadıysa backend örnek kasadır (vaultPath gerçek kasayı gösterse de).
  // Şerit kapatılmış ya da açılış yalnız yavaş olsa bile örnek taslağı gerçek kasaya yazılmasın.
  return !backendOpened;
}

/** reopenVault'un koruma sırası için store'un verdiği adımlar (testte sahtesi verilir). */
export interface GuardedOpenDeps<B> {
  isSwitch: boolean;
  prevPath: string | null;
  path: string;
  flushDraft: () => Promise<boolean>;
  onFlushFailed: () => Promise<void>;
  /** Klasöre erişip yeni backend'i kurar; erişilemezse fırlatır. */
  open: () => Promise<B>;
  /** Açık taslağı/notu bırakır (yalnız kasa değişiminde). */
  clearForSwitch: () => void;
  releaseBookmark: (path: string) => void;
}

/**
 * Kasa açılışının koruma sırası (LOM-25). Kasa değişiminde taslak önce eski kasaya yazılır;
 * açık not ancak yeni kasa gerçekten açıldıktan sonra bırakılır. Açılış düşerse (şerit açıkken
 * pencereye her dönüşte otomatik deneme koşar) hiçbir şeye dokunulmaz, hata yukarı fırlar.
 * Taslak yazılamazsa null döner, açılış iptal.
 */
export async function openVaultGuarded<B>(d: GuardedOpenDeps<B>): Promise<B | null> {
  if (d.isSwitch && !(await d.flushDraft())) {
    await d.onFlushFailed();
    return null;
  }
  const next = await d.open();
  if (d.isSwitch) {
    // Açılış sürerken editör açık kaldı; o arada yazılan metni de eski kasaya yaz (backend hâlâ eski).
    if (!(await d.flushDraft())) {
      await d.onFlushFailed();
      return null;
    }
    d.clearForSwitch();
    // Kasa değiştiyse öncekinin security-scoped erişimini bırak (kaynak sızıntısı önlemi).
    if (d.prevPath && d.prevPath !== d.path) d.releaseBookmark(d.prevPath);
  }
  return next;
}

/** Store'un açılamayan kasa onarımı için verdiği bağımlılıklar (testte sahtesi verilir). */
export interface RecoveryDeps {
  getError: () => VaultOpenError | null;
  getVaultPath: () => string | null;
  getVaultPaths: () => { path: string; name?: string }[];
  pickFolder: () => Promise<string | null>;
  createBookmark: (path: string) => Promise<string | null>;
  setBookmark: (vaultPath: string, bookmark: string) => void;
  reopen: (path: string) => Promise<void>;
  changeVaultPath: (oldPath: string, newPath: string) => Promise<void>;
  switchVault: (path: string) => Promise<void>;
  addVault: () => Promise<void>;
  warnAlreadyVault: (name: string) => Promise<void>;
  setRetryStatus: (s: RetryStatus) => void;
}

/** Açılamayan kasayı yeniden deneme ve klasörünü yeniden seçme akışı. Aynı anda tek deneme çalışır. */
export function createOpenRecovery(d: RecoveryDeps) {
  let retrying = false;
  let repicking = false;

  async function retry(auto = false): Promise<void> {
    const err = d.getError();
    if (!err || retrying) return;
    if (auto && (repicking || !shouldAutoRetry(err, d.getVaultPath()))) return;
    retrying = true;
    // Otomatik deneme sürerken de düğme pasif kalsın ('deneniyor').
    d.setRetryStatus("busy");
    try {
      await d.reopen(err.path);
    } finally {
      retrying = false;
      // Hâlâ hata varsa düğmeyle denemede görünür geri bildirim; otomatik denemede sessizce boşa dön.
      d.setRetryStatus(d.getError() && !auto ? "failed" : "idle");
    }
  }

  async function repickFolder(err: VaultOpenError): Promise<void> {
    const picked = await d.pickFolder();
    const vaults = d.getVaultPaths();
    const decision = decideRepick(err.path, picked, vaults.map((v) => v.path));
    if (decision === "cancel" || !picked) return;
    if (decision === "other-vault") {
      const n = normalizeVaultPath(picked);
      const hit = vaults.find((v) => normalizeVaultPath(v.path) === n);
      await d.warnAlreadyVault(hit?.name || vaultLabel(picked));
      return;
    }
    if (decision === "same") {
      // İzin düştüyse çare aynı klasörü yeniden seçmektir: erişimi yeniden üret, kaydı güncelle, aç.
      const bookmark = await d.createBookmark(picked);
      if (bookmark) d.setBookmark(err.path, bookmark);
      await d.reopen(err.path);
      return;
    }
    // Yeni klasör: kasanın klasörünü değiştir (etkinse yeniden açılır).
    const idx = vaults.findIndex((v) => v.path === err.path);
    await d.changeVaultPath(err.path, picked);
    // changeVaultPath yalnız etkin kasayı yeniden açar; açılamayan kasa etkin değilse yeni klasöre burada geç.
    const now = d.getVaultPaths()[idx]?.path;
    if (now && now !== err.path && d.getVaultPath() !== now) await d.switchVault(now);
  }

  async function repick(): Promise<void> {
    const err = d.getError();
    if (!err) return;
    // Listede yoksa yeni kasa olarak ekle.
    if (!d.getVaultPaths().some((v) => v.path === err.path)) return d.addVault();
    d.setRetryStatus("idle");
    repicking = true;
    try {
      await repickFolder(err);
    } finally {
      repicking = false;
    }
  }

  return { retry, repick };
}

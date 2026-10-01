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
export function isVaultSwitch(
  prevPath: string | null,
  path: string,
  backendOpened: boolean,
  openError: VaultOpenError | null,
): boolean {
  if (prevPath !== path) return true;
  // Kayıtlı kasa açılamayınca uygulama örnek kasayla çalışır ama vaultPath gerçek kasayı gösterir.
  // Sonradan açılış başarılı olursa örnek kasanın taslağı gerçek kasaya yazılmasın: değişim say.
  return !backendOpened && openError?.path === path;
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
    if (!auto) d.setRetryStatus("busy");
    try {
      await d.reopen(err.path);
    } finally {
      retrying = false;
      // Hâlâ hata varsa görünür geri bildirim; açıldıysa şerit zaten kalktı.
      if (!auto) d.setRetryStatus(d.getError() ? "failed" : "idle");
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

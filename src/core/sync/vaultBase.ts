// Mobil GitHub senkronunun 3-yönlü birleştirme temeli (son başarılı senkron commit'i) KASA BAŞINA
// tutulur (LOM-114). Tek global temel olunca, aynı depoya bağlı iki kasadan birinin temeli diğerine
// taşınıyor ve "yerelde yok, uzak==temel" dosyalar yerel silme sayılıp uzaktan siliniyordu.
// Saf modül: store'u bilmez; test burada koşar.

/** Temelle ilgili, kasa kaydındaki alanlar. */
export interface VaultBaseFields {
  path: string;
  /** Son başarılı senkronun commit sha'sı. */
  baseSha?: string | null;
  /** O temelin ait olduğu depo (`owner/repo`). Depo değişince temel geçersizdir. */
  baseRepo?: string | null;
}

/**
 * Kasanın temeli. Kayıt yoksa, temel başka bir depoya aitse ya da depo bilinmiyorsa `null`:
 * temelsiz senkron güvenlidir (yerelde olmayan uzak dosya çekilir, silme olmaz).
 */
export function getVaultBase(
  vaults: readonly VaultBaseFields[],
  path: string | null,
  repoFullName: string | null | undefined
): string | null {
  if (!path || !repoFullName) return null;
  const v = vaults.find((x) => x.path === path);
  if (!v || !v.baseSha || v.baseRepo !== repoFullName) return null;
  return v.baseSha;
}

/** Yalnız `path` kasasının temelini yazar (başka kasaya dokunmaz). `sha` null → temeli siler. */
export function withVaultBase<T extends VaultBaseFields>(
  vaults: readonly T[],
  path: string,
  repoFullName: string | null,
  sha: string | null
): T[] {
  return vaults.map((v) =>
    v.path === path
      ? { ...v, baseSha: sha && repoFullName ? sha : null, baseRepo: sha && repoFullName ? repoFullName : null }
      : v
  );
}

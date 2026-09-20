/**
 * Mobil kasa yollarını uygulama veri klasörüne göre yeniden tabanlama.
 *
 * SORUN: Mobilde kasa klasörü uygulamanın kendi veri klasörünün (appDataDir) altındadır ve
 * kayıtlara MUTLAK yol olarak yazılır. iOS'ta bu yolun içinde uygulama konteynerinin kimliği
 * geçer; uygulama güncellenince (ya da yedekten geri yüklenince) kimlik DEĞİŞİR. Eski mutlak
 * yol artık var olmayan bir klasörü gösterir: kasa "açılamadı"ya düşer, ikinci kasa listede
 * ölü kayıt olarak kalır.
 *
 * ÇÖZÜM: Kasayı KLASÖR ADIYLA tanı. Her açılışta güncel veri klasörü öğrenilir ve kayıtlı
 * yollar bu köke göre yeniden kurulur (ad aynı kalır, kök tazelenir). Böylece eski mutlak
 * kayıtlar da kendiliğinden düzelir — hiçbir şey silinmez, yalnız yol güncellenir.
 *
 * Bu dosya SAF tutulur (Tauri/ortam çağrısı yok) ki node testinden koşulabilsin.
 */

/** Yol ayırıcılarını `/` yapar, tekrar eden ve sondaki ayırıcıyı atar. */
export function normalizePath(p: string): string {
  const unified = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return unified.length > 1 ? unified.replace(/\/+$/, "") : unified;
}

/** Yolun son parçası (klasör adı). Boş yolda "" döner. */
export function lastSegment(p: string): string {
  const parts = normalizePath(p).split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

/** `root` ile `name`i tek bir yola birleştirir. */
export function joinPath(root: string, name: string): string {
  const r = normalizePath(root).replace(/\/+$/, "");
  const n = normalizePath(name).replace(/^\/+/, "");
  if (!n) return r;
  return r ? `${r}/${n}` : `/${n}`;
}

/** Yol `root` klasörünün altında mı (kökün kendisi de sayılır)? */
export function isUnderRoot(root: string, p: string): boolean {
  const r = normalizePath(root).replace(/\/+$/, "");
  const x = normalizePath(p);
  return x === r || x.startsWith(`${r}/`);
}

/**
 * Mobil kasa kaydının klasör adı. Yol güncel kökün altındaysa kökten sonraki kalan
 * (iç içe klasör olabilir), değilse yalnız son parça kullanılır — eski konteyner
 * yolundan yalnızca kasa adı anlamlıdır.
 */
export function mobileVaultFolderName(root: string, stored: string): string {
  const r = normalizePath(root).replace(/\/+$/, "");
  const s = normalizePath(stored);
  if (s === r) return ""; // kökün kendisi — ad yok, kök olduğu gibi kalır
  if (isUnderRoot(r, s)) return s.slice(r.length + 1);
  return lastSegment(s);
}

/** Kayıtlı (belki bayat) mobil kasa yolunu güncel köke göre yeniden kur. */
export function rebaseMobileVaultPath(root: string, stored: string): string {
  const name = mobileVaultFolderName(root, stored);
  return name ? joinPath(root, name) : normalizePath(root);
}

/** Yeniden tabanlanacak kasa durumu (store'daki alanların saf kopyası). */
export interface MobileVaultState<E extends { path: string }, T> {
  vaultPath: string | null;
  vaults: E[];
  tabsByVault: Record<string, T>;
}

export interface MobileVaultMigration<E extends { path: string }, T> extends MobileVaultState<E, T> {
  /** Eski yol → yeni yol eşlemesi (yalnız değişenler). */
  renamed: Record<string, string>;
  /** Herhangi bir yol değişti mi? */
  changed: boolean;
}

/**
 * Kasa listesini, aktif kasayı ve sekme kayıtlarını güncel veri klasörüne göre yeniden tabanla.
 * Aynı klasör adına düşen mükerrer kayıtlar (eski + yeni konteyner yolu) teke indirilir;
 * ilk kaydın alanları korunur. Veri silinmez — yalnız yollar güncellenir.
 */
export function migrateMobileVaults<E extends { path: string }, T>(
  root: string,
  state: MobileVaultState<E, T>
): MobileVaultMigration<E, T> {
  const renamed: Record<string, string> = {};
  const seen = new Map<string, E>();
  for (const entry of state.vaults) {
    const next = rebaseMobileVaultPath(root, entry.path);
    if (next !== normalizePath(entry.path)) renamed[entry.path] = next;
    if (!seen.has(next)) seen.set(next, { ...entry, path: next });
  }
  const vaults = [...seen.values()];

  const vaultPath = state.vaultPath ? rebaseMobileVaultPath(root, state.vaultPath) : null;
  if (state.vaultPath && vaultPath && vaultPath !== normalizePath(state.vaultPath)) {
    renamed[state.vaultPath] = vaultPath;
  }

  const tabsByVault: Record<string, T> = {};
  for (const [key, value] of Object.entries(state.tabsByVault)) {
    const next = rebaseMobileVaultPath(root, key);
    // Mükerrer anahtarda ilk kayıt kalır (hangi konteynerden geldiği bilinmez; sekmeler türetilir).
    if (!(next in tabsByVault)) tabsByVault[next] = value;
    if (next !== normalizePath(key)) renamed[key] = next;
  }

  return {
    vaultPath,
    vaults,
    tabsByVault,
    renamed,
    changed: Object.keys(renamed).length > 0 || vaults.length !== state.vaults.length,
  };
}

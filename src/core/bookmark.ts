import { invoke } from "@tauri-apps/api/core";

/**
 * macOS security-scoped bookmark köprüsü (Mac App Store / sandbox).
 *
 * Sandbox'ta kullanıcının seçtiği klasöre erişim yalnızca o oturum için verilir; uygulama
 * yeniden açılınca kaybolur. Kalıcı erişim için seçim anında bir "bookmark" üretilip saklanır,
 * açılışta o bookmark çözülerek erişim geri alınır.
 *
 * Sandbox dışı derlemelerde (Developer ID ile dağıtım) bu katman zararsızdır: bookmark yine
 * üretilir ama erişim zaten açık olduğu için bir şey değiştirmez. Diğer platformlarda (Windows,
 * Linux) sandbox kavramı yoktur; fonksiyonlar sessizce boş döner.
 */

/** Klasör için bookmark üretir. Başarısızlıkta null — kasa yine de açılabilir. */
export async function createBookmark(path: string): Promise<string | null> {
  try {
    const data = await invoke<string>("bookmark_create", { path });
    return data.length > 0 ? data : null;
  } catch (e) {
    console.warn("[bookmark] üretilemedi:", e);
    return null;
  }
}

export interface ResolvedBookmark {
  /** Klasörün güncel yolu (kullanıcı taşımış olabilir). */
  path: string;
  /** Bookmark eskimiş — çağıran taraf yenisini üretip saklamalı. */
  stale: boolean;
}

/**
 * Bookmark'ı çözer ve klasöre erişimi başlatır.
 * Başarısızlıkta null döner (kasa erişilemez → kullanıcıya yeniden seçtirilmeli).
 */
export async function resolveBookmark(data: string): Promise<ResolvedBookmark | null> {
  try {
    return await invoke<ResolvedBookmark>("bookmark_resolve", { data });
  } catch (e) {
    console.warn("[bookmark] çözülemedi:", e);
    return null;
  }
}

/**
 * Klasöre erişimi bırakır. Kasa değiştirilirken çağrılır.
 * Bırakılmazsa çekirdek kaynağı sızar ve uygulama sandbox dışına erişimini kaybeder.
 */
export async function releaseBookmark(path: string): Promise<void> {
  try {
    await invoke("bookmark_release", { path });
  } catch {
    /* sandbox dışında anlamsız — yok say */
  }
}

/** Uygulama macOS sandbox'ında mı çalışıyor (Mac App Store sürümü)? */
export const appIsSandboxed = () => invoke<boolean>("app_is_sandboxed").catch(() => false);

/**
 * Kasa klasörünü fs eklentisinin çalışma zamanı kapsamına alır.
 *
 * Statik kapsam yalnız `$HOME`/`$APPDATA` altını kapsar. macOS'ta erişim bookmark çözülürken
 * zaten veriliyor, ama Windows/Linux'ta bookmark üretilmez: kasa klasörü seçildiği anda izinli
 * olur, uygulama kapatılıp açılınca bir daha olmaz. Kasası ev klasörünün dışında olan
 * (D: sürücüsü, harici disk) kullanıcı her açılışta "Kasa açılamadı" görürdü.
 *
 * Başarısızlık ölümcül değildir: kapsam zaten kasayı içeriyor olabilir.
 */
export async function allowVaultPath(path: string): Promise<void> {
  if (!path) return;
  try {
    await invoke("vault_allow", { path });
  } catch (e) {
    console.warn("[vault] kapsama alınamadı:", e);
  }
}

// Modüller sayfası (LOM-112) — saf hesap; React yok.
//
// Altı modül, Ayarlar özellik kartlarıyla (LOM-82) aynı kimliklerdir: liste FEATURE_IDS'ten gelir.
// "Kurulu" sayılma kuralı: kayıtlı bayrak true YA DA modül şu an açık. Tekrar'ın açık/kapalı bilgisi
// kasadan geç okunduğu için kurulu bilgisi kayıt açılırken hesaplanmaz, her çizimde türetilir.
import { FEATURE_IDS, isFeatureId, type FeatureId } from "./features";

export type ModulesView = "grid" | "list";

/** Kayıtlı görünüm: bozuksa ızgara. */
export function normalizeModulesView(v: unknown): ModulesView {
  return v === "list" ? "list" : "grid";
}

/** Bir kez kurulan (ya da elle açılıp kapatılan) modüller. */
export type ModulesInstalled = Partial<Record<FeatureId, boolean>>;

/** Kayıtlı kurulu bayrakları: nesne değilse boş; yalnız bilinen kimlik ve true değerler tutulur. */
export function normalizeModulesInstalled(v: unknown): ModulesInstalled {
  const out: ModulesInstalled = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (isFeatureId(k) && x === true) out[k] = true;
  }
  return out;
}

/** Modül kurulu mu: kayıtlı bayrak ya da şu an açık. */
export function isModuleInstalled(id: FeatureId, installed: ModulesInstalled, on: boolean): boolean {
  return on || installed[id] === true;
}

export type ModuleCta = "install" | "switch" | "locked";

/**
 * Kartın eylemi: kilitli (Tekrar ayarı okunmadı) → "locked"; kurulu → Aktif/Pasif anahtarı;
 * değilse Kur.
 */
export function moduleCta(
  id: FeatureId,
  st: { installed: ModulesInstalled; on: boolean; locked: boolean },
): ModuleCta {
  if (st.locked) return "locked";
  return isModuleInstalled(id, st.installed, st.on) ? "switch" : "install";
}

/** Detay sayfası yalnız kurulu ve aktif modülde açılır. */
export function canOpenDetail(installed: boolean, on: boolean): boolean {
  return installed && on;
}

/** Özet sayaç: toplam modül ve aktif olanlar. */
export function moduleCounts(isOn: (id: FeatureId) => boolean): { total: number; active: number } {
  return { total: FEATURE_IDS.length, active: FEATURE_IDS.filter((id) => isOn(id)).length };
}

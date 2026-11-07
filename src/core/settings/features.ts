// Ayarlar: özellik kartları (LOM-82) — saf hesap; Ayarlar üstündeki kartlar, kayıt (store) ve
// uygulamadaki gizleme kuralları bunu kullanır.
//
// Altı özellik tek yerden çözülür. Yalnız Yedekleme (GitHub), Takvim, Alışkanlık ve Kütüphane için YENİ bayrak
// tutulur; Tekrar `srsSettings.enabled` (kasadaki ayar dosyası), Asistan `aiEnabled` olarak zaten
// vardı — ikinci bir kopya tutulmaz ki iki yer birbirini tutmasın.

/** Kart sırası: Yedekleme, Takvim, Tekrar, Asistan, Alışkanlık Takibi, Kütüphane (LOM-83). */
export const FEATURE_IDS = ["github", "calendar", "review", "assistant", "habits", "library"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

/** Kayıtta tutulan yeni bayraklar (LOM-82; Kütüphane LOM-83). */
export interface FeatureFlags {
  github: boolean;
  calendar: boolean;
  habits: boolean;
  library: boolean;
}

/** Varsayılan: hepsi açık — güncelleme sonrası kimsede bir şey kaybolmasın. */
export const DEFAULT_FEATURES: Readonly<FeatureFlags> = Object.freeze({
  github: true,
  calendar: true,
  habits: true,
  library: true,
});

const FLAG_KEYS = ["github", "calendar", "habits", "library"] as const;

export function isFeatureId(v: unknown): v is FeatureId {
  return typeof v === "string" && (FEATURE_IDS as readonly string[]).includes(v);
}

/**
 * Kayıtlı bayrakları temizle: nesne değilse varsayılan; alan boolean değilse o alan varsayılan;
 * bilinmeyen alanlar atılır. Her zaman yeni nesne döner.
 */
export function normalizeFeatures(v: unknown): FeatureFlags {
  const src = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out = { ...DEFAULT_FEATURES };
  for (const k of FLAG_KEYS) if (typeof src[k] === "boolean") out[k] = src[k] as boolean;
  return out;
}

export interface FeatureSources {
  features: FeatureFlags;
  /** Tekrar: kasadaki ayar dosyasındaki `enabled`. */
  srsEnabled: boolean;
  /** Asistan: `aiEnabled`. */
  aiEnabled: boolean;
}

/** Özellik açık mı — beş kimlik için doğru kaynağı okur. */
export function isFeatureOn(id: FeatureId, src: FeatureSources): boolean {
  switch (id) {
    case "review":
      return src.srsEnabled;
    case "assistant":
      return src.aiEnabled;
    default:
      return src.features[id];
  }
}

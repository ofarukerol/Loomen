import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import tr from "./locales/tr/translation.json";
import en from "./locales/en/translation.json";

// Çok dilli altyapı (bkz docs 07-i18n.md):
// - Kaynak dil Türkçe; fallback zinciri daima TR'ye düşer.
// - İlk fazda TR + EN + AR; AR (RTL) ileride otomatik çeviri pipeline'ı ile dolacak.
// - 20 dile ölçek: yeni dil = locale ekle + resource bağla, kod değişmez.
export const SUPPORTED_LOCALES = ["tr", "en", "ar"] as const;
export const RTL_LOCALES = new Set(["ar"]);
export const DEFAULT_LOCALE = "tr";

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
    // ar henüz boş — eksik anahtarlar TR'ye fallback (kırık metin yok)
    ar: { translation: {} },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

/** Aktif dile göre <html dir> ayarla (RTL desteği). */
export function applyDir(lang: string) {
  document.documentElement.dir = RTL_LOCALES.has(lang) ? "rtl" : "ltr";
  document.documentElement.lang = lang;
}

export default i18n;

---
name: LOM-82 — Ayarlar: özellikleri açıp kapatma en üste, görsel kartlarla
description: Ayarlar sayfasının en üstüne Yedekleme (GitHub), Takvim, Tekrar, Asistan ve Alışkanlık Takibi için açma/kapama düğmeli beş görsel kart eklenir; kapalı özelliğin ayar bölümü ve uygulama içindeki girişleri (şerit düğmesi, sağ blok kartı, otomatik eşitleme) gizlenir, verisi ve bağlantısı silinmez, seçim kalıcı tutulur.
type: project
proje: loomen
kaynak: kart LOM-82 · dal fix/LOM-82 · Loomen@f39777c6c5a145972a696eb63e6c5ca3b5c55650 · test koşusu 46b23ba6-d81d-4377-b9e8-4144ea92640e (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-05
---

# LOM-82 — Ayarlar: özellikleri açıp kapatma en üste, görsel kartlarla

## Ne yapıldı

Ayarlar sayfasının en üstüne Yedekleme (GitHub), Takvim, Tekrar, Asistan ve Alışkanlık Takibi için açma/kapama düğmeli beş görsel kart eklenir; kapalı özelliğin ayar bölümü ve uygulama içindeki girişleri (şerit düğmesi, sağ blok kartı, otomatik eşitleme) gizlenir, verisi ve bağlantısı silinmez, seçim kalıcı tutulur.

## Adımlar

- Saf çekirdek modülü yaz: `Loomen/src/core/settings/features.ts`. İçerik: `FEATURE_IDS = ["github","calendar","review","assistant","habits"]` (kart sırası), `FeatureFlags = { github; calendar; habits }` (yalnız YENİ üç bayrak; Tekrar = `srsSettings.enabled`, Asistan = `aiEnabled` olarak zaten var, ikinci bir kopya tutulmaz), `DEFAULT_FEATURES` (üçü de true: güncelleme sonrası kimsede bir şey kaybolmasın), `normalizeFeatures(v: unknown)` (nesne değilse varsayılan; alan boolean değilse varsayılan; fazla alan atılır), `isFeatureOn(id, { features, srsEnabled, aiEnabled })` (beş kimliği tek yerden çözer). Yorumlar Türkçe, LOM-82 referanslı.
- Store (`Loomen/src/store/useAppStore.ts`): `features: FeatureFlags` alanı ve `DEFAULT_FEATURES` başlangıcı; `setFeatureOn(id: FeatureId, on: boolean)` eylemi: github/calendar/habits → `features` güncellenir; review → `srsSetSettings({ enabled: on })` (status ready değilse hiçbir şey yapmaz, mevcut LOM-71 koruması); assistant → `aiSetEnabled(on)`. Kapatılan özellik o an açık ekransa (`screen` habits/assistant/review) `planner`a dön. `partialize`e `features: s.features`, `merge`e `features: p.features === undefined ? current.features : normalizeFeatures(p.features)` ekle.
- Gating: `Loomen/src/App.tsx` otomatik eşitleme etkilerine `features.github` / `features.calendar` şartı ekle (kapalıyken aralık kurulmaz). `Loomen/src/components/Ribbon.tsx` alışkanlık düğmesi yalnız `features.habits` iken. `Loomen/src/components/MobileTopBar.tsx` menüdeki Alışkanlıklar maddesi yalnız `features.habits` iken. `Loomen/src/screens/Planner/HabitsTodayCard.tsx` özellik kapalıyken null döner. `Loomen/src/components/Explorer.tsx` alt şeritte `!ghToken || !features.github` ise yerel/eşitleme yok etiketi. `Loomen/src/screens/Settings/SideCardsSettings.tsx` habits satırına da `features.habits` kapalıyken "kapalı" rozeti.
- Yeni bileşen `Loomen/src/screens/Settings/FeatureCards.tsx`: `FEATURE_IDS` sırasıyla beş kart (lucide ikon: Github, CalendarDays, Repeat2, Sparkles, Sprout). Her kartta ad, kısa açıklama, durum satırı ve `lo-switch` düğmesi. Durum: github → bağlıysa `@login` yoksa "bağlı değil"; calendar → bağlıysa hesap e-postası/takvim adı yoksa "bağlı değil"; review → status loading ise "yükleniyor" (düğme disabled), error ise "okunamadı" + Yeniden dene (ReviewSettingsGate'in retry'ı), ready ise "{{n}} kart"; assistant → "{{n}} sağlayıcı" ya da tarayıcıda "yalnız uygulamada"; habits → `activeHabits` sayısı. Mobil/tarayıcı kısıtları (isTauri, hasCreds) yalnız alt bölümde kalır, kartta düğme çalışır. Kapalı kartta `is-off` sınıfı.
- `Loomen/src/screens/Settings/SettingsScreen.tsx`: başlığın hemen altına `<FeatureCards />`; aşağıda `GitHubSync` yalnız `features.github`, `GoogleCalendarSync` yalnız `features.calendar`, `AiSettings` yalnız `aiEnabled`, `ReviewSettings` yalnız `srsSettingsStatus === "ready" && srsSettings.enabled` iken çizilir. Kasalar grubu (`lo-set__group`) GitHub kapalıyken yalnız VaultManager'ı içerir.
- `Loomen/src/screens/Settings/AiSettings.tsx`: kart içindeki "etkinleştir" satırı ve `enabled` koşulları kaldırılır (bölüm artık yalnız açıkken çiziliyor); `appOnly` uyarısı ve diğer satırlar aynen kalır. `Loomen/src/screens/Settings/ReviewSettings.tsx`: `ReviewSettingsBody`deki etkinleştir satırı ve `cfg.enabled` koşulu kaldırılır (kart sayısı artık üst kartta), gate dalı güvenlik için kalır.
- Metinler: `Loomen/src/i18n/locales/tr|en|ar/translation.json` içine `settings.features` altında `title`, `sub`, her kimlik için `name` ve `desc`, durum metinleri (`notConnected`, `connectedAs` {{name}}, `loading`, `readError`, `retry`, `cards` {{n}}, `providers` {{n}}, `appOnly`, `habitsCount` {{n}}, `on`, `off`). Üç dilde aynı anahtar seti; Arapça metinler Arapça harf içerir.
- Stil `Loomen/src/styles/app.css`: `.lo-set__feats` (iki sütunlu grid, dar ekranda tek sütun, mantıksal özellikler/RTL uyumlu), `.lo-feat` kartı (`lo-card` üstüne ikon dairesi vurgu rengiyle, ad, açıklama, durum satırı, sağ üstte düğme), `.lo-feat.is-off` (soluk ikon), `.lo-feat__status`, `.lo-feat__retry`. Mevcut `lo-switch` kullanılır.
- Test `Loomen/src/core/__test__/featuresTest.ts` (sideCardsTest biçiminde, check/section): varsayılanlar açık; normalize bozuk/eksik/fazla alan; `isFeatureOn` beş kimlik için doğru kaynağı okur; kart sırası beş kimlik; üç dilde `settings.features` anahtarları eşit, boş yok, ar Arapça; kaynak denetimi: SettingsScreen kaynağında `FeatureCards` ilk Section'dan önce, GitHubSync/GoogleCalendarSync/AiSettings/ReviewSettings koşullu; store kaynağında partialize `features:` ve merge `normalizeFeatures` geçiyor; AiSettings ve ReviewSettings'te `ai.enable` / `review.set.enable` satırı kalmadı. `Loomen/scripts/run-tests.mjs` suites listesine ekle.
- Wiki: `Loomen/LoomenWiki/modules/mimari.md` sonuna kısa "Ayarlar: özellik kartları (LOM-82)" bölümü (beş kart, hangi bayrak nerede saklanır, kapatınca ne gizlenir, veri silinmez).
- `npm run typecheck` ve `npm test` koş; ikisi de yeşil olmadan bitti deme. Commit mesajında AI imzası yok (AGENTS.md).

## Dokunulan dosyalar

- `Loomen/src/core/settings/features.ts`
- `Loomen/src/core/__test__/featuresTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/App.tsx`
- `Loomen/src/components/Ribbon.tsx`
- `Loomen/src/components/MobileTopBar.tsx`
- `Loomen/src/components/Explorer.tsx`
- `Loomen/src/screens/Planner/HabitsTodayCard.tsx`
- `Loomen/src/screens/Settings/FeatureCards.tsx`
- `Loomen/src/screens/Settings/SettingsScreen.tsx`
- `Loomen/src/screens/Settings/AiSettings.tsx`
- `Loomen/src/screens/Settings/ReviewSettings.tsx`
- `Loomen/src/screens/Settings/SideCardsSettings.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi temiz geçti. npm test ile 40 test dosyasının hepsi geçti, düşen yok. Yeni özellik kartı testi de bunların içinde. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-82`
- Commit: `Loomen@f39777c6c5a145972a696eb63e6c5ca3b5c55650`
- Test koşusu: `46b23ba6-d81d-4377-b9e8-4144ea92640e` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

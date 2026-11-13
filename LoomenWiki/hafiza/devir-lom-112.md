---
name: LOM-112 — Loomen'e Modüller menüsü (yeni sayfa)
description: Loomen'in sol menüsüne Modüller sayfası eklenecek: altı bölüm (Yedekleme, Takvim, Tekrar, Asistan, Alışkanlık, Kütüphane) ızgara ya da liste halinde kart kart duracak, kurulmamışta Kur, kurulmuşta Aktif/Pasif anahtarı çıkacak, aktif modülün kendi detay sayfası açılacak; Ayarlar'ın tepesindeki kartlar buraya taşınacak.
type: project
proje: loomen
kaynak: kart LOM-112 · dal fix/LOM-112 · Loomen@c5062e373f5645af3e82fe4e3e5902aeaeca4763 · test koşusu 65e28765-de26-454c-87a4-34508f74bd76 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-13
---

# LOM-112 — Loomen'e Modüller menüsü (yeni sayfa)

## Ne yapıldı

Loomen'in sol menüsüne Modüller sayfası eklenecek: altı bölüm (Yedekleme, Takvim, Tekrar, Asistan, Alışkanlık, Kütüphane) ızgara ya da liste halinde kart kart duracak, kurulmamışta Kur, kurulmuşta Aktif/Pasif anahtarı çıkacak, aktif modülün kendi detay sayfası açılacak; Ayarlar'ın tepesindeki kartlar buraya taşınacak.

## Adımlar

- Önce oku: Loomen/src/screens/Settings/FeatureCards.tsx (kart, durum metni ve Tekrar kilidi kalıbı), Loomen/src/core/settings/features.ts, Loomen/src/store/useAppStore.ts (setFeatureOn 2843, merge 5929, partialize 6016), Loomen/src/App.tsx (ekranlar 339-351, geri tuşu katmanları 248-256), Loomen/src/components/Ribbon.tsx, Loomen/src/components/MobileTopBar.tsx, Loomen/src/core/__test__/featuresTest.ts. Yeni bağımlılık ekleme; commit mesajında AI imzası yok.
- Loomen/src/core/settings/modules.ts (yeni, saf; React yok): `ModulesView = "grid" | "list"`, `normalizeModulesView(v)` (bozuksa grid); `ModulesInstalled = Partial<Record<FeatureId, boolean>>`, `normalizeModulesInstalled(v)` (nesne değilse boş; yalnız bilinen kimlik ve true değerleri tutulur); `isModuleInstalled(id, installed, on)` = kayıtlı bayrak true YA DA modül şu an açık; `moduleCta(id, {installed, on, locked})` → "install" | "switch" | "locked"; `canOpenDetail(installed, on)` = kurulu ve aktif; `moduleCounts(...)` → {total, active}. Kimlik listesi FEATURE_IDS'ten gelir, ikinci liste tutulmaz.
- Loomen/src/store/useAppStore.ts: Screen tipine "modules" ekle. Yeni alanlar: `modulesView` (varsayılan grid), `modulesInstalled` (varsayılan {}), `moduleDetailId: FeatureId | null`. Eylemler: `setModulesView(v)`, `moduleOpenDetail(id | null)` (id verilince screen modules olur), `installModule(id)` (Tekrar ayarı okunmadıysa hiçbir şey yapmaz; yoksa bayrağı true yapar ve setFeatureOn(id, true) çağırır). setFeatureOn içinde, Tekrar erken dönüşünden SONRA `modulesInstalled[id] = true` yaz (bir kez elle açılıp kapatılan modül Kur'a geri dönmesin) ve kapatılan modülün detayı açıksa `moduleDetailId` null yap. partialize'a `modulesView` ve `modulesInstalled` ekle; merge'de ikisini normalize et (undefined ise current). featuresTest'in aradığı satırları (`if (s.srsSettingsStatus !== "ready") return;`, `library: ["library", "reader"]`, `features: s.features,`, merge'deki features satırı) aynen koru.
- Loomen/src/screens/Modules/moduleUi.ts (yeni): FeatureCards'taki ICONS eşlemesi ve durum metni hesabı buraya `useModuleInfo()` kancası olarak taşınır (ad, açıklama, durum metni, açık mı, kilitli mi, hata mı, yeniden dene). Metinler mevcut `settings.features.*` anahtarlarından okunur; o anahtarlara dokunma. Her modüle sabit bir ton sınıfı ver (ör. data-tone) ki kartlar birbirinden ayrışsın.
- Loomen/src/screens/Modules/ModuleCard.tsx (yeni): ızgara ve liste için tek bileşen (`view` prop). İçerik: renkli ikon karosu, ad, açıklama, durum çipi (Aktif / Pasif / Kurulmadı), durum satırı. Sağ/alt eylem: kurulmamışsa `Kur` düğmesi (kilitliyse disabled), kuruluysa `lo-switch` (role=switch, aria-checked, aria-label) Aktif/Pasif; Tekrar okunamadıysa Yeniden dene. Aktif kartın gövdesi düğmedir ve detayı açar (ok simgesi görünür); anahtar ve Kur tıklaması detayı açmaz (stopPropagation). `data-module`, `data-state` öznitelikleri koy (test ve otomasyon için).
- Loomen/src/screens/Modules/ModuleDetail.tsx (yeni): üstte Geri düğmesi (liste), büyük ikon, ad, açıklama, durum ve Aktif/Pasif anahtarı olan başlık alanı. Gövde: github → `<GitHubSync />`, calendar → `<GoogleCalendarSync />`, review → `<ReviewSettings />`, assistant → `<AiSettings />`; habits ve library → kısa bilgi kartı + modül ekranını açan `Aç` düğmesi (setScreen habits/library). Gövde 680px'lik sütunda dursun ki ayar bölümleri bozulmasın. Modül pasife alınırsa ya da kurulu değilse detay kapanır (liste görünür).
- Loomen/src/screens/Modules/ModulesScreen.tsx (yeni): `moduleDetailId` doluysa ve canOpenDetail true ise ModuleDetail, değilse liste. Liste: yaratıcı bir üst alan (başlık, alt yazı, "N modülden M aktif" özeti, yumuşak vurgu renkli degrade zemin), sağda ızgara/liste seçici (iki ikonlu segment, aria-pressed), altında FEATURE_IDS sırasıyla ModuleCard'lar. Kapsayıcı `lo-scroll`. Hook'lar erken return'den önce dursun.
- Loomen/src/App.tsx: `{screen === "modules" && <ModulesScreen />}` ekle; geri tuşu katmanlarına `if (screen === "modules" && moduleDetailId) closers.push(() => moduleOpenDetail(null))` ekle (habits kalıbının hemen altı). explorerEligible ve rightEligible listelerine modules EKLEME (Ayarlar gibi tam genişlik).
- Loomen/src/components/Ribbon.tsx: alt grupta Yardım'ın üstüne `btn("modules", t("ribbon.modules"), <Puzzle .../>)` ekle; her zaman görünür. Mevcut `habitsOn && btn("habits"` ve `libraryOn && btn("library"` satırlarını değiştirme. Loomen/src/components/MobileTopBar.tsx: ⋮ menüsüne her zaman görünen Modüller maddesi ekle (onModules: setScreen modules + menüyü kapat); `hasMenu` artık hep true olur, koşulu sadeleştir; Alışkanlıklar ve Kütüphane maddelerinin JSX'ini aynen bırak.
- Loomen/src/screens/Settings/SettingsScreen.tsx: `<FeatureCards />` ve import'unu kaldır; yerine başlığın altına tek satırlık kart koy (ad: Modüller, alt yazı, `Aç` düğmesi → setScreen modules; `data-modules-link`). Alttaki koşullu bölümler (`features.github && <GitHubSync />` vb.) aynen kalır. Loomen/src/screens/Settings/FeatureCards.tsx dosyasını `git rm` ile kaldır (içeriği moduleUi ve ModuleCard'a taşındı).
- Loomen/src/styles/app.css: eski `.lo-set__feats`, `.lo-set__featsub`, `.lo-feat*` kurallarını kaldır. Yeni `.lo-mod*` blokları: sayfa kapsayıcısı (max-width ~960px), üst alan (degrade, yuvarlak köşe, özet sayaç), görünüm seçici, ızgara (`repeat(auto-fill, minmax(260px, 1fr))`), liste satırı, kart (ton rengiyle ikon karosu, hover'da hafif yükselme, pasifte soluk, kurulmamışta kesikli kenar), durum çipi, Kur düğmesi, detay başlığı ve gövdesi. Yalnız tema değişkenleri (var(--bg-elev), var(--line), var(--accent) …) ve mantıksal özellikler kullan (koyu tema ve sağdan sola bozulmasın); `prefers-reduced-motion`'da geçişleri kapat; mobilde (`.lo-app.is-mobile`) tek sütun ve en az 36px dokunma alanı.
- Loomen/src/i18n/locales/tr|en|ar/translation.json: `ribbon.modules` ekle; yeni üst düzey `modules` bölümü üç dilde aynı anahtarlarla: title, sub, summary ({{active}}, {{total}}), viewGrid, viewList, install, active, passive, notInstalled, open, back, details, openScreen, settingsLink, settingsLinkSub, lockedHint. `settings.features` anahtarlarına dokunma. Arapça metinler Arapça harfle.
- Loomen/src/core/__test__/modulesTest.ts (yeni; featuresTest'teki check/section kalıbı): normalizeModulesView ve normalizeModulesInstalled bozuk/eksik/fazla girdide; isModuleInstalled (açık modül her zaman kurulu, kapalı + bayraksız kurulu değil, kapalı + bayraklı kurulu); moduleCta üç durumu; canOpenDetail; moduleCounts; üç dilde `modules` ve `ribbon.modules` anahtarları eşit, boş yok, ar Arapça, summary yer tutucuları var. Kaynak denetimi: Screen tipinde modules, App.tsx'te ModulesScreen ve geri katmanı, Ribbon'da `btn("modules"`, MobileTopBar'da Modüller maddesi, partialize/merge'de modulesView ve modulesInstalled, setFeatureOn içinde modulesInstalled yazımı, ModuleDetail'de dört ayar bileşeni, ModuleCard'da Kur ve role="switch". Loomen/scripts/run-tests.mjs suites listesine ekle.
- Loomen/src/core/__test__/featuresTest.ts: "özellik kartları başlığın altında" denetimini "Ayarlar'da FeatureCards yok, Modüller bağlantı satırı başlığın altında ve ilk bölümden önce" olarak değiştir; diğer denetimler aynen geçmeli.
- Loomen/LoomenWiki/modules/mimari.md: sonuna kısa "Modüller sayfası (LOM-112)" bölümü ekle (ekran, kurulu sayılma kuralı, hangi bilgi nerede saklanır, detayda hangi ayar bileşeni çizilir, Ayarlar'daki kartların kalktığı); LOM-82 bölümüne kartların taşındığını not düş.
- `npm run typecheck` ve `npm test` koş; ikisi de yeşil olmadan bitti deme. Sonuçta görünümün gözle denenmediğini açıkça yaz.

## Dokunulan dosyalar

- `Loomen/src/core/settings/modules.ts`
- `Loomen/src/core/__test__/modulesTest.ts`
- `Loomen/src/core/__test__/featuresTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/App.tsx`
- `Loomen/src/components/Ribbon.tsx`
- `Loomen/src/components/MobileTopBar.tsx`
- `Loomen/src/screens/Modules/moduleUi.ts`
- `Loomen/src/screens/Modules/ModuleCard.tsx`
- `Loomen/src/screens/Modules/ModuleDetail.tsx`
- `Loomen/src/screens/Modules/ModulesScreen.tsx`
- `Loomen/src/screens/Settings/SettingsScreen.tsx`
- `Loomen/src/screens/Settings/FeatureCards.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/LoomenWiki/modules/mimari.md`
- `Loomen/src/screens/Modules`

## Test

Testler geçti.

> Tip denetimi hatasız geçti. Tam test takımı (72 dosya) geçti. modulesTest 50/50, featuresTest 40/40. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-112`
- Commit: `Loomen@c5062e373f5645af3e82fe4e3e5902aeaeca4763`
- Test koşusu: `65e28765-de26-454c-87a4-34508f74bd76` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

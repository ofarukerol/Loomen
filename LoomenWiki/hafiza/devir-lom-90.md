---
name: LOM-90 — Geniş ekranda not ve tablo bütün genişliği kullansın
description: Not editöründe düzenleme ve okuma modundaki 760/680 px genişlik sınırı, Ayarlar → Editör'e eklenen "Tam genişlik" anahtarıyla (varsayılan açık) kaldırılır; tablolar geniş ekranda sütunun tamamını kullanır.
type: project
proje: loomen
kaynak: kart LOM-90 · dal fix/LOM-90 · Loomen@3000969aed259d3cd8565a0dde96d2d2d75c87c8 · test koşusu fafcbbb7-0273-48a5-99f4-425aaa408fd7 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-07
---

# LOM-90 — Geniş ekranda not ve tablo bütün genişliği kullansın

## Ne yapıldı

Not editöründe düzenleme ve okuma modundaki 760/680 px genişlik sınırı, Ayarlar → Editör'e eklenen "Tam genişlik" anahtarıyla (varsayılan açık) kaldırılır; tablolar geniş ekranda sütunun tamamını kullanır.

## Adımlar

- Loomen/src/store/useAppStore.ts: `EditorSettings` arayüzüne `fullWidth: boolean` ekle (satır 173-177); varsayılan ayarlara `fullWidth: true` ekle (satır 1532). `merge` içinde (satır 4023) editorSettings birleşiminden sonra `fullWidth` boolean değilse varsayılana (true) çek.
- Loomen/src/screens/Editor/editorLayout.ts: saf bir `editorRootClass({ narrow, wide }: { narrow: boolean; wide: boolean }): string` fonksiyonu ekle; "lo-editor" döner, narrow ise " lo-editor--narrow", wide ise " lo-editor--wide" ekler. React import etme (node testi çağırır).
- Loomen/src/screens/Editor/EditorScreen.tsx: `const fullWidth = useAppStore((s) => s.editorSettings.fullWidth)` oku; satır 211'deki kök div sınıfını `editorRootClass({ narrow, wide: fullWidth })` ile üret.
- Loomen/src/styles/app.css: `.lo-prose` kuralının (satır 865) hemen altına tek kural ekle: `.lo-editor--wide .lo-editor__editwrap, .lo-editor--wide .lo-editor__preview, .lo-editor--wide .lo-prose { max-width: none; }`. Mevcut 760/680 px kuralları ve iç boşluklar (padding 40px) aynen kalsın; anahtar kapalıyken dar sütun korunur. Başına LOM-90 açıklama yorumu yaz.
- Loomen/src/screens/Editor/CodeMirrorEditor.tsx satır 44: `.cm-content` temasından `maxWidth: "760px"` değerini kaldır (genişliği zaten `.lo-editor__editwrap` sarmalayıcısı yönetiyor; sabit kalırsa tam genişlik modunda düzenleme alanı 760'ta takılır).
- Loomen/src/screens/Settings/SettingsScreen.tsx: `editorRows` listesine `{ key: "fullWidth", label: t("settings.fullWidth") }` satırını ekle (Canlı önizleme'den sonra). Mevcut Toggle ve toggleEditorSetting aynen kullanılır.
- Loomen/src/i18n/locales/tr|en|ar/translation.json: `settings` altına `fullWidth` anahtarı ekle: tr "Tam genişlik", en "Full width", ar "العرض الكامل" (spellCheck satırının yanına).
- Loomen/src/core/__test__/editorWidthTest.ts (yeni): mevcut test biçimiyle (check/ran/fails, kaynak okuma) şunları denetle: editorRootClass dört kombinasyonu doğru sınıf dizgisini verir; app.css'te `.lo-editor--wide` kuralı üç seçiciyi de (`__editwrap`, `__preview`, `.lo-prose`) kapsar ve `max-width: none` içerir; eski `.lo-editor__editwrap` 760px ve `.lo-prose` 680px kuralları hâlâ var (anahtar kapalı davranış); CodeMirrorEditor.tsx `.cm-content` kuralında px cinsinden maxWidth YOK; EditorScreen.tsx `editorRootClass` kullanır ve `editorSettings.fullWidth` okur; useAppStore.ts varsayılanı `fullWidth: true`; üç dil dosyasında `settings.fullWidth` dolu. Dosyayı Loomen/scripts/run-tests.mjs `suites` listesine ekle.
- `npm test` ve `npm run typecheck` koş; ikisi de yeşil olmadan commit etme. Commit mesajında AI imzası yok; dal fix/LOM-90.

## Dokunulan dosyalar

- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Editor/editorLayout.ts`
- `Loomen/src/screens/Editor/EditorScreen.tsx`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/screens/Settings/SettingsScreen.tsx`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/editorWidthTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> npm test koşuldu: 43 test dosyasının tümü geçti, yeni tam genişlik testi 24/24. Tip denetimi hatasız bitti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-90`
- Commit: `Loomen@3000969aed259d3cd8565a0dde96d2d2d75c87c8`
- Test koşusu: `fafcbbb7-0273-48a5-99f4-425aaa408fd7` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

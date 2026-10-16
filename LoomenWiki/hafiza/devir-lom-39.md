---
name: LOM-39 — Masaüstü: pencere üst çubuktan sürüklenemiyor
description: Masaüstünde pencerenin üst çubuktan sürüklenmesi için eksik Tauri izni (core:window:allow-start-dragging) eklenir, üst çubuktaki sekme şeridinin boşlukları da sürükleme bölgesi yapılır ve bu bir birim testiyle kilitlenir.
type: project
proje: loomen
kaynak: kart LOM-39 · dal fix/LOM-39 · Loomen@5a88b4ba1d510072b173d3f66ea7be41a76d5b02 · test koşusu a5b6f74f-fd56-4d59-a23b-5e52c43e898c (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-16
---

# LOM-39 — Masaüstü: pencere üst çubuktan sürüklenemiyor

## Ne yapıldı

Masaüstünde pencerenin üst çubuktan sürüklenmesi için eksik Tauri izni (core:window:allow-start-dragging) eklenir, üst çubuktaki sekme şeridinin boşlukları da sürükleme bölgesi yapılır ve bu bir birim testiyle kilitlenir.

## Adımlar

- src-tauri/capabilities/default.json: permissions listesine, core:default satırının hemen altına "core:window:allow-start-dragging" ekle. Başka izin ekleme; çift tıklama büyütme (internal-toggle-maximize) zaten core:default içinde. mobile.json'a dokunma.
- src/components/TopBar.tsx: sekme şeridi sarmalayıcısına (className lo-topbar__tabs olan div) data-tauri-drag-region ekle ki sekmeler arasındaki boşluk da sürüklesin. Kök .lo-topbar, .lo-topbar__os ve .lo-topbar__spacer işaretleri aynen kalsın. Düğmelere (lo-topbar__toggle, lo-topbar__new, lo-wtab__pin, lo-wtab__x), sekme kutusuna (lo-wtab) ve sekme adı span'ına işaret KOYMA; Tauri'nin sürükleme betiği yalnız doğrudan basılan öğede bu işareti arar, bu yüzden çocuk öğeler tıklanabilir kalır.
- Yeni test dosyası src/core/__test__/windowDragTest.ts yaz (updaterTest.ts'deki check/eq kalıbıyla, JSX yok): (a) node:fs ile src-tauri/capabilities/default.json'u oku ve JSON.parse et; permissions içinde "core:window:allow-start-dragging" ve "core:default" var, windows listesi "main" içeriyor, platforms macOS/windows/linux içeriyor diye kontrol et; (b) src-tauri/capabilities/mobile.json'da start-dragging YOK diye kontrol et (mobilde gereksiz); (c) src/components/TopBar.tsx kaynağını metin olarak oku ve className'i lo-topbar, lo-topbar__os, lo-topbar__spacer, lo-topbar__tabs olan div'lerin data-tauri-drag-region taşıdığını, hiçbir <button ...> etiketinin bu işareti taşımadığını, lo-wtab div'inin işaret taşımadığını regex ile doğrula. Dosya yolları process.cwd() tabanlı (run-tests.mjs cwd olarak depo kökünü verir).
- scripts/run-tests.mjs: suites listesine ["src/core/__test__/windowDragTest.ts", []] satırını ekle.
- LoomenWiki/modules/mimari.md: kısa bir not ekle: masaüstünde pencere sürükleme data-tauri-drag-region işareti + core:window:allow-start-dragging izni ister (core:default bu izni içermez, çift tıklama büyütmeyi içerir); Tauri sürükleme betiği yalnız doğrudan basılan öğedeki işarete bakar, bu yüzden düğmeler ve sekmeler işaretsiz bırakılır.
- Doğrula: npx tsc --noEmit çıktısız, npm test tümü yeşil (yeni windowDragTest dahil), npm run build başarılı. Derlenen uygulamada (Excalibur test derlemesi, CDP 9224 portu) otomatik canlı kontrol: document.querySelector('.lo-topbar__spacer').hasAttribute('data-tauri-drag-region') true; window.__TAURI_INTERNALS__.invoke('plugin:window|start_dragging') 'not allowed' hatasıyla reddedilmiyor; window.__TAURI_INTERNALS__.invoke('plugin:window|internal_toggle_maximize') sonrası pencere büyümüş/küçülmüş durumu değişiyor; üst çubuktaki + ve panel düğmeleri tıklanınca çalışıyor.

## Dokunulan dosyalar

- `Loomen/src-tauri/capabilities/default.json`
- `Loomen/src/components/TopBar.tsx`
- `Loomen/src/core/__test__/windowDragTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> tsc, npm test ve npm run build üçü de geçti. Yeni windowDragTest 15/15 geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-39`
- Commit: `Loomen@5a88b4ba1d510072b173d3f66ea7be41a76d5b02`
- Test koşusu: `a5b6f74f-fd56-4d59-a23b-5e52c43e898c` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

---
name: LOM-80 — Yan paneller: sağ panelde daraltma sınırı, sol panele genişlik ayarı
description: Sağ panelin alt genişlik sınırı 300 px'e çekilip kartlar bu sınırda taşmayacak şekilde düzenlenir; sol panele (gezgin) sağdakiyle aynı sürüklenebilir, klavyeyle de çalışan ve kayıtta saklanan genişlik tutamağı eklenir.
type: project
proje: loomen
kaynak: kart LOM-80 · dal fix/LOM-80 · Loomen@f9b3008e420ec830751edfce14254ce51a14bbe9 · test koşusu 202c1a26-040c-45a6-9292-b1f2046095c1 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-05
---

# LOM-80 — Yan paneller: sağ panelde daraltma sınırı, sol panele genişlik ayarı

## Ne yapıldı

Sağ panelin alt genişlik sınırı 300 px'e çekilip kartlar bu sınırda taşmayacak şekilde düzenlenir; sol panele (gezgin) sağdakiyle aynı sürüklenebilir, klavyeyle de çalışan ve kayıtta saklanan genişlik tutamağı eklenir.

## Adımlar

- Sağ sınır: `src/core/layout/rightPanel.ts` içinde RIGHT_PANEL_MIN 260 → 300 (yorumda LOM-80 ve neden: sayaç kartları + görev satırı 260'ta sığmıyor). `src/core/__test__/rightPanelTest.ts` beklentilerini yeni sınıra göre düzelt ('Sınırlar 300-560', dragStartWidth(280,500) artık MIN döner; 'dar pencerede ilk adım' örneğini 320 → 310 ile kur) ve tableWrapTest desenindeki gibi app.css'i okuyup `.lo-side` genişlik formülünde `max(300px` geçtiğini doğrula (CSS ile sabit senkron).
- Sağ CSS (`src/styles/app.css`): `.lo-side` genişliği `min(var(--side-w, 312px), max(300px, 100vw - 392px - var(--left-w, 0px)))` (392 = 56 şerit + 336 orta sütun; --left-w App'ten gelir). En dar genişlikte taşmayı önleyen kurallar: `.lo-stats--compact { flex-wrap: wrap }` ve `.lo-stat--sm { flex: 1 1 0 }` (kart min-content altına inmez, sığmazsa üçüncü kart alt satıra tam genişlik geçer); `.lo-mini__title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }` ve `.lo-mini__actions { flex-shrink:0 }`; `.lo-cal__weekdays` ve `.lo-cal__grid` sütunları `repeat(7, minmax(0, 1fr))`, `.lo-cal__month` ellipsis + `.lo-cal__nav { flex-shrink:0 }`; `.lo-revcard__head` ve `.lo-pomoc__start` metinleri için min-width:0/ellipsis. Üç dilde (tr/en/ar) metin uzunluklarını göz önüne al.
- Sol çekirdek: yeni `src/core/layout/leftPanel.ts`, rightPanel.ts'nin aynası: LEFT_PANEL_DEFAULT=248, MIN=200, MAX=480, STEP=16; clampLeftWidth (sayı değilse varsayılan, yuvarla), nextLeftWidth(start, dx, rtl) = clamp(start + (rtl ? -dx : dx)) (LTR'de tutamak sağ kenarda, sağa çekince genişler; RTL'de panel sağda, tutamak solda, sola çekince genişler), leftDragStartWidth(measured, stored), leftWidthForKey (Home MIN, End MAX, Enter varsayılan, ArrowRight LTR'de genişletir/RTL'de daraltır, Shift ×4, diğer tuş null).
- Sol testi: yeni `src/core/__test__/leftPanelTest.ts` (rightPanelTest deseni: sınırlar, bozuk kayıt, LTR/RTL yön, ölçülen genişlik, klavye) + app.css'te `.lo-explorer` genişliğinin `var(--left-w` ve `max(200px` içerdiği, `.lo-drawer .lo-explorer { width: auto` kuralının durduğu ve tr/en/ar `planner.resizeLeft` metinlerinin dolu olduğu (sideCardsTest gibi JSON import). `scripts/run-tests.mjs` listesine ekle.
- Store (`src/store/useAppStore.ts`): AppState'e `leftWidth: number` (yorum: masaüstü sol panel genişliği px, 200-480, kalıcı, LOM-80), `setLeftWidth(w)` (clamp; değişmediyse yazma) ve `resetLeftWidth()`; başlangıç LEFT_PANEL_DEFAULT; `partialize`'a leftWidth; `merge`'e `leftWidth: p.leftWidth === undefined ? current.leftWidth : clampLeftWidth(p.leftWidth)`.
- Yeni `src/components/LeftPanel.tsx`: RightPanel.tsx'in masaüstü dalını aynalar. `<div className="lo-leftwrap" style={{'--left-w': shown+'px'}}><Explorer /><div className="lo-left__grip" role=separator aria-orientation=vertical aria-label/title=t('planner.resizeLeft') aria-valuenow/min/max tabIndex=0 .../></div>`; sürüklemede yalnız yerel `live` değeri, bırakınca tek kez setLeftWidth; pointer capture, `.lo-app`'e `is-resizing`, pointercancel/lostpointercapture temizliği, çift tık resetLeftWidth, klavye leftWidthForKey; başlangıç genişliği sarmalayıcının ölçülen genişliğinden (getComputedStyle, border-box; tutamak absolute olduğu için sarmalayıcı = gezgin genişliği), ölçüm yoksa kayıtlı değer. Mobilde hiç çizilmez (App yalnız masaüstünde kullanır); MobileDrawer Explorer'ı aynen kullanmaya devam eder.
- `src/App.tsx`: masaüstünde `showExplorer` iken `<Explorer />` yerine `<LeftPanel />`; `.lo-app` style'ına `--left-w` ekle (showExplorer ? leftWidth px : 0px) ki sağ panel formülü orta sütunu koruyabilsin (accentVars ile birleştir).
- Sol CSS (`src/styles/app.css`): `.lo-leftwrap { position:relative; flex-shrink:0; display:flex; min-height:0 }`; `.lo-explorer` genişliği `min(var(--left-w, 248px), max(200px, 100vw - 692px))` (692 = 56 + 336 + 300), `.lo-drawer .lo-explorer { width:auto }` aynen kalır; `.lo-left__grip` kuralı `.lo-side__grip` ile ortak seçicide (inset-inline-end: -3px, 7px, col-resize, hover/aktif/odak çizgisi, touch-action none, z-index üstte). En dar genişlikte taşma önleyiciler: `.lo-explorer__title` min-width:0 + ellipsis, `.lo-explorer__vaultbtn { max-width:100%; min-width:0 }`, `.lo-explorer__pathline` zaten ellipsis; `.lo-tree__file`, `.lo-tree__group`, `.lo-fav__item`, `.lo-search__hitname` için `min-width:0; overflow-wrap:anywhere` (uzun ad kesilmez, sarılır); `.lo-explorer__bar` padding (trafik ışıkları için 40px) ve düğmeler 200 px'e sığar (142 px gerekir), gerekirse düğme aralığı 0.
- Çeviri: tr/en/ar translation.json `planner.resizeLeft` (resizeRight kalıbıyla: 'Sol panelin genişliği — sürükle ya da ok tuşlarını kullan; Home en dar, End en geniş, çift tık ya da Enter varsayılana döndürür' ve İngilizce/Arapça karşılıkları).
- Wiki: `LoomenWiki/modules/planlayici-takvim-pomodoro.md`'ye 'Yan panel genişlikleri (LOM-63, 67, 80)' bölümü: sağ 300-560 (varsayılan 312), sol 200-480 (varsayılan 248); tutamak, klavye, çift tık; kayıt alanları rightWidth/leftWidth; dar pencere formülleri ve orta sütun ≥336 px; mobilde tutamak yok.
- Doğrulama: `npm run typecheck`, `npm test`, `npm run build`. Sonra uygulamayı (vite dev ya da derlenmiş sürüm) tek Chrome oturumu kuralına uyarak (9333 kapısı, yeni sekme) aç; her iki tutamağa odaklanıp Home ile en dara çek; tr ve ar dillerinde `.lo-side`, içindeki `.lo-card`lar, `.lo-mini__row`, `.lo-explorer` ve `.lo-explorer__bar` için scrollWidth ≤ clientWidth olduğunu ölç; sayfayı yenileyip her iki genişliğin korunduğunu ve localStorage `loomen.settings` içinde leftWidth/rightWidth yazıldığını gör; 760 px pencerede tutamakların kaybolup çekmecenin eski genişlikte açıldığını doğrula. Not dosyalarına yazım olmadığını git status ile gör; commit mesajı Türkçe, AI imzası yok.

## Dokunulan dosyalar

- `Loomen/src/core/layout/rightPanel.ts`
- `Loomen/src/core/layout/leftPanel.ts`
- `Loomen/src/core/__test__/rightPanelTest.ts`
- `Loomen/src/core/__test__/leftPanelTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/components/LeftPanel.tsx`
- `Loomen/src/App.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md`

## Test

Testler geçti.

> Tip denetimi, tam birim test takımı (36 dosya) ve derleme hatasız geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-80`
- Commit: `Loomen@f9b3008e420ec830751edfce14254ce51a14bbe9`
- Test koşusu: `202c1a26-040c-45a6-9292-b1f2046095c1` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

---
name: LOM-22 — Dar pencerede not araç çubuğundaki Okuma düğmesi sağ panelin üstüne taşıyor
description: Dar orta sütunda (800x600, sağ panel açık, ~184 px) not araç çubuğunu sütun içinde alt satıra sardırmak ve yazı alanını sıfır genişliğe düşüren 288 px'lik Bağlantılar yan panelini dar sütunda alttan açılan pencereye çevirmek.
type: project
proje: loomen
kaynak: kart LOM-22 · dal fix/LOM-22 · Loomen@6988695ea0a4bb5720ecc50de7dac7a4eb9737d4 · test koşusu 7583fe90-22ba-4a43-a6c1-b86970faebaa (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-01
---

# LOM-22 — Dar pencerede not araç çubuğundaki Okuma düğmesi sağ panelin üstüne taşıyor

## Ne yapıldı

Dar orta sütunda (800x600, sağ panel açık, ~184 px) not araç çubuğunu sütun içinde alt satıra sardırmak ve yazı alanını sıfır genişliğe düşüren 288 px'lik Bağlantılar yan panelini dar sütunda alttan açılan pencereye çevirmek.

## Adımlar

- KÖK SEBEP (koddan doğrulandı, değişiklik öncesi bir kez gözle teyit et): 800 − 56 (ribbon) − 248 (gezgin) − 312 (sağ panel) = 184 px orta sütun. (1) Loomen/src/styles/app.css `.lo-editortoolbar` tek satır flex, sarma yok, 16+16 iç boşluk → 152 px; mikrofon (28) + Bağlantılar düğmesi (~43) + Okuma düğmesi (~95) + aralıklar buna sığmıyor, düğmeler küçülmediği için Okuma düğmesi sütundan taşıp sağ panelin üstüne biniyor. (2) Yazı alanı: store'da `backlinksCollapsed: false` varsayılan; `.lo-backlinks` 288 px ve `flex-shrink: 0`, `.lo-editor__body` ise 184 px → `.lo-editor__scroll` genişliği 0'a düşüyor. Panel kapalıyken bile `.lo-editor__editwrap` 40+40 iç boşlukla yazıya 104 px bırakıyor.
- Loomen/src/screens/Editor/editorLayout.ts (yeni, saf modül; React import etme): `export const NARROW_EDITOR_PX = 560;` ve `export function isNarrowEditor(width: number): boolean` — genişlik 0 ya da ölçülmemişse (<=0, NaN) false, aksi halde `width < NARROW_EDITOR_PX`. 560 = 288 px Bağlantılar paneli + okunabilir en az yazı genişliği.
- Loomen/src/hooks/useIsNarrow.ts (yeni; useIsMobile.ts'in yazım biçimine uy): `useIsNarrow(): [ (el: HTMLElement | null) => void, boolean ]` — callback ref + ResizeObserver ile öğenin genişliğini izler, `isNarrowEditor(width)` sonucunu state'te tutar; öğe değişince/kalkınca gözlemciyi kapatır. Callback ref şart: EditorScreen'de not yokken erken `return` var (satır 116), kök öğe sonradan mount oluyor. Yeni bağımlılık YOK (ResizeObserver tarayıcıda hazır).
- Loomen/src/screens/Editor/EditorScreen.tsx: (a) `const [narrowRef, narrow] = useIsNarrow();` hook'unu erken `return`den ÖNCE çağır; kök `<div className="lo-editor">` → `ref={narrowRef}` ve dar ise `lo-editor lo-editor--narrow` sınıfı. (b) `const sheetMode = isMobile || narrow;` tanımla; Bağlantılar düğmesinde, vurgu sınıfında, yan panel koşulunda (`!sheetMode && !backlinksCollapsed`) ve alttaki sheet bloğunda `isMobile` yerine `sheetMode` kullan — dar sütunda yan panel çizilmez, düğme mobildeki gibi alttan açılan pencereyi açar. (c) `useEffect(() => { if (!sheetMode) setBlSheetOpen(false); }, [sheetMode])` ekle (pencere genişleyince açık sheet kalmasın); bu effect de erken return'den önce durmalı. (d) Araç çubuğundaki `<div className="lo-tabs__spacer" />` satırını kaldır (yol metni artık kendisi esneyecek). Başka davranışa (kayıt, mod geçişi, ses notu) dokunma.
- Loomen/src/styles/app.css — araç çubuğu: `.lo-editortoolbar`'a `flex-wrap: wrap; row-gap: 6px; justify-content: flex-end; min-width: 0;` ekle. `.lo-crumbs`'a `flex: 1 1 0; min-width: 72px;` ekle; `.lo-crumbs__seg`'e `min-width: 0; overflow: hidden; text-overflow: ellipsis;` ekle (uzun yol kesilsin, düğmeleri itmesin). `.lo-modetoggle`'a `flex-shrink: 0; white-space: nowrap;` ekle; `.lo-editortoolbar .lo-tab__action { flex-shrink: 0; }` ekle. Sonuç: geniş pencerede görünüm aynı (yol solda, düğmeler sağda tek satır); dar sütunda sığmayan düğmeler sütunun İÇİNDE ikinci satıra iner. `.lo-voicerec__bar` (top:100%) sarılı çubukta da çubuğun altında kalır — kontrol et.
- Loomen/src/styles/app.css — sütun ve yazı alanı: `.lo-editor`'a `min-width: 0`, `.lo-editor__body`'ye `min-width: 0`, `.lo-editor__scroll`'a `min-width: 0` ekle. Dar sütun kuralları (mevcut `.lo-app.is-mobile` kalıbına benzer, editör bölümünün yanına): `.lo-editor--narrow .lo-editortoolbar { padding-inline: 10px; }`, `.lo-editor--narrow .lo-editortoolbar .lo-tab__action { padding: 0 8px; }`, `.lo-editor--narrow .lo-fmt { padding-inline: 10px; }`, `.lo-editor--narrow .lo-editor__editwrap, .lo-editor--narrow .lo-editor__preview { padding-inline: 14px; }`. Yalnız mantıksal özellik kullan (Arapça/RTL bozulmasın). `.lo-main`'e ya da `.lo-editor`'a `overflow: hidden` EKLEME (açılır menü ve ses kaydı çubuğu kesilebilir). Biçimlendirme çubuğu (`.lo-fmt`) zaten sarıyor; ona başka dokunma.
- Loomen/src/core/__test__/editorTest.ts: dosyadaki mevcut check/eq kalıbıyla `isNarrowEditor` testleri ekle: 184 → true, 559 → true, 560 → false, 1200 → false, 0 → false, NaN → false. (Dosya bu dalda yoksa aynı kalıpla `editorLayoutTest.ts` aç ve Loomen/scripts/run-tests.mjs listesine ekle; varsa run-tests.mjs'e dokunma.)
- DOĞRULAMA (yerel): `npm test` hepsi yeşil, `npx tsc --noEmit` çıktısız, `npm run build` başarılı. Kod gözden geçirme: mobilde (`isMobile`) davranış değişmedi — sheet ve gizli mod düğmesi aynı; geniş masaüstünde yan Bağlantılar paneli ve tek satır araç çubuğu aynı.
- OTOMATİK CANLI DENEME (Excalibur; önce Loomen/scripts/win-test/README.md'yi oku, sıra kuralına uy): pencereyi 800x600 yap, gezgin ve sağ panel AÇIK, bir not aç, düzenleme modunda. Ölç ve ekran görüntüsü al: `.lo-editortoolbar` içindeki her düğmenin (özellikle `.lo-modetoggle`) sağ kenarı `.lo-maincol` sağ kenarını geçmiyor; `.lo-editor__scroll` genişliği > 120 px ve yazı görünüyor; `.lo-side` üstünde editöre ait öğe yok. Okuma moduna geçip aynı ölçümü tekrarla. Bağlantılar düğmesine bas → alttan pencere açılıyor, karartmaya tıklayınca kapanıyor. Pencereyi 1280x800 yap → araç çubuğu tek satır, Bağlantılar yan panel olarak geri geliyor. Denenemeyen adımı raporda açıkça yaz.
- COMMIT: repo dilinde mesaj, AI imzası YOK, dal fix/LOM-22, push YOK. Not: fix/LOM-21 (henüz main'de değil) app.css'te yalnız `.lo-writebar` bloğuna dokunuyor; bu iş editör bölümlerine dokunduğu için çakışma beklenmez, yine de raporda belirt. Sonuçta test çıktısını (komut + geçti/kaldı satırı), ekran görüntüsü yolunu ve denenmeyen kısımları yaz.

## Dokunulan dosyalar

- `Loomen/src/styles/app.css`
- `Loomen/src/screens/Editor/EditorScreen.tsx`
- `Loomen/src/screens/Editor/editorLayout.ts`
- `Loomen/src/hooks/useIsNarrow.ts`
- `Loomen/src/core/__test__/editorTest.ts`

## Test

Testler geçti.

> Hızlı kontrol yeşil: tsc hatasız, npm test "8 test dosyasının tümü geçti", npm run build "built in 7.20s" (yalnız eski büyük dosya uyarısı). Excalibur'da LOM-22 dalı olmadığı için yerel çalışma kopyamı ayrı klasörde (C:\TestDerleme\Loomen-lom22, port 9234) derleyip canlı test koştum; ana depoya ve main'e dokunulmadı. Derleme tamam (npm ci 0, tauri build 0). 800x600 pencere, sağ panel açık, Inbox n

## Kanıt

- Dal: `fix/LOM-22`
- Commit: `Loomen@6988695ea0a4bb5720ecc50de7dac7a4eb9737d4`
- Test koşusu: `7583fe90-22ba-4a43-a6c1-b86970faebaa` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

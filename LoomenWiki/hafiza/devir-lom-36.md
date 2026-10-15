---
name: LOM-36 — Editör sağ-tık / uzun basma menüsü: Ekle kapanıyor, tüm seçenekler doğrulanacak
description: Editör uzun basma / sağ tık menüsünde grup başlığına (Ekle vb.) dokununca menünün kapanması düzeltilir; menü odağı çalmaz, yalnız yükseklik değişen boyutlanma menüyü kapatmaz; bütün komutlar birim testi ve otomatik senaryo betiğiyle doğrulanır.
type: project
proje: loomen
kaynak: kart LOM-36 · dal fix/LOM-36 · Loomen@21b35e200d98be0c39818e1114ce7514a9ac5d14 · test koşusu c1f9c7f7-5a39-4fc2-b7ca-32407e64cb7c (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-15
---

# LOM-36 — Editör sağ-tık / uzun basma menüsü: Ekle kapanıyor, tüm seçenekler doğrulanacak

## Ne yapıldı

Editör uzun basma / sağ tık menüsünde grup başlığına (Ekle vb.) dokununca menünün kapanması düzeltilir; menü odağı çalmaz, yalnız yükseklik değişen boyutlanma menüyü kapatmaz; bütün komutlar birim testi ve otomatik senaryo betiğiyle doğrulanır.

## Adımlar

- YENİDEN ÜRETME (düzeltmeden önce): scripts/win-test/menu-testi.mjs betiğini asistan-testi.mjs desenine göre yaz (Playwright LOOMEN_PW ile komşu depodan ödünç alınır, Loomen'e bağımlılık eklenmez). İki mod: LOOMEN_URL verilirse chromium.launch + vite dev adresi ve Pixel 5 cihaz profili (hasTouch, 375x667); verilmezse CDP 9224'e connectOverCDP ve Emulation.setDeviceMetricsOverride(375x667, mobile:true) + Emulation.setTouchEmulationEnabled. Senaryo: bir not aç, .cm-content üstünde Input.dispatchTouchEvent ile touchStart → 650 ms bekle → .lo-ctxmenu görünür mü (parmak hâlâ ekrandayken) → touchEnd → belgeye '[[]]' girdi mi (ilk öğe yanlışlıkla çalıştı mı) → 'Ekle' düğmesine dokun → aria-expanded ve alt öğeler (Tablo, Çağrı, Yatay çizgi, Kod bloğu) görünür mü → yüksekliği 667'den 360'a düşür (klavye taklidi: setViewportSize ya da setDeviceMetricsOverride) → menü hâlâ açık mı → 'Tablo'ya dokun → belgede tablo var mı ve menü kapandı mı. Betiği düzeltmesiz kodda koş, kapanma adımının kırmızı olduğunu sonuç raporuna yaz. Playwright yoksa bunu açıkça yaz ve kod okumasındaki sebeple ilerle.
- MODEL: src/screens/Editor/contextMenuModel.ts (yeni, saf, DOM'suz) yaz. İçerik: menü ağacı MENU (id, labelKey, sep, children, command adı; ikon yok) ve subItems(id); viewportChangeAction(önce{w,h}, sonra{w,h}) → genişlik değiştiyse 'close', yalnız yükseklik değiştiyse 'reclamp', aynıysa 'none'; clampMenuPosition({x,y,w,h,vw,vh,pad=8}) (EditorContextMenu'deki mevcut hesap); createActivationGate({openedBy:'mouse'|'touch', graceMs:400}) → fareyle açıldıysa hemen hazır, dokunmayla açıldıysa ilk pointerup/pointercancel ya da 400 ms sonra hazır; activate(run, getView, onClose) → görünüm varsa komutu çalıştırır, sonra kapatır.
- KOMUTLAR: src/screens/Editor/editorCommands.ts. (a) Pano komutları bir adaptör alsın: copy/cut/paste(v, io?) burada io = { readText, writeText, notify }; varsayılan adaptör navigator.clipboard kullanır, writeText başarısızsa document.execCommand('copy'/'cut') dener, readText yoksa/reddedilirse 'unavailable' döner ve notify ile ctx.pasteUnavailable mesajını gösterir; sonuç ('ok'|'empty'|'unavailable') döndürülsün. (b) wrap: tek yıldız (italik) açma/kapama kontrolünde dıştaki işaret '**' kalınının parçasıysa italik sayılmasın (bugün '**metin**' içinde italik '*metin*'e çeviriyor); birim testi bunu kapsasın. (c) Diğer komutların imzası değişmez.
- BİLDİRİM + ÇEVİRİ: src/store/useAppStore.ts içindeki notifyError'u dışa aç ve isteğe bağlı kind ('error'|'info') parametresi ekle (plugin-dialog message, web'de alert). src/i18n/locales/tr, en, ar translation.json 'ctx' bloğuna 'pasteUnavailable' (Panoya erişilemedi; klavyenin yapıştır komutunu kullan) ve 'copyUnavailable' anahtarlarını üç dilde ekle (tr:504, en:436, ar:501 satırları civarı).
- MENÜ BİLEŞENİ: src/screens/Editor/EditorContextMenu.tsx. (a) Kök div'e onMouseDown={e => e.preventDefault()} ekle: düğmeye basmak editörün odağını almasın, Android klavyesi kapanmasın (mevcut onPointerDown stopPropagation kalır). (b) window 'resize' dinleyicisi doğrudan kapatmasın: açılıştaki innerWidth/innerHeight'ı tut, viewportChangeAction 'close' derse onClose, 'reclamp' derse bir sayaç state'i artırıp konum hesaplayan useLayoutEffect'i yeniden koştur (bağımlılığa sayacı ekle); 'blur' ve dışarı pointerdown kapatması aynen kalsın. (c) Konum hesabını clampMenuPosition'a, öğe ağacını MENU'ya taşı; ikonlar ve cmd eşlemesi bileşende kalsın. (d) createActivationGate ile hazır değilken yaprak ve grup tıklamalarını yok say; pencere pointerup/pointercancel ile hazır yap. (e) Pano komutlarına notify olarak notifyError(…, 'info') ve t('ctx.pasteUnavailable') ver.
- UZUN BASMA KAYNAĞI: src/screens/Editor/CodeMirrorEditor.tsx onContextMenu imzasına üçüncü parametre ekle: via 'mouse' (contextmenu olayı) | 'touch' (zamanlayıcı). src/screens/Editor/EditorScreen.tsx ctxMenu state'ine via'yı koy ve EditorContextMenu'ye openedBy olarak geçir. Zamanlayıcı dolunca pressTimer null'lanıyor; aynı basışta ikinci açılış olmadığından emin ol.
- CSS: src/styles/app.css yalnız senaryo betiği kırpma/taşma gösterirse değişir. Masaüstü fare senaryosunda alt menüye geçerken 2px boşlukta (.lo-ctxmenu--sub margin-inline-start) menü kapanıyorsa boşluğu şeffaf kenarlıkla ya da padding'le kapat. Gerekmiyorsa dokunma.
- BİRİM TESTLERİ: src/core/__test__/ctxMenuTest.ts (yeni; editorTest.ts deseni: check/eq, process.exit). EditorState üzerine sahte görünüm kur ({state, dispatch(spec){state=state.update(spec).state}, focus(){}}) ve her komutu seçili + seçimsiz durumda dene: bold/italic/strike/highlight/inlineCode (sarma, geri alma, kalın içinde italik), heading 1-6 ve 0 (mevcut başlığı değiştirme), bulletList/numberedList/checklist/quote (aç-kapa), wikilink, externalLink, clearFormat, selectAll, table/callout/hr/codeBlock (belge ve imleç), copy/cut/paste sahte adaptörle (yazma, kesme, yapıştırma; readText reddedince belge değişmez ve notify çağrılır; boş seçimde cut/copy belgeyi bozmaz). Model testleri: subItems('ins') = tbl,cal,hr,cb; viewportChangeAction yükseklik-only → reclamp, genişlik → close; clampMenuPosition dar ekranda sınırlar içinde; activation gate dokunmada pointerup'a kadar kapalı, fareyle hemen açık; activate komutu çalıştırıp kapatıyor. Üç dil JSON'unu import edip MENU'daki her labelKey ve yeni anahtarların tr/en/ar'da bulunduğunu doğrula. scripts/run-tests.mjs suites listesine ctxMenuTest'i ekle. (tsconfig __test__ klasörünü dışlar; esbuild tip denetimi yapmaz, tipleri yine doğru yaz.)
- SENARYO BETİĞİNİ TAMAMLA: menu-testi.mjs'e masaüstü fare senaryosu ekle (setDeviceMetricsOverride kaldır / 1200x800; sağ tık → gruplara hover ile her yaprak öğeye tıkla → belge metni beklendiği gibi; Kes/Kopyala/Yapıştır/Tümünü seç; seçili ve seçimsiz iki tur). Mobil senaryoda Biçimlendirme ve Paragraf gruplarını da aç. Yapıştır reddi: page.evaluate ile navigator.clipboard.readText'i reddeden sürümle değiştir, Yapıştır'a dokun, belge değişmediğini ve konsolda hata olmadığını doğrula. scripts/win-test/README.md'ye betiğin bölümünü ve koşma komutunu ekle.
- DOĞRULAMA VE SONUÇ: npx tsc --noEmit, npm test, npm run build; menu-testi.mjs'i düzeltilmiş kodda koş ve yeşil çıktıyı kanıt olarak yaz. Sonuç raporunda bulunan diğer hataları listele: kalın içinde italik (düzeltildi), liste türü değiştirince öneklerin üst üste binmesi ('- 1. madde'), externalLink/table içindeki gömülü Türkçe yer tutucular ('metin', 'Başlık'), clearFormat'ın kelime içi alt çizgileri silmesi, boş seçimde Kes/Kopyala'nın sessiz kalması, iOS'ta klavye açıkken menü konumunun visualViewport'u hesaba katmaması. Commit fix/LOM-36 dalına, repo dilinde, AI imzası yok.

## Dokunulan dosyalar

- `Loomen/src/screens/Editor/EditorContextMenu.tsx`
- `Loomen/src/screens/Editor/contextMenuModel.ts`
- `Loomen/src/screens/Editor/editorCommands.ts`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/screens/Editor/EditorScreen.tsx`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/ctxMenuTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/scripts/win-test/menu-testi.mjs`
- `Loomen/scripts/win-test/README.md`
- `Loomen/src/styles/app.css`

## Test

Testler geçti.

> Tip denetimi, tüm birim testleri (12 dosya) ve derleme hatasız geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-36`
- Commit: `Loomen@21b35e200d98be0c39818e1114ce7514a9ac5d14`
- Test koşusu: `c1f9c7f7-5a39-4fc2-b7ca-32407e64cb7c` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

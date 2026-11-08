---
name: LOM-97 — Kütüphane: iPad'de kalemle kenara not
description: PDF okuyucuya kalem modu gelir: Apple Pencil (ve masaüstünde fare) ile sayfa üstüne çizilir, geri al ve sayfayı temizle olur; çizgiler kitap kaydına sayfa oranıyla yazılır, kitabın notunda "Kalem notları" bölümünde sayfa resmi ve sayfa bağlantısıyla görünür.
type: project
proje: loomen
kaynak: kart LOM-97 · dal fix/LOM-97 · Loomen@66ab652a8e4209b77657eb441d2adca514742c76 · test koşusu b6f91529-5753-4ceb-87aa-7d30f37f0408 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-08
---

# LOM-97 — Kütüphane: iPad'de kalemle kenara not

## Ne yapıldı

PDF okuyucuya kalem modu gelir: Apple Pencil (ve masaüstünde fare) ile sayfa üstüne çizilir, geri al ve sayfayı temizle olur; çizgiler kitap kaydına sayfa oranıyla yazılır, kitabın notunda "Kalem notları" bölümünde sayfa resmi ve sayfa bağlantısıyla görünür.

## Adımlar

- Çekirdek veri: types.ts'e InkStroke (id, 0-1 oranlı düz nokta dizisi) ve InkPage (page, strokes, updatedAt) türleri ile Book.ink? alanını ekle; codec.ts'te encodeBook sırasına ink'i (positionSavedAt'ten sonra, highlights'tan önce) r5 yuvarlamayla yaz, decodeBook'ta alan yoksa boş kabul et, bozuksa null dön (çizim kuralıyla aynı).
- model.ts'e addInkStroke, undoInkStroke, clearInkPage, inkForPage saf yardımcılarını ekle (değişmezlik, aynı nesneyi döndürme kalıbı); yeni src/core/library/ink.ts'te sayfa oranı <-> piksel dönüşümü, nokta seyreltme ve çizgi yolu (polyline) yardımcılarını yaz; index.ts'ten dışa ver.
- Testler: libraryTest.ts'e ink kodlama/çözme tur testi (eski dosya ink'siz okunur, bozuk ink null), yeni src/core/__test__/inkTest.ts'e model ve ink.ts testleri; scripts/run-tests.mjs suites listesine inkTest ekle.
- Not eşitleme: noteSync.ts'e 'Kalem notları' bölüm etiketi (NoteLabels.ink), <!-- loomen:ink p<N> --> işaretli blok üretimi (![[Kütüphane/Kalem/<bookId>-s<N>.png]] + [s. N](loomen://book/<id>?page=N)), insertInkBlock/updateInkBlock/removeInkBlock; bölüm yoksa notun sonuna '## Kalem notları' açılır, bloklar sayfa sırasına girer, yalnız işaretler arasına dokunulur.
- links.ts'te HL_MARKER_LINE_RE'yi loomen:(hl|ink) olacak biçimde genişlet; libraryNoteTest.ts ve libraryLinkTest.ts'e ink blok ve işaret testleri ekle.
- PdfView: PdfPage içine .lo-pdf__ink katmanı (canvas, highlights üstünde, textLayer altında, pointer-events none, karanlık temada ters çevrilmez) ekle ve sayfanın ink çizgilerini oran->piksel çizerek göster; kalem modu açıkken sayfa üstüne .lo-pdf__pen yakalama katmanı (touch-action none, pointerType pen ve mouse kabul, touch'ı geçir) koy; pointerdown/move/up ile çizgi topla, bitince onInkStroke(page, stroke) çağır; sayfa görüntüsü + ink'i ~800px genişlikte offscreen canvas'a çizip PNG blob üreten snapshot yolu ekle (onInkSnapshot).
- readerTypes.ts: ReaderViewProps'a ink, penMode, onInkStroke, onInkSnapshot isteğe bağlı alanlarını ekle; pdfView.css'e katman ve kalem modu stilleri (z-index sırası, imleç, textLayer'ın kalem modunda pointer-events none olması).
- Store: useAppStore.ts'e libraryInkAddStroke, libraryInkUndo, libraryInkClear, libraryInkFlush eylemlerini ekle; bookCommit ile iyimser güncelle, saveBook'u POSITION_SAVE_MS benzeri gecikmeyle kuyrukla; PNG'yi backend.writeBinary ile Kütüphane/Kalem/ altına yaz ve syncBookNote ile ink bloğunu ekle/güncelle/kaldır; hata notifyError ile bildirilir; libraryNoteLabels'a ink etiketi ekle.
- ReaderScreen/ReaderToolbar: yalnız book.format === 'pdf' iken kalem düğmesi (lucide Pen/PenLine, is-on + aria-pressed), kalem açıkken geri al ve sayfayı temizle düğmeleri; kalem modu açıkken seçim menüsü kapatılır; görünürlük gizlenince ve okuyucu kapanırken libraryInkFlush çağrılır (flushPosition yanında).
- i18n: tr/en/ar translation.json'a library.reader.pen, penUndo, penClear ve library.note.ink ('Kalem notları') anahtarlarını ekle; app.css'e üst çubuk kalem düğmeleri ve dar ekran düzenlemelerini ekle.
- Doğrulama: npm run typecheck ve npm test; çıktıdaki geçti/kaldı satırlarını kanıt olarak yaz.

## Dokunulan dosyalar

- `Loomen/src/core/library/types.ts`
- `Loomen/src/core/library/codec.ts`
- `Loomen/src/core/library/model.ts`
- `Loomen/src/core/library/ink.ts`
- `Loomen/src/core/library/index.ts`
- `Loomen/src/core/library/noteSync.ts`
- `Loomen/src/core/library/links.ts`
- `Loomen/src/core/__test__/libraryTest.ts`
- `Loomen/src/core/__test__/inkTest.ts`
- `Loomen/src/core/__test__/libraryNoteTest.ts`
- `Loomen/src/core/__test__/libraryLinkTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/screens/Library/readerTypes.ts`
- `Loomen/src/screens/Library/views/PdfView.tsx`
- `Loomen/src/screens/Library/views/pdfView.css`
- `Loomen/src/screens/Library/ReaderScreen.tsx`
- `Loomen/src/screens/Library/ReaderToolbar.tsx`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`

## Test

Testler geçti.

> Tip denetimi hatasız geçti. npm test ile 53 test dosyasının tümü geçti, kalem testleri de bunların içinde. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-97`
- Commit: `Loomen@66ab652a8e4209b77657eb441d2adca514742c76`
- Test koşusu: `b6f91529-5753-4ceb-87aa-7d30f37f0408` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

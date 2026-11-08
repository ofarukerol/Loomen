---
name: LOM-83 — Kütüphane 1: kitap okuma ve çizimleri kasaya kaydetme
description: Loomen'a Kütüphane bölümü: PDF ve EPUB kitaplar uygulama klasöründe durur, kasada kitap kaydı ve düz not tutulur; okuyucuda seçilen metin renkle çizilir, alıntı sayfa/bölüm bilgisi ve kitabı o yerde açan bağlantıyla nota düşer; kalınan yer, yazı boyutu ve tema hatırlanır. İş üç alt karta bölünür: raf ve ortak altyapı, PDF okuyucu, EPUB okuyucu.
type: project
proje: loomen
kaynak: kart LOM-83 · dal fix/LOM-83 · Loomen@73dd3d1e68ba1485495b8303588f2143c982bb9f · test koşusu 982277b5-694e-49e8-b349-41a05b89edad (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-08
---

# LOM-83 — Kütüphane 1: kitap okuma ve çizimleri kasaya kaydetme

## Ne yapıldı

Loomen'a Kütüphane bölümü: PDF ve EPUB kitaplar uygulama klasöründe durur, kasada kitap kaydı ve düz not tutulur; okuyucuda seçilen metin renkle çizilir, alıntı sayfa/bölüm bilgisi ve kitabı o yerde açan bağlantıyla nota düşer; kalınan yer, yazı boyutu ve tema hatırlanır. İş üç alt karta bölünür: raf ve ortak altyapı, PDF okuyucu, EPUB okuyucu.

## Adımlar

- AŞAMA 1 — Raf ve ortak altyapı (alt kart 1). Saf çekirdek: `src/core/library/types.ts` (BookFormat pdf|epub, BookStatus toread|reading|done, HighlightColor yellow|green|blue|pink, PdfAnchor {kind:'pdf', page, rects:[x,y,w,h][] PDF nokta birimi ölçek 1}, EpubAnchor {kind:'epub', href, start, end} bölüm metni içindeki karakter konumları, Highlight {id, color, quote, note?, createdAt, anchor}, Position pdf {page,yRatio} | epub {href, offset}, Book {v:1, id sha256 hex, title, author?, format, status, addedAt, fileName, size, notePath, coverFile?, position?, highlights[]}; sabitler LIBRARY_DIR='Kütüphane' (kasa), BOOKS_DIR='loomen-library' (uygulama veri klasörü), BOOK_ID_RE), `codec.ts` (encode/decode/normalize; bozuk kayıt null), `model.ts` (durum sırası, raf süzgeci, ilerleme yüzdesi, yeni highlight id, not dosya adı türetme ve çakışma numaralama), `store.ts` (habit/store.ts kalıbı: findLibraryDir NFC/NFD, loadBooks → raw/broken, saveBook bozuk ya da yüklenmemiş dosyanın üstüne yazmaz, removeBook çöpe), `links.ts` (bookLink(id, hl) = loomen://book/<id>?hl=<hid>, parseBookLink), `noteSync.ts` (initialNote(book): frontmatter tür/kitap/yazar/durum + '# Başlık' + '## Alıntılar'; upsertHighlightBlock ve removeHighlightBlock: blok = '<!-- loomen-hl:<id> -->' satırı + ardışık '> ' satırları (alıntı, '— s. 42 · [Kitapta aç](link) 🟡' ya da bölüm adı, 'Not: …'); '## Alıntılar' bölümünün sonuna eklenir, bölüm yoksa dosya sonuna açılır; işaretsiz metne dokunulmaz), `index.ts`.
- Testler (node, esbuild): `src/core/__test__/libraryTest.ts` (codec round-trip, normalize bozuk alanlar, durum/süzgeç/sıra, not adı çakışması), `libraryNoteTest.ts` (ekle/güncelle/sil; kullanıcı metni, başka başlıklar ve iki ayrı blok korunur; bölüm yoksa oluşur), `libraryLinkTest.ts` (üret/çöz, geçersiz id reddi). `scripts/run-tests.mjs` listesine bu üçü ve ileride gelecek `pdfAnchorTest.ts`, `zipTest.ts`, `epubTest.ts` adlarını da ekle (kaynağı olmayan atlanır).
- Özellik kartı: `src/core/settings/features.ts` FEATURE_IDS sonuna 'library', FeatureFlags.library varsayılan açık, normalize'a alan; `FeatureCards.tsx` ikon (lucide Library) ve durum '{{n}} kitap'; `featuresTest.ts` altı kimlik ve yeni bayrağa göre güncellenir. Store `setFeatureOn`: library kapanınca açık ekran library/reader ise planner'a dön.
- Store (`src/store/useAppStore.ts`): Screen birleşimine 'library' | 'reader'; alanlar libraryBooks, libraryLoaded, libraryBroken, libraryBookId (okuyucudaki kitap), libraryTarget ({hl?} bekleyen hedef), readerPrefs {fontScale, theme:'light'|'dark'|'sepia'} (partialize + merge normalize). Eylemler: libraryLoad (loadBooks; bayat okuma sayacı), refreshLibrary loadFromBackend sonunda refreshHabits kalıbıyla; libraryImport (isTauri değilse yok; plugin-dialog open filters pdf/epub → plugin-fs readFile → crypto.subtle.digest SHA-256 → appDataDir/loomen-library/<id>.<ext> yoksa writeFile → başlık dosya adından → not Kütüphane/<Başlık>.md initialNote ile (varsa numaralı) → saveBook → loadFromBackend; aynı id zaten rafta ise yalnız rafa odaklan; 200 MB üstü uyarı), librarySetStatus, libraryRemove(id, deleteFile) (json çöpe, not yerinde kalır, dosya isteğe bağlı silinir), libraryOpen(id, target?) (screen 'reader'), libraryCloseReader (konumu hemen yaz, screen 'library'), libraryAddHighlight(id, {color, quote, note, anchor}) → json kaydet → notu DİSKTEN okuyup upsertHighlightBlock ile yaz → loadFromBackend; libraryUpdateHighlight (not/renk; blok güncellenir), libraryRemoveHighlight (json + blok silinir), librarySavePosition (2 sn debounce; kapanışta ve visibilitychange hidden'da anında), librarySetMeta(id, {title?, author?}) ve librarySetCover(id, bytes → loomen-library/<id>.cover.jpg), libraryOpenLink(url) (parseBookLink → libraryOpen), setReaderPrefs. Yazma hatası habitFailed kalıbıyla bildirilir, bellek diskteki doğruya döner. Not dosyasına yalnız noteSync fonksiyonları yazar.
- Yerleşim: `App.tsx` iki ekran (`LibraryScreen`, `ReaderScreen`), Android geri kapatıcıları: reader → libraryCloseReader, library → planner; explorerEligible listesine library eklenmez (tam genişlik). `Ribbon.tsx` features.library iken Library ikonlu düğme (habits'ten sonra); `MobileTopBar.tsx` ⋮ menüsüne Kütüphane maddesi (hasMenu koşuluna ekle).
- Raf ekranı `src/screens/Library/LibraryScreen.tsx` (HabitsScreen kalıbı: lo-scroll kap, başlık, 'Kitap ekle' düğmesi, lo-seg süzgeç Hepsi/Okunuyor/Okunacak/Bitti, boş durum, broken uyarısı, tarayıcıda 'yalnız uygulamada' notu) ve `BookCard.tsx` (kapak resmi varsa plugin-fs readFile → blob URL, yoksa başlık harfli yer tutucu; başlık, yazar, ilerleme yüzdesi, durum rozeti + küçük menü: durum değiştir, Notu aç (openNote), Kaldır → HabitConfirm ile onay ve 'dosyayı da sil' seçeneği; karta tık → libraryOpen).
- Okuyucu kabuğu `src/screens/Library/ReaderScreen.tsx`: üst çubuk `ReaderToolbar.tsx` (geri, başlık, sayfa/bölüm etiketi, A- / A+, tema menüsü açık/koyu/sepya, Çizimler paneli, Notu aç); gövde: biçime göre görüntüleyici `import.meta.glob('./views/*View.tsx')` ile seçilir (PdfView / EpubView yoksa 'Bu biçim için okuyucu henüz hazır değil' yer tutucusu — alt kart 2 ve 3 yalnız dosya ekler, kabuğa dokunmaz); kitap baytları plugin-fs readFile ile bir kez okunur; sözleşme `readerTypes.ts`: RendererProps { book, bytes, prefs, highlights, target, onPosition, onSelection({quote, anchor, rect}), onHighlightTap(id), onMeta({title?, author?, cover?}) }. `HighlightMenu.tsx` seçimin yakınında yüzen dört renk + 'Not ekle' (pointerup/selectionchange ile konumlanır, mobilde alt şerit), `HighlightNoteDialog.tsx` (createPortal + useModalLayer, textarea, kaydet/sil), `HighlightsPanel.tsx` (yan panel/alt pencere: renk, alıntı, not, sayfa; tık → görüntüleyiciye hedef; sil). Tema yalnız okuyucu kabında data-reader-theme ile.
- Bağlantılar: `Markdown.tsx` INLINE_RE'ye `[etiket](loomen://book/…)` deseni; yalnız bu şema `lo-wiki` sınıflı düğme olur ve yeni `onBookLink` prop'unu çağırır (başka URL'ler düz metin kalır); `EditorScreen.tsx` onBookLink={libraryOpenLink}. Düzenleme modu: `livePreview.ts` aynı deseni `cm-booklink` işaretiyle dekore eder (aktif satır dışında parantez gizlenir, wiki-link kalıbı), `CodeMirrorEditor.tsx` `.cm-booklink` için stil ve domEventHandlers mousedown → libraryOpenLink (varsayılan açılış düzenleme modu olduğu için şart).
- Çeviriler tr/en/ar `translation.json`: ribbon.library, settings.features.library.name/desc ve 'books' durumu, 'library' bölümü (title, add, filters, empty, statuses, remove/confirm, deleteFile, appOnly, broken, tooBig, reader: back, fontUp/Down, theme light/dark/sepia, highlights, openNote, colors, addNote, noteTitle, save, delete, pageLabel 'Sayfa {{n}} / {{total}}', chapterLabel, toc, noRenderer, notePage 's. {{n}}', noteOpenLabel 'Kitapta aç', noteQuotesHeading 'Alıntılar', noteLine 'Not'). Üç dilde aynı anahtarlar; Arapça Arapça harf.
- Stil `src/styles/app.css` sonuna lo-lib (raf gridi, kart, kapak oranı 2:3, durum rozeti, süzgeç, boş durum; mobilde 2 sütun) ve lo-reader (kap, araç çubuğu, tema değişkenleri --rd-bg/--rd-fg sepya ve koyu, yüzen renk menüsü, not penceresi, çizim paneli, reduced-motion) blokları; mantıksal kenar boşlukları (RTL).
- Wiki: `LoomenWiki/modules/kutuphane.md` (veri yerleri, json şeması, not blok biçimi, bağlantı şeması, görüntüleyici sözleşmesi) ve `mimari.md`'ye kısa bölüm. `npm run typecheck`, `npm test`, `npm run build` yeşil; commit mesajında AI imzası yok.
- AŞAMA 2 — PDF okuyucu (alt kart 2, onay sonrası). `package.json`'a pdfjs-dist (Apache-2.0) eklenir (kurulum onayı). `src/core/library/pdfAnchor.ts` saf: seçim dikdörtgenlerini görünüm → PDF noktasına ve geri çevirme, aynı satırdaki dikdörtgenleri birleştirme, sayfa içi y oranı; `pdfAnchorTest.ts`.
- `src/screens/Library/views/PdfView.tsx` (+ `pdfView.css`): getDocument({data}); worker `new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), {type:'module'})` → GlobalWorkerOptions.workerPort; dikey sayfa listesi, yalnız görünür ±2 sayfa canvas (devicePixelRatio) + TextLayer; ölçek = genişliğe sığdır × prefs.fontScale (A-/A+ yakınlaştırma); koyu tema canvas'a invert+hue-rotate, sepya sepia filtresi; highlight katmanı: her çizimin rects'i viewport ile görünüm koordinatına çevrilip mix-blend-mode:multiply kutular; seçim: text layer içinde pointerup → range.getClientRects → sayfa öğesine göre → PDF noktası → onSelection({quote: selection.toString(), anchor, rect}); onPosition en üstteki görünür sayfa + y oranı (debounce); target: sayfaya kaydır, çizimi görünüme getir ve kısa vurgula; ilk açılışta onMeta: getMetadata başlık/yazar ve 1. sayfadan 300 px kapak JPEG. İlk açılışta kayıtlı konuma dön. Wiki `LoomenWiki/modules/kutuphane-pdf.md`.
- AŞAMA 3 — EPUB okuyucu (alt kart 3, bağımlılık yok). `src/core/library/zip.ts`: merkezi dizin ayrıştırma, stored ve deflate girdileri; deflate için küçük saf TypeScript inflate (RFC 1951; DecompressionStream'e güvenilmez, macOS 11 WebKit'te yok); `zipTest.ts` elle kurulmuş stored ve deflate arşivle. `epub.ts` saf: container.xml → OPF yolu, OPF metadata (title, creator), manifest/spine sırası, kapak (meta cover / properties cover-image), nav.xhtml ya da toc.ncx içindekiler, göreli href çözme (XML ayrıştırma için enjekte edilen parse arayüzü; uygulamada DOMParser), `epubAnchor.ts` saf: metin düğümü uzunlukları ↔ bölüm içi karakter konumu eşlemesi, aralıktan anchor ve anchor'dan düğüm/ofset; `epubTest.ts`.
- `src/screens/Library/views/EpubView.tsx` (+ `epubView.css`): bölüm bölüm kaydırmalı görünüm, önceki/sonraki bölüm, İçindekiler çekmecesi; bölüm XHTML'i DOMParser ile ayrıştırılıp temizlenir (script/iframe/object/form/on* ve dış URL'ler atılır; img/svg ve CSS url() zip'ten blob: URL'ye; @font-face ve @import atılır; bölüm CSS'i '.lo-epub' önekiyle kapsamlanır); yazı boyutu ve tema kap üzerindeki değişkenlerle; çizimler TreeWalker ile aralık kurulup <mark data-hl> ile sarılır (ofsetler ham textContent'e göre, sarma onları bozmaz); seçim → epubAnchor ile {href,start,end} + quote; onPosition href + ilk görünür metin ofseti (debounce); target: bölümü aç, işareti görünüme getir; onMeta: başlık/yazar ve manifest kapak resmi. Wiki `LoomenWiki/modules/kutuphane-epub.md`.

## Dokunulan dosyalar

- `Loomen/src/core/library/types.ts`
- `Loomen/src/core/library/codec.ts`
- `Loomen/src/core/library/model.ts`
- `Loomen/src/core/library/store.ts`
- `Loomen/src/core/library/links.ts`
- `Loomen/src/core/library/noteSync.ts`
- `Loomen/src/core/library/index.ts`
- `Loomen/src/core/library/pdfAnchor.ts`
- `Loomen/src/core/library/zip.ts`
- `Loomen/src/core/library/epub.ts`
- `Loomen/src/core/library/epubAnchor.ts`
- `Loomen/src/core/__test__/libraryTest.ts`
- `Loomen/src/core/__test__/libraryNoteTest.ts`
- `Loomen/src/core/__test__/libraryLinkTest.ts`
- `Loomen/src/core/__test__/pdfAnchorTest.ts`
- `Loomen/src/core/__test__/zipTest.ts`
- `Loomen/src/core/__test__/epubTest.ts`
- `Loomen/src/core/__test__/featuresTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/core/settings/features.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/App.tsx`
- `Loomen/src/components/Ribbon.tsx`
- `Loomen/src/components/MobileTopBar.tsx`
- `Loomen/src/screens/Settings/FeatureCards.tsx`
- `Loomen/src/screens/Editor/Markdown.tsx`
- `Loomen/src/screens/Editor/EditorScreen.tsx`
- `Loomen/src/screens/Editor/livePreview.ts`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/screens/Library/LibraryScreen.tsx`
- `Loomen/src/screens/Library/BookCard.tsx`
- `Loomen/src/screens/Library/ReaderScreen.tsx`
- `Loomen/src/screens/Library/ReaderToolbar.tsx`
- `Loomen/src/screens/Library/HighlightMenu.tsx`
- `Loomen/src/screens/Library/HighlightNoteDialog.tsx`
- `Loomen/src/screens/Library/HighlightsPanel.tsx`
- `Loomen/src/screens/Library/readerTypes.ts`
- `Loomen/src/screens/Library/views/PdfView.tsx`
- `Loomen/src/screens/Library/views/pdfView.css`
- `Loomen/src/screens/Library/views/EpubView.tsx`
- `Loomen/src/screens/Library/views/epubView.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/styles/app.css`
- `Loomen/package.json`
- `Loomen/package-lock.json`
- `Loomen/LoomenWiki/modules/kutuphane.md`
- `Loomen/LoomenWiki/modules/kutuphane-pdf.md`
- `Loomen/LoomenWiki/modules/kutuphane-epub.md`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi, birim testleri (48 dosya) ve derleme hatasız geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-83`
- Commit: `Loomen@73dd3d1e68ba1485495b8303588f2143c982bb9f`
- Test koşusu: `982277b5-694e-49e8-b349-41a05b89edad` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

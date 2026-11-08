---
name: LOM-91 — Kütüphane: altı çizilen cümleden tek dokunuşla Tekrar kartı
description: Kütüphane okuyucusunda çizim menüsüne ve çizim listesine "Tekrar kartı yap" düğmesi eklenir; basınca cümle, kitabın adını taşıyan kendi Tekrar listesine (Tekrar/Listeler/kitap-<kitapId>.txt) kart olarak düşer, aynı cümle ikinci kez eklenmez ve düğme "Tekrar'da" olur.
type: project
proje: loomen
kaynak: kart LOM-91 · dal fix/LOM-91 · Loomen@3cbf5ef3550e81a07c466a2460068f6c0a60abcf · test koşusu 05297893-4ce3-4a75-83ca-5eb2055b4b53 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-08
---

# LOM-91 — Kütüphane: altı çizilen cümleden tek dokunuşla Tekrar kartı

## Ne yapıldı

Kütüphane okuyucusunda çizim menüsüne ve çizim listesine "Tekrar kartı yap" düğmesi eklenir; basınca cümle, kitabın adını taşıyan kendi Tekrar listesine (Tekrar/Listeler/kitap-<kitapId>.txt) kart olarak düşer, aynı cümle ikinci kez eklenmez ve düğme "Tekrar'da" olur.

## Adımlar

- Önce oku: src/core/srs/lists.ts (ReviewList, ListRow, normalizeRow, encodeList, saveList korumaları), src/core/srs/parser.ts (normalizeKey), src/core/library/{types,model,noteSync}.ts (Highlight, cleanQuote, locationLabel), src/store/useAppStore.ts içindeki reloadSrsLists (1368), srsListSave (4034), libraryAddHighlight (4552), libraryNoteLabels; src/screens/Library/{HighlightMenu,HighlightsPanel,ReaderScreen}.tsx.
- Yeni saf modül src/core/library/reviewCard.ts (React/i18n/dosya yok): bookListId(bookId) = `kitap-${bookId}` (LIST_ID_RE'ye uyar; kitap kimliği 16 küçük hex); newBookReviewList(book, now): id=bookListId, name=kitap başlığı, emoji '📖', color DEFAULT_LIST_COLOR, direction 'front', newPerDay null, rows []; highlightRow(book, h, labels): front=cleanQuote(h.text), back=`${başlık}${yazar ? ' — ' + yazar : ''} · ${locationLabel(h, labels)}`, note=h.note; quoteInList(list, text) = rows.some(r => normalizeKey(r.front) === normalizeKey(normalizeRow({front:text, back:'x'}).front)); addHighlightRow(list, book, h, labels) → { list, added }: zaten varsa aynı liste nesnesi ve added=false, yoksa normalizeRow uygulanmış satır sona eklenir. index.ts'e dışa aktar.
- useAppStore.ts: yeni eylemler. srsEnsureLists(): srsListVault boşsa reloadSrsLists() çağırır (okuyucu açılınca listeler hazır olsun, diskte duran dosya 'yüklenmemiş' sayılmasın). libraryHighlightToReview(hlId): Promise<'added' | 'exists' | null>: readerBookId'deki kitabı ve çizimi bul; srsLoaded değilse srsLoad(), ardından srsEnsureLists(); mevcut liste = srsLists.find(id === bookListId(book.id)) ?? newBookReviewList(book, Date.now()); addHighlightRow ile satır ekle; added false ise 'exists' dön; aksi hâlde srsListSave(list) çağır ve 'added' dön. Hata olursa notifyError(i18n.t('library.review.saveError', {detail})) ve null. Not dosyasına dokunma (NOTE_SAFETY). Eylem imzalarını arayüz tipine ekle.
- HighlightMenu.tsx: yeni proplar reviewState: 'add' | 'done' | 'busy' ve onReview(). Renk düğmelerinden sonra, not düğmesinin yanına ikon + kısa metinli düğme (lucide Repeat ikonu, sınıf lo-hlmenu__review): 'add' iken metin t('library.review.add'), tıklanınca onReview; 'done' iken metin t('library.review.done'), disabled ve aria-pressed; 'busy' iken disabled.
- HighlightsPanel.tsx: yeni proplar inReview(h): boolean ve onReview(h). Her li içinde iç içe düğme OLMASIN: mevcut atlama düğmesinin yanına kardeş küçük düğme (lo-hlpanel__review) koy; 'Tekrar kartı yap' / 'Tekrar'da' (ikincisi disabled). Tıklama atlamayı tetiklemesin.
- ReaderScreen.tsx: açılışta srsEnsureLists() çağır; bookList = useAppStore(s => s.srsLists.find(l => l.id === bookListId(book.id))). Menü için reviewState: seçimde quoteInList(bookList, sel.text), var olan çizimde quoteInList(bookList, hl.text) ise 'done'. onReview: seçimdeyse önce addHl({text, anchor, color: prefs.color, chapter}) ile çizimi oluştur, dönen çizim kimliğiyle libraryHighlightToReview(id); var olan çizimde doğrudan çağır; işlem sürerken 'busy'. Menü kapanmasın ya da kapanıyorsa durum panelden de görünsün; başarıda ek pencere açma (düğmenin 'Tekrar'da' olması yeterli).
- app.css (5216-5270 civarı): .lo-hlmenu__review (ikon + metin, küçük yazı, disabled soluk) ve .lo-hlpanel__review / satır düzeni için stil; mobil kırılımda da sığsın.
- Çeviriler tr/en/ar translation.json 'library.review' altına: add ('Tekrar kartı yap' / 'Make a review card' / Arapça), done ('Tekrar'da' / 'In Review' / Arapça), saveError ('Tekrar kartı kaydedilemedi: {{detail}}' / … / …). Üç dilde aynı anahtarlar ve aynı yer tutucular.
- Yeni test src/core/__test__/libraryReviewTest.ts (libraryTest kalıbı: check/fails) ve scripts/run-tests.mjs suites listesine ekle. Kontroller: bookListId LIST_ID_RE'ye uyar; yeni liste adı kitabın başlığı, yön 'front'; addHighlightRow sonra encodeList→decodeList gidiş dönüşünde ön yüz cümle, arka yüz başlık+yer, not çizim notu; aynı cümle (fazla boşluk, büyük harf farkı) ikinci kez eklenmez ve aynı nesne döner; '::' içeren cümle kaydedilir ve yine tekrar sayılır; listCards tek yönlü basic kart üretir (soru=cümle); farklı cümle eklenir; tr/en/ar JSON'larında library.review anahtarları ve yer tutucular eşit; yazılan hiçbir yol .md değil (sahte backend ile saveList yolu Tekrar/Listeler/kitap-… ile başlar).
- npm run typecheck ve npm test koş; libraryReviewTest, srsListTest, reviewI18nTest ve libraryTest geçtiğini kanıtla. Denenmeyeni (gerçek okuyucuda tıklama) sonuçta açık yaz.

## Dokunulan dosyalar

- `Loomen/src/core/library/reviewCard.ts`
- `Loomen/src/core/library/index.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Library/HighlightMenu.tsx`
- `Loomen/src/screens/Library/HighlightsPanel.tsx`
- `Loomen/src/screens/Library/ReaderScreen.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/libraryReviewTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Tip denetimi temiz, npm test'teki 51 test dosyasının tümü geçti (libraryReviewTest dahil). Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-91`
- Commit: `Loomen@3cbf5ef3550e81a07c466a2460068f6c0a60abcf`
- Test koşusu: `05297893-4ce3-4a75-83ca-5eb2055b4b53` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

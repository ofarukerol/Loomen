---
name: LOM-110 — Not içinde metin seçince tekrar kartı ve bağlantı için seçenek çubuğu
description: Notta metin seçilince üstünde küçük bir seçenek çubuğu çıkacak; buradan açılan pencerelerle seçili metin tekrar kartına ya da başka bir nota bağlantıya çevrilecek, elle yazılan işaretler aynen çalışmaya devam edecek.
type: project
proje: loomen
kaynak: kart LOM-110 · dal fix/LOM-110 · Loomen@86649593939565af64d3a7f6add44210ff62ba9e · test koşusu 5b627eb9-9f39-4703-a638-18be719d3ed9 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-13
---

# LOM-110 — Not içinde metin seçince tekrar kartı ve bağlantı için seçenek çubuğu

## Ne yapıldı

Notta metin seçilince üstünde küçük bir seçenek çubuğu çıkacak; buradan açılan pencerelerle seçili metin tekrar kartına ya da başka bir nota bağlantıya çevrilecek, elle yazılan işaretler aynen çalışmaya devam edecek.

## Adımlar

- Önce oku: Loomen/src/screens/Editor/EditorContextMenu.tsx (odak/seçim koruma ve ekrana kenetleme kalıbı), Loomen/src/screens/Editor/editorCommands.ts (computeBlockInsert), Loomen/src/core/srs/parser.ts (kart biçimi), Loomen/src/core/markdown/links.ts (bağlantı çözümü), Loomen/src/screens/Library/HighlightNoteDialog.tsx (pencere kalıbı). Yeni bağımlılık ekleme.
- Loomen/src/screens/Editor/selectionActions.ts (yeni, saf modül; React ve DOM yok): (a) cardLine(front, back): satır sonlarını boşluğa, '::' dizisini ': :' biçimine çevirip 'ön :: arka' üretir; ön ya da arka boşsa null. (b) planCardInsert(doc, from, to, front, back): seçim tam olarak tek bir satırın metniyse (liste işareti hariç) ve ön yüz seçimle aynıysa o satırı kart satırıyla değiştirir (liste işaretini korur); değilse computeBlockInsert ile kart satırını seçimin bulunduğu bloğun altına ayrı satır olarak ekler; sonuç {from, to, insert, caret}. (c) wikiLinkText(target, label): etiketi tek satıra indirir, '[', ']' ve '|' karakterlerini çıkarır; etiket hedefle aynıysa '[[hedef]]', değilse '[[hedef|etiket]]'. (d) linkTargetFor(note, notes): aynı adlı birden çok not varsa uzantısız yol, yoksa not adı. (e) filterNotes(notes, query, limit): foldTr ile ada ve yola göre süzer, adı sorguyla başlayanlar önce. (f) canMakeCard(settings, path): Tekrar açık, 'Soru :: Cevap' biçimi açık ve not hariç klasörde değilse true. (g) placeBar({selTop, selBottom, selLeft, barW, barH, vw, vh, touch}): çubuğu seçimin üstüne (dokunmatikte altına), sığmazsa öbür tarafa koyar ve ekrana kenetler. (h) barVisible({empty, text, inTable, editing}): boş ya da yalnız boşluk seçimde ve tablo içinde false.
- Loomen/src/screens/Editor/CodeMirrorEditor.tsx: isteğe bağlı onSelection prop'u ekle (ref'te tut, diğer callback'ler gibi). updateListener içinde seçim ya da belge değişince ve odak değişince {from, to, text, coords} bilgisini bildir; fareyle sürükleme sürerken bildirme, pointerup'ta bildir. Seçim boşsa null bildir. Kaydırmada (cm-scroller scroll) null bildir. Mevcut uzun basma ve bağlam menüsü akışına dokunma.
- Loomen/src/screens/Editor/SelectionBar.tsx (yeni): position: fixed küçük çubuk, role="toolbar"; iki düğme: 'Tekrar kartı yap' (canMakeCard false ise gösterilmez) ve 'Bağlantı ver'. Kapsayıcıda onMouseDown preventDefault (odak ve seçim kaybolmasın). Konum useLayoutEffect içinde ölçülüp placeBar ile verilir. Bağlam menüsü açıkken çubuk çizilmez.
- Loomen/src/screens/Editor/ReviewCardDialog.tsx (yeni; HighlightNoteDialog kalıbı: createPortal, lo-modal, useModalLayer, Escape ve zemin tıklaması kapatır, Cmd/Ctrl+Enter kaydeder): 'Ön yüz' alanı seçili metinle dolu gelir, 'Arka yüz' boş gelir ve odak oradadır; biri boşken Kaydet kapalıdır. Kaydet onSave(front, back) çağırır.
- Loomen/src/screens/Editor/LinkNoteDialog.tsx (yeni, aynı pencere kalıbı): üstte seçili metin, altında arama kutusu ve filterNotes sonuç listesi (açık notun kendisi listede yok); ok tuşlarıyla gezinme, Enter ya da dokunma ile seçim; sonuç yoksa 'Not bulunamadı' satırı. Seçim onPick(note) çağırır.
- Loomen/src/screens/Editor/EditorScreen.tsx: seçim durumunu state'te tut (CodeMirrorEditor onSelection), SelectionBar'ı çiz; düğmeye basılınca from/to/text yakalanıp ilgili pencere açılır. Kaydetmede önce viewRef'teki belgede from-to aralığının hâlâ yakalanan metin olduğunu doğrula; değilse yazma, notifyError ile 'Metin değişti, yeniden seç' bilgisini ver. Kart: planCardInsert sonucu view.dispatch ile yazılır, ardından saveNote çağrılır ve Tekrar kartlarının bu notu görmesi için store'daki mevcut yeniden toplama yolu tetiklenir (saveNote bunu yapmıyorsa srsLoad yüklüyse mevcut regather/srsLoad yolunu kullan; store'a yeni yazma yolu ekleme). Bağlantı: wikiLinkText(linkTargetFor(not), seçili metin) seçimin yerine dispatch edilir. Not değişince ve okuma moduna geçince pencere ve çubuk kapanır. Hook'lar erken return'den önce durmalı.
- Loomen/src/screens/Editor/livePreview.ts: [[hedef|etiket]] biçiminde imleç başka satırdayken 'hedef|' kısmını da gizle (yalnız etiket görünsün); cm-wikilink işaretine imleç başka satırdayken data-target ekle ve bookLinkClick ile aynı kalıpta sol tıkta useAppStore.getState().openNote(hedef) çağıran işleyici ekle. Takma adsız [[hedef]] görünümü aynı kalır. Dekorasyon sıralama kuralına (from artan) uy. Loomen/src/screens/Editor/CodeMirrorEditor.tsx temasına '.cm-wikilink[data-target]': cursor pointer ekle.
- Loomen/src/styles/app.css: .lo-selbar (cm-table-strip ile aynı görünüm: var(--bg-elev), var(--line), var(--sh3), z-index 1001, max-width calc(100vw - 8px)), düğme stilleri, mobilde en az 36px yükseklik; .lo-selcard ve .lo-sellink pencere stilleri (lo-hlnote ölçülerine benzer). Yalnız mantıksal özellik kullan (sağdan sola düzen bozulmasın).
- Loomen/src/i18n/locales/tr|en|ar/translation.json: yeni 'selbar' bölümü üç dilde aynı anahtarlarla: makeCard, addLink, cardTitle, front, back, save, cancel, linkTitle, searchPlaceholder, noResult, stale, barLabel. Mevcut anahtarları değiştirme.
- Loomen/src/core/__test__/selectionBarTest.ts (yeni; ctxMenuTest.ts'teki check/eq ve sahte görünüm kalıbıyla): cardLine ('::' kaçışı, satır sonu, boş alan null); planCardInsert (tam satır değişimi, liste maddesi, paragraf içi seçimde alt satıra ekleme, tablo ve kod bloğu yanında); üretilen satırın parseCards ile tek kart verdiği ve elle yazılmış 'Soru :: Cevap' ile aynı kimliği ürettiği; wikiLinkText (aynı ad, takma ad, yasak karakter, çok satır) ve çıktının parseWikiLinks ile doğru hedef/etiket verdiği; linkTargetFor (aynı adlı iki not); filterNotes (Türkçe harf katlama, sıra, sınır); canMakeCard; placeBar (üst, alt, kenar kenetleme, dokunmatik); barVisible; 'selbar' anahtarlarının üç dilde eksiksiz ve boş olmadığı. Loomen/scripts/run-tests.mjs listesine dosyayı ekle.
- Doğrulama: Loomen klasöründe npm test, npm run typecheck ve npm run build çalıştır; hepsi temiz olmalı. Mevcut ctxMenuTest, editorTest, srsTest ve libraryLinkTest'in değişmeden geçtiğini sonuçta ayrıca belirt.

## Dokunulan dosyalar

- `Loomen/src/screens/Editor/selectionActions.ts`
- `Loomen/src/screens/Editor/SelectionBar.tsx`
- `Loomen/src/screens/Editor/ReviewCardDialog.tsx`
- `Loomen/src/screens/Editor/LinkNoteDialog.tsx`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/screens/Editor/EditorScreen.tsx`
- `Loomen/src/screens/Editor/livePreview.ts`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/selectionBarTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Tip denetimi, tam test takımı (71 dosya, seçim çubuğu testi dahil) ve derleme temiz geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-110`
- Commit: `Loomen@86649593939565af64d3a7f6add44210ff62ba9e`
- Test koşusu: `5b627eb9-9f39-4703-a638-18be719d3ed9` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

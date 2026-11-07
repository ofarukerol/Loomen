---
name: LOM-84 — Kütüphane: Kindle çizimlerini kasaya alma
description: Testler kaldı: Kindle "My Clippings.txt" dosyasındaki çizimleri (bağlı Kindle'dan ya da seçilen dosyadan) okuyup Kütüphane rafına kitap kaydı ve notuna mevcut çizim bloğu biçimiyle, tekrarsız ve artımlı olarak alan Kindle içe aktarma eklenir.
type: project
proje: loomen
kaynak: kart LOM-84 · dal fix/LOM-84 · commit yok · test koşusu 4578013e-27f5-4255-94ed-143d88e9231a (Excalibur)
guven: iddia
durum: gelistirildi
---

# LOM-84 — Kütüphane: Kindle çizimlerini kasaya alma

## Ne yapıldı

Kindle "My Clippings.txt" dosyasındaki çizimleri (bağlı Kindle'dan ya da seçilen dosyadan) okuyup Kütüphane rafına kitap kaydı ve notuna mevcut çizim bloğu biçimiyle, tekrarsız ve artımlı olarak alan Kindle içe aktarma eklenir.

## Adımlar

- Çekirdek türler: `src/core/library/types.ts` içinde BOOK_FORMATS'a "kindle" ekle; yeni `KindleAnchor { kind: "kindle"; location?: { start: number; end: number }; page?: number }` (en az biri dolu) Anchor birleşimine; BookPosition'a `{ kind: "kindle"; location: number }` varyantı. Açıklama yorumuna Kindle kitabının dosyasının olmadığını, hash'in başlık+yazardan türediğini yaz.
- Codec: `codec.ts` encodeAnchor/decodeAnchor ve encodePosition/decodePosition kindle varyantını yazsın/okusun (location start<=end tamsayı, page >=1; ikisi de yoksa null). decodeBook `fileName` boş ve `size` 0 kaydı zaten kabul ediyor; değiştirme.
- Model: `model.ts` compareAnchor'a kindle→kindle sırası (location.start, sonra page, sonra end); karışık türlerde sabit sıra pdf < epub < kindle. positionOfAnchor kindle için `{kind:"kindle", location: start ?? page ?? 0}`. `bookFileName` kindle için çağrılmamalı: `hasBookFile(b) = b.format !== "kindle"` yardımcısı ekle ve dışa ver.
- Not biçimi: `noteSync.ts` NoteLabels'a `location: "Konum {n}"` ve `kindle: "Kindle"` alanları (DEFAULT_NOTE_LABELS dahil). locationLabel: kindle çıpada page varsa `labels.page`, yoksa `labels.location` ile `start` (start≠end ise `start-end`). bookNoteTemplate: format kindle ise "Kitabı aç" bağlantı satırı yerine `*Kindle*` kaynak satırı yaz; çizim blokları birebir aynı biçimde kalır (işaret, `> alıntı`, not, simge + `[yer](loomen://book/<id>?hl=<hlId>)`).
- Yeni saf modül `src/core/library/kindle.ts`: (a) `parseClippings(text)`: BOM ve CRLF temizle, `==========` ile böl; her girdide 1. satır `Başlık (Yazar)` (son parantez yazar; yoksa yazar yok), 2. satır meta: tür anahtar kelimeleri İngilizce (Highlight/Note/Bookmark) ve Türkçe (Vurgu/Not/Yer İmi), sayfa (`page N` / `Sayfa N`), konum (`Location a-b` / `Konum a-b`, tek sayı da olur), tarih best-effort (İngilizce ve Türkçe; çözülemezse undefined); gövde satırları birleşik metin. Bilinmeyen dilde konum+metin varsa highlight, metinsizse atla. Çıktı `KindleClipping { title, author?, type, page?, location?, addedAt?, text }`. (b) `groupClippings(list)`: kitap anahtarı normalize(başlık|yazar); notları aynı kitapta konumu kapsayan (yoksa dosyada hemen önceki) vurguya `note` olarak bağla; yer imlerini ve sahipsiz notları say, atla. (c) `kindleBookHash(title, author)` → sha256Hex(normalize key) (async; `sha256Hex` modelden), `kindleHighlightId(h)` → 'k' + sha256(location|page|cleanQuote(text)) ilk 10 hex (deterministik). (d) `applyKindleBook(existing: Book|null → Book, group, now)`: yeni kitapsa newBook({hash, size:0, fileName:"", format:"kindle", title, notePath}) + author; her vurgu için id hesapla: kayıtta yoksa addHighlight (renk yellow, createdAt = addedAt ?? now), varsa ve not değiştiyse updateHighlight; `{ book, added: Highlight[], updated: {prev, next}[], skipped }` dön. `index.ts` dışa versin.
- Testler: yeni `src/core/__test__/kindleTest.ts` (örnek İngilizce ve Türkçe clippings metni gömülü: BOM+CRLF, iki kitap, not birleştirme, yer imi atlama, bilinmeyen dil; aynı metin ikinci kez uygulanınca added=0 ve kitap nesnesi aynı; yeni girdi eklenmiş metinde yalnız o gelir; sonradan eklenen not updated listesine düşer; blokların notta kitap sırasıyla ve tek seferde oluştuğu insertHighlightBlock ile doğrulanır). `scripts/run-tests.mjs` listesine ekle. `libraryTest.ts`'e kindle çıpa/konum yaz-oku ve compareAnchor; `libraryNoteTest.ts`'e kindle yer etiketi ("Konum 180-182", sayfa varsa "s. 12") ve kindle şablonunun bağlantı yerine kaynak satırı içermesi; EN etiket nesnesine yeni alanları ekle.
- Cihaz tarama (Tauri'ye bağlı, store dışında): yeni `src/core/library/kindleDevice.ts` içinde `findKindleClippings(): Promise<string|null>`: macOS `/Volumes/*/documents/My Clippings.txt` (readDir + exists), Linux `/media/*/*/documents/...` ve `/run/media/*/*/documents/...`, Windows D: … Z: sürücülerinde `<X>:/documents/My Clippings.txt` exists (hata yakalanır, null döner). `readClippingsText(path)` plugin-fs readTextFile. Tarayıcıda (isTauri false) null.
- İzin: `src-tauri/capabilities/default.json` içinde fs:allow-read-text-file, fs:allow-read-dir ve fs:allow-exists listelerine salt okuma için `/Volumes/**`, `/media/**`, `/run/media/**` ekle (yazma izinlerine DOKUNMA). mobile.json değişmez.
- Store (`src/store/useAppStore.ts`): yeni alan `kindleDevicePath: string|null`, eylemler `libraryProbeKindle()` (findKindleClippings → alanı yaz) ve `libraryImportKindle(source: "auto"|"file")`: busy kilidi; auto'da cihaz yolu varsa onu oku, yoksa plugin-dialog ile `.txt` seç (başlık ve süzgeç i18n); metni parse+group et; hiç çizim yoksa bilgi mesajı. Her kitap için hash→id; `libraryBroken` ise atla; `applyKindleBook` → `bookCommit` → `syncBookNote`: yeni kitapta `(text)=>text` (şablon bütün çizimlerle oluşur), var olanda added için insertHighlightBlock (order = kitabın çizim id sırası), updated için updateHighlightBlock(prev) (elle değişmiş blok atlanır, `library.blockEdited` bilgisi). Sonunda özet mesajı: kaç kitap, kaç yeni çizim, kaç güncellenen, kaç zaten vardı. `libraryOpenReader`: format kindle ise `libraryOpenNote(id)` çağırıp dön (bağlantıdan açılış da böylece nota gider). `libraryRemove`/`libraryReadFile`/`libraryRelink`: `hasBookFile` false ise dosya işlemi yok (readFile hata atar; ekrana düşmez çünkü reader açılmaz).
- Arayüz: `LibraryScreen.tsx` başlıkta ve boş durumda 'Kitap ekle' yanına 'Kindle'dan al' düğmesi (lucide `Tablet`), tıklanınca `libraryImportKindle("auto")`; ekran açılınca ve pencere odak alınca `libraryProbeKindle`; cihaz bulunduysa raf üstünde `lo-hab-warn` benzeri bilgi şeridi 'Kindle bağlı' + 'Çizimleri al' düğmesi. Boş durum metni Kindle'ı da ansın. `BookCard.tsx`: kindle kitapta kapak tıklaması ve menüdeki 'Oku' yerine notu aç; rozet 'KINDLE'; ilerleme çubuğu gösterilmez. Gerekirse `src/styles/app.css` sonuna küçük stil (`lo-lib-kindle` şerit).
- Çeviriler tr/en/ar `translation.json` `library` bölümüne: `kindle.import` ('Kindle'dan al'), `kindle.detected`, `kindle.take`, `kindle.pickTitle`, `kindle.pickFilter`, `kindle.notClippings`, `kindle.none` (dosyada çizim yok), `kindle.result` ({{books}} kitap, {{added}} yeni çizim, {{updated}} güncellendi, {{same}} zaten vardı), `kindle.emptyHint`; `note.location` ('Konum {{n}}'), `note.kindle` ('Kindle'). `libraryNoteLabels()` yeni alanları doldursun. Üç dilde aynı anahtarlar.
- Wiki: `LoomenWiki/modules/kutuphane.md` yeni 'Kindle' bölümü (kaynak dosya, tanıma yolu, kitap kimliği, çizim kimliği ve tekrar koruması, not bloğu farkı, kapsam dışı); `mimari.md` Kütüphane maddesine tek cümle. Devir notunda LOM-84 için yapılan ve kalan yazılır.
- Doğrulama: `npm run typecheck`, `npm test` (kindleTest, libraryTest, libraryNoteTest dahil 47+ dosya), `npm run build` yeşil. Commit mesajında AI imzası yok; dal fix/LOM-84.

## Dokunulan dosyalar

- `Loomen/src/core/library/types.ts`
- `Loomen/src/core/library/codec.ts`
- `Loomen/src/core/library/model.ts`
- `Loomen/src/core/library/noteSync.ts`
- `Loomen/src/core/library/kindle.ts`
- `Loomen/src/core/library/kindleDevice.ts`
- `Loomen/src/core/library/index.ts`
- `Loomen/src/core/__test__/kindleTest.ts`
- `Loomen/src/core/__test__/libraryTest.ts`
- `Loomen/src/core/__test__/libraryNoteTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Library/LibraryScreen.tsx`
- `Loomen/src/screens/Library/BookCard.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src-tauri/capabilities/default.json`
- `Loomen/LoomenWiki/modules/kutuphane.md`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler KALDI; iş doğrulanmadı.

> Tip denetimi, birim testleri ve derleme temiz geçti. Kindle testleri ve kitap notu testleri yeşil. K8 canlı doğrulaması koşmadı. Canlı doğrulama insana kaldı. Kokpit: `gecti=true` ama özet bir kontrolün koşmadığını söylüyor: "K8 canlı doğrulaması koşmadı". O kontrolü koştur ve komut çıktısını alıntıla; yalnız fiziksel doğrulamaysa (yazıcı, terazi, kasa ekranı) `insana_kalan`a tek cümlecik olarak y

## Kanıt

- Dal: `fix/LOM-84`
- Test koşusu: `4578013e-27f5-4255-94ed-143d88e9231a` (Excalibur)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.

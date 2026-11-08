---
name: LOM-94 — Kütüphane: KOReader çizimlerini alma
description: Rafa "KOReader'dan al" düğmesi eklenir; seçilen KOReader çizim dosyası (kitabın yanındaki metadata.*.lua ya da dışa aktarılan JSON) okunur, kitap dosyasız bir "koreader" kaydı olarak rafa, çizimleri mevcut blok biçimiyle notuna düşer; aynı dosya ikinci kez alınınca yalnız yeni çizimler gelir.
type: project
proje: loomen
kaynak: kart LOM-94 · dal fix/LOM-94 · Loomen@ad8e4349983f8c8cc522a63fddafc1582bbc39c5 · test koşusu 56c0d4aa-da01-4efc-8335-efbeba87d203 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-08
---

# LOM-94 — Kütüphane: KOReader çizimlerini alma

## Ne yapıldı

Rafa "KOReader'dan al" düğmesi eklenir; seçilen KOReader çizim dosyası (kitabın yanındaki metadata.*.lua ya da dışa aktarılan JSON) okunur, kitap dosyasız bir "koreader" kaydı olarak rafa, çizimleri mevcut blok biçimiyle notuna düşer; aynı dosya ikinci kez alınınca yalnız yeni çizimler gelir.

## Adımlar

- Çekirdek türler (src/core/library/types.ts): BOOK_FORMATS'a "koreader" ekle; yeni KoreaderAnchor { kind: "koreader"; page: number; pos0?: string; pos1?: string } Anchor birleşimine; BookPosition'a { kind: "koreader"; page: number } varyantı. Baş yorumuna KOReader kitabının dosyasız olduğunu, özetin 'koreader|başlık|yazar' metninden türediğini yaz.
- Codec (src/core/library/codec.ts): encodeAnchor/decodeAnchor koreader varyantını yazsın/okusun (page tamsayı ≥1 zorunlu, pos0/pos1 varsa string, aksi null); encodePosition/decodePosition koreader { page ≥1 }.
- Model (src/core/library/model.ts): hasBookFile'ı FILE_BOOK_FORMATS listesine göre yaz (kindle ve koreader false); KIND_RANK'a koreader: 3; compareAnchor koreader→koreader sayfaya göre (eşitse 0, sortHighlights createdAt ile ayırır); samePosition/comparePosition koreader sayfa; positionOfAnchor koreader → { kind: "koreader", page }. addHighlight'taki 'anchor.kind === format' kuralı koreader için kendiliğinden sağlanır.
- Not biçimi (src/core/library/noteSync.ts): NoteLabels'a koreader?: string (DEFAULT 'KOReader'); locationLabel koreader çıpada labels.page ile sayfa; bookNoteTemplate'te kaynak satırı: format kindle ise *Kindle*, koreader ise *KOReader*, dosyalı kitapta 'Kitabı aç' bağlantısı (hasBookFile ile ayır).
- Yeni saf modül src/core/library/lua.ts: KOReader metadata dosyası için güvenli Lua tablo sabiti ayrıştırıcı (eval yok): baştaki 'return', satır ve blok yorumları, ["anahtar"]=, [sayı]=, ad= ve sıralı değerler, çift/tek tırnaklı dize kaçışları (\n \r \t \\ \" \' \ddd ondalık, ters bölü+satır sonu), uzun dize [[...]] / [==[...]==], ondalık/onaltılık/negatif sayılar, true/false/nil, iç içe tablo (derinlik sınırı); bozuk girdide hata fırlatır. Tabloyu Map<string|number, unknown> benzeri düz nesneye çevir ve sıralı dizi alma yardımcısı ver.
- Yeni saf modül src/core/library/koreader.ts: (a) parseKoreaderLua(text, sourcePath?) → KoreaderBook: doc_props.title/authors (yazarlar satır sonlarıyla ayrılmışsa virgülle birleştir), yoksa başlık doc_path ya da .sdr klasör adından; yeni biçim 'annotations' (text ve pos0 dolu girdiler çizim; note, pageno/page, chapter, datetime 'YYYY-MM-DD HH:MM:SS' yerel saat, color), eski biçim 'highlight' [sayfa][i] + 'bookmarks' (highlighted=true, aynı datetime/pos0; text boş değil ve 'Sayfa N … @ tarih' otomatik kalıbı değilse not); salt yer imleri ve metinsiz girdiler atlanıp sayılır. (b) parseKoreaderJson(text) → KoreaderBook[]: tek nesne ya da dizi; title, author, entries[] (text, note, page, time saniye→ms, chapter, color/drawer). (c) parseKoreaderFile(text, path): uzantı/içeriğe göre (JSON ile başlıyorsa JSON, yoksa Lua) seçer; hiçbiri değilse boş liste. (d) koreaderBookKey/koreaderBookHash: sha256('koreader|' + normalleştirilmiş başlık|yazar) — Kindle kaydıyla çakışmaz. (e) koreaderHighlightId(h) = 'o' + sha256(cleanQuote(text)) ilk 10 hane (sayfa EPUB'da yazı boyutuna göre değişir, kimliğe girmez). (f) koreaderAnchor(h), renk eşlemesi (yellow/orange→yellow, green/olive→green, blue/cyan→blue, red/purple→pink, yoksa varsayılan). (g) applyKoreaderBook(existing, book, now, init?) applyKindleBook ile aynı sözleşme: yeni kayıt newBook({hash, size 0, fileName '', format 'koreader', title, notePath}) + author; olmayan çizim eklenir (createdAt KOReader anı, updatedAt alım anı, chapter alanı dolu), olanın notu değiştiyse güncellenir; { book, created, added, updated, same, skipped } döner; koreader olmayan kayda işlemez. src/core/library/index.ts iki modülü dışa versin.
- Testler: yeni src/core/__test__/luaTest.ts (kaçışlar, yorumlar, uzun dize, sayısal anahtar sırası, iç içe tablo, bozuk girdi hata); yeni src/core/__test__/koreaderTest.ts (gömülü örnekler: yeni annotations Lua, eski highlight+bookmarks Lua ile kullanıcı notu ve otomatik not ayrımı, Türkçe karakter ve kaçışlı metin, başlık yoksa yol adından; JSON tek kitap ve dizi; aynı metin ikinci kez → added=0, kitap nesnesi ve not aynı; eklenen çizim ve sonradan yazılan not yalnız fark olarak gelir; not bloğu *KOReader* satırı ve sayfa etiketi, bloklar kitap sırasıyla; koreader olmayan kayda işlenmez). libraryTest.ts'e koreader çıpa/konum yaz-oku, bozuk çıpa null, compareAnchor sayfa sırası, hasBookFile false; libraryNoteTest.ts'e koreader yer etiketi ve şablon kaynak satırı, EN etiket nesnesine koreader; readingTest.ts'e pageUnit koreader null. scripts/run-tests.mjs listesine luaTest ve koreaderTest ekle. src/core/habit/reading.ts pageUnit koreader konumunda null dönsün.
- Store (src/store/useAppStore.ts): Kindle alma döngüsünün kitap başına kısmını (özet→id, bozuk kayıt kontrolü, biçim çakışması, freeNotePath, apply, bookCommit, syncBookNote blok ekleme/güncelleme, sonuç sayaçları) ortak iç yardımcıya çıkar ve parametre olarak { format, hash(group), apply(existing, group, now, init), i18n öneki } al; libraryImportKindle davranışı birebir aynı kalsın. Yeni eylem libraryImportKoreader(): busy kilidi; Tauri değilse appOnly; plugin-dialog open ile tek dosya (süzgeç lua, json; başlık i18n); readPickedFile + TextDecoder; parseKoreaderFile(text, path); kitap yoksa library.koreader.none; ortak yardımcıyla işle; sonuç mesajı library.koreader.result + skipped + blockEdited + sorunlar. libraryNoteLabels'a koreader etiketi.
- Arayüz: src/screens/Library/LibraryScreen.tsx başlık eylemlerine ve boş durum düğmelerine Kindle'ın yanında 'KOReader'dan al' düğmesi (lucide Import simgesi, aynı lo-lib-kindle-btn sınıfı, busy/!app iken pasif) → libraryImportKoreader(). src/screens/Library/BookCard.tsx rozet ve not-aç etiketini biçime göre seç (library.<format>.badge), kindle'a özel sabit metin kalmasın. Gerekirse src/styles/app.css'te üç düğmenin dar ekranda sarması için küçük düzeltme.
- Çeviriler tr/en/ar translation.json library bölümüne koreader alt nesnesi: import ('KOReader'dan al'), pickTitle ('KOReader çizim dosyasını seç (metadata.*.lua ya da JSON)'), pickFilter, none, readError, result ({{books}} kitap, {{added}} yeni çizim, {{updated}} not işlendi, {{same}} zaten vardı), skipped_one/other, clash, badge ('KOREADER'); note.koreader ('KOReader'). Üç dilde aynı anahtarlar.
- Wiki: LoomenWiki/modules/kutuphane.md'ye 'KOReader çizimleri (LOM-94)' bölümü (kaynak dosyalar ve iki Lua düzeni, JSON, kimlikler ve tekrar koruması, metin-tabanlı kimliğin bilinen sınırı, renk eşlemesi, not biçimi, kapsam dışı); mimari.md Kütüphane maddesine tek cümle.
- Doğrulama: npm run typecheck, npm test (luaTest, koreaderTest, libraryTest, libraryNoteTest, readingTest, kindleTest dahil hepsi), npm run build yeşil. Commit mesajında AI imzası yok; dal fix/LOM-94.

## Dokunulan dosyalar

- `Loomen/src/core/library/types.ts`
- `Loomen/src/core/library/codec.ts`
- `Loomen/src/core/library/model.ts`
- `Loomen/src/core/library/noteSync.ts`
- `Loomen/src/core/library/lua.ts`
- `Loomen/src/core/library/koreader.ts`
- `Loomen/src/core/library/index.ts`
- `Loomen/src/core/habit/reading.ts`
- `Loomen/src/core/__test__/luaTest.ts`
- `Loomen/src/core/__test__/koreaderTest.ts`
- `Loomen/src/core/__test__/libraryTest.ts`
- `Loomen/src/core/__test__/libraryNoteTest.ts`
- `Loomen/src/core/__test__/readingTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Library/LibraryScreen.tsx`
- `Loomen/src/screens/Library/BookCard.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/LoomenWiki/modules/kutuphane.md`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi, 54 test dosyasının tamamı ve derleme yeşil geçti. KOReader ile ilgili 31 kontrol geçti, hiçbiri kırmızı değil. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-94`
- Commit: `Loomen@ad8e4349983f8c8cc522a63fddafc1582bbc39c5`
- Test koşusu: `56c0d4aa-da01-4efc-8335-efbeba87d203` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

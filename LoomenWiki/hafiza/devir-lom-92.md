---
name: LOM-92 — Kütüphane: kalınan yer cihazlar arasında kaybolmadan taşınır
description: Kütüphanede kalınan yer: eşitlemeden önce bekleyen konum diske yazılır, konuma kayıt zamanı eklenir ve daha yeni konum (başka cihazdan gelen) eskisini ezmez; kitap açıkken başka cihazdan ileri konum gelince okuyucuda "Oraya git" şeridi çıkar.
type: project
proje: loomen
kaynak: kart LOM-92 · dal fix/LOM-92 · Loomen@43153e38154e45def657e041d3746b9b0acc56c6 · test koşusu 15172332-6cd9-4394-82a2-db7a32adf4c9 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-07
---

# LOM-92 — Kütüphane: kalınan yer cihazlar arasında kaybolmadan taşınır

## Ne yapıldı

Kütüphanede kalınan yer: eşitlemeden önce bekleyen konum diske yazılır, konuma kayıt zamanı eklenir ve daha yeni konum (başka cihazdan gelen) eskisini ezmez; kitap açıkken başka cihazdan ileri konum gelince okuyucuda "Oraya git" şeridi çıkar.

## Adımlar

- Türler: Loomen/src/core/library/types.ts içinde Book'a isteğe bağlı `positionSavedAt?: number` alanı ekle (kalınan yerin kaydedildiği an, ms). Açıklama yorumuna cihazlar arası 'yeni olan kazanır' kuralının bu alana dayandığını yaz. Dosya sürümü v:1 kalır.
- Kayıt biçimi: Loomen/src/core/library/codec.ts encodeBook `position`tan hemen sonra `positionSavedAt` yazsın (yalnız tanımlıysa); decodeBook sayı ise okusun. Sıra deterministik kalsın.
- Model: Loomen/src/core/library/model.ts içinde `samePosition`u dışa ver; `comparePosition(a, b)` ekle (pdf: page sonra offset; epub: spine sonra offset; kindle: location; farklı tür 0). `setPosition` artık `positionSavedAt: now` da yazar. Yeni saf yardımcılar: `newerPosition(mem: Book, disk: Book): Book` → disk.positionSavedAt > (mem.positionSavedAt ?? 0) ise mem'in position/progress/positionSavedAt alanlarını diskten alır, yoksa mem'i aynen döner; `shouldKeepPendingPosition(book, pendingAt)` → book.positionSavedAt ?? 0 <= pendingAt ise true (bekleyen konum yazılır), yoksa false (diskteki daha yeni, atlanır); `remotePositionAhead(book, local: {pos?: BookPosition; at: number})` → book.position varsa, local.pos ile aynı değilse, book.positionSavedAt > local.at ise ve comparePosition(book.position, local.pos) > 0 ise (local.pos yoksa da) book.position döner, değilse null.
- Store, bekleyen konum: Loomen/src/store/useAppStore.ts içinde `pendingPosition` nesnesine `at: number` ekle (librarySavePosition'da Date.now()). libraryFlushPosition: kitabı bulduktan sonra `shouldKeepPendingPosition(book, p.at)` false ise yazmadan dön (diskteki daha yeni konum kalır); true ise bookSetPosition ile yaz.
- Store, eşitleme öncesi: ghSync içinde `await flushDraft()` satırının hemen ardından `await get().libraryFlushPosition()` çağır (mobil ve masaüstü dalları ortak noktada, try'dan önce). Yorumla açıkla: eşitleme diski okur, bekleyen konum gönderilmezdi.
- Store, eşitleme sonrası birleştirme: libraryLoad'da `gen !== libraryGen` dalında `mem.get(b.id) ?? b` yerine `mem.has(b.id) ? newerPosition(mem.get(b.id)!, b) : b` kullan; böylece okuma sürerken yapılan yerel değişiklik korunur ama diskten gelen daha yeni konum kaybolmaz. gen eşitse disk zaten esas alınır (değişiklik yok).
- Okuyucu şeridi: Loomen/src/screens/Library/ReaderScreen.tsx içinde `localRef = useRef<{ id; pos?: BookPosition; at: number }>` tut; kitap değişince initialRef ile birlikte `{ pos: book.position, at: Date.now() }` olarak sıfırla. `onPosition`u sarmala: localRef'i (pos, at=Date.now()) güncelle, sonra savePosition'a ilet. `remoteHint` state'i ({ pos, savedAt } | null) ve `dismissedAt` ref'i tut. `book.position`/`book.positionSavedAt` değişince useEffect: `remotePositionAhead(book, localRef.current)` sonucu varsa ve savedAt dismissedAt'tan farklıysa remoteHint'e yaz. Şerit `.lo-reader__main` içinde, görüntüleyicinin üstünde yüzen küçük bir kutu (role="status"): metin `t("library.reader.remotePos", { where })` (where: pdf → `library.note.page` n=page; epub → `library.note.section` n=spine+1), 'Oraya git' düğmesi `jump({ position: hint.pos })` çağırır, localRef.pos'u o konuma ve at'ı Date.now()'a çeker, şeridi kapatır; 'Kapat' düğmesi dismissedAt = savedAt yapar ve şeridi kapatır. Sayfa kendiliğinden atlamaz, initialPosition sabit kalır.
- Metinler: Loomen/src/i18n/locales/tr/translation.json, en/translation.json, ar/translation.json dosyalarında `library.reader` altına `remotePos` (tr: "Başka cihazda {{where}} konumuna kadar okumuşsun."), `goThere` (tr: "Oraya git"), `dismiss` (tr: "Kapat") anahtarlarını ekle; en ve ar karşılıklarını yaz.
- Stil: Loomen/src/styles/app.css `.lo-reader__state` bloğundan sonra `.lo-reader__hint` ekle: `.lo-reader__main` içinde position:absolute, alt orta (inset-inline 0 margin auto, bottom 16px), max-width 420px, küçük yazı, panel arka planı, gölge, iki düğme; mobilde de sığsın (padding ve flex-wrap).
- Testler: Loomen/src/core/__test__/libraryTest.ts içine ekle: setPosition positionSavedAt yazar; encode/decode yaz-oku `positionSavedAt`ı korur ve aynı metni üretir; alan yoksa decode undefined bırakır; comparePosition pdf/epub ileri-geri-eşit; newerPosition disk yeniyse konumu alır, mem yeniyse mem'i aynen döner (çizimler mem'den kalır); shouldKeepPendingPosition disk yeniyse false; remotePositionAhead: aynı konum → null, geride konum → null, ileri ama eski zaman → null, ileri ve yeni → konum döner, local.pos yokken ileri sayılır.
- Doğrulama: `npm run typecheck` ve `npm test` çalıştır; libraryTest dahil bütün dosyalar geçmeli. Eski kayıt (positionSavedAt alanı olmayan JSON) bozuk sayılmadığını testle göster.

## Dokunulan dosyalar

- `Loomen/src/core/library/types.ts`
- `Loomen/src/core/library/codec.ts`
- `Loomen/src/core/library/model.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Library/ReaderScreen.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/libraryTest.ts`

## Test

Testler geçti.

> Tip denetimi temiz çıktı. npm test ile 50 test dosyasının tümü geçti, kütüphane çekirdeği testi de yeşil. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-92`
- Commit: `Loomen@43153e38154e45def657e041d3746b9b0acc56c6`
- Test koşusu: `15172332-6cd9-4394-82a2-db7a32adf4c9` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

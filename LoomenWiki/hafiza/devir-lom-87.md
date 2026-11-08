---
name: LOM-87 — Kütüphane 4: fotoğraftan alıntı, kitaplara soru sorma, okuma istatistikleri
description: LOM-87: Kütüphane'ye fotoğraftan alıntı (yapay zekâ sağlayıcısıyla metin okuma, yeni "photo" çizim türü), Asistan'a raf ve çizim bilgisi (kitap sorularına çizimlerden cevap) ve kalıcı okuma istatistikleri (sayfa, süre, biten kitap; Raporlar'da Okuma bölümü) eklenir.
type: project
proje: loomen
kaynak: kart LOM-87 · dal fix/LOM-87 · Loomen@b25a88e2a5807eff70c17b41b8d4acc799b5bcac · test koşusu 02863cda-a7b5-4931-b207-9429a1342ed6 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-08
---

# LOM-87 — Kütüphane 4: fotoğraftan alıntı, kitaplara soru sorma, okuma istatistikleri

## Ne yapıldı

LOM-87: Kütüphane'ye fotoğraftan alıntı (yapay zekâ sağlayıcısıyla metin okuma, yeni "photo" çizim türü), Asistan'a raf ve çizim bilgisi (kitap sorularına çizimlerden cevap) ve kalıcı okuma istatistikleri (sayfa, süre, biten kitap; Raporlar'da Okuma bölümü) eklenir.

## Adımlar

- Önce origin/main'i çek, fix/LOM-87 dalını origin/main'den aç; LOM-95 (kobo, sqlite) ve LOM-96 (share.ts, SharePickDialog, useShareIntake, 'shared' çizim türü) main'de mi doğrula ve bu planda adı geçen her dosyayı güncel hâliyle yeniden oku (yerel klasör bayat).
- Rust: src-tauri/src/ai/ocr.rs yaz: `ai_ocr_image(app, provider, image_base64, mime, language)` komutu; anahtar keys.rs'ten, taban adres llm.rs `base_of` ile; Gemini `generateContent` + inline_data görsel; OpenAI/compat `/chat/completions` içinde image_url data URL; Anthropic `/v1/messages` image base64 bloğu; istem 'görseldeki metni olduğu gibi, yorum eklemeden yaz'; en çok ~6 MB; hata metni llm.rs `error_message` ile. mod.rs'e `pub mod ocr;`, lib.rs'te masaüstü VE mobil generate_handler listelerine ekle.
- TS köprü src/core/ai/ocr.ts: `ocrImage(provider, bytes, mime, lang)` → base64 (stt.ts `bytesToBase64`) + invoke; boş sonuçta anlaşılır hata.
- Çekirdek kütüphane: types.ts'e `PhotoAnchor {kind:'photo'; page?: number}` ve BOOK_FORMATS'a dosyasız 'paper' (basılı kitap) ekle; codec.ts encode/decode; model.ts KIND_RANK photo, compareAnchor (sayfa, yoksa son), addHighlight kuralını 'shared' gibi photo için de gevşet, positionOfAnchor photo → null; noteSync.ts NoteLabels'a photo ('Fotoğraf', sayfa varsa 'Fotoğraf · s. N') ve paper ('Basılı kitap') etiketi, bookNoteTemplate paper kaynak satırı.
- Yeni saf modül src/core/library/photo.ts: `cleanOcrText` (satır sonu tire birleştirme, paragraf içi tek satır sonlarını boşluğa çevirme, çoklu boşluk temizliği), `photoHighlightId` = 'p' + sha256(temiz alıntı).slice(0,10), `applyPhotoQuote(existing|null, {quote, page?, title?, author?}, now)` → {book, created, added, duplicate} (aynı kitapta normalize alıntı eşitse duplicate; yoksa addHighlight; kayıt yoksa newBook ile 'paper' kaydı, hash sha256('paper|başlık|yazar')); index.ts'ten dışa ver.
- Görsel küçültme yardımcısı src/screens/Library/photoCapture.ts: createImageBitmap/canvas ile en uzun kenar ≤1600 px, JPEG 0.85, Uint8Array + mime döner; mobilde gizli `<input type=file accept=image/* capture=environment>`, masaüstünde plugin-dialog `open` (jpg/png/heic filtresi) + readPickedFile.
- Store (useAppStore.ts): `libraryOcrPhoto(bytes, mime)` (aiEnabled ve etkin sağlayıcı yoksa library.photo.needAi hatası; aiTranscribe deseniyle sağlayıcıyı bul, ocr.ts çağır, cleanOcrText uygula); `libraryAddPhotoQuote({bookId} | {newTitle, author?}, quote, page?)` → libraryBusy kilidi, applyPhotoQuote, duplicate ise library.photo.duplicate (info), değilse bookCommit + syncBookNote ile insertHighlightBlock (yeni kayıtta şablon), başarıda library.photo.added; libraryNoteLabels'a photo/paper etiketleri.
- Arayüz: src/screens/Library/PhotoQuoteDialog.tsx (SharePickDialog deseni: portal + useModalLayer): adım 1 fotoğraf seç/çek (sağlayıcıya gönderileceği uyarısı), adım 2 'Metin okunuyor…', adım 3 düzenlenebilir metin kutusu (seçim varsa seçili kısım alınır) + isteğe bağlı sayfa + kitap listesi (shelfBooks) ya da 'Yeni basılı kitap: başlık/yazar'; Ekle/Vazgeç. LibraryScreen.tsx baş eylemlerine ve boş rafa 'Fotoğraftan al' düğmesi; BookCard.tsx yorumuna paper rozeti (library.paper.badge/openNote anahtarları).
- İzinler: Info.plist'e NSCameraUsageDescription ve NSPhotoLibraryUsageDescription (Türkçe açıklama); AndroidManifest.xml'e android.permission.CAMERA (otomatik üretilen bloğun dışına).
- Asistan çekirdeği: chunk.ts parça metninden `<!-- loomen:hl … -->`, `<!-- /loomen:hl … -->` (ve loomen:ink) satırlarını at; yeni src/core/ai/library.ts: `libraryDigest(books)` (başlık, yazar, durum, sayfa, çizim sayısı; ~40 kitap / ~1500 karakter sınırı), `matchBooksInQuestion(books, q)` (share.ts normalizeTitle ile başlık/yazar içerme, ≥4 karakter), `isBookQuestion(q)` (kitap/çiz/alıntı/okudu… anahtar kelimeleri), `highlightsContext(book, maxChars)` (çizimler yer etiketiyle, retrieve hit biçiminde sahte parça, path = kitabın notu); context.ts PromptOptions'a `library?: string` ve sistem istemine 'Kütüphane' bölümü (çizimlerden cevap ver, kitap adını söyle, uydurma).
- aiSend: features.library açık ve kitap varsa (booksLoaded değilse libraryLoad bekle) soruda eşleşen kitapların çizim bağlamını hit listesinin başına koy, kitap sorusuysa digest'i sistem istemine ver; AssistantScreen.tsx boş sohbette hızlı soru çipleri ('Bu kitaptan ne çizmiştim?' son okunan kitapla, 'Şu konuda hangi kitaplarda ne okudum?').
- İstatistik çekirdeği src/core/library/stats.ts: `ReadingStats {v:1, days: Record<gün, Record<bookId, {p:number; s:number}>>}`, `normalizeStats`, `statsAdd(stats, day, bookId, pages, seconds)`, `pruneStats(keepDays=400)`, `activeSeconds` (olay zaman damgalarından ~90 sn boşluk kesmeli aktif süre), `summarizeStats(stats, books, today)` → bugün/bu hafta (Pazartesi başlangıç)/bu ay/toplam sayfa ve saniye, biten kitap (status done, finishedAt; bu yıl ve toplam), son 7 gün dizisi, en çok okunan kitaplar; index.ts'ten dışa ver.
- Store: `readingStats` durumu (partialize + yüklemede normalizeStats), `libraryStatsTrack(bookId, pagesDelta, secondsDelta)` ve kapanış/gizlenmede flush; habitTrackReading'deki yeni sayfa birimi hesabını ortak yardımcıya ayırıp alışkanlık olmasa da istatistiğe yaz; ReaderScreen.tsx: onPosition ve pointer/scroll olaylarını aktif süre sayacına besle, visibilitychange/pagehide ve okuyucu kapanışında flush.
- Arayüz: ReportsScreen.tsx'e 'Okuma' bölümü (bugün sayfa, bu hafta sayfa ve süre, toplam süre, biten kitap kartları; son 7 gün çubukları; boş durum metni; Kütüphane kapalıysa gizli); LibraryScreen.tsx başına tek satır özet şeridi ('Bu hafta N sayfa · süre').
- i18n tr/en/ar: library.photo.{take, pickTitle, pickFilter, reading, needAi, sent, duplicate, added, page, newBook, selectHint, error}, library.paper.{badge, openNote}, library.note.{photo, paper}, ai.library.{chipHighlights, chipTopic}, reports.reading.{title, pagesToday, pagesWeek, timeWeek, timeTotal, finished, empty}; üç dilde aynı anahtar ve yer tutucular; app.css'e küçük stiller.
- Testler: src/core/__test__/photoQuoteTest.ts (cleanOcrText, kimlik deterministik, applyPhotoQuote ekleme/çift/yeni paper kayıt, photo anchor codec gidiş-dönüş, addHighlight her biçimde photo kabul eder, locationLabel/şablon), aiLibraryTest.ts (digest sınırı, başlık eşleşmesi tr küçük harf, highlightsContext, chunk işaret temizleme, sistem istemi Kütüphane bölümü), readingStatsTest.ts (normalize bozuk veri, add/prune, activeSeconds boşluk kesmesi, summarize hafta/ay/biten kitap); scripts/run-tests.mjs suites listesine üçünü ekle.
- LoomenWiki/modules/kutuphane.md'ye 'Fotoğraftan alıntı (LOM-87)' ve 'Okuma istatistikleri' bölümleri, asistan sayfasına kitap bağlamı notu, mimari.md'ye tek cümle.
- Doğrulama: npm run typecheck, npm test, npm run build, cd src-tauri && cargo check; geçti/kaldı satırlarını kanıt olarak yaz; AI imzasız commit, fix/LOM-87 dalına push.

## Dokunulan dosyalar

- `Loomen/src-tauri/src/ai/ocr.rs`
- `Loomen/src-tauri/src/ai/mod.rs`
- `Loomen/src-tauri/src/lib.rs`
- `Loomen/src-tauri/gen/apple/loomen_iOS/Info.plist`
- `Loomen/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- `Loomen/src/core/ai/ocr.ts`
- `Loomen/src/core/ai/chunk.ts`
- `Loomen/src/core/ai/context.ts`
- `Loomen/src/core/ai/library.ts`
- `Loomen/src/core/library/types.ts`
- `Loomen/src/core/library/codec.ts`
- `Loomen/src/core/library/model.ts`
- `Loomen/src/core/library/noteSync.ts`
- `Loomen/src/core/library/photo.ts`
- `Loomen/src/core/library/stats.ts`
- `Loomen/src/core/library/index.ts`
- `Loomen/src/core/habit/reading.ts`
- `Loomen/src/core/__test__/photoQuoteTest.ts`
- `Loomen/src/core/__test__/aiLibraryTest.ts`
- `Loomen/src/core/__test__/readingStatsTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Library/LibraryScreen.tsx`
- `Loomen/src/screens/Library/PhotoQuoteDialog.tsx`
- `Loomen/src/screens/Library/photoCapture.ts`
- `Loomen/src/screens/Library/BookCard.tsx`
- `Loomen/src/screens/Library/ReaderScreen.tsx`
- `Loomen/src/screens/Assistant/AssistantScreen.tsx`
- `Loomen/src/screens/Reports/ReportsScreen.tsx`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/styles/app.css`
- `Loomen/LoomenWiki/modules/kutuphane.md`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi, tüm test paketi (61 dosya), web derlemesi ve Rust derleme denetimi temiz geçti. Canlı doğrulama (telefon kamerası, gerçek yapay zekâ hizmeti) insana kaldı.

## Kanıt

- Dal: `fix/LOM-87`
- Commit: `Loomen@b25a88e2a5807eff70c17b41b8d4acc799b5bcac`
- Test koşusu: `02863cda-a7b5-4931-b207-9429a1342ed6` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

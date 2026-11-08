---
name: LOM-96 — Kütüphane: Paylaş menüsünden alıntı alma
description: Testler kaldı: Android Paylaş menüsünden ve iPhone/iPad Kısayolu'ndan gelen metin Loomen'a alınır; alıntı, kitap adı ve yazar ayıklanıp raftaki kitabın notuna eklenir, eşleşme yoksa kitap seçtirilir, aynı alıntı ikinci kez eklenmez.
type: project
proje: loomen
kaynak: kart LOM-96 · dal fix/LOM-96 · commit yok · test koşusu 8ace927d-6e02-47a2-86d6-41abdcb03a53 (Air)
guven: iddia
durum: gelistirildi
---

# LOM-96 — Kütüphane: Paylaş menüsünden alıntı alma

## Ne yapıldı

Android Paylaş menüsünden ve iPhone/iPad Kısayolu'ndan gelen metin Loomen'a alınır; alıntı, kitap adı ve yazar ayıklanıp raftaki kitabın notuna eklenir, eşleşme yoksa kitap seçtirilir, aynı alıntı ikinci kez eklenmez.

## Adımlar

- Önce LOM-94 main'e girmiş mi doğrula (koreader.ts ve KOReader düğmesi main'de olmalı); dal fix/LOM-96 main'den açılır.
- Android alıcı: AndroidManifest.xml'de MainActivity'ye otomatik üretilen DEEP LINK bloğunun DIŞINA yeni bir intent-filter ekle: action android.intent.action.SEND, category DEFAULT, data mimeType text/plain.
- MainActivity.kt'de onCreate ve onNewIntent'i geçersiz kıl: gelen intent ACTION_SEND ve text/plain ise EXTRA_TEXT (ve varsa EXTRA_SUBJECT, referrer paket adı) ile `loomen://share?text=…&subject=…&app=…` adresi kur, intent'i ACTION_VIEW + bu Uri olarak yeniden yaz; onCreate'te super'den önce setIntent(yeni), onNewIntent'te super'e yeniden yazılmış intent'i ver. Önce ~/.cargo/registry içindeki tauri-plugin-deep-link Android kaynağını okuyup plugin'in activity.intent'i load sırasında ve onNewIntent'te okuduğunu doğrula.
- .gitignore'a mevcut zincir biçimiyle (her seviyede '*' sonra '!') MainActivity.kt'yi depoya alan istisnaları ekle (java/ → org/ → loomen/ → notes/ → MainActivity.kt); `git status` dosyayı göstermeli; generated/ klasörü dışarıda kalır.
- types.ts: BOOK_FORMATS'a 'shared' ekle (FILE_BOOK_FORMATS değişmez); `SharedAnchor { kind: 'shared'; app?: string }` tanımla ve Anchor birleşimine kat; BookPosition'a dokunma; dosya başı yorumuna paylaşılan alıntı açıklaması ekle.
- codec.ts: encodeAnchor/decodeAnchor 'shared' türünü işlesin (isteğe bağlı app alanı kısa metin); decodeBook 'shared' biçimini BOOK_FORMATS üzerinden zaten kabul eder, dosya sürümü v:1 kalır.
- model.ts: KIND_RANK'e shared:4; compareAnchor shared/shared için 0 (sortHighlights zaten createdAt ve id ile ayırır); addHighlight'taki biçim kuralını 'anchor.kind !== shared && anchor.kind !== b.format' olarak gevşet; positionOfAnchor dönüşünü BookPosition | null yap ve shared için null döndür; hasBookFile shared için false kalır.
- positionOfAnchor'un iki çağrı yerini null'a dayanıklı yap: ReaderScreen.tsx:440 onJump null ise atlamaz; useAppStore.ts:4712 readerTarget yalnız position varsa kurulur.
- noteSync.ts: NoteLabels'a `shared?` etiketi (varsayılan 'Paylaşıldı'); locationLabel shared için bu etiketi döndürsün; bookNoteTemplate 'shared' biçiminde kaynak satırı olarak '*Paylaşıldı*' yazsın; dosyalı kitaba eklenen shared blok mevcut biçimle (loomen:hl işaretleri, kitap bağlantısı) aynı kalsın.
- Yeni saf modül src/core/library/share.ts: parseShareUrl(url) → host 'share' değilse null, text/subject/app çözer (URL ile, bozuksa elle); parseSharedText(text, subject?) → {quote, title?, author?, app?}: Kindle (tırnaklı alıntı + '— Yazar, Başlık' satırı, a.co/amazon bağlantı ve tanıtım satırları atılır), Apple Kitaplar ('Excerpt From'/'Alıntı' + başlık + yazar, telif satırı atılır), Google Play Kitaplar ('Başlık by Yazar' + play.google bağlantısı), genel durumda tamamı alıntı ve subject varsa başlık; normalizeTitle (NFC, tr küçük harf, noktalama ve çoklu boşluk temizliği); matchBooks(books, parsed) → tam eşleşme tek sonuç, yoksa en az 4 karakterli içerme eşleşmeleri, yazar varsa daraltır; sharedHighlightId = 's' + sha256(cleanQuote).slice(0,10); sharedBookHash = sha256('shared|başlık|yazar'); applySharedQuote(existing|null, parsed, now, init?) → {book, created, added: Highlight|null, duplicate}: aynı kitapta normalize alıntı eşitse duplicate ve aynı nesne döner; yoksa addHighlight ile shared anchor ekler; existing yoksa newBook ile dosyasız 'shared' kaydı açar.
- index.ts'e `export * from './share'` ekle.
- Testler: src/core/__test__/shareTest.ts (Kindle/Apple/Play/genel metin fixture'ları, URL çözme, eşleştirme tek/çok/yok, çift alıntı no-op, yeni kayıt kimliği deterministik); libraryTest.ts'e shared anchor codec gidiş-dönüş, addHighlight'ın shared'ı her biçimde kabul edip diğer uyumsuzlukları hâlâ reddettiği, positionOfAnchor shared → null; libraryNoteTest.ts'e shared etiketli blok ve 'shared' şablon kaynak satırı; scripts/run-tests.mjs suites listesine shareTest ekle.
- useAppStore.ts: libraryNoteLabels'a shared etiketi; yeni state `pendingShare: { parsed, candidates: Book[] } | null`; eylem libraryReceiveShare(url): parseShareUrl → boşsa library.share.noText; features.library kapalıysa library.featureOff; vaultPath yoksa kuyrukta tut, booksLoaded değilse libraryLoad bekle; matchBooks tek → doğrudan uygula; yok/çok → pendingShare set. Eylem libraryResolveShare(target: {bookId} | {newRecord: true} | null): seçilen kitaba ya da yeni 'shared' kayda uygular. Ortak uygulama: libraryBusy kilidi, applySharedQuote, duplicate ise library.share.duplicate (info); değilse bookCommit, syncBookNote ile insertHighlightBlock (yeni kayıtta şablon zaten bütün çizimleri yazar), başarıda library.share.added (info); hatalar mevcut noteSyncFailed/importError yoluyla.
- Yeni src/hooks/useShareIntake.ts: isTauri'de onOpenUrl dinler ve açılışta getCurrent() okur; yalnız host 'share' olan adresleri libraryReceiveShare'e verir (Google giriş adresleri geçilir); vaultPath hazır olunca kuyruğu boşaltır. App.tsx'te hook'u çağır ve pendingShare doluysa SharePickDialog'u global olarak render et.
- Yeni src/screens/Library/SharePickDialog.tsx: HabitConfirm desenine göre portal + useModalLayer; başlıkta alıntının kısaltılmışı, metinde tanınan başlık/yazar varsa gösterilir; raftaki kitaplar (shelfBooks ile sıralı) liste olarak, başlık çözüldüyse 'Yeni kayıt: <başlık>' seçeneği, Vazgeç; seçim libraryResolveShare'e gider; Escape/zemin vazgeçer. Gerekirse app.css'e küçük stil.
- BookCard.tsx 'shared' biçimi için library.shared.badge ve library.shared.openNote anahtarlarını zaten biçim adıyla okur; yalnız yorumu güncelle ve anahtarları ekle. LibraryScreen.tsx yorumuna LOM-96 satırı (düğme eklenmez).
- i18n tr/en/ar: library.share.{added, duplicate, noText, pickTitle, pickBody, newRecord, noBooks, cancel}, library.shared.{badge, openNote}, library.note.shared; help.s.mobile altına yeni grup 'share' (h, p, steps: Android'de Paylaş → Loomen; iPhone/iPad'de Kısayollar'da Paylaşım Sayfası kısayolu: girdi metin, 'URL aç' eylemi loomen://share?text= + URL-kodlu girdi) üç dilde aynı anahtar, yer tutucu ve ters tırnak sayısıyla; HelpScreen.tsx SECTIONS mobile grubuna { id: 'share' } ekle.
- LoomenWiki/modules/kutuphane.md'ye '## Paylaş menüsünden alıntı (LOM-96)' bölümü (Android alıcı, Kısayol, ayıklama, eşleştirme, çift kayıt kuralı, Kod ve Testler satırlarına share/shareTest) ve mimari.md'ye tek cümle.
- Doğrulama: npm run typecheck, npm test, npm run build; git status'ta MainActivity.kt'nin izlendiğini göster; AI imzasız commit, fix/LOM-96 dalına push.

## Dokunulan dosyalar

- `Loomen/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- `Loomen/src-tauri/gen/android/app/src/main/java/org/loomen/notes/MainActivity.kt`
- `Loomen/.gitignore`
- `Loomen/src/core/library/types.ts`
- `Loomen/src/core/library/codec.ts`
- `Loomen/src/core/library/model.ts`
- `Loomen/src/core/library/noteSync.ts`
- `Loomen/src/core/library/share.ts`
- `Loomen/src/core/library/index.ts`
- `Loomen/src/core/__test__/shareTest.ts`
- `Loomen/src/core/__test__/libraryTest.ts`
- `Loomen/src/core/__test__/libraryNoteTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/hooks/useShareIntake.ts`
- `Loomen/src/App.tsx`
- `Loomen/src/screens/Library/SharePickDialog.tsx`
- `Loomen/src/screens/Library/LibraryScreen.tsx`
- `Loomen/src/screens/Library/BookCard.tsx`
- `Loomen/src/screens/Library/ReaderScreen.tsx`
- `Loomen/src/screens/Help/HelpScreen.tsx`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/styles/app.css`
- `Loomen/LoomenWiki/modules/kutuphane.md`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler KALDI; iş doğrulanmadı.

> İş yarıda durduruldu; testler koşmadı.

## Kanıt

- Dal: `fix/LOM-96`
- Test koşusu: `8ace927d-6e02-47a2-86d6-41abdcb03a53` (Air)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.

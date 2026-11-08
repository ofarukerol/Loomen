---
name: LOM-95 — Kütüphane: Kobo çizimlerini alma
description: Rafa "Kobo'dan al" düğmesi ve bağlı Kobo için "Kobo bağlı" şeridi eklenir; Kobo'nun KoboReader.sqlite dosyası bağımlılık kurmadan, salt okunur küçük bir SQLite çözücüyle okunur ve çizimler Kindle/KOReader ile aynı ortak döngüden tekrarsız olarak kitap notlarına düşer.
type: project
proje: loomen
kaynak: kart LOM-95 · dal fix/LOM-95 · Loomen@a0db04c39c9bf736ceaceb6f9b54059797704847 · test koşusu c6b1747e-f7ce-455c-9101-65f8691a881e (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-08
---

# LOM-95 — Kütüphane: Kobo çizimlerini alma

## Ne yapıldı

Rafa "Kobo'dan al" düğmesi ve bağlı Kobo için "Kobo bağlı" şeridi eklenir; Kobo'nun KoboReader.sqlite dosyası bağımlılık kurmadan, salt okunur küçük bir SQLite çözücüyle okunur ve çizimler Kindle/KOReader ile aynı ortak döngüden tekrarsız olarak kitap notlarına düşer.

## Adımlar

- Çekirdek türler (src/core/library/types.ts): BOOK_FORMATS'a "kobo" ekle (FILE_BOOK_FORMATS değişmez); yeni KoboAnchor { kind: "kobo"; progress: number (bölüm içi 0..1); chapter?: number (Kobo bölüm sırası, 0'dan) } Anchor birleşimine; BookPosition'a { kind: "kobo"; location: number } (location = round(((chapter ?? 0) + progress) * 1000), yalnız sıra/gösterim). Baş yorumuna Kobo kitabının dosyasız olduğunu ve özetin 'kobo|başlık|yazar' metninden türediğini yaz.
- Codec (src/core/library/codec.ts): encodeAnchor/decodeAnchor kobo varyantı (progress sayı, 0..1'e sıkıştırılıp 5 haneye yuvarlanır; chapter varsa tamsayı ≥0, değilse null); encodePosition/decodePosition kobo { location tamsayı ≥0 }.
- Model (src/core/library/model.ts): KIND_RANK'a kobo: 4; compareAnchor kobo→kobo: önce chapter (bilinmeyen en sona), sonra progress; samePosition/comparePosition kobo location; positionOfAnchor kobo → { kind: "kobo", location }. hasBookFile FILE_BOOK_FORMATS üzerinden zaten false döner, test et.
- Not biçimi (src/core/library/noteSync.ts): NoteLabels'a kobo?: string (DEFAULT 'Kobo') ve progress?: string (DEFAULT '%{n}'); locationLabel kobo çıpada: h.chapter varsa o, yoksa a.chapter tanımlıysa labels.section ile 'Bölüm n' (chapter+1), o da yoksa progress etiketi (yüzde, yuvarlanmış); bookNoteTemplate'te kindle/koreader zincirini hasBookFile(book) ile genelleştir: dosyasız kitapta `*<labels[format]>*` kaynak satırı (kobo için *Kobo*), dosyalı kitapta 'Kitabı aç' bağlantısı. Baş yorumuna Kobo satırı ekle.
- Yeni saf modül src/core/library/sqlite.ts — salt okunur SQLite dosya çözücü, kod çalıştırmaz, yazmaz: başlık doğrulama ('SQLite format 3\0'), sayfa boyutu (ofset 16; 1 = 65536), ayrılmış bayt (ofset 20), metin kodlaması (ofset 56; yalnız UTF-8 desteklenir, başkası hata), sayfa 1'den sqlite_master tablo B-ağacı; tablo B-ağacı sayfaları (0x0D yaprak, 0x05 iç; indeks sayfaları atlanır), hücre işaretçi dizisi, sağ işaretçi; varint, rowid, taşma (overflow) hesabı (U, X, M, K formülü) ve taşma sayfa zinciri; kayıt başlığı ve seri tipler (NULL, 1-6 bayt tamsayı, 8 bayt float, 0/1 sabitleri, blob, metin); CREATE TABLE metninden sütun adları (tırnaklı adlar, üst seviye virgül ayrımı, CONSTRAINT/PRIMARY/UNIQUE/FOREIGN/CHECK satırları atlanır) ve INTEGER PRIMARY KEY takma adı için rowid yerine koyma; WITHOUT ROWID tablo hata. Ziyaret edilen sayfa kümesiyle döngü ve sınır dışı işaretçi koruması ('bozuk dosya' hatası). API: openSqlite(bytes) → { tables(): string[]; rows(table): Record<string, SqlValue>[] } (SqlValue = null | number | string | Uint8Array; sütun adı eşleşmesi büyük/küçük harfe duyarsız yardımcıyla).
- Yeni saf modül src/core/library/kobo.ts: (a) parseKoboDatabase(bytes): KoboGroups { books: KoboBook[]; skipped }: `content` tablosundan ContentType 6 satırları kitap (ContentID → Title, Attribution), ContentType 9 ve 899 (ya da BookID dolu) satırları bölüm (ContentID → Title, VolumeIndex, BookID); `Bookmark` tablosunda Hidden 'true' olan, Type 'dogear'/'markup' olan ve Text boş olan girdiler atlanıp sayılır; her çizim için text=Text, note=Annotation (kırpılmış, boşsa yok), addedAt=DateCreated (ISO 'YYYY-MM-DDTHH:MM:SS[.sss][Z]' → ms; çözülemezse yok), progress=ChapterProgress (0..1'e sıkıştırılır, yoksa 0), color=Color tamsayı eşlemesi (0→yellow, 1→pink, 2→green, 3→blue, yoksa/bilinmeyen→yellow), chapter: Bookmark.ContentID için bölüm satırı (tam eşleşme → '#' parçası atılmış → aynı VolumeID'nin bölümleri içinde en uzun önek eşleşmesi) varsa Title ve VolumeIndex. Kitap başlığı content kaydından, yoksa VolumeID yolunun son parçasından (URL çözümü, .kepub.epub/.epub/.pdf uzantısı atılır), o da yoksa 'Kobo'; yazar Attribution. Aynı kitapta cleanQuote eşit çizimler birleşir (KOReader Collector mantığı; not ve en eski tarih korunur); sıralama chapter (bilinmeyen sona), progress, addedAt. (b) koboBookKey = kindleBookKey; koboBookHash = sha256('kobo|' + key); koboHighlightId = 'b' + sha256(cleanQuote(text)) ilk 10 hane; koboAnchor(h). (c) applyKoboBook(existing, group, now, init?) applyKoreaderBook ile aynı sözleşme: kobo olmayan kayda işlemez; yeni kayıt newBook({hash, size 0, fileName '', format 'kobo', title, notePath}) + author; olmayan çizim eklenir (createdAt Kobo anı, updatedAt alım anı, chapter dolu), olanın Kobo notu değiştiyse güncellenir; { book, created, added, updated, same, skipped } döner, değişiklik yoksa aynı kitap nesnesi. src/core/library/index.ts sqlite ve kobo modüllerini dışa versin.
- Cihaz tanıma (src/core/library/kindleDevice.ts + yeni src/core/library/koboDevice.ts): kindleDevice'taki disk kökü tarama döngüsünü (macOS /Volumes/*, Linux /media/*, /media/*/*, /run/media/*/*) `findOnMountedDisks(relPath)` adlı dışa açık yardımcıya çıkar, Kindle aynı yardımcıyla 'documents/My Clippings.txt' arasın (davranış birebir). koboDevice.ts: findKoboDatabase() → '.kobo/KoboReader.sqlite' arar (Tauri değilse, mobil ve Windows'ta null; hata sızdırmaz), readKoboDatabase(path) → plugin-fs readFile (Uint8Array).
- İzinler (src-tauri/capabilities/default.json): fs:allow-exists listesine ve yeni fs:allow-read-file girdilerine /Volumes/*/.kobo/KoboReader.sqlite, /media/*/.kobo/KoboReader.sqlite, /media/*/*/.kobo/KoboReader.sqlite, /run/media/*/*/.kobo/KoboReader.sqlite ekle (yazma izni yok, klasör listeleme izinleri aynı). Açıklama metnine Kobo satırı ekle. mobile.json değişmez.
- Store (src/store/useAppStore.ts): importExternalBooks'un format tipini 'kindle' | 'koreader' | 'kobo' yap; durum alanı koboDevicePath: string | null (başlangıç null); eylemler libraryProbeKobo() (Kindle'daki gibi tek süren arama kilidi) ve libraryImportKobo(source = 'auto'): busy kilidi, Tauri değilse appOnly; 'auto'da koboDevicePath (yoksa findKoboDatabase) okunur, okunamazsa şerit kalkar ve readError; dosya yolunda plugin-dialog open (süzgeç sqlite, sqlite3, db; başlık i18n) + readPickedFile → bayt; parseKoboDatabase hata verirse ya da kitap yoksa library.kobo.none; ortak importExternalBooks ile { format 'kobo', prefix 'library.kobo', fallbackTitle 'Kobo', hash koboBookHash, apply applyKoboBook }. libraryNoteLabels'a kobo ve progress etiketleri.
- Arayüz (src/screens/Library/LibraryScreen.tsx): açılışta ve pencere odağında Kindle ile birlikte Kobo da aranır; koboDevicePath doluyken rafın üstünde aynı şerit sınıfıyla 'Kobo bağlı · Çizimleri al' şeridi (libraryImportKobo('auto')); başlık eylemlerine ve boş rafa Kindle/KOReader düğmelerinin yanına 'Kobo'dan al' düğmesi (aynı lo-lib-kindle-btn sınıfı, lucide-react 0.468'de var olan bir simge, busy/!app iken pasif). BookCard rozet/etiket zaten biçimden okuyor (library.<format>.badge/openNote); yalnız çeviri anahtarları eklenir. Gerekirse src/styles/app.css'te dört düğmenin dar ekranda sarması için küçük düzeltme.
- Çeviriler tr/en/ar translation.json library bölümüne kobo alt nesnesi: import ('Kobo'dan al'), detected ('Kobo bağlı. Çizimlerini kitap notlarına alabilirsin.'), take, pickTitle ('Kobo veritabanı dosyasını seç (.kobo/KoboReader.sqlite — gizli klasör, Mac'te Cmd+Shift+. ile görünür)'), pickFilter, none, readError, result ({{books}} kitap, {{added}} yeni çizim, {{updated}} not işlendi, {{same}} zaten vardı), skipped_one/other ('yer imi, kalem çizimi ya da metni olmayan girdi'), clash, badge ('KOBO'), openNote; library.note.kobo ('Kobo') ve library.note.progress ('%{{n}}' tr, '{{n}}%' en/ar). Üç dilde aynı anahtarlar.
- Test fikstürü: scripts/fixtures/kobo-sample.sql (Kobo şemasının gerekli sütunlarıyla `content` ve `Bookmark` tabloları, PRAGMA page_size=1024; 2 kitap, bölüm satırları, 'highlight' ve 'note' türü çizimler, Annotation'lı girdi, 'dogear' ve Hidden='true' girdiler, Color 0..3 örnekleri, 1024 baytı aşan uzun alıntı (taşma sayfası), content tablosunu birden çok sayfaya taşıracak kadar satır (iç sayfa), VolumeID'si content'te olmayan kitap (başlık yoldan), Türkçe karakterli metin) ve bundan sqlite3 komut satırıyla bir kez üretilip depoya eklenen src/core/__test__/fixtures/kobo-sample.sqlite (küçük ikili dosya; test process.cwd() üzerinden okur, run-tests.mjs cwd'yi depo kökü yapıyor).
- Testler: yeni src/core/__test__/sqliteTest.ts (başlık ve sayfa boyutu, tablo listesi, satır sayısı, tipler null/tamsayı/ondalık/metin/blob, taşma sayfalı uzun metin tam döner, çok sayfalı tablo bütün satırları döner, INTEGER PRIMARY KEY takma adı rowid'den dolar, bozuk/kesik bayt dizisi hata fırlatır, SQLite olmayan dosya hata). Yeni src/core/__test__/koboTest.ts (fikstürden 2 kitap ve çizim sayıları; dogear/hidden/boş metin atlanıp sayılıyor; not Annotation'dan; bölüm adı ve sırası; renk eşlemesi; başlık yoldan; tarih çözümü; koboBookHash aynı başlıklı kindleBookHash ve koreaderBookHash'ten farklı; applyKoboBook: ilk alım created ve added dolu, ikinci alım added=0, same dolu, kitap nesnesi aynı referans; yeni not var olan bloğa işleniyor, elle değişmiş blok korunuyor; not şablonunda *Kobo* kaynak satırı ve bölüm/yüzde etiketi, bloklar kitap sırasıyla; kobo olmayan kayda işlenmez; encodeBook/decodeBook ile yaz-oku). libraryTest.ts'e kobo çıpa/konum yaz-oku ve bozuk çıpa null, compareAnchor bölüm-yüzde sırası, hasBookFile false; libraryNoteTest.ts'e kobo yer etiketi üç dalı ve şablon kaynak satırı, EN etiket nesnesine kobo/progress; readingTest.ts'e pageUnit kobo konumunda null. scripts/run-tests.mjs listesine sqliteTest ve koboTest ekle.
- Wiki: LoomenWiki/modules/kutuphane.md'ye 'Kobo çizimleri (LOM-95)' bölümü (kaynak dosya ve gizli .kobo klasörü, tanıma yolları ve salt okuma izni, bağımlılıksız SQLite çözücü ve sınırları — UTF-8, WAL okunmaz, rowid tabloları —, Bookmark/content alan eşlemesi, kimlikler ve tekrar koruması, renk eşlemesi, not biçimi ve yer etiketi, kapsam dışı, bilinen sınırlar); 'Ortak alma döngüsü' maddesine Kobo'yu ekle; mimari.md Kütüphane maddesine tek cümle.
- Doğrulama: npm run typecheck, npm test (sqliteTest, koboTest, libraryTest, libraryNoteTest, readingTest, kindleTest, koreaderTest dahil hepsi) ve npm run build yeşil. Yeni npm ya da Cargo bağımlılığı eklenmez. Commit mesajında AI imzası yok; dal fix/LOM-95.

## Dokunulan dosyalar

- `Loomen/src/core/library/types.ts`
- `Loomen/src/core/library/codec.ts`
- `Loomen/src/core/library/model.ts`
- `Loomen/src/core/library/noteSync.ts`
- `Loomen/src/core/library/sqlite.ts`
- `Loomen/src/core/library/kobo.ts`
- `Loomen/src/core/library/koboDevice.ts`
- `Loomen/src/core/library/kindleDevice.ts`
- `Loomen/src/core/library/index.ts`
- `Loomen/src-tauri/capabilities/default.json`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Library/LibraryScreen.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/sqliteTest.ts`
- `Loomen/src/core/__test__/koboTest.ts`
- `Loomen/src/core/__test__/fixtures/kobo-sample.sqlite`
- `Loomen/scripts/fixtures/kobo-sample.sql`
- `Loomen/src/core/__test__/libraryTest.ts`
- `Loomen/src/core/__test__/libraryNoteTest.ts`
- `Loomen/src/core/__test__/readingTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/LoomenWiki/modules/kutuphane.md`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi, tam test takımı (56 dosya) ve derleme hatasız geçti. Kobo ve SQLite okuyucu testleri yeşil. package.json ve Cargo.toml'da fark yok. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-95`
- Commit: `Loomen@a0db04c39c9bf736ceaceb6f9b54059797704847`
- Test koşusu: `c6b1747e-f7ce-455c-9101-65f8691a881e` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

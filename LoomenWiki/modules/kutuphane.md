---
module: kutuphane
repos: [Loomen]
status: aktif
last_updated: 2026-11-08
related_docs:
  - modules/mimari.md
---

# Loomen — Kütüphane (LOM-83)

PDF ve EPUB kitapları uygulamanın içinde okumak; çizilen yerleri kitabın notuna alıntı olarak
düşürmek. Şeritte ve telefon menüsünde "Kütüphane" girişi; Ayarlar › Özellikler'de açılıp
kapanır (varsayılan açık, kapatmak veri silmez).

## Nerede ne durur
- **Kitap dosyası kasaya girmez.** İçe aktarınca cihazın uygulama klasörüne, `loomen#library/<id>.pdf|epub`
  olarak kopyalanır; kapak `loomen#library/covers/<id>.png|jpg`. Yazım önce geçici dosyaya, sonra
  yeniden adlandırma (yarım dosya kalmaz). Dosya adları sıkı bir kalıptan geçer (yol kaçırma yok).
- **Klasör adı neden `loomen#library`:** noktayla başlayan ad Tauri dosya izninde (`$APPDATA/**`)
  macOS/Linux/Android'de eşleşmez, bütün okuma/yazma reddedilirdi. Mobilde kasalar da uygulama
  klasöründe durur; kasa adından `#` silindiği için hiçbir kasa bu adı alamaz.
- **Kasada kayıt:** `Kütüphane/<id>.json` — başlık, yazar, biçim, dosya özeti (SHA-256), durum
  (okunacak/okunuyor/bitti), kalınan yer, ilerleme, çizimler, notun yolu. `<id>` dosya özetinin ilk
  16 hanesi: aynı dosya her cihazda aynı kayda eşlenir. Bozuk kayıt rafta gösterilmez, üstüne
  yazılmaz; rafın üstünde uyarı çıkar.
- **Kasada not:** `Kütüphane/<Başlık>.md`. Ön maddede `loomen-book: <id>`; başlık, yazar,
  "Kitabı aç" bağlantısı ve "Alıntılar" bölümü. Not taşınırsa ön maddeden bulunur ve kayıttaki yol
  güncellenir; hiç bulunamazsa bütün çizimleriyle yeniden yazılır.
- **Okuyucu tercihleri** (yazı boyutu, görünüm, son renk) ve raf süzgeci cihaz ayarıdır (`loomen.settings`).

## Çizim bloğu
Her çizim notta kendi bloğudur:

```
<!-- loomen:hl <hlId> -->
> alıntı
kullanıcının notu (varsa)
🟨 [s. 12](loomen://book/<id>?hl=<hlId>)
<!-- /loomen:hl <hlId> -->
```

- Bloklar kitap sırasıyla dizilir; kullanıcının blok dışına yazdıkları korunur.
- Çizim silinince yalnız o blok kalkar. Bitişi silinmiş (bozuk) bloğa dokunulmaz.
- Alıntı/nottaki `<!--` ve `-->` etkisizleştirilir (blok sınırı kaçırılamaz); bağlantı etiketindeki
  köşeli parantez kaçışlıdır (`\[`, `\]`). Satır sonu biçimi (CRLF) korunur.
- Okuma modunda işaret satırları görünmez, bağlantı düğme olur. Düzenleme modunda işaret satırları
  soluk görünür (silinmesinler), bağlantının adresi imleç satırda değilken gizlenir ve etikete
  dokununca kitap açılır.
- Not yazımı Markdown not sırasından geçer: açık notun taslağı önce kaydedilir, not diskten okunur,
  blok değiştirilir, yazılır, dizin yenilenir.

## Konum (çıpa)
- PDF: sayfa (1'den) + sayfadaki dikdörtgenler (0..1 oranında). EPUB: bölüm sırası ve yolu + bölüm
  düz metnindeki [başlangıç, bitiş) aralığı. Kalınan yer de aynı mantıkla (sayfa + dikey oran /
  bölüm + karakter).
- Kalınan yer okurken 2 sn gecikmeyle yazılır; ekran gizlenince, okuyucu kapanınca ve başka kitaba
  geçince hemen yazılır. Kasa değişirse bekleyen konum atılır.

## Okuyucu kabuğu ve görüntüleyiciler
- Kabuk (`src/screens/Library/ReaderScreen.tsx`): dosyayı uygulama klasöründen okur; üst çubuk
  (geri, başlık, yazı boyutu, görünüm, çizimler, not), renk menüsü, not penceresi, çizim listesi.
- Biçime özel görüntüleyici `src/screens/Library/views/<Biçim>View.tsx` dosyasıdır (`PdfView`,
  `EpubView`); tembel yüklenir, yoksa "bu sürümde yok" yer tutucusu çıkar. Sözleşme
  `src/screens/Library/readerTypes.ts`: görüntüleyici çıpayı hesaplar, seçimi/konumu/kitap bilgisini
  bildirir; kayıt ve not işleri kabuktadır.
- Dosya bu cihazda yoksa (başka cihazda eklenmiş kitap) "Dosyayı seç" çıkar; seçilen dosyanın özeti
  kayıtla aynı değilse kabul edilmez.

## Raf
- Süzgeç: Hepsi / Okunuyor / Okunacak / Bitti (sayılarıyla). Kart: kapak (yoksa başlıktan renkli
  yüzey), başlık, yazar, durum seçici, ilerleme, çizim sayısı; ⋯ menüsünde oku, notu aç, raftan
  kaldır.
- Okuyucu açılınca "okunacak" kitap "okunuyor"a geçer. "Bitti"ye alınınca bitiş anı yazılır.
- Raftan kaldırma onay ister; kayıt çöpe gider, cihazdaki kopya ve kapak silinir, not kasada kalır.
- Aynı dosya ikinci kez eklenmez. 200 MB üstü dosya için onay sorulur.

## Kindle çizimleri (LOM-84)
- **Kaynak:** Kindle'ın `documents/My Clippings.txt` dosyası. Rafta "Kindle'dan al" düğmesi: bağlı
  Kindle varsa onun dosyası, yoksa (ya da Windows/mobil) dosya seçtirilir. Ekran açılınca ve pencere
  odak alınca Kindle aranır (zamanlayıcı yok); bulunursa rafın üstünde "Kindle bağlı · Çizimleri al"
  şeridi çıkar.
- **Tanıma yolu:** macOS `/Volumes/*/documents/`, Linux `/media/*/`, `/media/*/*/`, `/run/media/*/*/`.
  Bu yerler için yalnız okuma izni var (`capabilities/default.json`: metin oku, klasör oku, var mı);
  yazma izni yok. Windows sürücü harfleri için güvenli izin kalıbı yazılamadığından otomatik tanıma
  yok; seçilen dosya izne kendiliğinden girer.
- **Ayrıştırma:** baştaki görünmez işaret (BOM) ve Windows satır sonları temizlenir; İngilizce ve
  Türkçe meta satırı tanınır, başka dilde konum + metin varsa çizim sayılır. Not, aynı kitapta konumu
  kapsayan (yoksa dosyada hemen önceki) çizime bağlanır; yer imleri ve eşi bulunmayan notlar atlanır,
  sonuç mesajında sayılır.
- **Kimlikler (tekrar koruması):** kitap özeti normalleştirilmiş "başlık|yazar"ın SHA-256'sı, kimlik
  ilk 16 hane — aynı kitap her alımda aynı kayda düşer. Çizim kimliği `k` + SHA-256(konum|sayfa|alıntı)
  ilk 10 hane; aynı çizim ikinci alımda yeniden eklenmez, Kindle'da sonradan yazılan not mevcut
  çizimin bloğuna işlenir (blok elle değiştirildiyse dokunulmaz, kullanıcıya söylenir).
- **Kayıt:** biçim `kindle`, dosya yok (`hasBookFile` false), boyut 0; çıpa `{kind: "kindle",
  location?, page?}`, renk sarı. Kindle kaydını eski Loomen sürümleri tanımaz, "okunamadı" uyarısıyla
  gizler; üstüne yazmaz.
- **Not:** blok biçimi Loomen kitaplarıyla aynı (işaret, alıntı, not, renk simgesi + yer bağlantısı).
  Yer etiketi sayfa varsa "s. 12", yoksa "Konum 180-182". "Kitabı aç" bağlantısı yerine `*Kindle*`
  kaynak satırı yazılır.
- **Raf:** Kindle kartına ya da nottaki yer bağlantısına dokununca okuyucu değil kitabın notu açılır;
  kartta "KINDLE" rozeti, ilerleme ve "Oku" yok. Raftan kaldırınca yalnız kayıt çöpe gider (dosya yok).
- **Kapsam dışı:** Kindle kitabını aynı PDF/EPUB kaydıyla eşleştirme, metnini gösterme, yer imleri,
  Kindle'da silinen çizimin Loomen'dan silinmesi, Amazon bulutu, kapak indirme, mobilde USB tanıma.
- **Bilinen sınırlar:** Kindle'da uzatılıp kısaltılan çizim yeni aralıkla yeni girdi olarak gelir; eski de kalır (kimlik = aralık + metin). Kitabın başlık/yazar yazımı değişirse ayrı kitap olur. Kindle'daki not, Loomen'de değiştirilen notun üstüne yazar (blok elle değiştirildiyse blok korunur). "Clipping limit" uyarısı alıntı sayılmaz.
- **Not tamamlama:** raftan kaldırılıp yeniden alınan kitapta not zaten varsa yalnız notta olmayan bloklar eklenir; var olan bloğa dokunulmaz.
- **İzin:** dış disklerde yalnız disk adları listelenir, yalnız `documents/My Clippings.txt` okunur; yazma yok.

## KOReader çizimleri (LOM-94)
- **Kaynak:** rafta "KOReader'dan al" düğmesi (dolu ve boş rafta) bir dosya seçtirir: kitabın yanındaki
  `<kitap>.sdr/metadata.<biçim>.lua` ya da KOReader'ın JSON dışa aktarımı (tek kitap ya da kitap
  listesi). Bağlı cihaz tanıma ve `.sdr` klasörü tarama yok. Mobilde ve masaüstünde aynı yol.
- **Lua dosyası** kod çalıştırılmadan okunur (`lua.ts`: yalnız tablo sabiti; dize kaçışları, uzun dize,
  yorumlar). İki düzen tanınır: yeni `annotations` dizisi (metni ve `pos0`'ı olan girdi çizim) ve eski
  `highlight[sayfa][i]` + `bookmarks` (yer imindeki metin kullanıcının notu; KOReader'ın kendi yazdığı
  "Sayfa 12 … @ tarih" kalıbı not sayılmaz). Başlık `doc_props`'tan, yoksa kitap yolundan ya da `.sdr`
  klasör adından. Yer imleri ve metinsiz girdiler atlanır, sonuç mesajında sayılır.
- **JSON:** `{title, author, entries: [...]}`; girdide text, note, page, time (saniye), chapter, color.
  TXT, HTML, Markdown dışa aktarmaları desteklenmez ("çizim bulunamadı" mesajı).
- **Kimlikler (tekrar koruması):** kitap özeti SHA-256("koreader|" + normalleştirilmiş "başlık|yazar"),
  kimlik ilk 16 hane — aynı başlıklı Kindle kaydıyla çakışmaz, ayrı kart ve ayrı not olur. Çizim kimliği
  `o` + SHA-256(sadeleştirilmiş alıntı) ilk 10 hane. Sayfa kimliğe girmez (EPUB'da KOReader sayfası yazı
  boyutuna göre değişir). İkinci alımda yalnız yeni çizim eklenir, KOReader'da yazılan yeni/değişen not
  var olan bloğa işlenir; değişiklik yoksa kayıt ve not yazılmaz.
- **Kayıt:** biçim `koreader`, dosya yok (`hasBookFile` false), boyut 0; çıpa `{kind: "koreader", page,
  pos0?, pos1?}`. Renk eşlemesi: yellow/orange→sarı, green/olive→yeşil, blue/cyan→mavi,
  red/purple/pink→pembe, diğerleri sarı; renk kimliğe girmez. Eski Loomen sürümleri kaydı "okunamadı"
  uyarısıyla gizler, üstüne yazmaz.
- **Not ve raf:** blok biçimi aynı; yer etiketi sayfa ("s. 12"), "Kitabı aç" yerine `*KOReader*` kaynak
  satırı. Kartta "KOREADER" rozeti, ilerleme ve "Oku" yok; karta dokununca not açılır.
- **Bilinen sınırlar:** aynı kitapta birebir aynı iki alıntı tek çizim sayılır. KOReader'da silinen çizim
  Loomen'dan silinmez. Başlık/yazar yazımı değişirse ayrı kitap olur.

## Kobo çizimleri (LOM-95)
- **Kaynak:** Kobo'nun kökündeki gizli `.kobo/KoboReader.sqlite`. Masaüstünde (macOS/Linux) takılı
  disklerde kendisi aranır (`/Volumes/<disk>`, `/media/<disk>`, `/media/<kullanıcı>/<disk>`,
  `/run/media/<kullanıcı>/<disk>`; Kindle aramasıyla ortak `findOnMountedDisks`); bulunursa rafta
  "Kobo bağlı" şeridi çıkar. "Kobo'dan al" düğmesi (dolu ve boş rafta) cihaz varsa onu okur, yoksa
  dosya seçtirir (.sqlite/.sqlite3/.db). Windows ve mobilde yalnız dosya seçimi.
- **İzin:** capabilities'te yalnız dört kökteki `.kobo/KoboReader.sqlite` için var-mı ve okuma; yazma yok.
- **SQLite okuyucu** (`sqlite.ts`): bağımlılıksız, salt okunur; SQL çalıştırmaz, B-ağacını gezip tablo
  satırlarını verir (taşma sayfaları, INTEGER PRIMARY KEY = rowid, ALTER ile sonradan eklenmiş sütun →
  null). Sınırlar: yalnız UTF-8 veritabanı; `-wal`/`-shm` okunmaz (cihazda henüz yazılmamış son çizim
  gelmeyebilir, Kobo'yu güvenli çıkarınca gelir); WITHOUT ROWID ve sanal tablolar okunmaz. Bozuk dosyada
  ("sayfa döngüsü", "dosyanın dışında" …) hata atar, sonsuz döngüye girmez.
- **Alan eşlemesi:** `Bookmark` satırı → çizim (Text alıntı, Annotation not, DateCreated an,
  ChapterProgress bölüm içi ilerleme, Color renk). Hidden='true', Type dogear/markup ve metinsiz satırlar
  atlanır, sonuç mesajında sayılır. Kitap adı/yazarı `content` (ContentType 6) satırından; yoksa
  VolumeID yolundan (uzantı atılır, `_` boşluk olur). Bölüm: ContentID'nin birebir, `#` öncesi ya da aynı
  kitapta en uzun önek eşleşmesi; bölüm sırası VolumeIndex.
- **Kimlikler:** kitap özeti SHA-256("kobo|" + normalleştirilmiş "başlık|yazar") — Kindle/KOReader
  kaydıyla çakışmaz. Çizim kimliği `b` + SHA-256(sadeleştirilmiş alıntı) ilk 10 hane. Aynı alıntı iki kez
  varsa tek çizim olur (not ve en erken tarih tutulur). İkinci alımda yalnız yeni çizim eklenir; Kobo'da
  sonradan yazılan not var olan bloğa işlenir, elle değiştirilmiş bloğa dokunulmaz.
- **Kayıt:** biçim `kobo`, dosya yok, boyut 0; çıpa `{kind: "kobo", progress, chapter?}`, konum
  `{kind: "kobo", location}` = (bölüm + ilerleme) × 1000. Sıra: bölüm, sonra ilerleme; bölümü
  bilinmeyen sona. Renk: 1 pembe, 2 yeşil, 3 mavi, diğerleri sarı.
- **Not ve raf:** blok biçimi aynı; yer etiketi bölüm adı, yoksa "Bölüm n", yoksa "%n"; "Kitabı aç"
  yerine `*Kobo*` kaynak satırı. Kartta "KOBO" rozeti; dokununca not açılır.
- **Kapsam dışı / sınırlar:** Kobo bulutu; Kobo kitabını PDF/EPUB kaydıyla eşleme; Kobo'da silinen
  çizimi silme; yer imi ve kalem çizimi; Windows/mobilde cihaz tanıma.
- **Ortak alma döngüsü:** Kindle, KOReader ve Kobo alımı store'da aynı yardımcıdan geçer (`importExternalBooks`):
  bozuk kayıt/biçim çakışması kontrolü, boş not yolu, kayıt yazımı, not bloklarının eklenmesi, tek sonuç mesajı.

## Paylaş menüsünden alıntı (LOM-96)
- **Giriş yolu:** bütün kaynaklar tek adrese iner: `loomen://share?text=<metin>&subject=<konu>&app=<gönderen>`.
  - Android: manifestte (otomatik DEEP LINK bloğunun DIŞINDA) `ACTION_SEND` + `text/plain` alıcısı.
    `MainActivity.kt` gelen isteği bu adrese `ACTION_VIEW` olarak çevirir (`subject` = EXTRA_SUBJECT,
    `app` = gönderen paket). Derin bağlantı eklentisi soğuk açılışta `load()`'da `activity.intent`i, açıkken
    `onNewIntent`'i okur; bu yüzden çeviri `super.onCreate`'ten ÖNCE yapılır. `MainActivity.kt` elle düzenlenir
    ve `.gitignore` istisnasıyla depoda izlenir; `tauri android init` yeniden üretirse geri alınmalı.
  - iPhone/iPad: Share Extension yok. Kullanıcı bir kez Kısayol kurar (Paylaşma Ekranında Göster → URL Kodla →
    Metin `loomen://share?text=` + sonuç → URL'leri Aç). Adımlar Yardım > Telefonda kullanım > "Başka uygulamadan
    alıntı gönder" bölümünde üç dilde.
  - Masaüstünde ayrı düğme yok; aynı adres gelirse aynı yoldan işlenir.
- **Uygulamada alım:** `useShareIntake` (App düzeyi) eklentinin `getCurrent` + `onOpenUrl` değerlerinden yalnız
  `loomen://share` adreslerini alır (Google giriş dönüşü ve kitap bağlantıları başka yerde). Kasa açılmadan gelen
  adres kuyrukta bekler, kasa açılınca işlenir; aynı adres 3 sn içinde iki kez gelirse bir kez işlenir.
- **Ayıklama** (`share.ts`, saf): Kindle, Apple Kitaplar ve Google Play Kitaplar biçimleri tanınır (örnekler
  `shareTest.ts`'te); tanınmayan metinde tamamı alıntı, konu (subject) varsa kitap adı odur. Uygulama bağlantıları ve
  tanıtım/telif satırları atılır; metinde sayfa geçiyorsa okunur.
- **Kitabı bulma** (`matchBooks`): başlık işaretsiz/küçük harf karşılaştırılır; tam eşleşme yoksa ana başlık (alt
  başlık ayracından önce). Birden çok aday varsa yazar daraltır. **Tek aday → doğrudan eklenir.** Aday yok ya da
  birden çoksa seçim penceresi (`SharePickDialog`) açılır: birden çok eşleşmede yalnız onlar, yoksa bütün raf;
  başlık tanındıysa "Yeni kayıt: <başlık>" seçeneği (dosyasız `shared` kayıt, özeti "shared|başlık|yazar").
  Vazgeç/Escape/zemin hiçbir şey yazmaz. Raf boş ve başlık yoksa "önce kitap ekle" mesajı çıkar.
- **Kayıt ve not:** çizim çıpası `{kind: "shared", app?, page?}`, herhangi bir biçimdeki kitaba eklenebilir; renk
  sarı. Kimlik `s` + SHA-256(alıntı anahtarı) ilk 10 hane. Not bloğu diğer çizimlerle aynı biçimde, yer etiketi
  "Paylaşıldı" (sayfa varsa "Paylaşıldı · s. 12"). `shared` kaydın notunda "Kitabı aç" yerine `*Paylaşıldı*` kaynak
  satırı; rafta "PAYLAŞILDI" rozeti, dokununca not açılır. Eklenince "notuna eklendi" mesajı ve kitabın notu açılır.
- **Tekrar koruması:** alıntı anahtarı (işaretsiz, küçük harf, yalnız harf/rakam) kitabın BÜTÜN çizimleriyle
  karşılaştırılır (Kindle'dan ya da okuyucudan gelen dahil). Varsa kayıt ve not yazılmaz, "zaten var" denir.
- **Okuyucu:** paylaşılan alıntının kitapta yeri yok (`positionOfAnchor` null). Çizim listesinde görünür ama
  dokununca atlanmaz; nottaki bağlantısı kitabı kalınan yerden açar. PDF/EPUB görüntüleyicileri bu çizimi boyamaz.
- **Sıra:** paylaşımlar store'da sırayla işlenir; süren bir içe aktarma varsa bitmesi beklenir.
- **Bilinen sınırlar:** okuma uygulamalarının paylaşım metni örnekleri bellekten kuruldu, gerçek cihaz çıktısıyla
  doğrulanmadı; tanınmazsa seçim penceresi açılır. Android'de Paylaş listesinde görünme yalnız gerçek cihazda
  denenebilir.

## Kod
- Saf çekirdek: `src/core/library/` (`types`, `codec`, `model`, `links`, `noteSync`, `store`, `kindle`, `lua`, `koreader`, `sqlite`, `kobo`, `share`).
  Kindle/Kobo cihaz tarama ve okuma (Tauri'ye bağlı): `src/core/library/kindleDevice.ts`, `koboDevice.ts`.
  Paylaş alımı: `src/hooks/useShareIntake.ts`, `src/screens/Library/SharePickDialog.tsx`.
- Durum ve eylemler: `src/store/useAppStore.ts` (`library*`, `reader*`).
- Ekranlar: `src/screens/Library/`. Bağlantı: `src/screens/Editor/Markdown.tsx` (okuma),
  `livePreview.ts` (düzenleme).
- Testler: `libraryTest`, `libraryNoteTest`, `libraryLinkTest`, `kindleTest`, `luaTest`, `koreaderTest`, `sqliteTest`, `koboTest`, `shareTest` (`src/core/__test__/`; Kobo örnek veritabanı `fixtures/kobo-sample.sqlite`, kaynağı `scripts/fixtures/kobo-sample.sql`).

## Kapsam dışı (ilk sürüm)
Cihazlar arası kitap dosyası eşitleme; arama, sözlük, sesli okuma; PDF/EPUB dosyasını değiştirme;
DRM'li kitaplar ve MOBI.

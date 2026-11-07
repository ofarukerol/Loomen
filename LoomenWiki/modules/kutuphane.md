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

## Kod
- Saf çekirdek: `src/core/library/` (`types`, `codec`, `model`, `links`, `noteSync`, `store`, `kindle`).
  Kindle cihaz tarama ve okuma (Tauri'ye bağlı): `src/core/library/kindleDevice.ts`.
- Durum ve eylemler: `src/store/useAppStore.ts` (`library*`, `reader*`).
- Ekranlar: `src/screens/Library/`. Bağlantı: `src/screens/Editor/Markdown.tsx` (okuma),
  `livePreview.ts` (düzenleme).
- Testler: `libraryTest`, `libraryNoteTest`, `libraryLinkTest`, `kindleTest` (`src/core/__test__/`).

## Kapsam dışı (ilk sürüm)
Cihazlar arası kitap dosyası eşitleme; arama, sözlük, sesli okuma; PDF/EPUB dosyasını değiştirme;
DRM'li kitaplar ve MOBI.

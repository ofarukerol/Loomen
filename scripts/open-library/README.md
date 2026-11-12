# Açık kitaplık: iMac üzerinde çevrimdışı hazırlık

Bu araç yalnız yerel dosyalarla çalışır. Ağ bağlantısı, yükleme, uzak silme,
erişim izni değiştirme, sunucu oluşturma ve Drive bağlantısı içermez.
Mevcut depo adları devir kaydında bulunmadığı için örnek ayar yer tutucudur;
gerçek adların veya açık/kapalı erişimin doğrulandığı anlamına gelmez.

## Kullanım

iMac'te Node.js 20 veya üzeri yeterlidir; ek paket kurulmaz. Repo kökünden:

```sh
node --test scripts/open-library/prepare.test.mjs
node scripts/open-library/prepare.mjs prepare scripts/open-library/layout.example.json /yerel/kitap-girdisi /yerel/kitap-ciktisi 2026-11-12-01
node scripts/open-library/prepare.mjs verify /yerel/kitap-ciktisi/2026-11-12-01
```

Deneme çalışması da aynı komuttur: her çalışma çevrimdışıdır. Örnek ayarı
ayrı bir yerel dosyaya kopyalayıp mevcut iki depo adını yazabilirsin; anahtar,
parola veya bağlantı bilgisi gerekmez. Açık ve kapalı hedef aynı depo olamaz.
Bu ayrım bir erişim izni kontrolü değildir; gerçek erişim sonraki işte doğrulanır.

Girdi düzeni `kaynak/public/dosya` veya `kaynak/private/dosya` biçimindedir:

```text
kitap-girdisi/
  openiti/private/original.txt
  gutenberg/public/book.epub
  standard-ebooks/public/book.epub
  wikisource/public/book.txt
```

Kaynaklar ayardaki sırayla, dosyalar tek tek işlenir. Olmayan kaynak klasörleri
atlanır; bilinmeyen kaynak, yanlış erişim bölümü, boş girdi ve sembolik bağlantı
reddedilir. Dosya ve klasör adlarında Türkçe/Arapça dahil Unicode harfler,
rakamlar, birleştirme işaretleri, boşluk, nokta, alt çizgi ve tire kabul edilir;
ilk karakter harf veya rakamdır. Adlar değiştirilmeden korunur. Geçersiz yol
hatasında ilgili yol gösterilir. Normal `.DS_Store` ve `._` ile başlayan Mac
yardımcı dosyaları atlanır ve sayıları bildirilir; diğer gizli dosyalar veya
bağlantılar sessizce atlanmaz. Kaynak, depo ve çekim adları yine ASCII kullanır. Girdi ile çıktı ayrı, iç içe olmayan klasörlerdir.

## Çıktı ve devam

Her çekim ayrı klasördür. `manifest.json` kaynağı, erişim bölümünü, dosya yolunu,
bayt boyutunu ve SHA-256 değerini saklar. `files/` altında doğrulanmış kopyalar,
`uploads.json` içinde her kopyanın yerel yolu, hedef depo adı ve nesne yolu bulunur.
Nesne yolu `<önek>/snapshots/<çekim>/<kaynak>/<public|private>/<dosya>` biçimindedir.
Yeni çekimde yeni ad kullanılır; eski çekimle aynı ad verilirse işlem durur.
Kayıtlar ve tamamlanan kopyalar yeniden yazılmaz. Büyük dosyaların özeti akışla
hesaplanır; tüm kitap belleğe alınmaz. Çıktı için kitapların toplam boyutu kadar
ve en büyük dosya için geçici boş alan gerekir. Çıktı diski sabit bağlantı
(hard link) desteklemelidir; macOS'un APFS diski uygundur. exFAT/FAT gibi bunu
desteklemeyen disklerde hazırlık çalışmaz; çıktıyı destekleyen yerel diske al.
Girdi diski için bu şart yoktur. Hazırlık testleri `npm test` içinde de çalışır.

Kesinti sonrası aynı girdiyi ve ayarı kullan:

```sh
node scripts/open-library/prepare.mjs prepare scripts/open-library/layout.example.json /yerel/kitap-girdisi /yerel/kitap-ciktisi 2026-11-12-01 --resume
```

Devam, ilk kayıttaki dosyaları yeniden doğrular, sağlam kopyalara dokunmaz ve
eksikleri tamamlar. Sonradan eklenen girdiler o çekime girmez; yeni çekim gerekir.
Değişen veya eksik kaynak, bozulmuş çıktı ve farklı ayar işlemi durdurur.
`uploads.json` yalnız tüm kopyalar tamamlanınca yayımlanır; tüketici her zaman önce
`verify` çalıştırmalıdır. Liste dosyasının varlığı tek başına başarı kanıtı değildir.
Kayıt yazılmadan kesilmiş boş çekim klasörü devam ettirilemez; yeni çekim adı seçilir.
Kesintiden kalan rastgele adlı `.partial` dosyaları yükleme listesine girmez ve
otomatik silinmez. Güvenilir, yalnız bu iş için ayrılmış yerel klasörler kullan;
çalışma sırasında dosya ve klasörleri başka bir işlemle değiştirme.

## Kaynak alma

`intake.mjs` kitapları açık kaynaklardan alır ve lisansa göre üç bölüme ayırır.
Bu araç yayımlamaz ve hiçbir yere yüklemez. `sources.example.json` içindeki lisans
tablosu yalnız aday ayırır; **yayın kararı değildir**, hangi lisansın yayımlanacağına
Ömer karar verir.

Kaynak sırası sabittir ve kurallardan gelir: OpenITI, Standard Ebooks, Gutenberg,
Vikikaynak, Hindawi, Şamile. Her kaynak için liste klasöründe bir `<kaynak>.jsonl`
dosyası olur; listesi olmayan kaynak atlanır, sırada olmayan kaynak adı işlemi
durdurur. Her satır bir kitaptır:

```json
{"id":"kitap-1","title":"Örnek","url":"https://…","ext":"epub","license":"Public Domain","evidenceUrl":"https://…","verified":false}
```

`url` yerine `localPath` (yerel dosya) verilebilir. Kimlik ASCII harf, rakam,
nokta, alt çizgi ve tire içerir; aynı kimlik iki kez geçerse liste reddedilir.
Bütün listeler indirmeden önce denetlenir.

```sh
node scripts/open-library/intake.mjs run scripts/open-library/sources.example.json /yerel/listeler /yerel/alim
node scripts/open-library/intake.mjs status /yerel/alim
```

Üç bölüm:

- **Açık aday** `input/<kaynak>/public/`: lisans açık listede ve kanıt adresi var.
- **Kapalı arşiv** `input/<kaynak>/private/`: lisans kısıtlı listede ya da kaynak her zaman kapalı.
- **Bekleyen** `held/<kaynak>/`: lisans yazılmamış, tabloda yok ya da kanıtı eksik.
  Bekleyenler hazırlık girdisinin dışındadır; hiçbir çekime girmez.

Şamile kitapları üzerinde açık lisans yazsa bile kapalı arşive gider ve yalnız
yerel dosyadan alınır; adresli Şamile maddesi reddedilir. Hindawi kitabı lisans adı,
kanıt adresi ve elle verilmiş `"verified": true` olmadan bekler.

Ağ yalnız https'tir (yönlendirme sonrası da); kaynak başına istekler arası bekleme,
üç deneme ve zaman aşımı vardır. Her kitap için `records/` altında lisans, kanıt,
karar, gerekçe, boyut ve SHA-256 kaydı, `ledger.jsonl` defterinde bir satır tutulur.

Kesintiden sonra aynı komut yeniden çalıştırılır: kaydı ve sağlam dosyası olan kitap
yeniden indirilmez. Kaydı olup dosyası eksik ya da bozuk kitapta, ya da kurallar
değişince bölümü değişecek kitapta işlem durur; dosyalar taşınmaz, üstüne yazılmaz.
Yarım indirmeler `partial/` klasöründe kalır, çıktıya girmez ve kendiliğinden silinmez.

Alımdan sonra `input` klasörü hazırlık aracına verilir:

```sh
node scripts/open-library/prepare.mjs prepare scripts/open-library/layout.example.json /yerel/alim/input /yerel/kitap-ciktisi 2026-11-12-01
```

## Sonraki işe teslim

Kaynak alma artık `intake.mjs` ile yapılıyor; gerçek toplu alım iMac'te elle
çalıştırılır. Bozuk ve kaynaklar arası tekrar eden dosyaları ayırma, Arapça EPUB
dönüştürme ve kapaklar 2/4, yazar ve kategori eşleme 3/4, yükleme paketi ve kaynak
raporları 4/4 işidir. Bu araçlar yayın hakkına karar vermez. Gerçek yükleme
öncesi mevcut depo adları ve erişim düzeni ayrıca doğrulanmalı, yer tutucular
değiştirilmeli ve çekim yeniden doğrulanmalıdır. Gerçek yükleme, Keşfet ekranı,
Drive yedeği ve aylık görev bu parçaya dahil değildir.
SHA-256 yerel bozulmayı bulur; imza veya kötü niyetli kayıt değişikliğine karşı
özgünlük kanıtı değildir. Girdi ve tamamlanmış çekim birlikte korunmalıdır.

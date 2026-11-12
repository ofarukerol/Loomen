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

## Sonraki işe teslim

Kaynak alma işi indirilen dosyaları bu girdi düzenine koyacak; hak durumuna göre
açık veya kapalı bölümü seçecek. Bu araç yayın hakkına karar vermez. Gerçek yükleme
öncesi mevcut depo adları ve erişim düzeni ayrıca doğrulanmalı, yer tutucular
değiştirilmeli ve çekim yeniden doğrulanmalıdır. Gerçek yükleme, kaynakların toplu
alınması, Keşfet ekranı, Drive yedeği ve aylık görev bu parçaya dahil değildir.
SHA-256 yerel bozulmayı bulur; imza veya kötü niyetli kayıt değişikliğine karşı
özgünlük kanıtı değildir. Girdi ve tamamlanmış çekim birlikte korunmalıdır.

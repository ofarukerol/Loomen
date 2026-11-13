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

## Ayıklama

`curate.mjs` alınan kitapları yükleme hazırlığından önce elden geçirir. Çevrimdışıdır;
ağ, yükleme ve silme yoktur. Bekleyen (held) kitaplara dokunmaz.

```sh
node scripts/open-library/curate.mjs run scripts/open-library/sources.example.json /yerel/alim /yerel/ayiklanmis
```

Çıktı klasörü alım klasörüyle iç içe olamaz. İçinde:

- `input/<kaynak>/<public|private>/` kitap dosyaları, kapaklar (`<id>.cover.<uzantı>`) ve
  hazırlık aracının girdisi. Dönüştürülen Arapça kitap `<id>.epub` olur.
- `books/<kaynak>/<id>.json` her kitabın kaydı: başlık, yazar, dil, bölüm, dosya, boyut,
  SHA-256, kaynak dosyanın özeti, dönüştürüldü mü, kapak dosyası ve türü (hazır / üretildi).
- `reports/broken.json` bozuk dosyalar ve gerekçeleri; `reports/duplicates.json` elenen
  tekrarlar ve kalan kopya; `reports/editions.json` aynı adlı ama içeriği farklı baskılar.

**Bozuk dosya:** kesik ya da açılmayan e-kitap, yanlış işaretli e-kitap, okuma sırasında eksik
dosyası olan e-kitap, şifreli (DRM) e-kitap, geçersiz UTF-8 metin, web hata sayfası, başlığı ya da
sonu olmayan PDF ve tanınmayan biçim. Bunlar çıktıya girmez, nedeniyle raporlanır.

**Tekrar kuralı:** yalnız dosyası birebir aynı (aynı SHA-256) olan kitaplardan biri kalır;
metin benzerliği ya da başlık eşleşmesi eleme sebebi değildir. Önce açık aday kapalıdan, sonra kaynak sırasında öndeki, sonra
küçük kimlik kalır. Aynı adlı ama içeriği farklı baskılar ve çeviriler elenmez, yalnız
`editions.json`'da gruplanır. Harekeli ve harekesiz metin farklı baskıdır.

**Arapça:** harflerinin çoğu Arapça olan `.txt` dosyası sağdan sola EPUB 3'e çevrilir (dil `ar`,
`page-progression-direction="rtl"`). OpenITI başlığı, sayfa ve kilometre taşı işaretleri atılır;
harekeler ve metnin kendisi değiştirilmez. Başlık sırası: alım kaydı, metindeki başlık, kimlik.
Özgün `.txt` alım klasöründe kalır; çıktıya yalnız e-kitap girer. Diğer metinler çevrilmez.

**Kapak:** e-kitabın içinde kapak varsa o, yanına ayrı dosya olarak konur (e-kitabın içine
dokunulmaz). Yoksa başlık ve yazarlı sade bir SVG şablon kapak üretilir; yazı tipi gömülmez.
Kapaklar `prepare.mjs` için sıradan dosyadır; kitap ile kapağı ayırmak için `books/` kaydı kullanılır.

**Kesintiden devam:** aynı komut yeniden çalıştırılır. Kaydı ve sağlam dosyası olan kitap atlanır,
dosyalara dokunulmaz. Çıktıda dosya eksik ya da bozuksa, ya da yayımlanmış bir kitap sonradan
tekrar çıkıyorsa (örneğin yeni alınan bir kitap onu geride bıraktıysa) işlem durur; hiçbir şey
taşınmaz ya da silinmez, yeni çıktı klasörü kullanılır. Raporlar her çalışmada baştan yazılır.

Sonra hazırlık aracına `çıktı/input` verilir:

```sh
node scripts/open-library/prepare.mjs prepare scripts/open-library/layout.example.json /yerel/ayiklanmis/input /yerel/kitap-ciktisi 2026-11-12-01
```

## Yazarlar ve kategoriler

`catalog.mjs` ayıklanmış kitapları yazarlara ve Türkçe kategorilere bağlar. Çevrimdışıdır;
ağ ve yükleme yoktur, girdi klasörlerine hiçbir şey yazılmaz ya da silinmez.

```sh
node scripts/open-library/catalog.mjs run scripts/open-library/catalog.example.json /yerel/ayiklanmis /yerel/katalog --hints /yerel/ipuclari --decisions /yerel/kararlar
```

**Girdi:** `ayıklanmış klasör` (yalnız `books/<kaynak>/<id>.json` okunur); isteğe bağlı
`--hints` klasöründe `<kaynak>.jsonl` (satır: `id`, `subjects`, `sourceCategory`); isteğe bağlı
`--decisions` klasöründe `suggestions.jsonl` ve `approvals.jsonl`. Ayar dosyası için
`catalog.example.json` örnektir. Çıktı klasörü girdilerle iç içe olamaz.

**Çıktı** (her çalışmada baştan, aynı girdi aynı baytı verir): `authors.json`, `catalog.json`,
`reports/author-review.json`, `reports/pending-suggestions.json`, `reports/uncategorized.json`,
`reports/summary.json` (kategori başına açık ve kapalı kitap sayısı ayrı). Kapalı arşiv kitabı `catalog.json` içinde `decision: "private"` ile işaretli kalır;
sayımda açık kitaplarla karışmaz.

**Yazarlar:** harf büyüklüğü, aksan, noktalama, "Soyad, Ad" sırası, Arapçada hareke ve elif
biçimi farkı tek yazar sayılır. Başka hiçbir benzerlik birleştirmez. **Emin olunmayan yazar
birleştirilmez, `author-review.json` gözden geçir listesine düşer:** bir iki harf farkı, baş harf
kısaltması, el-/al-/ibn/bin farkı, ى/ي ve ة/ه farkı, bir adın ötekinin içinde geçmesi, vefat
tarihi eki, birden çok yazarlı görünen ad. Yazarı boş kitap hiçbir yazara bağlanmaz.

**Eş ad tablosu:** iki yazımın aynı kişi olduğunu bildiğinde (örneğin Latin ve Arapça yazım)
ayar dosyasındaki `authorAliases` listesine `{ "id": "sabit-kimlik", "name": "Görünen ad",
"variants": ["Yazım 1", "Yazım 2"] }` satırı ekle. `id` bir kez yazılır ve değişmez. İki ayrı
kişi olduğunu biliyorsan çifti `separate` listesine yaz; listeye bir daha düşmez.

**Kategoriler:** ağaç `categories.tr.json` dosyasındadır; adlar koddan bağımsız değiştirilebilir
(`id` ASCII ve benzersiz kalır). İslami Eserler dalı Şamile'nin tasnifini rehber alır ve her
düğümde Arapça başlığı `shamela` alanında taşır; bu başlıklar elle yazılmıştır, Şamile'den
çekilmemiştir. Kitap şu sırayla yerleşir: ayardaki elle atama (`overrides`), ipucundaki Şamile
başlığı, kaynak başına konu kuralı (`subjectRules`). Tahmin ya da başlıktan çıkarım yoktur;
eşleşmeyen kitap `uncategorized.json` listesinde kalır (yapay zekâya verilecek liste budur).

**Yapay zekâ önerisi:** araç yapay zekâyı çağırmaz; öneriyi `suggestions.jsonl` dosyasından
okur (`{ "key": "kaynak:id", "category": "kategori-id", "by": "kim", "note": "..." }`). **Onaysız
öneri yayına ve sayıma girmez;** kitabın kategorisi boş kalır, öneri `pending-suggestions.json`
listesinde bekler. Onay vermek için `approvals.jsonl` dosyasına satır eklenir:
`{ "key": "kaynak:id", "category": "kategori-id", "approvedBy": "ad" }`. Onay öneriden farklı
kategori gösteriyorsa onay geçerlidir. Bilinmeyen kitap, ağaçta olmayan kategori ve aynı kitaba
iki onay hata verir; kuralla zaten yerleşmiş kitaba gelen satır uyarıyla yok sayılır.

## Sonraki işe teslim

Kaynak alma `intake.mjs`, bozuk ve tekrar ayıklama, Arapça EPUB dönüştürme ve
kapaklar (2/4) `curate.mjs` ile yapılıyor; gerçek toplu çalıştırma iMac'te elle yapılır.
Yazar ve kategori eşleme (3/4) `catalog.mjs` ile bitti. Kalan iş yükleme paketi ve kaynak
raporlarıdır (4/4); o iş `authors.json` ile `catalog.json` dosyalarını kullanacak. Bu araçlar yayın hakkına karar vermez. Gerçek yükleme
öncesi mevcut depo adları ve erişim düzeni ayrıca doğrulanmalı, yer tutucular
değiştirilmeli ve çekim yeniden doğrulanmalıdır. Gerçek yükleme, Keşfet ekranı,
Drive yedeği ve aylık görev bu parçaya dahil değildir.
SHA-256 yerel bozulmayı bulur; imza veya kötü niyetli kayıt değişikliğine karşı
özgünlük kanıtı değildir. Girdi ve tamamlanmış çekim birlikte korunmalıdır.

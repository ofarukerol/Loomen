---
name: LOM-108 — Açık Kitaplık 3/4: yazarlar ve Türkçe kategoriler
description: Yazar birleştirme ve Türkçe kategori aracı dalda yazılmış ama test edilmeden kalmış; kalan iş bu kodu kabul ölçütlerine göre denetlemek, eksikleri kapatmak ve testleri yeşil göstermek.
type: project
proje: loomen
kaynak: kart LOM-108 · dal fix/LOM-108 · Loomen@d5281db1f0d0e9ddc14efa3a8f874221e76e8896 · test koşusu 09790335-3b16-40b4-9498-b2fac4c3668e (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-13
---

# LOM-108 — Açık Kitaplık 3/4: yazarlar ve Türkçe kategoriler

## Ne yapıldı

Yazar birleştirme ve Türkçe kategori aracı dalda yazılmış ama test edilmeden kalmış; kalan iş bu kodu kabul ölçütlerine göre denetlemek, eksikleri kapatmak ve testleri yeşil göstermek.

## Adımlar

- Önce durumu gör: fix/LOM-108 dalında olduğunu doğrula; `git log --oneline -3` ve `git show --stat 23c6e3e` ile commit'in hangi dosyalara dokunduğunu çıkar. Analiz adımı bu dosyaları okuyamadı (çalışma kopyası kapsam dışındaydı), o yüzden hepsini baştan sona oku: scripts/open-library altındaki authors.mjs, classify.mjs, catalog.mjs, catalog.test.mjs, categories.tr.json, catalog.example.json, README.md ve scripts/run-tests.mjs. Sıfırdan yazma; var olanı denetle.
- Testleri koş ve çıktıyı not al: `node --test scripts/open-library/catalog.test.mjs`, ardından curate, intake ve prepare testleri. Bu kod hiç test edilmedi; kırmızı çıkan her testin sebebini bul (kod mu yanlış, test mi) ve düzelt.
- Yazar birleştirmeyi denetle (authors.mjs): kesin eşleşme yalnız güvenli sadeleştirmeden sonra birebir aynı ad (büyük-küçük harf, hareke/aksan, noktalama, boşluk, 'Soyad, Ad' sırası) ya da elle tutulan takma ad tablosundaki kayıttır. Benzer yazım, tablosuz Arapça-Latin karşılığı ve yazarı boş kitap BİRLEŞTİRİLMEZ; ayrı inceleme listesine yazılır. Yazarı boş kitaplar tek bir 'bilinmeyen' yazarda toplanmaz. Aksi varsa düzelt.
- Kategori ağacını denetle (categories.tr.json): Türkçe adlar, benzersiz kimlikler, geçerli üst-alt bağları; İslami eserler dalında Şamile'nin ana başlıkları (akaid, tefsir, hadis, fıkıh, siyer ve tarih, ahlak/tasavvuf, Arap dili, tabakat gibi) Türkçe karşılıklarıyla bulunsun. Eksik ana başlık varsa ekle; ağacı baştan kurma.
- Sınıflandırmayı denetle (classify.mjs): kuralla kategorisi bulunan kitap doğru düğüme gider; ağaçta olmayan kategori kimliği reddedilir. Eşleşmeyen kitap için öneri bir dosyadan okunur (araç ağa çıkmaz). Onaysız öneri yalnız 'onay bekleyenler' listesine yazılır; yayın kataloğuna ve hiçbir sayıma girmez. Yalnız açık onay kaydı olan öneri kataloğa geçer. Aksi varsa düzelt.
- Ana aracı denetle (catalog.mjs): girdisi ayıklama aracının kitap kayıtlarıdır; girdiyi değiştirmez, silmez, taşımaz; kapalı arşiv kitabı açık kataloğa geçmez; aynı girdiyle ikinci çalıştırma bayt bayt aynı çıktıyı verir; çıktıda yazar listesi, kategori yerleşimi, emin olunmayan yazar eşleşmeleri ve onay bekleyen öneriler ayrı dosyalardır; komut sonunda sade Türkçe özet verir.
- catalog.test.mjs'te şu durumların her birinin testi olduğunu doğrula, eksik olanı ekle (kurgusal veri, ağ yok): farklı yazımlar tek yazar; benzer ama emin olunmayan ad birleşmez ve inceleme listesinde; yazarı boş kitap birleşmez; kuralla bulunan kategori doğru; ağaç geçerli ve Şamile ana başlıkları var; onaysız öneri ayrı listede, katalogda ve sayımda yok; onaylı öneri katalogda ve sayımda; kapalı arşiv kitabı açık katalogda yok; ikinci çalıştırma aynı ve girdi değişmemiş.
- scripts/run-tests.mjs'te `["scripts/open-library/catalog.test.mjs", []]` satırının curate satırının hemen altında olduğunu doğrula; yoksa ekle, başka satıra dokunma.
- README.md'de yazar ve kategori bölümünün koddaki gerçek davranışla uyuştuğunu doğrula (komut, girdi, çıktı dosyaları, kesin eşleşme kuralı, onay akışı, catalog.example.json'un kurgusal olduğu). 'Sonraki işe teslim' paragrafı 3/4'ü bitmiş, 4/4'ü kalan iş olarak göstersin. Uyuşmayan yeri düzelt.
- Herhangi bir dosya değiştiyse hedefli testleri yeniden koş; ardından `npm test` ve `npm run typecheck` koş. Geçti/kaldı satırlarını sonuçta kanıt olarak ver.
- Değişiklik yaptıysan fix/LOM-108 dalına commit et (AI imzası yok). Değişiklik gerekmediyse commit atma; 'kod ölçütleri karşılıyor, yalnız test kanıtı alındı' diye bildir.

## Dokunulan dosyalar

- `Loomen/scripts/open-library/authors.mjs`
- `Loomen/scripts/open-library/classify.mjs`
- `Loomen/scripts/open-library/catalog.mjs`
- `Loomen/scripts/open-library/catalog.test.mjs`
- `Loomen/scripts/open-library/categories.tr.json`
- `Loomen/scripts/open-library/catalog.example.json`
- `Loomen/scripts/open-library/README.md`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Hedefli testler (katalog 17/17, curate 14/14, intake 11/11, prepare 14/14), tam npm test (14+11+14+17, hepsi geçti) ve tip denetimi (tsc ve npm run typecheck) hatasız bitti. Canlı doğrulama insana kaldı. Test kopyasında dalgalı test görülmedi.

## Kanıt

- Dal: `fix/LOM-108`
- Commit: `Loomen@d5281db1f0d0e9ddc14efa3a8f874221e76e8896`
- Test koşusu: `09790335-3b16-40b4-9498-b2fac4c3668e` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

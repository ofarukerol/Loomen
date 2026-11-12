---
name: LOM-107 — Açık Kitaplık 2/4: kitap dosyaları ve kapaklar
description: Kitap ayıklama aracının (bozuk dosya ayırma, tekrar ayıklama, Arapça e-kitap üretme, kapak) kodu dalda yazılmış ama zincir düştüğü için test edilmemiş; kalan iş bu kodu kabul ölçütlerine göre denetlemek, eksikleri kapatmak ve testleri yeşile getirmek.
type: project
proje: loomen
kaynak: kart LOM-107 · dal fix/LOM-107 · Loomen@318421a59d4679f258d3ecd1b94024586ae206f7 · test koşusu 56dad424-bb8c-4d9b-8af9-15b865733bb0 (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-12
---

# LOM-107 — Açık Kitaplık 2/4: kitap dosyaları ve kapaklar

## Ne yapıldı

Kitap ayıklama aracının (bozuk dosya ayırma, tekrar ayıklama, Arapça e-kitap üretme, kapak) kodu dalda yazılmış ama zincir düştüğü için test edilmemiş; kalan iş bu kodu kabul ölçütlerine göre denetlemek, eksikleri kapatmak ve testleri yeşile getirmek.

## Adımlar

- Önce oku (değiştirmeden): Loomen/AGENTS.md, scripts/open-library/README.md, prepare.mjs, intake.mjs, rights.mjs ve dalda zaten duran curate.mjs, health.mjs, dedupe.mjs, arabic-epub.mjs, cover.mjs, zip.mjs, curate.test.mjs, run-tests.mjs. Bu kod test edilmeden commit edilmiş (zincir düşmüş); sıfırdan yazma, var olanı denetle.
- `node --test scripts/open-library/curate.test.mjs` koş ve sonucu not al. Kırmızı ya da eksik olan her şeyi aşağıdaki ölçütlere göre düzelt; yeşil olan ve ölçütü karşılayan koda dokunma.
- health.mjs denetimi: boş dosya, uzantısıyla uyuşmayan içerik, açılamayan/yarım zip, `mimetype` ya da `META-INF/container.xml` eksik EPUB, geçersiz UTF-8 düz metin 'bozuk' sayılmalı; her biri kısa bir gerekçe koduyla ve sade Türkçe açıklamayla dönmeli. Eksik denetim varsa ekle.
- dedupe.mjs denetimi: yalnız içeriği birebir aynı (SHA-256 eşit) dosyalar tekrar sayılsın; kazanan, kaynak sırasında önce gelen kopya olsun. Başlık ve yazarı aynı ama içeriği farklı kitaplar (farklı baskı, farklı çeviri) AYRI kalsın ve raporda yalnız 'olası tekrar' diye işaretlensin. Başlık+yazar üzerinden birleştiren kod varsa kaldır.
- arabic-epub.mjs denetimi: üretilen e-kitapta `mimetype` ilk ve sıkıştırılmamış girdi olsun; paket dosyasında dil `ar` ve sayfa yönü sağdan sola, her bölüm sayfasında `lang="ar"` ve `dir="rtl"` olsun. Metne Unicode normalleştirme (NFC/NFKC/NFD) UYGULAMA; hareke karakterleri (U+064B–U+0652, U+0670) aynen kalsın, yalnız XML kaçışı yapılsın. OpenITI başlık satırları bölüm başlığı olsun, sayfa işaretleri görünür metinden çıksın. Aynı girdi her çalıştırmada bayt bayt aynı dosyayı üretsin (zip tarihleri sabit).
- cover.mjs denetimi: kitabın yanında hazır kapak (EPUB içindeki kapak görseli ya da girdideki kapak dosyası) varsa o kullanılsın; yoksa başlık ve yazarla sade şablon kapak üretilsin (ek paket kurmadan; Arapça başlıkta yazı sağdan sola). Kapağın hazır mı üretilmiş mi olduğu kayda yazılsın.
- curate.mjs denetimi: alım aracının `input` klasörünü ve `records` kayıtlarını okuyup ayrı bir çıktı klasörüne yazsın; girdi dosyalarını değiştirmesin, silmesin, taşımasın. Çıktı: sağlam kitaplar hazırlık aracının beklediği `kaynak/public|private/dosya` düzeninde, ayrıca `broken.jsonl` (bozuklar + gerekçe), `duplicates.jsonl` (elenen + kazanan + gerekçe), `covers/` ve kitap başına kayıt. Kapalı arşivdeki kitap açık bölüme GEÇMEMELİ; üretilen Arapça e-kitap kaynağının bölümünde kalır. İkinci çalıştırma aynı sonucu versin, var olan çıktının üstüne sessizce yazmasın. Komut satırı sonunda sade Türkçe özet: kaç sağlam, kaç bozuk, kaç tekrar, kaç e-kitap üretildi, kaç kapak hazır/üretilmiş.
- curate.test.mjs'i tamamla (node:test, tümü kurgusal veri, ağ yok). Eksik olan durumları ekle: (1) boş dosya, yarım zip ve bozuk UTF-8 `broken.jsonl`'da gerekçesiyle, sağlam çıktıda yok; (2) aynı baytlı iki kopya tek kayda iner, kazanan kaynak sırasına göre; (3) aynı başlık+yazar, farklı içerik (farklı baskı ve farklı çeviri) iki ayrı kitap kalır; (4) harekeli Arapça metinden üretilen e-kitap açılıp okununca dil `ar`, yön sağdan sola ve gövde metnindeki hareke dizisi kaynakla birebir aynı; (5) `mimetype` ilk ve sıkıştırılmamış; (6) hazır kapaklı kitapta o kapak, kapaksız kitapta şablon kapak; (7) ikinci çalıştırma aynı çıktı, girdi dosyalarının özeti değişmemiş; (8) kapalı arşiv kitabı açık bölüme geçmez; (9) çıktının sağlam bölümü `prepare()` + `verify()`'dan geçer.
- scripts/run-tests.mjs: suites listesinde `["scripts/open-library/curate.test.mjs", []]` satırının intake satırının hemen altında olduğunu doğrula; yoksa ekle. Başka satıra dokunma.
- scripts/open-library/README.md: 'Ayıklama, Arapça e-kitap ve kapak' bölümünün var ve güncel olduğunu doğrula: komut, çıktı klasörleri, bozuk ve tekrar listeleri, 'farklı baskı ve çeviri korunur' kuralı, Arapça dönüştürme, kapak kuralı, hazırlık aracına nasıl verilir. 'Sonraki işe teslim' paragrafı 2/4'ü bitmiş, 3/4 ve 4/4'ü kalan iş olarak göstersin. Sade Türkçe.
- Bütün komutları koş ve çıktılarını sonuçta kanıt olarak ver: `node --test scripts/open-library/curate.test.mjs`, prepare ve intake testleri, `npm test`, `npm run typecheck`. Gerçek ağa çıkan ya da gerçek kitapla deneme yapma. Commit mesajında AI imzası olmasın; yeni bağımlılık kurma.

## Dokunulan dosyalar

- `Loomen/scripts/open-library/curate.mjs`
- `Loomen/scripts/open-library/health.mjs`
- `Loomen/scripts/open-library/dedupe.mjs`
- `Loomen/scripts/open-library/arabic-epub.mjs`
- `Loomen/scripts/open-library/cover.mjs`
- `Loomen/scripts/open-library/zip.mjs`
- `Loomen/scripts/open-library/curate.test.mjs`
- `Loomen/scripts/open-library/README.md`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Hedefli üç test dosyası (curate 12/12, prepare 14/14, intake 11/11) ve tip denetimi temiz geçti. Ardından tam paket (npm test) bir kez koşuldu: 66 test dosyasının tümü geçti. Kabul ölçütlerinin hepsi testlerle karşılandı. Canlı doğrulama bu kartta gerekmiyor.

## Kanıt

- Dal: `fix/LOM-107`
- Commit: `Loomen@318421a59d4679f258d3ecd1b94024586ae206f7`
- Test koşusu: `56dad424-bb8c-4d9b-8af9-15b865733bb0` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

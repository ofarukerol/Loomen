---
name: LOM-107 — Açık Kitaplık 2/4: kitap dosyaları ve kapaklar
description: Kitap ayıklama aracı dalda yazılmış ve bir kez testten geçmiş; son düzeltme turu test edilmeden kaldığı için kalan iş o turu denetlemek, eksik varsa kapatmak ve bütün testleri yeniden yeşil göstermek.
type: project
proje: loomen
kaynak: kart LOM-107 · dal fix/LOM-107 · Loomen@e095658918fc6b1755fb5e4296ae062cd8caca01 · test koşusu 8a7f8198-f317-4672-a84b-b6adeab74f5a (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-12
---

# LOM-107 — Açık Kitaplık 2/4: kitap dosyaları ve kapaklar

## Ne yapıldı

Kitap ayıklama aracı dalda yazılmış ve bir kez testten geçmiş; son düzeltme turu test edilmeden kaldığı için kalan iş o turu denetlemek, eksik varsa kapatmak ve bütün testleri yeniden yeşil göstermek.

## Adımlar

- Önce durumu gör: fix/LOM-107 dalında olduğunu doğrula, `git log --oneline -4` ve `git diff 318421a a7ebc99 --stat` ile son düzeltme turunun (a7ebc99) hangi dosyalara dokunduğunu çıkar; ardından `git diff 318421a a7ebc99` ile her değişikliği oku. 318421a testten geçmişti, a7ebc99 test edilmedi; asıl denetlenecek kısım bu fark.
- Değiştirmeden oku: scripts/open-library altındaki curate.mjs, health.mjs, dedupe.mjs, arabic-epub.mjs, cover.mjs, zip.mjs, curate.test.mjs ve README.md'nin ayıklama bölümü. Sıfırdan yazma; var olanı denetle.
- Şu komutları koş ve çıktılarını not al: `node --test scripts/open-library/curate.test.mjs`, `node --test scripts/open-library/prepare.test.mjs`, `node --test scripts/open-library/intake.test.mjs`. Hepsi yeşilse ve aşağıdaki denetimlerde eksik çıkmazsa koda dokunma.
- a7ebc99 farkını ölçütlere göre denetle: yarım kalmış düzenleme, kullanılmayan ya da çağrılmayan kod, testi olmayan yeni davranış var mı. Yarım kalan değişikliği ya tamamla (testiyle) ya da geri al; hangisini yaptığını sonuçta yaz.
- Tekrar kuralını kodda doğrula (dedupe.mjs): yalnız içeriği birebir aynı dosya elenir, kazanan kaynak sırasında önce gelendir; adı ve yazarı aynı ama içeriği farklı kitap elenmez, yalnız 'olası tekrar' diye işaretlenir. Aksi varsa düzelt.
- Arapça e-kitabı kodda doğrula (arabic-epub.mjs, zip.mjs): metin yolunda `normalize(` çağrısı yok; dil `ar`, sayfa yönü sağdan sola, her bölüm sayfasında lang ve dir var; `mimetype` ilk ve sıkıştırılmamış girdi; aynı girdi iki kez bayt bayt aynı dosyayı üretir. Aksi varsa düzelt.
- Bozuk dosya ve kapak kurallarını kodda doğrula (health.mjs, cover.mjs): boş dosya, uzantısıyla uyuşmayan içerik, yarım zip, eksik parçalı EPUB ve bozuk UTF-8 gerekçe koduyla ayrılır; hazır kapak varsa o kullanılır, yoksa şablon kapak üretilir ve hangisi olduğu kayda yazılır. Aksi varsa düzelt.
- Ana aracı doğrula (curate.mjs): girdi dosyalarını değiştirmez, silmez, taşımaz; kapalı arşiv kitabı açık bölüme geçmez; var olan çıktının üstüne sessizce yazmaz; sağlam bölüm hazırlık aracının `prepare()` ve `verify()` adımlarından geçer; komut sonunda sade Türkçe özet verir.
- curate.test.mjs'te şu dokuz durumun her birinin testi olduğunu doğrula, eksik olanı ekle (kurgusal veri, ağ yok): bozuk dosyalar listede; aynı baytlı iki kopya tek kayıt; aynı ad+yazar farklı içerik iki kitap; harekeler birebir; mimetype ilk ve sıkıştırılmamış; hazır kapak ve şablon kapak; ikinci çalıştırma aynı ve girdi değişmemiş; kapalı arşiv açık bölüme geçmez; çıktı prepare+verify'dan geçer.
- scripts/run-tests.mjs'te `["scripts/open-library/curate.test.mjs", []]` satırının intake satırının hemen altında olduğunu doğrula; yoksa ekle, başka satıra dokunma.
- README.md'de 'Ayıklama, Arapça e-kitap ve kapak' bölümünün koddaki gerçek davranışla uyuştuğunu doğrula (komut, çıktı klasörleri, bozuk ve tekrar listeleri, 'farklı baskı ve çeviri korunur' kuralı, kapak kuralı, hazırlık aracına nasıl verilir); 'Sonraki işe teslim' paragrafı 2/4'ü bitmiş, 3/4 ve 4/4'ü kalan iş olarak göstersin. Uyuşmayan yeri düzelt.
- Herhangi bir dosya değiştiyse üç hedefli testi yeniden koş; ardından `npm test` ve `npm run typecheck` koş. Çıktıların geçti/kaldı satırlarını sonuçta kanıt olarak ver.
- Değişiklik yaptıysan fix/LOM-107 dalına commit et (AI imzası yok, push yok). Değişiklik gerekmediyse commit atma; 'kod ölçütleri karşılıyor, yalnız test kanıtı alındı' diye bildir.

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

> Ayıklama, hazırlık ve alım testleri ayrı ayrı koştu, üçü de geçti: ayıklama 14/14, hazırlık 14/14, alım 11/11. Tip denetimi (tsc) hatasız bitti. Tam paket (npm test) bir kez koştu: 66 test dosyasının tümü geçti, 24/24 kontrol geçti. Kabul ölçütleri test adlarıyla eşleşiyor; kod satırlarını ayrıca okumadım. Canlı doğrulama bu kartta istenmedi.

## Kanıt

- Dal: `fix/LOM-107`
- Commit: `Loomen@e095658918fc6b1755fb5e4296ae062cd8caca01`
- Test koşusu: `8a7f8198-f317-4672-a84b-b6adeab74f5a` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

---
name: LOM-109 — Açık Kitaplık 4/4: yükleme paketi ve sonuç raporu
description: Testler kaldı: Ayıklanmış kitaplar ile yazar/kategori kataloğundan, açık ve kapalı kitapları ayrı listeleyen bir yükleme paketi, kaynak bazında sonuç raporu ve rastgele yirmi kitabı Loomen okuyucusunun kendi açma koduyla deneyen bir kontrol aracı eklenecek; rapor örnek deneme ile gerçek toplu işlemi ayrı gösterecek.
type: project
proje: loomen
kaynak: kart LOM-109 · dal fix/LOM-109 · commit yok · test koşusu 86d4f928-5d4a-4b0a-92c2-d397e8c6ddd6 (Air)
guven: iddia
durum: gelistirildi
---

# LOM-109 — Açık Kitaplık 4/4: yükleme paketi ve sonuç raporu

## Ne yapıldı

Ayıklanmış kitaplar ile yazar/kategori kataloğundan, açık ve kapalı kitapları ayrı listeleyen bir yükleme paketi, kaynak bazında sonuç raporu ve rastgele yirmi kitabı Loomen okuyucusunun kendi açma koduyla deneyen bir kontrol aracı eklenecek; rapor örnek deneme ile gerçek toplu işlemi ayrı gösterecek.

## Adımlar

- Önce dalı doğrula (fix/LOM-109) ve değiştirmeden oku: Loomen/AGENTS.md, scripts/open-library altında README.md, prepare.mjs, intake.mjs (kayıt alanları: decision, reason, license), curate.mjs (books kaydı, reports/broken, duplicates, editions), catalog.mjs (authors.json, catalog.json, reports/summary.json), rights.mjs (segment, fileName), layout.example.json; ayrıca src/core/library/zip.ts ve epub.ts ile EpubView.tsx'in kitabı açtığı yer (readZip + parseEpub). prepare.mjs, intake.mjs, curate.mjs ve catalog.mjs'e dokunma.
- scripts/open-library/report.mjs (yeni, saf; dosya ve ağ erişimi yok): `buildReport({ mode, order, records, books, broken, duplicates, editions, catalog, authors, readerCheck })` yaz. Kaynak başına (kaynak sırasıyla): gelen kitap sayısı, açık / kapalı / bekleyen, bekleme gerekçesine göre döküm, bozuk (gerekçesine göre), tekrar elenen, pakete giren. Toplamda: açık ve kapalı ayrı ayrı yazarı belli kitap oranı, kategorisi belli kitap oranı, onay bekleyen ve kategorisiz sayısı. Kapak dosyaları kitap sayılmaz; sayım books kayıtlarından yapılır. `renderReport(report)` aynı veriyi sade Türkçe Markdown olarak döndürür.
- Raporda örnek / gerçek ayrımı: `mode` yalnız 'sample' ya da 'full' olur, varsayılanı yoktur (verilmezse hata). Rapor iki sabit bölüm taşır: 'Örnek deneme' ve 'Gerçek toplu işlem'. Çalışan kip kendi bölümünü doldurur; öteki bölüm 'henüz çalıştırılmadı' yazar. Örnek kipte en üstte 'Bu bir örnek denemedir; tam koleksiyonun sonucu değildir' uyarısı ve kitap sayısı yer alır. Çıktı dosya adı kipi taşır (report.sample.json / report.full.json ve .md); bir kip öteki kipin dosyasını değiştirmez.
- scripts/open-library/package.mjs (yeni, yalnız Node yerleşikleri; ağ, yükleme ve silme yok): `pack({ layout, rules, intake, curated, catalog, output, id, mode, seed, resume })` dışa aktar. Önce tutarlılık denetimi: katalogdaki kitap anahtarları books kayıtlarıyla birebir aynı, her kitabın açık/kapalı kararı iki yerde aynı, her kitabın dosyası ve kapağı kayıttaki boyut ve SHA-256 ile uyuşuyor; uyuşmazlıkta dur, hiçbir şey yazma. Sonra `prepare()` ile `curated/input` klasöründen çekimi üret (yükleme listesi ve depo ayrımı oradan gelir) ve `verify()` çalıştır.
- package.mjs paket dosyaları: çekim klasörünün altında `package/` içinde `books.public.json` ve `books.private.json` (kitap başına: anahtar, başlık, yazar kimliği, kategori, dil, kitap dosyasının ve kapağın depo adı + nesne yolu + boyut + SHA-256), `authors.json` ve kategori ağacının kopyası, rapor dosyaları ve okuyucu kontrol sonucu. Yazımdan önce çapraz denetim: açık listede kapalı kitap ya da kapalı depoya giden satır yok, kapalı listede açık depo yok, her yükleme satırı tam bir kitaba ya da kapağa ait. Var olan dosyanın üstüne sessizce yazma (aynı bayt ise geç, farklıysa dur); girdi klasörlerine yazma; çıktı girdilerle iç içe olamaz; sembolik bağlantı reddedilir.
- scripts/open-library/reader-check.mjs (yeni): `pickSample(keys, 20, seed)` tohumlu ve tekrarlanabilir rastgele seçim yapar (tohum raporda yazılır). `checkBooks(files)` Loomen okuyucusunun kendi açma kodunu kullanır: src/core/library/zip.ts ve epub.ts dosyalarını esbuild'in JS API'siyle (run-tests.mjs'teki gibi, yeni bağımlılık yok) node_modules/.cache altına derleyip içe aktarır; EPUB için readZip + parseEpub + okuma sırasındaki ilk bölümün metnini okur, PDF için pdfjs-dist legacy derlemesiyle belgeyi ve ilk sayfayı açar. Okuyucunun açmadığı biçim 'açılmadı' sayılır, gerekçesi yazılır. Sonuç: seçilen kitaplar, açılan sayısı, açılmayanlar ve nedenleri; pakette yirmiden az kitap varsa hepsi denenir ve bu açıkça yazılır.
- package.mjs komut satırı: `package.mjs run <düzen.json> <kurallar.json> <alım> <ayıklanmış> <katalog> <çıktı> <çekim> --mode sample|full [--seed <değer>] [--resume]`. `--mode` zorunlu. Sonunda sade Türkçe özet yaz: açık ve kapalı kitap sayısı, okuyucu kontrolü sonucu, kip, ve 'Hiçbir yere yükleme yapılmadı.' satırı. Hata durumunda çıkış kodu 1.
- scripts/open-library/package.test.mjs (yeni, node:test, kurgusal veri, ağ yok): geçici klasörde intake kayıtları + curate() + catalog() ile en az 22 kurgusal kitap üret (EPUB, Arapça metinden çevrilen EPUB, açık ve kapalı karışık, bir bozuk, bir tekrar, bir bekleyen). Testler: (1) açık ve kapalı iki ayrı listede, kapalı kitap açık listede ve açık depoda yok; (2) çekim prepare verify'dan geçer; (3) rapor sayıları kaynak başına doğru, bekleyen/bozuk/tekrar gerekçeleriyle sayılı, kapak kitap sayılmamış; (4) yazar ve kategori oranları açık/kapalı ayrı ve onaysız öneri sayıma girmemiş; (5) yirmi kitap seçilir, aynı tohumla aynı seçim, hepsi okuyucu kodundan geçer; (6) bilerek bozulmuş bir EPUB 'açılmadı' diye nedeniyle çıkar; (7) örnek kipte uyarı var, 'Gerçek toplu işlem' bölümü 'henüz çalıştırılmadı', dosya adı sample; kip verilmezse hata; (8) katalog ile kitap kayıtları uyuşmazsa durur ve çıktı yazılmaz; (9) ikinci çalıştırma aynı baytları verir ve girdi klasörleri değişmemiştir; (10) yirmiden az kitapta sonuç yirmi kitap kontrolü gibi gösterilmez.
- scripts/run-tests.mjs: catalog satırının hemen altına `["scripts/open-library/package.test.mjs", []]` satırını ekle; başka satıra dokunma.
- scripts/open-library/README.md: 'Yükleme paketi ve rapor' bölümü ekle (komut, girdiler, paket klasörünün içeriği, örnek/gerçek kip kuralı, yirmi kitap kontrolünün ne yaptığı ve okuyucu kontrolü için depoda `npm install` yapılmış olması gerektiği, düz metin kitapların okuyucuda açılmadığı). 'Sonraki işe teslim' paragrafını güncelle: 4/4 bitti; kalan gerçek toplu çalıştırma (iMac, elle), gerçek yükleme ve depo adlarının doğrulanması.
- Testleri koş ve çıktıları kanıt olarak ver: `node --test scripts/open-library/package.test.mjs`, ardından prepare, curate ve catalog testleri, `npm test` ve `npm run typecheck`. Kırmızı varsa düzeltip yeniden koş.
- fix/LOM-109 dalına commit et (AI imzası yok, push yok). Sonuçta açıkça yaz: testler yalnız kurgusal örnekle koştu, gerçek toplu işlem iMac'te henüz çalıştırılmadı.

## Dokunulan dosyalar

- `Loomen/scripts/open-library/package.mjs`
- `Loomen/scripts/open-library/report.mjs`
- `Loomen/scripts/open-library/reader-check.mjs`
- `Loomen/scripts/open-library/package.test.mjs`
- `Loomen/scripts/open-library/README.md`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler KALDI; iş doğrulanmadı.

> İş yarıda durduruldu; testler koşmadı.

## Kanıt

- Dal: `fix/LOM-109`
- Test koşusu: `86d4f928-5d4a-4b0a-92c2-d397e8c6ddd6` (Air)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.

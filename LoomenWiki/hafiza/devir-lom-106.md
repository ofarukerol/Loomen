---
name: LOM-106 — Açık Kitaplık 1/4: kaynakları alma ve lisans ayrımı
description: Testler kaldı: Açık kaynaklardan kitapları sabit sırayla alan, her kitabın lisansına göre açık aday / kapalı arşiv / bekleyen diye ayıran ve kesilince kaldığı yerden süren bir alım aracı, mevcut hazırlık aracının yanına eklenir.
type: project
proje: loomen
kaynak: kart LOM-106 · dal fix/LOM-106 · commit yok · test koşusu 7f768c3d-2c3b-46a8-936e-460a1ac16e19 (Air)
guven: iddia
durum: gelistirildi
---

# LOM-106 — Açık Kitaplık 1/4: kaynakları alma ve lisans ayrımı

## Ne yapıldı

Açık kaynaklardan kitapları sabit sırayla alan, her kitabın lisansına göre açık aday / kapalı arşiv / bekleyen diye ayıran ve kesilince kaldığı yerden süren bir alım aracı, mevcut hazırlık aracının yanına eklenir.

## Adımlar

- Önce oku: Loomen/AGENTS.md, scripts/open-library/prepare.mjs, prepare.test.mjs, README.md, layout.example.json ve scripts/run-tests.mjs. prepare.mjs'in girdi kuralını (kaynak/public|private/dosya, ad kuralı, sembolik bağlantı yasağı) not al; prepare.mjs'e dokunma.
- scripts/open-library/rights.mjs (yeni, saf, dosya/ağ erişimi yok): `decide(item, source, rules)` yaz. Dönüş `{ decision: 'public' | 'private' | 'held', license, reason }`. Kurallar: kaynağın `forcePrivate` işareti varsa (Şamile) her zaman private; kaynak `requiresVerified` ise (Hindawi) lisans adı + kanıt adresi + `verified: true` yoksa held; lisans adı sadeleştirilip (küçük harf, boşluk/tire tekleştirme) kural tablosunda aranır: açık listede ise public, kısıtlı listede ise private, hiçbirinde yoksa ya da kanıt alanı boşsa held. Tablo izin listesidir: eşleşmeyen her şey held. `validateRules(rules)` de burada: sürüm, kaynak adları (prepare'deki segment kuralıyla aynı), tekrar eden kaynak, bilinmeyen alan reddedilir.
- scripts/open-library/sources.example.json (yeni, sır içermez): `version: 1`, `order: [openiti, standard-ebooks, gutenberg, wikisource, hindawi, shamela]`, kaynak başına ayar (`requiresVerified` hindawi için, `forcePrivate` ve `localOnly` shamela için, istekler arası bekleme süresi), lisans tablosu (`open`: public-domain, cc0, cc-by, cc-by-sa; `restricted`: cc-by-nc, cc-by-nc-sa, cc-by-nd, cc-by-nc-nd). Dosyanın başında değil README'de 'bu tablo yayın kararı değildir' notu olsun.
- scripts/open-library/layout.example.json: `sources` listesini kart sırasına getir ve eksikleri ekle: openiti, standard-ebooks, gutenberg, wikisource, hindawi, shamela. Başka alanı değiştirme.
- scripts/open-library/intake.mjs (yeni, yalnız Node yerleşikleri): `intake({ rules, lists, work, fetcher, sleep, signal })` dışa aktar. `lists` kaynak başına madde listesi dosyası (satır başına bir JSON: id, title, url ya da localPath, ext, license, evidenceUrl, verified). Kaynakları `rules.order` sırasıyla, maddeleri tek tek işle; listede olmayan kaynak atlanır, sırada olmayan kaynak adı hata verir. Madde kimliği `kaynak:id`; id segment kuralına uymalı, aynı kimlik listede iki kez geçerse hata.
- intake.mjs çıktı düzeni: `work/input/<kaynak>/<public|private>/<id>.<ext>` (prepare.mjs'in doğrudan girdisi), `work/held/<kaynak>/<id>.<ext>` (bekleyenler, prepare girdisinin DIŞINDA), `work/records/<kaynak>/<id>.json` (lisans adı, kanıt adresi, karar, gerekçe, kural sürümü, boyut, SHA-256, alındığı adres) ve `work/ledger.jsonl` (yalnız ekleme). Dosya adı prepare'deki ad kuralından geçmeli; geçmiyorsa madde hata ile durur, sessizce yeniden adlandırılmaz.
- intake.mjs alma ve devam: kararı indirmeden ÖNCE ver (rights.decide). İçeriği `<hedef>.<rastgele>.partial` dosyasına akışla yaz, SHA-256 ve boyutu hesapla, boş içeriği reddet, sonra `fs.link` ile hedefe yayımla (prepare.mjs'teki publish düzeni), kayıt dosyasını yaz, en son deftere satır ekle. Yeniden çalıştırmada: kayıt dosyası ve hedef dosya var, özet tutuyorsa madde atlanır ve fetcher ÇAĞRILMAZ; kayıt var ama dosya eksik/bozuksa hata ile dur (üstüne yazma yok); dosya var kayıt yoksa (kesinti) özet hesaplanıp kayıt tamamlanır. Daha önce alınmış maddenin kararı yeni kurallarla değişiyorsa taşımadan dur ve farkı bildir. Kalan `.partial` dosyaları silinmez, çıktıya girmez.
- intake.mjs ağ: varsayılan fetcher Node'un yerleşik `fetch`'i; yalnız https, yönlendirme sonrası da https, kaynak başına bekleme süresi, sınırlı yeniden deneme (ör. 3) ve zaman aşımı. `localOnly` kaynakta url'li madde reddedilir; localPath sembolik bağlantı olamaz. Fetcher ve sleep parametreyle verilebilir olsun ki testler ağa çıkmasın. Yükleme, uzak silme, kimlik bilgisi yok.
- intake.mjs komut satırı: `node scripts/open-library/intake.mjs run <kurallar.json> <liste-klasörü> <çalışma-klasörü>` ve `status <çalışma-klasörü>` (kaynak ve karar başına sayılar). Sonda sade Türkçe özet yaz: kaç açık aday, kaç kapalı, kaç bekleyen, kaç atlandı; 'Hiçbir yere yükleme yapılmadı' satırı. Hata durumunda çıkış kodu 1.
- scripts/open-library/intake.test.mjs (yeni, node:test, tümü kurgusal veri ve sahte fetcher): (1) altı kaynaklı örnekte fetcher çağrı sırası kart sırasıyla aynı; (2) açık lisanslı madde input/<kaynak>/public, kısıtlı lisanslı input/<kaynak>/private altında; (3) lisansı boş, tanınmayan ya da kanıtsız madde yalnız held altında, input altında yok; (4) Şamile maddesi 'public-domain' yazsa da private; url'li Şamile maddesi reddedilir; (5) verified olmayan Hindawi held, verified olan lisansına göre; (6) üçüncü maddede fetcher hata fırlatır → yeniden çalıştırınca ilk iki madde için fetcher çağrılmaz, toplam çağrı sayısı ve dosya mtime'ları doğrulanır; (7) tamamlanmış alımı tekrar çalıştırınca sıfır fetcher çağrısı ve defterde yinelenen satır yok; (8) bozulmuş hedef dosya ve değişen karar durdurur; (9) aynı kimlik iki kez, geçersiz id, sırada olmayan kaynak, http adresi reddedilir; (10) intake çıktısının `input` klasörü layout.example.json'daki kaynaklarla `prepare()` + `verify()`'dan geçer ve held dosyaları manifest'te yoktur; (11) rights.decide için tablo testleri.
- scripts/run-tests.mjs: suites listesine `["scripts/open-library/intake.test.mjs", []]` satırını prepare satırının hemen altına ekle; başka satıra dokunma.
- scripts/open-library/README.md: 'Kaynak alma' bölümü ekle: kaynak sırası, liste dosyası biçimi, üç bölüm (açık aday, kapalı, bekleyen), Şamile ve Hindawi kuralları, kesintiden devam, sonra prepare.mjs'e nasıl verilir, 'bu araç yayımlamaz, lisans tablosu yayın kararı değildir' uyarısı. Eski 'Sonraki işe teslim' paragrafını yeni duruma göre güncelle. Sade Türkçe.
- Testleri koş: `node --test scripts/open-library/intake.test.mjs`, `node --test scripts/open-library/prepare.test.mjs`, `npm test`, `npm run typecheck`. Gerçek ağa çıkan deneme yapma. Commit mesajında AI imzası olmasın; push etme.

## Dokunulan dosyalar

- `Loomen/scripts/open-library/intake.mjs`
- `Loomen/scripts/open-library/rights.mjs`
- `Loomen/scripts/open-library/sources.example.json`
- `Loomen/scripts/open-library/intake.test.mjs`
- `Loomen/scripts/open-library/layout.example.json`
- `Loomen/scripts/open-library/README.md`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler KALDI; iş doğrulanmadı.

> Eksik kanıt komutları ön planda koşturuldu. Alım testleri 11 geçti, hazırlık testleri 14 geçti, hiçbiri atlanmadı ya da kalmadı. Tip denetimi ve tam paket önceki test sonucu kullanıldı (kod değişmedi). Canlı doğrulama insana kaldı. Kokpit: `gecti=true` ama özet bir kontrolün koşmadığını söylüyor: "Alım testleri 11 geçti, hazırlık testleri 14 geçti, hiçbiri atlanmadı ya da kalmadı". O kontrolü koşt

## Kanıt

- Dal: `fix/LOM-106`
- Test koşusu: `7f768c3d-2c3b-46a8-936e-460a1ac16e19` (Air)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.

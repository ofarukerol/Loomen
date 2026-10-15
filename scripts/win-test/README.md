# Asistanın gerçek uygulamada testi (Windows)

`npm test` çekirdeği test eder ama asistanın **gerçekten çalıştığını** göstermez: mikrofon
açılıyor mu, ses sağlayıcıya ulaşıyor mu, öneri kartı diske doğru yazıyor mu? Buradaki iki
betik bunu, **gerçek bir API anahtarı harcamadan**, paketlenmiş uygulama üzerinde dener.

```
sahte-saglayici.mjs   OpenAI uyumlu iki uç: akışlı sohbet ve /audio/transcriptions.
                      Cevabı sahtedir; ağ yolu, SSE ayrıştırma ve ses yükleme gerçektir.
asistan-testi.mjs     Uygulamayı CDP üzerinden sürer ve adım adım doğrular.
```

## Koşturma

```powershell
npm run win-test:build                      # test sürümü (CDP portu 9224 açık)
node scripts\win-test\sahte-saglayici.mjs   # ayrı pencerede bırak
# uygulamayı konsol oturumunda aç (zamanlanmış görevle; SSH oturumundan açılan
# pencere ve WebView2 hiç oluşmaz)
node scripts\win-test\asistan-testi.mjs
```

Ortam değişkenleriyle değiştirilebilir: `LOOMEN_TEST_KASA`, `LOOMEN_TEST_SAGLAYICI`,
`LOOMEN_CDP`, `LOOMEN_PW` (Playwright'ın alındığı paket), `LOOMEN_TEST_PNG`.

> **Test kasası boş bir klasör olmalı.** Betik kasaya not yazar ve localStorage'ı temizler;
> gerçek kasanı verme.

## Ne doğrulanıyor

- Asistan ayarları: ses modeli alanı, not önerisi ve "doğrudan gönder" anahtarları
- Sağlayıcı kurulumu, anahtarın kaydı ve "Test et" (akışsız istek)
- Sohbet akışı; öneri bloğunun kullanıcıya **ham JSON olarak gösterilmemesi**
- **Onaydan önce diske hiçbir şey yazılmaması**
- Onaydan sonra notun yazılması, var olan notun **üzerine yazılmaması** (sıradaki boş ad)
  ve eski içeriğin bit bit aynı kalması
- Mikrofonun açılması, kaydın gerçekten sağlayıcıya ulaşması ve metnin soru kutusuna düşmesi

# Editör menüsünün testi (`menu-testi.mjs`, LOM-36)

Editörde sağ tık (masaüstü) ya da uzun basma (telefon) ile açılan menünün bütün öğelerini
dener. Mobil görünüm 375×667 dar ekran ve **gerçek dokunma olaylarıyla** (`Input.dispatchTouchEvent`)
sürülür; telefonda klavyenin kapanması, ekranın yalnız yüksekliğinin değişmesiyle (667→360) taklit edilir.

## Koşturma

```bash
# Tarayıcı modu (Mac, hızlı): örnek kasa bellekte, diske hiçbir şey yazılmaz
npm run dev -- --port 5199
LOOMEN_URL=http://localhost:5199 LOOMEN_PW=$HOME/Github/DathaDesktop/package.json \
  node scripts/win-test/menu-testi.mjs
```

```powershell
# CDP modu (Excalibur, paketli uygulama, port 9224): açık kasada "Yeni not" oluşturur
npm run win-test:build
node scripts\win-test\menu-testi.mjs
```

Ortam değişkenleri: `LOOMEN_URL` (verilirse tarayıcı modu), `LOOMEN_CDP`, `LOOMEN_PW`,
`LOOMEN_TEST_PNG`. Menü metinleri `src/i18n/locales/tr/translation.json`'dan okunur:
**uygulama dili Türkçe olmalı**, yoksa öğeler bulunamaz ve adımlar kırmızı çıkar.

CDP modunda masaüstü bölümü 1280×800, mobil bölüm 375×667 ekran taklidiyle koşar; betik biterken
(hata olsa da) taklit kapatılır. Betik açtığı yeni notun içeriğini baştan yazar; gerçek kasada
"Günün Notu"na hiç dokunmaz, ama yine de **test kasası** kullan.

## Ne doğrulanıyor

- Uzun basınca menünün açılması; parmak kalkınca ilk öğenin (Bağlantı ekle) **çalışmaması**
- Mobilde Biçimlendirme / Paragraf / Ekle'ye dokununca menünün kapanmaması, alt öğelerin
  görünmesi ve **editörün odağının menü düğmesine geçmemesi**
- Yalnız yükseklik değişince menünün açık kalması (Ekle akordeonu açıkken), genişlik
  değişince kapanması; sonra Tablo'ya dokununca tablonun eklenip menünün kapanması
- Seçili metne uzun basınca seçimin korunması
- Her yaprak öğe (Bağlantı, Dış bağlantı, 6 biçim, 11 paragraf, 4 ekleme, Kes, Kopyala,
  Yapıştır, Tümünü seç) **seçili ve seçimsiz** iki durumda, masaüstünde fareyle ve mobilde
  dokunarak: belge beklenen metne dönüşüyor, menü kapanıyor
- Pano okunamazsa Yapıştır'ın belgeyi değiştirmemesi ve kullanıcıya mesaj göstermesi

Seçim, menü açıldıktan sonra betik tarafından yeniden kurulur; sağ tık / uzun basmanın seçimi
bozup bozmadığı ayrı adımda denetlenir. Pano izni yoksa bellek içi bir pano taklidi kullanılır.

## Düzeltmesiz kodda sonuç (15 Eki 2026, tarayıcı modu)

LOM-36 öncesi kodda 8 adım kırmızıydı; kök sebep böyle göründü:

- Mobilde gruba dokununca odak `BUTTON.lo-ctxmenu__item`'a geçiyor (Biçimlendirme, Paragraf,
  Ekle için üç adım). Telefonda bu, klavyeyi kapatıp WebView'i küçültüyor.
- Yükseklik 667→360 olunca menü kapanıyor (pencere `resize` olayı); Ekle'nin alt öğeleri de
  gidiyor (iki adım). Masaüstünde yalnız yükseklik değişince de kapanıyordu (bir adım).
- Pano reddedilince Yapıştır sessiz kalıyor (masaüstü + mobil, iki adım).

Masaüstü ve mobilde bütün yaprak komutlar bu kodda da doğru metni üretiyordu; hata menünün
kendisindeydi, komutlarda değil.

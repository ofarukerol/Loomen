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

---
module: cok-dilli-altyapi
repos: [Loomen]
status: aktif
last_updated: 2026-09-13
related_docs:
  - docs/planning/07-i18n.md
---

# Loomen — Çok Dilli Altyapı

Kullanıcının isteği: "Varsayılan Türkçe, diğer diller otomatik çevrilsin, 3 dilden 20 dile çıkarken
zorlanmayayım." Kod: `src/i18n/index.ts`, çeviriler `src/i18n/locales/{tr,en,ar}/translation.json`.

## Kurallar
1. **Kaynak dil Türkçe.** Bütün metinler önce Türkçe yazılır; diğerleri ondan türetilir.
2. **Arayüzde gömülü metin yasak.** Görünen her metin bir anahtardan gelir (`t("common:save")`, `t("Kaydet")` değil).
3. **Anahtar sözleşmedir, metin veridir.** Yeni dil = yeni çeviri dosyası; kod değişmez.
4. **Cümle birleştirerek metin kurmak yasak.** Kelime sırası dile göre değişir; değişkenler yer tutucuyla gömülür.
5. **Tarih ve sayı elle biçimlenmez.** `Intl` / date-fns yerel ayarıyla.
6. **Çalışırken ağ yok.** Çeviriler derleme anında üretilir, uygulama hazır dosyayı okur.
7. **Yedek dil Türkçe.** Eksik anahtar İngilizceye değil Türkçeye düşer.

## Sağdan sola (Arapça)
- Dil RTL ise `<html dir="rtl">` (`applyDir`).
- CSS'te `left/right` yerine mantıksal özellikler (`margin-inline-start` vb.).
- Yön bildiren ikonlar aynalanır; gezgin sağa geçer.
- Türkçe içine Arapça gömülünce yön yalıtılır (`unicode-bidi: isolate`).
- Her yeni ekran hem soldan sağa hem sağdan sola gözle denetlenir.

Arapça ilk fazda bilerek var: en zor çok dil sorunu (yön) baştan çözülürse İbranice ve Farsça sonradan ek iş çıkarmaz.

## Planlanan otomatik çeviri akışı
Geliştirici yalnız `tr` dosyasını değiştirir. Bir betik eksik ya da değişmiş anahtarları hedef dillere
çevirir. Elle düzeltilen çeviri "kilitli" işaretlenir ve bir daha üzerine yazılmaz. Çeviri belleği aynı
metni iki kez çevirmez. Her anahtarın durumu tutulur: otomatik, elle düzeltilmiş ya da eskimiş.

## Bugünkü durum (2026-09-13)
TR, EN, AR dosyaları ve RTL yön ayarı kodda var; İngilizce ve Arapça eksikleri 2026-07-20'de tamamlandı.
Henüz olmayanlar: ICU çoğul biçimleri (`i18next-icu`), otomatik çeviri betiği ve çeviri belleği,
gömülü metni yakalayan lint kuralı, eksik anahtar denetimi. Tek bir `translation` ad alanı kullanılıyor;
planda özellik başına ayrı dosya vardı.

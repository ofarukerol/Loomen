---
module: tasarim-sistemi
repos: [Loomen]
status: aktif
last_updated: 2026-09-13
related_docs:
  - docs/planning/08-design-system.md
---

# Loomen — Tasarım Sistemi

Kaynak prototip: `design/loomen/project/Loomen.dc.html`. Renk ve ölçü değişkenleri:
`design/tokens.css` (uygulamaya doğrudan alınabilir). İş prototipin görüntüsünü eşlemek,
iç yapısını kopyalamak değil.

## Yön
Nötr sıcak griler + terra/amber vurgu. His: Linear / Things 3 inceliği, ferah, içerik önde.
Vurgu rengi **yalnız** etkin öğe, sayaç ve birincil düğmede. Saf beyaz ve siyah yok.

## Renkler
| Rol | Açık | Koyu |
|---|---|---|
| Zemin | `#FAF9F6` | `#191815` |
| Yüzey | `#FFFFFF` | `#232220` |
| Metin | `#211F1B` | `#ECEAE4` |
| Çizgi | `#E9E6DF` | `#322F2A` |
| **Vurgu** | `#C2603A` | `#D67A4E` |
| Geciken | `#C0473A` | `#E0796B` |
| Tamam | `#3E8E5A` | `#5DB17F` |

Ayarlardan seçilebilen vurgular: terra (varsayılan), teal `#2E8B7F`, mor `#6C5CE0`, kırmızı `#A4261F`.

## Yazı tipleri
DM Sans (bütün arayüz) · JetBrains Mono (sayı, tarih, sayaç, kod, dosya yolu, takvim günleri) ·
Noto Sans Arabic (RTL). Yıl başlığı 46 px mono, sayaç 32 px mono, gövde 14–15,5 px.

## Ölçüler
İkon şeridi 56 px · gezgin 248 px · planlayıcı sağ paneli 312 px · geri bağlantı paneli 288 px.
İkon düğmesi 40×40, köşe 11. Sayaç kartı köşe 14; ilki dolu vurgu. Pomodoro halkası 148 px.
Geciken görev: solda 2 px kırmızı çizgi + açık kırmızı zemin.

## Ekranlar
Planlayıcı (zaman çizelgesi ↔ pano) · Editör (sekmeler + canlı önizleme + geri bağlantılar) ·
Graf (üzerine gelince komşular vurgulanır) · Ayarlar · Mobil (alt sekmeler: Planlayıcı, Takvim,
Notlar, Pomodoro, Ara) · RTL (bütün düzen aynalı, Arapça-Hint rakamları).

Arayüz öğeleri sessiz kalır; göze batan renk yalnız vurgu yerlerinde. README ekran görüntüleri
örnek veriyle (sample modu) alınır, gerçek kasadan değil.

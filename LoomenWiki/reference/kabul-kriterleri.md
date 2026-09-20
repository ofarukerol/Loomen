---
module: kabul-kriterleri
repos: [Loomen]
status: aktif
last_updated: 2026-09-13
related_docs:
  - docs/planning/05-acceptance-criteria.md
---

# Loomen — "Bitti" Ne Demek

Tam liste `docs/planning/05-acceptance-criteria.md`'de (Given/When/Then, her özellik için işlev,
platformlar arası tutarlılık, hız ve uç durumlar). Burada en çok unutulan maddeler var.

## Sayısal hedefler
| Ölçü | Hedef |
|---|---|
| Soğuk açılış (1.000+ not) | < 3 sn |
| Tuş → ekran gecikmesi, not açma/kaydetme | < 100 ms |
| Arama (1.000+ not) | < 500 ms |
| Geri bağlantı paneli (1.000 not) | < 300 ms |
| Görev değişince sayaç güncellemesi | < 200 ms |
| Takvimde ay değiştirme | < 150 ms |
| Pomodoro doğruluğu (25 dk) | ± 1 sn |
| Graf | 1.000 düğüme kadar akıcı |

## Sık atlanan uç durumlar
- Kaydederken çökme dosyayı bozmamalı (atomik yazma).
- Yeniden adlandırılan/taşınan not, ona verilen `[[bağlantı]]`ları kırmamalı: ya güncellenir ya uyarılır.
- Açıkken diskte değişen dosya fark edilmeli; sessiz ezme yok.
- Aynı adlı iki not varsa bağlantı belirsizliği açıkça gösterilmeli.
- Türkçe harfler (ç, ş, ı, ğ) ve büyük/küçük harf aramada doğru çalışmalı.
- Görev satırı ayrıştırılıp geri yazılınca dosyada yalnız amaçlanan değişiklik olmalı; tanınmayan emoji korunmalı.
- Tarihsiz görev "Planlanmamış"a, geçmiş tarihli açık görev "Geciken"e düşmeli.
- Takvimde hafta Pazartesi başlamalı.
- Pomodoro ortasında uygulama kapanırsa durum kurtarılmalı ya da temiz sıfırlanmalı; bildirim izni yoksa sayaç yine çalışmalı.
- Arapça seçilince bütün düzen aynalanmalı; çevirisi eksik anahtar TR'ye düşmeli, boş ya da anahtar adı görünmemeli.
- Ayar dosyası bozuksa uygulama varsayılanlarla açılmalı.
- Dizin dosyası silinirse açılışta dosyalardan yeniden kurulmalı.

## İlk sürüm ne zaman bitmiş sayılır
Bütün işlev ve hız maddeleri masaüstünde geçer; graf masaüstünde tam, mobilde sınırlı; iOS ve
Android'de temel özellikler çalışır; birincil kullanıcı Obsidian planlama düzenini bırakıp Loomen'e
geçebilir; 30 gün gerçek kullanımda **sıfır** veri kaybı.

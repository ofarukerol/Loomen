---
module: urun-ve-mvp
repos: [Loomen]
status: aktif
last_updated: 2026-09-13
related_docs:
  - docs/planning/01-spec.md
  - docs/planning/02-mvp-scope.md
---

# Loomen — Ürün ve İlk Sürüm Kapsamı

## Ne yapar
Notları, görevleri, günlük planı, takvimi ve Pomodoro'yu **tek yerel uygulamada** birleştirir.
Tez: Obsidian'daki planlama düzeni (Tasks + Tasks Timeline + Calendar + Pomodoro eklentileri) elle
kurulup bakılmak zorunda; Loomen bunu kutudan çıktığı gibi, gömülü sunar.

## Kimin için
- **Birincil — üretkenlik odaklı güç kullanıcısı:** Obsidian + eklenti düzeninden yorulmuş, verisinin yerelde kalmasını şart koşan kişi. Başarı ölçütü: "Sabah açıyorum, bugünün ajandası, gecikenler ve Pomodoro tek ekranda."
- **İkincil — gizliliğe duyarlı öğrenci/araştırmacı:** bağlantılı notlar ve graf, çevrimdışı ve ücretsiz.
- **Üçüncül — telefonda hızlı not alan:** gün içinde telefondan görev yakalar, akşam masaüstünde işler.

## Değişmez iş kuralları
1. Kasa tek doğruluk kaynağıdır; uygulama dosyaların üstünde bir görüntüleyici/düzenleyicidir.
2. Türetilen her şey (arama dizini, geri bağlantılar, görev listesi) dosyalardan yeniden üretilebilir.
3. Görev = Markdown satırı. Ayrı görev veritabanı yok; planlayıcı satırı okur ve aynı satıra yazar.
4. Çevrimdışı öncelikli; çekirdek işlem internet beklemez.
5. Yıkıcı işlem yok: silme geri alınabilir.

## İlk sürüm (MVP) — olmazsa olmazlar
Kasa + dosya işlemleri + çöp kutusu · canlı önizlemeli editör · `[[wiki-link]]` + geri bağlantı ·
tam metin arama + hızlı açıcı · görev motoru (tarih alanlarıyla) · **planlayıcı** (zaman çizelgesi,
göreli tarih, Bugün/Geciken/Planlanmamış sayaçları, hızlı ekleme) · **takvim** (aylık, günlük not) ·
**Pomodoro** (göreve bağlı, kayıtlı, bildirimli) · graf (masaüstü öncelikli) · `#etiket` ·
açık/koyu tema · TR/EN/AR + RTL · ayarlar.

İki kalp aynı anda atmalı: çalışan bir not editörü **ve** çalışan bir planlayıcı. Biri çıkarsa ürün
var olan alternatiflerden ayrışmaz; bu yüzden Pomodoro ve takvim de "olmazsa olmaz".

- **Sonraya bırakılan:** görsel ekleme, gelişmiş komut paleti, görsel tarih seçici, KaTeX/Mermaid, Canvas, tema mağazası, gelişmiş tekrar kuralları.
- **Bu sürümde hiç yok:** kendi eşitleme sunucusu/hesap sistemi, eklenti ekosistemi, çok kullanıcılı paylaşım, web sürümü. Plan yapay zekâyı da dışarıda bırakıyordu (`01 §7`); `sesli-asistan` dalında bu karardan sapan bir asistan çalışması var, henüz `main`'de değil.

## Yapım sırası (plan)
İskelet + tema + i18n → kasa katmanı → editör → bağlantılar → arama → görev motoru →
planlayıcı → takvim → Pomodoro → graf → ayarlar → mobil derleme. İlk altı adım "bir Obsidian klonu"
üretir; sonrakiler onu Loomen yapar.

## Bugünkü durum (2026-09-13, `main`)
`v0.1.0`, henüz yayınlanmadı. Editör, planlayıcı (zaman çizelgesi, pano, takvim kartı, Pomodoro,
hızlı ekleme, görev detayı), graf, arama, günlük not ve çöp kutusu kodda var. Planın dışında
eklenenler: Excalidraw çizim, ses kaydı (WAV/FLAC), raporlar ekranı, GitHub eşitleme, Google Takvim.
Yayın adımları: `docs/yayinlama.md`.

---
name: LOM-101 — Açık Kitaplık: Hetzner'de kitap deposu, işleme sunucusu ve Drive yedeği
description: Mevcut kitap deposunun düzeni ve iMac’te kaynakları sırayla işlemeye hazırlık yapılacak.
type: project
proje: loomen
kaynak: kart LOM-101 · dal fix/LOM-101 · Loomen@07315c625d862de2724c0f2b385743b45e65417b · test koşusu e311b6fe-61c6-4eeb-ab38-421884b083f4 (iMac)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-12
---

# LOM-101 — Açık Kitaplık: Hetzner'de kitap deposu, işleme sunucusu ve Drive yedeği

## Ne yapıldı

Mevcut kitap deposunun düzeni ve iMac’te kaynakları sırayla işlemeye hazırlık yapılacak.

## Adımlar

- Uygulama öncesinde mevcut dalı, görev devrini, ilgili hafıza kayıtlarını ve LoomenWiki kurallarını oku; önerilen dosya yollarını mevcut yapıyla karşılaştır.
- Mevcut açık kitaplık ve kapalı arşivin hedef düzenini, kaynak ayrımını ve değiştirilmeyen çekim kayıtlarını sır içermeyen örnek ayarda tanımla.
- iMac’te yerel örnek dosyaları kaynak sırasıyla hazırlayan, dosya listesi ve SHA-256 değerlerini üreten çevrimdışı hazırlık aracını oluştur.
- Yarım kalan hazırlığı sürdürme, önceki çekimi koruma ve bozuk ya da eksik dosyayı reddetme kontrollerini ekle.
- Mevcut test altyapısıyla kurgusal dosyalar üzerinde hedef ayrımını, tekrar çalıştırmayı, kesintiden devamı ve bütünlük denetimini doğrula.
- iMac kullanımını, gerekli mevcut araçları ve sonraki kaynak alma işine teslim edilecek dosyaları belgeleyip farkları bağımsız incelemeye sun.

## Dokunulan dosyalar

- `Loomen/scripts/open-library/layout.example.json`
- `Loomen/scripts/open-library/prepare.mjs`
- `Loomen/scripts/open-library/prepare.test.mjs`
- `Loomen/scripts/open-library/README.md`

## Test

Testler geçti.

> Hazırlık aracının 14 testi geçti, atlanan test yok. Tip denetimi, derleme ve 64 dosyalık tam test takımı da geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-101`
- Commit: `Loomen@07315c625d862de2724c0f2b385743b45e65417b`
- Test koşusu: `e311b6fe-61c6-4eeb-ab38-421884b083f4` (iMac)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

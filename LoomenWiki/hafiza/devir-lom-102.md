---
name: LOM-102 — Açık Kitaplık: kaynakları alma, katalog (yazar, kategori, lisans) ve kapaklar
description: Testler kaldı: Kitapları iMac’te kaynak sırasıyla işleyen, lisansları ayıran, yazar ve kategorileri birleştiren hazırlık işi dört alt karta bölünsün.
type: project
proje: loomen
kaynak: kart LOM-102 · dal fix/LOM-102 · commit yok · test koşusu c0a1cc7a-87eb-4207-984a-dd590651571e (iMac)
guven: iddia
durum: gelistirildi
---

# LOM-102 — Açık Kitaplık: kaynakları alma, katalog (yazar, kategori, lisans) ve kapaklar

## Ne yapıldı

Kitapları iMac’te kaynak sırasıyla işleyen, lisansları ayıran, yazar ve kategorileri birleştiren hazırlık işi dört alt karta bölünsün.

## Adımlar

- Alt kartları açmadan önce LOM-101 devrini, depo kurallarını ve mevcut işleme dosyalarını salt okunur inceleyerek önerilen yolları doğrula.
- İşi dört bağımsız teslim olarak böl; bu ana kartta uygulama başlatma.
- İlk teslimde kaynak sırasını, toplu alma kurallarını, lisans kanıtlarını, kapalı arşiv ayrımını ve kaldığı yerden devam etmeyi kur.
- İkinci teslimde bozuk ve tekrar dosyaları ayır; Arapça metinleri harekeleri koruyarak sağdan sola EPUB’a dönüştür ve kapakları hazırla.
- Üçüncü teslimde yazar eşlemesini, Türkçe kategori ağacını ve insan onayı bekleyen öneri kayıtlarını oluştur.
- Son teslimde çıktıları LOM-101 sözleşmesine uygun yükleme paketine dönüştür; kaynak raporlarını ve kapsama oranlarını üret.
- Mevcut test düzeninde kontrollü örneklerle hata, tekrar başlatma, lisans ayrımı ve yirmi kitap açılma kontrollerini çalıştır; gerçek toplu işlemenin sonucunu ayrıca raporla.

## Dokunulan dosyalar

- `Loomen/tools/open-library/contracts.ts`
- `Loomen/tools/open-library/pipeline.ts`
- `Loomen/tools/open-library/rights.ts`
- `Loomen/tools/open-library/sources.ts`
- `Loomen/tools/open-library/intake.test.ts`
- `Loomen/tools/open-library/deduplicate.ts`
- `Loomen/tools/open-library/arabic-epub.ts`
- `Loomen/tools/open-library/covers.ts`
- `Loomen/tools/open-library/preparation.test.ts`
- `Loomen/tools/open-library/authors.ts`
- `Loomen/tools/open-library/categories.tr.json`
- `Loomen/tools/open-library/classification.ts`
- `Loomen/tools/open-library/catalog.test.ts`
- `Loomen/tools/open-library/package.ts`
- `Loomen/tools/open-library/report.ts`
- `Loomen/tools/open-library/reader-check.test.ts`

## Test

Testler KALDI; iş doğrulanmadı.

> Derleme, uygulamanın tip denetimi ve tüm testler geçti. Dört kitaplık dosyasında sırasıyla 15, 10, 8 ve 9 kontrol geçti; atlanan yok. Kitap hazırlama araçlarının ayrı tip denetimi Node tanımları bulunamadığı için tamamlanamadı; bağımlılık kurulumu onay gerektiriyor. Gerçek koleksiyon henüz işlenmedi.

## Kanıt

- Dal: `fix/LOM-102`
- Test koşusu: `c0a1cc7a-87eb-4207-984a-dd590651571e` (iMac)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.

---
name: LOM-102 — Açık Kitaplık: kaynakları alma, katalog (yazar, kategori, lisans) ve kapaklar
description: Testler kaldı: Kitapları iMac’te kaynak sırasıyla işleyen, lisansları ayıran, yazar ve kategorileri birleştiren hazırlık işi dört alt karta bölünsün.
type: project
proje: loomen
kaynak: kart LOM-102 · dal fix/LOM-102 · commit yok · test koşusu bdd1ce71-a437-4470-a576-b80cbcdf8904 (iMac)
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

> Derleme ve tip denetimleri geçti; npx tsc --noEmit -p tsconfig.json hatasız tamamlandı. Genel testte 64 dosya geçti. Kitaplık testleri ayrı ayrı da geçti: kaynak alma 15, hazırlama 10, katalog 8 ve okuma kontrolü 9; atlanan yok. Gerçek koleksiyon henüz işlenmediği için yüzde 90 doluluk ve 20 gerçek kitap doğrulanmış değil. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-102`
- Test koşusu: `bdd1ce71-a437-4470-a576-b80cbcdf8904` (iMac)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.

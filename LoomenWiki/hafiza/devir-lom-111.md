---
name: LOM-111 — Kütüphane yükleme aracının bir testi Air'de kırmızı
description: Testler kaldı: Kitap yükleme aracının okuyucu kontrolünde sağlam PDF'in Air'de 'açılmadı' sayılmasının nedeni bulunup düzeltilecek; ortam eksiği kitap hatası gibi gösterilmeyecek, test de nedeni açıkça yazacak.
type: project
proje: loomen
kaynak: kart LOM-111 · dal fix/LOM-111 · commit yok · test koşusu 00b40117-56c9-453f-a100-ec417e26e5fd (Excalibur)
guven: iddia
durum: gelistirildi
---

# LOM-111 — Kütüphane yükleme aracının bir testi Air'de kırmızı

## Ne yapıldı

Kitap yükleme aracının okuyucu kontrolünde sağlam PDF'in Air'de 'açılmadı' sayılmasının nedeni bulunup düzeltilecek; ortam eksiği kitap hatası gibi gösterilmeyecek, test de nedeni açıkça yazacak.

## Adımlar

- Dalın fix/LOM-111 olduğunu ve scripts/open-library altında reader-check.mjs ile package.test.mjs dosyalarının main'deki haliyle durduğunu doğrula; değilse dur ve bildir.
- `node --version` çıktısını al ve node_modules/pdfjs-dist klasörünün var olup olmadığına, sürümüne bak; sonucu kanıt olarak not et.
- package.test.mjs içindeki (6) numaralı testte sağlam PDF ve sağlam EPUB denetimlerine açılmama nedenini gösteren mesaj ekle (assert'in üçüncü argümanı olarak `reason`), sonra `node --test scripts/open-library/package.test.mjs` koşup gerçek nedeni oku.
- Neden ortam eksiğiyse (pdfjs-dist bulunamıyor, pdf.js yüklenirken hata veriyor ya da Node sürümü yetmiyor): reader-check.mjs içinde pdf.js yüklemesini esbuild'deki gibi ayrı bir yükleyiciye al; yükleme hatasında 'Okuyucu kontrolü için depoda `npm install` yapılmış olmalı (pdfjs-dist bulunamadı)' ya da gereken Node sürümünü söyleyen açık bir hata fırlat. checkBooks bu hatayı kitaba 'açılmadı' diye yazmasın, yukarı iletsin (mevcut /npm install/ denetimini ortam hatası işaretiyle değiştir).
- Neden kodun kendisindeyse (örneğin pdf.js'e verilen seçenekler, baytların aktarımı, test PDF'inin kuruluşu ya da kapanış sırasındaki hata): yalnız reader-check.mjs'teki openPdf'i ya da testteki örnek PDF'i düzelt; sağlam PDF açılsın, 'pdf değil' içerikli dosya yine nedenle reddedilsin.
- Teste bir senaryo ekle: ortam hatası kitaba 'açılmadı' diye yazılmıyor, hata olarak yukarı çıkıyor (pdf.js yükleyicisi sahte bir yükleyiciyle değiştirilerek, ağ ve gerçek paket kaldırma olmadan).
- README'nin 'Yirmi kitap kontrolü' paragrafında ve baştaki Node satırında PDF kontrolünün pdfjs-dist ve onun istediği Node sürümünü gerektirdiğini tek cümleyle güncelle.
- `node --test scripts/open-library/package.test.mjs`, `npm test` ve `npm run typecheck` koş; çıktıları kanıt olarak ver. Kırmızı kalırsa nedeni yaz.
- Air'de eksik paket ya da eski Node çıktıysa hiçbir şey kurma: neyin eksik olduğunu ve Air'de ne yapılması gerektiğini sade Türkçe bildir. Değişiklikleri fix/LOM-111 dalına AI imzasız commit et, push etme.

## Dokunulan dosyalar

- `Loomen/scripts/open-library/reader-check.mjs`
- `Loomen/scripts/open-library/package.test.mjs`
- `Loomen/scripts/open-library/README.md`

## Test

Testler KALDI; iş doğrulanmadı.

> İş yarıda durduruldu; testler koşmadı.

## Kanıt

- Dal: `fix/LOM-111`
- Test koşusu: `00b40117-56c9-453f-a100-ec417e26e5fd` (Excalibur)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.

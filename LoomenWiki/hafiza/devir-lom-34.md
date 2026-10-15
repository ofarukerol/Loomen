---
name: LOM-34 — Mobil: görev detay penceresi çok büyük açılıyor
description: Mobilde görev detay ve çöp kutusu pencerelerinin üstten çentik payı + 32px, alttan ev çizgisi payı + 32px (klavye açıkken klavyenin 12px üstü) boşluk bırakacak şekilde app.css'teki dar ekran kuralını düzeltmek.
type: project
proje: loomen
kaynak: kart LOM-34 · dal fix/LOM-34 · Loomen@08306a7cb0d76e7d69a924bf799770215e453f61 · test koşusu 0f514c53-3e0b-4b1f-a56b-81e4d958b258 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-15
---

# LOM-34 — Mobil: görev detay penceresi çok büyük açılıyor

## Ne yapıldı

Mobilde görev detay ve çöp kutusu pencerelerinin üstten çentik payı + 32px, alttan ev çizgisi payı + 32px (klavye açıkken klavyenin 12px üstü) boşluk bırakacak şekilde app.css'teki dar ekran kuralını düzeltmek.

## Adımlar

- KÖK SEBEP (koddan doğrulandı): Loomen/src/styles/app.css 3310-3317 arasındaki `@media (max-width: 768px)` bloğu `.lo-modal`'a 12px kenar, `.lo-tdetail` ve `.lo-trash`'e `max-height: calc(100dvh - 24px - var(--kb))` veriyor. index.html'de `viewport-fit=cover` olduğu için 12px çentiğin/durum çubuğunun ve ev çizgisinin içine giriyor; pencere ekranın üstüne ve dibine yapışıyor. Masaüstü kuralı (1611-1637: 24px kenar, 88dvh) dar ekranda ezildiği için orada boşluk yok.
- Loomen/src/styles/app.css — aynı bloğu şöyle değiştir (başka satıra dokunma): `.lo-modal` içinde iki değişken tanımla ve kısa yazımla kenar boşluğu ver: `--lo-modal-top: calc(env(safe-area-inset-top, 0px) + 32px);` `--lo-modal-bottom: max(calc(env(safe-area-inset-bottom, 0px) + 32px), calc(var(--kb) + 12px));` `padding: var(--lo-modal-top) 12px var(--lo-modal-bottom);`. Böylece klavye kapalıyken alt boşluk ev çizgisi + 32px, klavye açıkken klavyenin 12px üstü olur (çift sayma yok, pencere gereksiz küçülmez). Eski `padding-bottom` satırı kalksın (kısa yazım onu kapsıyor).
- Loomen/src/styles/app.css — `.lo-tdetail, .lo-trash` için `max-height: calc(100dvh - var(--lo-modal-top) - var(--lo-modal-bottom));` yaz. Özel değişkenler .lo-modal'dan çocuklara miras geçer; kenar boşluğu ile üst sınır birebir aynı sayıdan türediği için pencere hiçbir zaman boşluğa taşmaz. Bloğun üstündeki Türkçe yorumu güncelle: neden çentik/ev çizgisi payı ve neden klavyede 12px'e inildiğini tek-iki cümleyle yaz. `border-radius: 16px`, `overflow: hidden`, gövdenin `overflow-y: auto` ve altlığın `flex-shrink: 0` kuralları temel sınıflarda zaten var; onlara dokunma.
- DOĞRULAMA (yerel): `npx tsc --noEmit` çıktısız, `npm test` tüm dosyalar geçti, `npm run build` başarılı (bilinen 500 kB uyarısı hata değil). Koddan gözden geçir: 769px üstünde hiçbir şey değişmedi (blok yalnız max-width 768 içinde); `.lo-ghdev` penceresi aynı .lo-modal içinde ama max-height almıyor, yalnız dikey konumu kayar.
- Canlı/ekran doğrulaması test ajanınca koşturulmaz, insana kalır: OTOMATİK CANLI DENEME (Excalibur, LOM-22'deki yöntemle: ayrı klasörde derle, CDP ile sür; önce Loomen/scripts/win-test/README.md'yi oku, sıra kuralına uy): pencereyi 390x844 yap, Planlayıcı'da bir göreve tıkla. Ölç: `.lo-tdetail` getBoundingClientRect().top >= 32, (innerHeight - rect.bottom) >= 32, `.lo-tdetail__save` ekran içinde ve görünür, computed border-radius 16px, `.lo-tdetail__body` overflow-y auto. CDP ile `document.documentElement.style.setProperty('--kb','300px')` ver, tekrar ölç: `.lo-tdetail__foot` alt kenarı <= innerHeight - 300. `--kb`'yi 0px'e döndür. Çekmeceden çöp kutusunu aç, `.lo-trash` için aynı üst/alt boşluk ölçümünü yap. Pencereyi 1280x800 yap: `.lo-tdetail` kenar boşluğu 24px, max-height 88dvh (değişmedi). Her ölçümde ekran görüntüsü al; denenemeyen adımı raporda açıkça yaz.
- Canlı/ekran doğrulaması test ajanınca koşturulmaz, insana kalır: COMMIT: repo dilinde mesaj, AI imzası YOK, dal fix/LOM-34, push YOK. Sonuçta test komutlarını ve geçti/kaldı satırlarını, ekran görüntüsü yollarını ve denenmeyen kısımları yaz.

## Dokunulan dosyalar

- `Loomen/src/styles/app.css`

## Test

Testler geçti.

> Tip denetimi, tüm testler ve derleme hatasız geçti. Dar ekran kuralı app.css'te üst ve alt 32px boşlukla duruyor. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-34`
- Commit: `Loomen@08306a7cb0d76e7d69a924bf799770215e453f61`
- Test koşusu: `0f514c53-3e0b-4b1f-a56b-81e4d958b258` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

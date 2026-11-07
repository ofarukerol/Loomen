---
title: Kütüphane — PDF okuyucu
tags: [kütüphane, pdf, okuyucu]
updated: 2026-11-07
kart: LOM-83
---

# Loomen — Kütüphane: PDF okuyucu (LOM-83)

Kütüphane kabuğunun ([[kutuphane]]) PDF görüntüleyicisi. Kabuk dosyayı okur, çizim menüsünü,
not penceresini ve kayıtları yönetir; bu parça yalnız sayfaları gösterir, seçimi çizim yerine
çevirir ve kalınan yeri bildirir. Sözleşme: `src/screens/Library/readerTypes.ts`.

## Dosyalar
- `src/screens/Library/views/PdfView.tsx` — görüntüleyici (kabuk `import.meta.glob` ile tembel yükler).
- `src/screens/Library/views/pdfView.css` — sayfa, çizim ve metin katmanı stilleri.
- `src/core/library/pdfAnchor.ts` — saf hesaplar; testi `src/core/__test__/pdfAnchorTest.ts`.

## pdf.js nasıl yüklenir
- Paket `pdfjs-dist` (Apache-2.0). **İsteğe bağlıdır:** `import.meta.glob(..., { exhaustive: true })`
  ile `node_modules/pdfjs-dist/legacy/build/pdf.min.mjs` aranır. Paket kurulu değilse glob boş
  döner; tip denetimi ve derleme bozulmaz, okuyucu "PDF okuyucu bu sürümde kurulu değil" der.
  `exhaustive: true` şart: Vite glob'u yoksa `node_modules`'u atlar.
- **Kurulum (onay gerekir):** `npm install pdfjs-dist@^5`. Kod değişmeden devreye girer.
  5.x paketi Node 22.13+ ister (yalnız kurulum/derleme makinesi için).
- `legacy` derlemesi seçildi: macOS 11 ve eski Android WebView'da yeni JS özellikleri yok.
- Çalışan (worker) `?url` ile ayrı varlık olarak paketlenir (`assets/pdf.worker.min-*.mjs`) ve
  `GlobalWorkerOptions.workerSrc`'ye verilir. CSP `worker-src 'self'` yeter; `isEvalSupported: false`
  (CSP'de `unsafe-eval` yok). CSP'ye dokunulmadı.
- `getDocument({ data })` baytları çalışana aktarır (kaynak dizi boşalır); bu yüzden `data.slice()` verilir.

## Düzen
- Sayfalar alt alta, mutlak konumlu; sayfa ölçüleri önce 1. sayfanınkiyle varsayılır, arkada
  40'arlı parçalarla gerçekleri okunur (karışık boyutlu PDF'ler).
- Ölçek = genişliğe sığdır (en çok 880 px) × yazı boyutu. Yazı boyutu düğmesi = yakınlaştırma.
- Yalnız görünen sayfalar ±2 tuvale çizilir; görünümden çıkan sayfanın tuvali ve metni bırakılır,
  `page.cleanup()` çağrılır. Tuval cihaz pikseliyle çizilir ama sayfa başına 6 milyon pikseli aşmaz
  (Safari'nin toplam tuval belleği dar). Bırakılan tuvalin boyutu sıfırlanır: Safari belleği ancak öyle geri verir.
- Genişlik değişimi 150 ms bekletilir (pencere sürükleme, klavye, döndürme sırasında sürekli yeniden çizim olmasın).
  Kaydırma dinleyicisi düzeni ref'ten okur; `overflow-anchor: none` tarayıcının konumu oynatmasını engeller.
- Yeni ölçekte tuval hazır olunca eskisiyle değiştirilir: yakınlaştırırken sayfa boş görünmez.
- Metin katmanı pdf.js `TextLayer`; CSS'i paketten alınmaz, `pdfView.css` içinde özü var.
  Değişkenler (`--scale-factor`, `--total-scale-factor`) sayfa öğesine yazılır.

## Çizim yeri ve kalınan yer (K5)
- Çizim = sayfa + sayfaya göre 0..1 dikdörtgenler. Seçimin `getClientRects()` kutuları sayfa
  kutusuna göre orana çevrilir, aynı satırdakiler birleşir; birden çok sayfaya taşan seçimde en
  çok alan düşen sayfa alınır; alıntı metni de o sayfayla sınırlanır. Ölçek değişse de oran aynıdır.
- Çizimler tuvalin üstünde ayrı katmanda (`mix-blend-mode: multiply`; koyu temada `screen`);
  metin katmanı en üstte kalır, seçim engellenmez. Çizime dokunma, tıklanan nokta çizim
  kutularıyla karşılaştırılarak bulunur.
- Kalınan yer = ekranın üst kenarındaki sayfa + o sayfanın geçilen oranı. Yazı boyutu ya da
  pencere değişince bu yere geri kaydırılır. Kabuk kaydı geciktirir.
- Hedefe gitme: çizim ekranın üst dörtte birine getirilir ve kısa süre yanıp söner.

## Tema
- Koyu: tuvale `invert + hue-rotate` (resimler de döner; bilinen sınır). Sepya: `sepia` filtresi.

## Kapak ve bilgi
- Açılıştan ~0,6 sn sonra 1. sayfa 300 px genişlikte JPEG kapak olarak çizilir; başlık/yazar
  PDF bilgisinden alınır ("Microsoft Word - x.docx", "untitled" gibi anlamsızlar elenir).
  Kabuk kapağı yalnız yoksa yazar. Ana hatlar (outline) varsa içindekiler olarak bildirilir.

## Bilinen sınırlar
- CMap ve standart yazı tipi verisi paketlenmedi: gömülü yazı tipi olmayan bazı Çince/Japonca
  PDF'lerde metin eksik çıkabilir. JPEG 2000 resimleri için wasm çözücü yolu verilmedi.
- Parolalı PDF açılmaz (ayrı mesaj). Dokunmatik seçim ve renk menüsü cihazda denenmeli.
- Tauri `.mjs` dosyasını `text/javascript` olarak sunar (tauri-utils mime_type), çalışan modül olarak yüklenir.

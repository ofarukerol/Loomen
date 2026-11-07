---
title: Kütüphane — EPUB okuyucu
tags: [kütüphane, epub, okuyucu]
updated: 2026-11-07
kart: LOM-83
---

# Loomen — Kütüphane: EPUB okuyucu (LOM-83)

Kütüphane kabuğunun ([[kutuphane]]) EPUB görüntüleyicisi. **Dış paket yok**: ZIP açma, inflate,
kitap yapısı ve çizim yeri hesabı uygulamanın kendi kodu. Kabuk dosyayı okur, çizim menüsünü,
not penceresini ve kayıtları yönetir; bu parça bölümü gösterir, seçimi çizim yerine çevirir,
kalınan yeri bildirir. Sözleşme: `src/screens/Library/readerTypes.ts`. PDF eşi: [[kutuphane-pdf]].

## Dosyalar
- `src/core/library/zip.ts` — ZIP merkez dizini (ZIP64 dahil) + saf inflate (stored/sabit/dinamik
  Huffman). macOS 11 WebKit'te `DecompressionStream` olmadığı için kendi inflate'imiz var.
  Korumalar: girdi başına 512 MB sınırı, beklenen boyut ve CRC denetimi, şifreli girdi açılmaz,
  `..`/mutlak yollu girdi atlanır. Testi `zipTest.ts` (çıktı node zlib ile karşılaştırılır, bozuk
  akışta yalnız `ZipError`).
- `src/core/library/epub.ts` — hoşgörülü küçük XML ayrıştırıcı, `container.xml` → OPF → manifest,
  spine, başlık/yazar (aut rolü, EPUB3 refines), kapak, içindekiler (EPUB3 nav, yoksa NCX), DRM
  denetimi, yol çözme ve kitap CSS'ini kapsamlayan `scopeCss`. Testi `epubTest.ts`.
- `src/core/library/epubAnchor.ts` — saf (DOM'suz) konum hesapları: düğüm başlangıçları, konum →
  düğüm, çizim parçaları, seçim kırpma, alıntıyla yeniden bulma.
- `src/screens/Library/views/EpubView.tsx` + `epubView.css` — görüntüleyici.

## Çizim yeri (K5)
- `EpubAnchor {spine, href, start, end}`: bölümün **temizlenmiş** gövdesindeki bütün metin
  düğümleri art arda eklendiğinde oluşan düz metinde `[start, end)` aralığı. Yazı boyutu, tema,
  pencere genişliği bu metni değiştirmez; çizim yerinde kalır. `<mark>` ile sarmak yalnız düğümü
  böler, metni değiştirmez.
- Boyarken aralıktaki metin alıntıyla (`cleanQuote`) karşılaştırılır; tutmazsa alıntı bölümde
  aranır, eski başlangıca en yakın eşleşme alınır (`relocateRange`). Bulunamazsa çizim boyanmaz
  ama listede ve notta kalır.
- **Dikkat:** temizleme kuralını (atılan öğe listesi) değiştirmek metni ve dolayısıyla eski
  çizimlerin ofsetini kaydırabilir; alıntıyla yeniden bulma bunu çoğunlukla kurtarır, yine de
  kuralı gereksiz değiştirme.
- Kalınan yer `{kind:"epub", spine, href, offset}`: ekranın üstündeki ilk metnin bölüm ofseti
  (`caretPositionFromPoint`/`caretRangeFromPoint`). Bulunamazsa kaydırma kesrinden tahmin.
  İlerleme bölüm boyutlarıyla ağırlıklı (`epubProgress`).

## Bölüm nasıl gösterilir
- Bölüm XHTML `DOMParser` ile açılır (bozuksa HTML ayrıştırıcısı). **Temizlik ayrıştırılmış
  belgede yapılır**, sonra uygulamanın belgesine aktarılır (aktarınca resimler hemen yüklenir).
- Atılan öğeler: script, style, link, meta, base, iframe/frame, object/embed, form ve form
  öğeleri, noscript, template, audio/video, SVG foreignObject ve animasyon öğeleri. Yorumlar atılır,
  CDATA düz metne döner.
- Atılan öznitelikler: `on*`, srcset, action/formaction/ping, contenteditable, `javascript:` değerli
  her şey. `id` → `data-epub-id` (uygulama kimlikleriyle çakışmasın).
- Resimler ve CSS `url()` arşivden `blob:` adresine çevrilir (CSP `img-src blob: data:`); çözülemeyen
  adres atılır. Dış bağlantılar tıklanmaz (adres başlıkta görünür); iç bağlantılar bölüme/parçaya
  gider.
- Kitap CSS'i `.lo-epub__body` içine kapsamlanır; html/body/:root seçicileri kabın kendisine
  döner. @import, @font-face, @page, @keyframes, sabit/yapışkan konum atılır. px/pt/rem yazı
  boyutu ve satır aralığı `--lo-epub-scale` ile çarpılır; böylece yazı boyutu ayarı kitabın sabit
  boyutlarında da işler.
- Shadow DOM kullanılmadı: WebKit'te seçim gölge ağaca girmiyor.

## Tema, gezinme
- Renkler kabuğun `--rd-bg`/`--rd-fg` değişkenlerinden. Koyu ve sepya temada kitabın sabit yazı ve
  zemin renkleri bastırılır (çizim işaretleri hariç).
- Üst çubuk: içindekiler düğmesi, bölüm adı, "n / toplam", önceki/sonraki. Bölüm sonunda da
  önceki/sonraki düğmesi. Kabuk `onToc` vermiyor; içindekiler çekmecesi görüntüleyicinin kendi
  içinde (Esc kapatır). İçindekiler yoksa "Bölüm N" listesi.
- Sağdan sola: OPF `page-progression-direction="rtl"` ya da dil ar/he/fa/ur.

## Çeviri anahtarları
Görüntüleyici `t(anahtar, Türkçe varsayılan)` kullanır. `tr/en/ar` dosyalarına eklenmesi gereken
anahtarlar (`library.epub.*`): `drm`, `notEpub`, `chapterError`, `toc`, `prev`, `next`.
Var olanlardan: `library.loading`, `library.close`, `library.note.section`.

## Sınırlar
- Kitap yazı tipleri yüklenmez (CSP `font-src` blob: vermiyor); uygulamanın serif yığını kullanılır.
- DRM'li kitap açılmaz ("Bu kitap DRM ile korunuyor"); yalnız yazı tipi gizleme (IDPF/Adobe) kabul.
- Sayfa çevirme yok, bölüm içinde dikey kaydırma. Ses/video, betik, form gösterilmez.
- Kitap dosyası hiç değiştirilmez.
- Görüntüleyici gerçek pencerede (Mac WebKit, Windows WebView2) elle denenmeli: seçim, çizim,
  yazı boyutu değişince yerin korunması, bağlantıdan çizime atlama.

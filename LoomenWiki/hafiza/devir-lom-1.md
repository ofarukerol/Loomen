---
name: LOM-1 — Not Kısmı
description: Not editöründe tablo/gömülü blok altına imlecin gidememesi ve okuma sırasında bulunan diğer kararsızlıklar (imlecin gizli tablo kaynağına girmesi, tıklama kayması, not değiştirirken son yazılanın kaybolması, resimlerin hiç gösterilmemesi) düzeltilecek ve editör mantığı için node testleri eklenecek.
type: project
proje: loomen
kaynak: kart LOM-1 · dal fix/LOM-1 · Loomen@23eff9be78824887d831e779dfbc7d3d1d32bd27 · test koşusu f2aeabe5-bea1-4c21-92eb-b253857d92fe (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-09-18
---

# LOM-1 — Not Kısmı

## Ne yapıldı

Not editöründe tablo/gömülü blok altına imlecin gidememesi ve okuma sırasında bulunan diğer kararsızlıklar (imlecin gizli tablo kaynağına girmesi, tıklama kayması, not değiştirirken son yazılanın kaybolması, resimlerin hiç gösterilmemesi) düzeltilecek ve editör mantığı için node testleri eklenecek.

## Adımlar

- KÖK NEDEN (imleç): tableWidget.ts tabloyu block replace dekorasyonuyla gösteriyor. Tablo (veya ses embed'i) belgenin SON satırıysa altında gidilecek satır yok; alt boşluğa tıklayınca imleç belge sonuna = gizlenen aralığın içine düşüyor ve görünmüyor. Ayrıca tableField atomicRanges sağlamıyor, ok tuşlarıyla imleç gizli tablo kaynağına girip kayboluyor ve yazılan metin tabloyu bozuyor.
- Düzeltme 1: Belge bir blok widget'la (tablo / ses / resim) bitiyorsa altında her zaman boş bir satır bulunmasını garanti et (CodeMirrorEditor açılışında ve docChanged sonrası tek seferlik ekleme; sonsuz döngüye girmeyecek şekilde). Tablonun son satırındayken ArrowDown/Enter ve alt boşluğa tıklama imleci tablonun altındaki satıra götürsün.
- Düzeltme 2: tableField için EditorView.atomicRanges sağla; imleç tablo aralığının içine hiç giremesin, üstünden/altından atlasın. Backspace/Delete tablonun hemen altındaki boş satırda tabloyu sessizce bozmasın.
- Düzeltme 3: .cm-tablewrap üzerindeki margin'i padding'e çevir (dosyadaki kendi notu: margin CM yükseklik ölçümünü bozar, tıklama isabeti kayar). .cm-audioembed ve yeni resim widget'ında da margin kullanılmasın.
- Düzeltme 4: Tablo algılama kod bloğu (```) içindeki '|' satırlarını tablo sanmasın (buildTables + tableBlockRange içinde fence takibi). Saf tablo mantığını (splitTableRow, isSeparator, pipePositions, blok aralığı, hücre aralığı) DOM'suz test edilebilsin diye tableModel.ts'e taşı.
- Düzeltme 5: editorCommands.insertBlock — imleç bir tablo satırındaysa/ dolu paragraftaysa bloğu tablonun ORTASINA ya da metne yapışık eklemesin: blok sonuna git, önce ve sonra boş satır bırak, imleci eklenen bloğun ALTINDAKİ boş satıra koy (belge sonunda da satır oluştur).
- Düzeltme 6: Hücre düzenleme (editCell) sağlamlaştır: kaydırmada yüzen input yanlış yerde kalmasın (scroll'da kaydet-kapat), view yok edildikten sonra blur gelirse dispatch etme, yapıştırılan metindeki satır sonlarını boşluğa çevir, Tab/Shift+Tab ile komşu hücreye geç. colWidths anahtarı notlar arası çakışmasın (editör kurulurken temizle).
- Düzeltme 7 (VERİ KAYBI): EditorScreen 700 ms debounce ile kaydediyor; openNote / setActiveTab / closeTab draft'ı kaydetmeden eziyor → hızlı not değiştirince son yazılanlar kayboluyor. Store'da bu üç eylemden önce bekleyen taslağı yaz (mevcut güvenlik kuralları korunarak: draftPath === activeNote ve içerik farklıysa). EditorScreen unmount'unda ve pencere blur/visibilitychange'de de flush et. NOT: useAppStore.ts'de kaydedilmemiş yerel değişiklik var; yalnız ilgili eylemlere dokun, diğer farkları koru.
- Düzeltme 8 (resim): Şu an resim ne düzenleme ne okuma modunda gösteriliyor (kodda hiç img yok). ![[x.png|jpg|jpeg|gif|webp|svg]] ve ![alt](göreli/yol) satırlarını backend.readBinary + blob URL ile gösteren ImageEmbed bileşeni ekle; livePreview'da aktif satır dışında widget olarak, Markdown.tsx'te okuma modunda kullan. Yüklenemeyen resimde ham metin/uyarı göster, yükseklik sabit min değerle gelsin ki yükleme sonrası imleç isabeti kaymasın (yüklenince view.requestMeasure). Panodan resim yapıştırma: mevcut writeBinary ile 'Ekler/' altına kaydedip embed satırı ekle (yeni bağımlılık YOK).
- Test: mevcut desenle (esbuild + node, bkz src/core/__test__/srsTest.ts) src/core/__test__/editorTest.ts yaz: tablo ayrıştırma/kaçışlı boru/kod bloğu içi tablo, hücre aralığı, satır-sütun ekleme sonrası kaynak, belge sonu tablo → alt satır garantisi, atomik aralıkta imleç, insertBlock senaryoları (boş not, belge sonu, tablo içi imleç, art arda iki tablo), firstSectionCaret uçları (boş belge, başlıksız, sondaki başlık), audioInsertion. Hepsi @codemirror/state ile DOM'suz koşar.
- Doğrulama: testleri koş, `npx tsc --noEmit` ve `npm run build` temiz geçsin; sonuç raporuna test çıktısını, düzeltilen ve kalan (elle denenmesi gereken: gerçek tıklama/kaydırma davranışı, mobil) maddeleri yaz. Push yok, bağımlılık ekleme yok.

## Dokunulan dosyalar

- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/screens/Editor/tableModel.ts`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/screens/Editor/editorCommands.ts`
- `Loomen/src/screens/Editor/noteCaret.ts`
- `Loomen/src/screens/Editor/livePreview.ts`
- `Loomen/src/screens/Editor/ImageEmbed.tsx`
- `Loomen/src/screens/Editor/Markdown.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/screens/Editor/EditorScreen.tsx`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/core/__test__/editorTest.ts`

## Test

Testler geçti.

> Sabit test kopyasında editör testleri, TypeScript denetimi ve derleme geçti. Derlemede yalnız paket boyutu ve içe aktarma uyarıları var. Kaynaklar değişmedi. Gerçek tıklama/kaydırma, resim yapıştırma, taslak kaydı ve mobil davranış doğrulanmadı. Kopyanın dalı main görünüyor; dal değiştirilmedi.

## Kanıt

- Dal: `fix/LOM-1`
- Commit: `Loomen@23eff9be78824887d831e779dfbc7d3d1d32bd27`
- Test koşusu: `f2aeabe5-bea1-4c21-92eb-b253857d92fe` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

---
name: LOM-98 — Tabloda biçim çubuğu: ortala, kalın ve benzeri
description: Tablo hücre kutusunun altına küçük bir biçim çubuğu eklenir (Hücre/Satır/Sütun kapsamı; sola/ortaya/sağa, kalın, italik); sütun hizası standart Markdown ayraç satırına, satır/hücre biçimi ile kalın/italik tablonun altındaki gizli not satırına yazılır ve düzenleme ile okuma modunda uygulanır.
type: project
proje: loomen
kaynak: kart LOM-98 · dal fix/LOM-98 · Loomen@f63c42a3d9b1fbfc7d120327e8b7a55510dc5a12 · test koşusu ef47b1af-fa8a-4a99-9f62-86fc9e7930a1 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-09
---

# LOM-98 — Tabloda biçim çubuğu: ortala, kalın ve benzeri

## Ne yapıldı

Tablo hücre kutusunun altına küçük bir biçim çubuğu eklenir (Hücre/Satır/Sütun kapsamı; sola/ortaya/sağa, kalın, italik); sütun hizası standart Markdown ayraç satırına, satır/hücre biçimi ile kalın/italik tablonun altındaki gizli not satırına yazılır ve düzenleme ile okuma modunda uygulanır.

## Adımlar

- Önce dalı doğrula (fix/LOM-98) ve şu dosyaları oku: src/core/markdown/tableMeta.ts, src/screens/Editor/tableModel.ts, src/screens/Editor/tableWidget.ts (openCellEditor 165-553, applyMove 605-631, mkCell 750-819), src/screens/Editor/Markdown.tsx (160-227), src/screens/Editor/CodeMirrorEditor.tsx (90-207), src/styles/app.css (887-1038), src/core/__test__/tableCurrencyTest.ts. Aşağıdaki adları oradaki gerçek adlara uydur.
- Yeni saf modül src/core/markdown/tableStyle.ts (DOM, i18n, CodeMirror bilmez; tableModel'i içe AKTARMA, kendi boru bölme yardımcısını yaz, `\|` kaçışına saygı duy): `type Align = "left"|"center"|"right"`; `interface CellStyle { align?: Align; bold?: boolean; italic?: boolean }`; `type StyleTarget = {kind:"col";col} | {kind:"row";row} | {kind:"cell";row;col}` (row 0-tabanlı gövde indeksi, -1 = başlık; cellLineIndex ile aynı). Anahtar metni formül diliyle aynı: `styleKey(t)` → sütun "B", satır "2" (başlık 1, ilk gövde satırı 2 → sayı = row+2), hücre "B2"; `parseStyleKey(s)` tersi (geçersizse null). Özellik belirteçleri virgülle: sol|orta|sag|kalin|-kalin|italik|-italik; `parseStyleFlags(s): CellStyle|null`, `serializeStyleFlags(st): string|null` (boşsa null). Ayraç satırı: `parseSeparatorAlign(sepLine): (Align|null)[]` (`:--:` orta, `:--` sol, `--:` sağ, `---` null) ve `setSeparatorAlign(sepLine, col, align|null): string` (yalnız o hücrenin ham metnini `:---:`/`:---`/`---:`/`---` yapar, girinti ve diğer hücreler aynen; sütun yoksa girdi aynen). Çözümleme: `effectiveCellStyle(colAlign, meta, row, col): { align: Align|null; bold: boolean; italic: boolean }` → align = hücre ?? satır ?? ayraç sütunu ?? null; bold = hücre ?? satır ?? sütun ?? false; italic aynı. `styleClasses(eff): string[]` → is-align-left|is-align-center|is-align-right, is-bold, is-italic (iki modda ortak). Uygulama: `applyFormat({ meta, colAlign, target, action })` → `{ meta: TableMeta; colAlign }`; action `{type:"align", align}` | `{type:"bold"}` | `{type:"italic"}`. Kurallar: sütun + hizalama → yalnız colAlign değişir (not satırına yazılmaz), aynı hizaya ikinci tıklama ayarı kaldırır (null); satır/hücre + hizalama → hedefin align'ı set edilir, aynı değere ikinci tıklama kaldırır; kalın/italik → hedef için yeni değer = !etkin değer (hücrede etkin = hücre ?? satır ?? sütun ?? false; satır ve sütunda etkin = kendi ?? false); yeni değer kalıtılan değere eşitse anahtar silinir (temiz dosya), değilse açıkça yazılır (-kalin ile satır kalınken tek hücre düz kalabilir). Girdi nesneleri değişmez.
- src/core/markdown/tableMeta.ts: `TableMeta`ya isteğe bağlı `style?: Record<string, CellStyle>` ekle (anahtar styleKey; eski testlerdeki `{ currency: {...} }` sabitleri derlenmeye devam etsin). parseTableMeta'yı bölüm tabanlı yaz: `para` bölümünde eski sütun=KOD okuma AYNEN, yeni `bicim` bölümünde `<anahtar>=<belirteçler>` (parseStyleKey + parseStyleFlags; tanınmayan parça yok sayılır). serializeTableMeta: önce `para ...` (eski çıktıyla birebir aynı), sonra varsa ` bicim B=kalin 2=orta,italik B2=sag`; ikisi de boşsa null (mevcut `<!-- loomen: para B=TRY D=USD -->` ve null testleri değişmeden geçmeli). Yeni: `setTargetStyle(meta, target, style)` (boş stilde anahtar silinir), `targetStyle(meta, target): CellStyle`. moveMetaColumn'u sütun ve hücre anahtarlarını da taşıyacak şekilde genişlet (currency ile aynı kaydırma; satır anahtarları aynen); yeni `moveMetaRow(meta, from, to, rows?)` satır ve hücre anahtarlarını gövde indeksine göre taşır (moveTableRow anlamı), sınır dışı aynen. emptyTableMeta style'ı boş nesne verebilir ama serialize/karşılaştırma `style ?? {}` ile çalışsın.
- src/screens/Editor/tableModel.ts: `TableBlock`a `align: (Align|null)[]` ekle (findTables'ta `parseSeparatorAlign(lines[i+1])`, başlık sayısına null ile tamamla/kırp). moveTableColumn ayraç hücrelerini zaten taşıdığından hiza sütunla gider; başka değişiklik yok.
- src/screens/Editor/tableWidget.ts: (a) TableWidget yapıcısına `align` ekle, eq() karşılaştırmasına JSON.stringify(align) kat; buildTables yeni alanı geçsin. (b) mkCell: `effectiveCellStyle(this.align, this.meta, row, col)` ile styleClasses sınıflarını th/td'ye ekle (textContent/dataset.raw satırlarına dokunma; tableFormulaTest ve tableWrapTest kaynaktan arıyor). (c) applyMove: sütun ekseninde genişletilmiş moveMetaColumn'u, satır ekseninde moveMetaRow'u kullanarak not satırı değişikliğini AYNI changes dizisine ekle; tek dispatch kalsın. (d) Yeni `writeTableFormat(view, headerFrom, target, action)`: tableBlockFrom ile bloğu bul, applyFormat çalıştır, not satırı metnini serializeTableMeta ile (LOM-89 writeTableMeta mantığı: var/yok/sil), colAlign değiştiyse ayraç satırını (headerLine+1) setSeparatorAlign ile üret; hepsini tek dispatch'te uygula. (e) openCellEditor: mevcut para birimi şeridini tek bir yüzen kapsayıcıya (`.cm-table-strip`, body'de fixed, placeStrip aynı konumlama, flex-wrap) taşı: üstte HER hücre için biçim satırı `.cm-table-format` (kapsam düğmeleri Hücre/Satır/Sütun → modül düzeyinde `lastFormatScope` oturum boyunca hatırlanır, varsayılan Hücre; sonra sola/ortaya/sağa (inline SVG), K/B kalın, İ/I italik düğmeleri, aria-label i18n), altta yalnız başlıkta (row === -1) eski para birimi satırı. Düğmelerin basılı (is-active, aria-pressed) durumu seçili kapsamdaki hedefin etkin stiline göre çizilir ve kapsam değişince yeniden çizilir. Olay kalıbı para birimi düğmeleriyle aynı (pointerdown preventDefault+stopPropagation, fare hemen, dokunmatikte createTapTracker ile kalkınca; mousedown preventDefault). Seçince: `finish(true, false)` → `writeTableFormat(...)` → requestAnimationFrame ile aynı hücreyi `[data-table-from][data-row][data-col]` ile yeniden bul ve openCellEditor'ı yeniden aç (moveTo kalıbı; bulunamazsa view.focus()). cleanup kapsayıcıyı kaldırır; mevcut Enter/Escape/Tab/öneri akışına dokunma.
- src/screens/Editor/CodeMirrorEditor.tsx teması: `.cm-table td.cm-table__currency` kuralının ALTINA ekle: `.cm-table th.is-align-left, .cm-table td.is-align-left` textAlign start; `.is-align-center` center; `.is-align-right` end; `.is-bold` fontWeight 700; `.is-italic` fontStyle italic. Mevcut colgrip/rowgrip/formula/currency kurallarına dokunma.
- src/screens/Editor/Markdown.tsx (okuma modu): ayraç satırını atlamadan önce `parseSeparatorAlign(lines[i+1])` ile sütun hizalarını al; meta zaten okunuyor. th ve her td çizilirken `effectiveCellStyle(align, meta, ri (başlık -1), ci)` → styleClasses sınıflarını className'e ekle (formül ve para birimi hücrelerinde mevcut sınıfların yanına). app.css: `.lo-table td.lo-table__currency` kuralının ALTINA `.lo-table th.is-align-left, .lo-table td.is-align-left { text-align: start }`, center, end, `.is-bold { font-weight: 700 }`, `.is-italic { font-style: italic }`; biçim şeridi stilleri `.cm-table-strip` (fixed, z-index 1001, bg-elev, kenarlık, radius, flex-direction column, gap), `.cm-table-format` (flex, flex-wrap, gap 4px), `.cm-table-format__scope` ve `.cm-table-format__btn` (cm-table-currency__opt ile aynı ölçüler, is-active accent), mobilde `.lo-app.is-mobile` büyük dokunma alanı. Mevcut `.cm-table-currency*` sınıf adları kalsın (tableCurrencyTest arıyor).
- Çeviri src/i18n/locales/{tr,en,ar}/translation.json: yeni `tableFormat` nesnesi: label (Biçim/Format), scopeCell (Hücre/Cell), scopeRow (Satır/Row), scopeColumn (Sütun/Column), alignLeft (Sola yasla/Align left), alignCenter (Ortala/Center), alignRight (Sağa yasla/Align right), bold (Kalın/Bold), italic (İtalik/Italic); Arapça karşılıkları dolu.
- Yeni test src/core/__test__/tableFormatTest.ts (check/read kalıbı) ve scripts/run-tests.mjs listesine tableCurrencyTest'in altına ekle. Kontroller: styleKey/parseStyleKey gidiş-dönüş (B, 2, B2, AA3; başlık satırı 1); parseStyleFlags/serializeStyleFlags; parseTableMeta `<!-- loomen: para B=TRY bicim B=kalin 2=orta,italik B2=sag,-kalin -->` → currency ve style doğru, serialize aynı metni üretir; yalnız para olan satır eski çıktıyla birebir aynı; yalnız bicim olan satırda `para` yazılmaz; ikisi boşsa null; eski sürüm uyumu: bilinmeyen belirteç yok sayılır. parseSeparatorAlign(`| :--: | --- | --: | :-- |`) → center,null,right,left; setSeparatorAlign girinti ve diğer hücreleri korur, aynı hizaya null ile `---` döner. effectiveCellStyle öncelik: hücre > satır > sütun; satır kalınken hücre -kalin düz. applyFormat: sütun ortala → colAlign değişir, meta değişmez; ikinci tıklama kaldırır; satır kalın → anahtar "2" kalin; o satırda hücreye kalın tıklayınca -kalin yazılır; kalıtılana eşitse anahtar silinir. moveMetaColumn hücre ve sütun anahtarlarını taşır (B→D), moveMetaRow satır ve hücre anahtarlarını taşır (2↔3), sınır dışı aynen; findTables ayraç `:--:` ile align dolu ve tablo hâlâ tanınır. Kaynak denetimi: tableWidget.ts `effectiveCellStyle(`, `cm-table-format`, `writeTableFormat(`, `moveMetaRow(` içerir; Markdown.tsx `parseSeparatorAlign(` ve `styleClasses(` içerir; CodeMirrorEditor.tsx ve app.css `is-align-center` ile `is-bold` kurallarını currency kuralından SONRA içerir; üç dilde `tableFormat` anahtarları; run-tests.mjs'de kayıtlı.
- LoomenWiki/modules/mimari.md 'Sütun para birimi (LOM-89)' maddesinin altına 'Tabloda biçim (LOM-98)' maddesi: hücre kutusunun altındaki şerit, kapsam Hücre/Satır/Sütun; sütun hizası GFM ayraç satırında (`:---:`), satır/hücre hizası ile kalın/italik not satırının `bicim` bölümünde (`B=kalin 2=orta B2=sag,-kalin`, satır 1 başlık); öncelik hücre > satır > sütun; kod `src/core/markdown/tableStyle.ts`, test `tableFormatTest.ts`.
- Depo kökünde `npm run typecheck` ve `npm test` koş; ikisi de yeşil olmalı (tableFormatTest, tableCurrencyTest, tableFormulaTest, tableMoveTest, tableWrapTest, editorTest dahil). Kanıt satırlarını sonuç raporuna yaz. fix/LOM-98 dalında AI imzasız commit at.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/tableStyle.ts`
- `Loomen/src/core/markdown/tableMeta.ts`
- `Loomen/src/screens/Editor/tableModel.ts`
- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/screens/Editor/Markdown.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/tableFormatTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi hatasız bitti. npm test'te 63 test dosyasının hepsi geçti. Yeni biçim testi (tableFormatTest) ve eski para birimi testi (tableCurrencyTest, 69/69) geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-98`
- Commit: `Loomen@f63c42a3d9b1fbfc7d120327e8b7a55510dc5a12`
- Test koşusu: `ef47b1af-fa8a-4a99-9f62-86fc9e7930a1` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

---
name: LOM-89 — Tabloda sütun için para birimi seçilsin
description: Tabloda sütun başına para birimi (₺, $, €, £) seçilir; seçim tablonun hemen altındaki gizli bir not satırında dosyayla birlikte saklanır, sayılar ve formül sonuçları düzenleme ve okuma modunda "212.500 ₺" gibi gösterilir, dosyadaki sayılar değişmez.
type: project
proje: loomen
kaynak: kart LOM-89 · dal fix/LOM-89 · Loomen@4d2cb97cec5b07579a1175151947736cf3249bc9 · test koşusu e8d3ba9d-953d-4c24-baa4-03343e428a4f (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-07
---

# LOM-89 — Tabloda sütun için para birimi seçilsin

## Ne yapıldı

Tabloda sütun başına para birimi (₺, $, €, £) seçilir; seçim tablonun hemen altındaki gizli bir not satırında dosyayla birlikte saklanır, sayılar ve formül sonuçları düzenleme ve okuma modunda "212.500 ₺" gibi gösterilir, dosyadaki sayılar değişmez.

## Adımlar

- Önce dalı doğrula: çalışma ağacı analiz sırasında main'deydi; fix/LOM-89 dalında olduğundan emin ol. Dokunacağın dosyaları (tableModel.ts, tableWidget.ts, Markdown.tsx, tableFormula.ts) oku; aşağıdaki adımları oradaki gerçek adlara uydur.
- Yeni saf modül src/core/markdown/tableMeta.ts (DOM, i18n, CodeMirror bilmez): (a) Saklama biçimi tablonun HEMEN altındaki tek satır HTML yorumu: `<!-- loomen: para B=TRY D=USD -->`; anahtar sütun harfi (A, B, … AA; formül diliyle aynı), değer ISO kodu. Dışa aç: isTableMetaLine(line), parseTableMeta(line) → { currency: Map<number, string> } | null (bozuk/boş satırda null), serializeTableMeta(meta) → string | null (hiç seçim yoksa null = satır silinir), setColumnCurrency(meta|null, col, code|null) → yeni meta|null, moveMetaColumn(meta, from, to) (tableModel.moveItem mantığıyla harf anahtarlarını yeni sıraya taşır). (b) Para listesi CURRENCIES: TRY ₺, USD $, EUR €, GBP £ (code, symbol, labelKey 'tableCurrency.TRY' vb.). (c) formatCurrency(value, code, locale) = formatFormulaResult(value, locale) + ' ' + simge ('212.500 ₺'); bilinmeyen kodda yalnız sayı. (d) formatCellDisplay(raw, code, locale): parseLocalizedNumber(raw) sayıysa formatCurrency, değilse raw aynen (metin/boş hücre bozulmaz). tableFormula.ts'ten parseLocalizedNumber ve formatFormulaResult içe aktar; tableFormula.ts'te parseLocalizedNumber'ın simge temizleyen düzenli ifadesine £ ekle (tek karakter), başka değişiklik yapma.
- src/screens/Editor/tableModel.ts: TableBlock'a `metaLine: number | null` ve `meta: TableMeta | null` ekle. findTables: gövde satırları bittikten sonra bir sonraki satır (çit dışında) isTableMetaLine ise metaLine=j ve meta=parseTableMeta, i=j+1; aksi halde null. endLine ESKİSİ GİBİ son tablo satırı kalır (satır/sütun taşıma, hücre yazma, addRow buna dayanıyor). tableContaining metaLine'ı da tabloya saysın; needsTrailingBlankLine belge meta satırıyla bitiyorsa da true dönsün. Yeni yardımcı tableVisibleEnd(block) = metaLine ?? endLine. editorCommands.ts computeBlockInsert'te `end = inTable.endLine` yerine metaLine ?? endLine kullan (eklenen blok tablo ile not satırının arasına girmesin).
- src/screens/Editor/CodeMirrorEditor.tsx trailingBlankLine süzgecindeki ucuz ön elemeye son satırın `<!--` ile başlaması durumunu ekle (yoksa meta satırıyla biten belgeye alt boş satır eklenmez, imleç gidecek yer bulamaz). Temaya ekle: `.cm-table td.cm-table__currency` (textAlign end, fontVariantNumeric tabular-nums, whiteSpace nowrap), `.cm-table__curbadge` (başlıkta küçük soluk simge: fontSize 11px, color var(--fg3), marginInlineStart 6px, fontWeight 400). Mevcut cm-table__colgrip/rowgrip/formula kurallarına dokunma (tableMoveTest ve tableWrapTest bunları kaynaktan okur).
- src/screens/Editor/tableWidget.ts: (a) TableWidget yapıcısına `meta: TableMeta | null` ekle, eq() karşılaştırmasına serializeTableMeta(meta) kat; buildTables dekorasyonun `to`sunu metaLine ?? endLine satırının sonuna uzat (meta satırı gizlenir). Backspace koruyucusunda `t.endLine === prev.number - 1` yerine (t.metaLine ?? t.endLine) kullan. (b) mkCell: sütunun para kodu varsa (meta.currency.get(col)) gövde hücresinde formül sonucunu formatCurrency ile, formül olmayan sayı hücresini formatCellDisplay ile göster ve `cm-table__currency` sınıfı ekle; `el.dataset.raw = text` satırı AYNEN kalsın (tableFormulaTest bunu kaynaktan arar), düzenleme kutusu ham metni göstermeye devam eder. Başlık hücresine para varsa `span.cm-table__curbadge` ile simgeyi ekle (textContent'ten SONRA appendChild; headerTexts dataset.raw okuduğu için ad bozulmaz). (c) Yeni yardımcı writeTableMeta(view, headerFrom, nextMeta): tableBlockAt ile bloğu bul; metaLine varsa o satırı serializeTableMeta ile değiştir (null ise satırı önündeki \n ile birlikte sil), yoksa endLine satırının sonuna '\n' + metin ekle; tek dispatch. (d) openCellEditor'da row === -1 ise textarea'nın altında `.cm-table-currency` şeridi aç (document.body'de, suggest gibi fixed; placeSuggest benzeri konumlama): seçenekler 'Yok' + CURRENCIES (simge ve i18n adı), mevcut olan is-active. Öğelerde pointerdown preventDefault + stopPropagation (blur kapatmasın; suggest öğeleriyle aynı kalıp, dokunmatikte createTapTracker ile kısa dokunuşta seç). Seçilince önce finish(true, false) (başlık metni kaydedilir), sonra writeTableMeta(view, headerFrom, setColumnCurrency(meta, col, code)) ve view.focus(). cleanup() şeridi de kaldırsın; öneri listesi açılırsa şerit gizlensin. Mevcut keydown/Enter/Escape/Tab akışına dokunma. (e) applyMove sütun ekseninde: meta varsa aynı dispatch'in changes dizisine meta satırının yeni metnini (moveMetaColumn ile) ekle; `dispatch(` çağrısı bir tane kalsın (tableMoveTest sayar). addCol sona eklediği için meta değişmez.
- src/screens/Editor/Markdown.tsx (okuma modu, kendi ayrıştırıcısı var): gövde satırları döngüsünden sonra `lines[i]` isTableMetaLine ise parseTableMeta ile oku ve i++ (satır çizilmez). Hücre çizerken sütunun para kodu varsa formül sonucuna formatCurrency, formül olmayan hücreye formatCellDisplay uygula ve td'ye `lo-table__currency` sınıfı ekle; para yoksa eski davranış. app.css'e `.lo-table td.lo-table__currency { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }` ve `.cm-table-currency` şeridi stilleri (cm-table-suggest kurallarının altına: fixed, z-index 1001, bg-elev, kenarlık, radius, flex sarmalı; `.cm-table-currency__opt` min-height 36px, `.is-active` accent; `[hidden]` display none) ekle.
- Çeviri: src/i18n/locales/{tr,en,ar}/translation.json'a `tableCurrency` nesnesi: label ('Para birimi' / 'Currency' / Arapça), none ('Yok' / 'None'), TRY ('Türk lirası' / 'Turkish lira'), USD ('Dolar' / 'US dollar'), EUR ('Euro'), GBP ('Sterlin' / 'Pound sterling'); üç dilde dolu.
- Yeni test src/core/__test__/tableCurrencyTest.ts (mevcut testlerin check/read kalıbıyla) ve scripts/run-tests.mjs listesine ekle. Kontroller: parse/serialize gidiş dönüş (`<!-- loomen: para B=TRY D=USD -->`), bozuk satır ve boş meta → null, isTableMetaLine düz metinde false; findTables: meta satırlı tabloda metaLine dolu, endLine son satır, rows meta satırını içermez, araya boş satır girince meta sayılmaz, meta yoksa null; setColumnCurrency ekleme/değiştirme/kaldırma ve son seçim kalkınca null; moveMetaColumn B→A taşınınca anahtar A olur; formatCurrency(212500,'TRY','tr') === '212.500 ₺', (1500,'USD','en') === '1,500 $', (1234.5,'EUR','tr') === '1.234,5 €'; formatCellDisplay('212500'|'212.500','TRY','tr') → '212.500 ₺', 'abc' → 'abc', '' → ''; parseLocalizedNumber('£ 1.200') === 1200; needsTrailingBlankLine meta satırıyla biten belgede true; tableContaining meta satırında tabloyu bulur; computeBlockInsert tablo içindeyken meta satırının ALTINA ekler. Kaynak denetimi: tableWidget.ts 'cm-table__currency', 'cm-table__curbadge', 'cm-table-currency' ve 'formatCurrency(' içerir, applyMove'da tek dispatch; Markdown.tsx 'lo-table__currency' ve 'isTableMetaLine(' içerir; CodeMirrorEditor.tsx teması cm-table__currency kuralı; app.css lo-table__currency ve cm-table-currency kuralları; üç dilde tableCurrency anahtarları; run-tests.mjs'de test kayıtlı.
- LoomenWiki/modules/mimari.md 'Tabloda formül (LOM-79)' maddesinin altına 'Sütun para birimi (LOM-89)' maddesi: başlık kutusunda seçilir, tablonun altındaki gizli `<!-- loomen: para B=TRY -->` satırında saklanır, yalnız gösterim değişir, kod `src/core/markdown/tableMeta.ts`.
- Depo kökünde npm run typecheck ve npm test koş; ikisi de yeşil olmalı (tableCurrencyTest, tableFormulaTest, tableMoveTest, tableWrapTest, editorTest dahil). Kanıt satırlarını sonuç raporuna yaz. fix/LOM-89 dalında AI imzasız commit at.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/tableMeta.ts`
- `Loomen/src/core/markdown/tableFormula.ts`
- `Loomen/src/screens/Editor/tableModel.ts`
- `Loomen/src/screens/Editor/editorCommands.ts`
- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/screens/Editor/Markdown.tsx`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/tableCurrencyTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi temiz geçti. npm test içinde 42 test dosyasının hepsi geçti, yeni para birimi testi de dahil (69/69 kontrol). Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-89`
- Commit: `Loomen@4d2cb97cec5b07579a1175151947736cf3249bc9`
- Test koşusu: `e8d3ba9d-953d-4c24-baa4-03343e428a4f` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

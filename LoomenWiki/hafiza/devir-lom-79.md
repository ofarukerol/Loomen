---
name: LOM-79 — Tabloda Excel gibi formül
description: Loomen tablolarında "=" ile başlayan Excel benzeri formüller (hücre başvurusu, aynı satır kısaltması, sütun aralığı, TOPLA/SUM vb.) saf bir çekirdek modülünde hesaplanır; düzenleme ve okuma modunda sonuç gösterilir, tıklayınca formül açılır, dosyada yalnız formül metni kalır.
type: project
proje: loomen
kaynak: kart LOM-79 · dal fix/LOM-79 · Loomen@a2f65cb985576974ef6c28f039364022c0b56c41 · test koşusu d56f09fa-1e62-4111-a9d3-5c1d85cdb2fc (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-05
---

# LOM-79 — Tabloda Excel gibi formül

## Ne yapıldı

Loomen tablolarında "=" ile başlayan Excel benzeri formüller (hücre başvurusu, aynı satır kısaltması, sütun aralığı, TOPLA/SUM vb.) saf bir çekirdek modülünde hesaplanır; düzenleme ve okuma modunda sonuç gösterilir, tıklayınca formül açılır, dosyada yalnız formül metni kalır.

## Adımlar

- Loomen/src/core/markdown/tableFormula.ts adında saf (DOM'suz, i18n'siz, CodeMirror'suz) bir modül yaz. Dışa açılan API: `isFormulaCell(text)` (kırpılmış metin '=' ile başlıyor ve devamı var); `parseLocalizedNumber(text): number | null` (boşluk, '₺', 'TL', '$', '€' kırpılır; virgül varsa virgül ondalık ve noktalar binlik; virgül yoksa ve nokta(lar) tam 3 haneli gruplarla takip ediliyorsa binlik ('212.500'→212500, '1.500.000'→1500000), aksi halde ondalık ('1.5'→1.5); boş ya da sayı olmayan → null); `evaluateTable(header: string[], rows: string[][]): CellResult[][]` ve `formatFormulaResult(value: number, locale: string): string` (Intl.NumberFormat, maximumFractionDigits 2, geçersiz locale'de 'tr' yedeği). `CellResult = { formula: string | null; value: number | null; error: FormulaError | null }`, `FormulaError = 'syntax' | 'ref' | 'cycle' | 'div0' | 'value'`. Formül olmayan hücrede formula null.
- Aynı dosyada formül ayrıştırıcı (tokenizer + özyinelemeli iniş): sayı sabitleri de parseLocalizedNumber kuralıyla okunur; işleçler + - * / ^ ve tekli eksi, parantez; öncelik Excel gibi (^ > * / > + -). Hücre başvuruları Excel gibi: sütun harfi (A..Z, AA..) + satır numarası; satır 1 = başlık satırı, ilk gövde satırı 2 ('=B2-C2'). Satır numarası olmayan harf ('=B-C') formülün kendi satırını gösterir. Aralıklar 'B2:B9' ve tam sütun 'B:B' (bütün gövde satırları; formülün kendi hücresi hariç tutulur ki alt toplam satırı döngüye girmesin). Fonksiyonlar büyük/küçük harf duyarsız, Türkçe ve İngilizce adlarla: SUM/TOPLA, AVERAGE/ORTALAMA, MIN, MAX, COUNT/SAY, ROUND/YUVARLA, ABS. Argüman ayracı ';' her zaman; ',' iki rakam arasındaysa ondalık, değilse ayraç sayılır.
- Değerlendirme kuralları: başka bir formül hücresine başvuru o hücrenin sonucudur (memo + 'ziyaret ediliyor' kümesiyle döngü tespiti → 'cycle'); boş hücre doğrudan başvuruda 0; sayı olmayan metin doğrudan başvuruda 'value' hatası, aralık/fonksiyon içinde atlanır (Excel gibi); tablo dışı satır/sütun → 'ref'; sıfıra bölme → 'div0'; ayrıştırılamayan formül → 'syntax'. Hatalı hücre diğer hücreleri etkilemez; ona başvuran hücre de aynı hatayı taşır.
- Loomen/src/screens/Editor/tableWidget.ts: toDOM içinde `const results = evaluateTable(this.header, this.rows)` hesapla. mkCell'e gövde hücreleri için sonucu geçir: formül hücresinde `el.textContent` = formatFormulaResult(value, i18n.language) ya da hata durumunda i18n.t('tableFormula.errorLabel'); `el.dataset.raw` formül metni OLARAK KALIR (openCellEditor zaten dataset.raw'ı açar; böylece tıklayınca formül görünür, kayıt yine cellSourceText ile kaynağa formül yazar). Sınıf `cm-table__formula`, hata ise ek `is-error`; `title` = formül (hata ise formül + ' — ' + i18n.t('tableFormula.' + error)). Başlık hücrelerinde formül değerlendirilmez. Widget her docChanged'da yeniden kurulduğu için başvurulan hücre değişince sonuç kendiliğinden güncellenir; ek dispatch, kaynağa yazma ya da eq() değişikliği YOK. Tab geçişi ve sürükleme kodu değişmez.
- Loomen/src/screens/Editor/Markdown.tsx: tablo bloğunda satırlar toplandıktan sonra evaluateTable(header, rows) çağır; formül hücresini inlineNodes yerine `<td className={'lo-table__formula' + (error ? ' is-error' : '')} title={...}>` ile sonuç/hata etiketi olarak çiz. Çeviri için tableWidget'taki gibi `import i18n from '../../i18n'` kullan (i18n.t ve i18n.language). Diğer hücreler ve yerel splitTableRow/isTableSeparator aynen kalır.
- Stil: Loomen/src/screens/Editor/CodeMirrorEditor.tsx cmTheme'e `.cm-table__formula` (fontVariantNumeric: 'tabular-nums', color var(--fg1), hafif ayırt edici: textDecoration 'underline dotted' ya da sol kenar vurgusu) ve `.cm-table__formula.is-error` (color var(--danger), background var(--danger-bg)) kuralları ekle. Loomen/src/styles/app.css'te okuma modu için `.lo-table__formula` ve `.lo-table__formula.is-error` aynı mantıkla (tokens.css'teki --danger / --danger-bg değişkenleri).
- Çeviri: Loomen/src/i18n/locales/{tr,en,ar}/translation.json dosyalarına üst düzey `tableFormula` nesnesi ekle: errorLabel ('#HATA' / '#ERROR' / Arapça karşılığı), syntax ('Formül anlaşılamadı'), ref ('Tabloda olmayan hücreye başvuru'), cycle ('Formül kendine dönüyor'), div0 ('Sıfıra bölme'), value ('Başvurulan hücre sayı değil'). Üç dilde de aynı anahtarlar bulunsun.
- Loomen/src/core/__test__/tableFormulaTest.ts yaz (tableMoveTest.ts kalıbı: check(), sonunda 'x/y kontrol geçti', fails>0 → process.exit(1)) ve Loomen/scripts/run-tests.mjs suites listesine ['src/core/__test__/tableFormulaTest.ts', []] ekle. Kontroller: sayı okuma ('212.500'→212500, '212.500,50'→212500.5, '1,5'→1.5, '1.5'→1.5, '1.500.000'→1500000, '₺ 1.200'→1200, 'abc'→null, ''→null); kalan senaryosu: başlık ['Ad','Tutar','Ödenen','Kalan'], satırlar [['x','212.500','50.000','=B-C'], ['y','1.000','250','=B3-C3'], ['Toplam','=TOPLA(B:B)','=SUM(C2:C3)','=SUM(D:D)']] → 162500, 750, 213500, 50250, 163250 (tam sütun kendi hücresini dışlar); öncelik '=2+3*4'→14, '=(2+3)*4'→20, '=-A' tekli eksi, '=2^3'→8, '=YUVARLA(10/3;2)'→3.33, ORTALAMA/MIN/MAX/SAY, virgül ondalık '=B*1,18'; hatalar: '=A2+'→syntax, '=Z9'→ref, A→B→A→cycle, '=1/0'→div0, metin hücreye doğrudan başvuru→value, aralıkta metin atlanır, boş hücre 0 sayılır; formatFormulaResult(212500,'tr')==='212.500', (1234.5,'tr')==='1.234,5', (212500,'en')==='212,500'. Kaynak denetimi: tableWidget.ts ve Markdown.tsx 'evaluateTable(' çağırıyor, tableWidget'ta 'el.dataset.raw = text' korunmuş, üç dilde tableFormula.errorLabel var, run-tests.mjs'de test kayıtlı.
- Loomen/LoomenWiki/modules/mimari.md 'Veri modeli' bölümüne LOM-76 satırının altına tek madde ekle: '**Tabloda formül (LOM-79).** = ile başlayan hücre formüldür; sonuç yalnız ekranda hesaplanır, dosyada formül metni kalır. Başvuru Excel gibi (B2, B:B, aynı satır için B). Kodda src/core/markdown/tableFormula.ts'.
- Depo kökünde `npm run typecheck` ve `npm test` koş; ikisi de yeşil olmalı, kanıt satırlarını sonuç raporuna yaz. fix/LOM-79 dalında AI imzasız commit at.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/tableFormula.ts`
- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/screens/Editor/Markdown.tsx`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/tableFormulaTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi hatasız geçti. npm test ile 39 test dosyasının hepsi geçti; yeni formül testi 76/76 kontrolü geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-79`
- Commit: `Loomen@a2f65cb985576974ef6c28f039364022c0b56c41`
- Test koşusu: `d56f09fa-1e62-4111-a9d3-5c1d85cdb2fc` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

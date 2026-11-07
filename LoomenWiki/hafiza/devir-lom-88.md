---
name: LOM-88 — Tablo formülünde Excel gibi öneri çıksın
description: Formül motoru sütun başlığı adını (TOPLA(Tutar), =Tutar-Ödenen) tanır; öneri listesinde sütunlar "B · Tutar" olarak görünür ve seçilince adı yazılır.
type: project
proje: loomen
kaynak: kart LOM-88 · dal fix/LOM-88 · Loomen@5cf3d9b7ff13c337bd1f948f9ce00340f04eb03f · test koşusu 0fcc95bf-5a61-4bda-af79-5fa34be1426b (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-07
---

# LOM-88 — Tablo formülünde Excel gibi öneri çıksın

## Ne yapıldı

Formül motoru sütun başlığı adını (TOPLA(Tutar), =Tutar-Ödenen) tanır; öneri listesinde sütunlar "B · Tutar" olarak görünür ve seçilince adı yazılır.

## Adımlar

- Önce dalı doğrula: çalışma ağacı analiz sırasında main'deydi; fix/LOM-88 dalında olduğundan emin ol ve dalda var olan src/core/markdown/formulaSuggest.ts, src/core/__test__/formulaSuggestTest.ts ve tableWidget.ts içindeki öneri kodunu (refreshSuggest, cm-table-suggest__name) oku; aşağıdaki adımları oradaki gerçek adlara uydur.
- src/core/markdown/tableFormula.ts: başlık adıyla başvuru ekle. (a) Dışa açık yardımcılar yaz: normalizeColumnName(s) = baştaki/sondaki boşluk ve * _ işaretlerini at, Türkçe büyük harfe çevir (toLocaleUpperCase('tr')), İ→I; isPlainColumnName(s) = /^\p{L}[\p{L}\p{N}_]*$/u ile tek kelime mi; headerNameIndex(header) = normalize edilmiş ad → ilk sütun indeksi (aynı ad iki kez varsa ilki). (b) tokenize(src, names) imzasını genişlet: harf dizisini \p{L} ile (Türkçe harfler dahil) oku, ardından [\p{L}\p{N}_]* uzantısını al. Boşluk sonrası '(' geliyorsa fonksiyon (eski gibi). Değilse tam kelime names'te varsa {t:'ref', col, row:null, named:true}; yoksa harfler yalnız A-Z/a-z ve uzantı yalnız rakam (ya da boş) ise eski harf+satır başvurusu; aksi halde FormulaFail('ref'). (c) parse(src, names) ve evaluateTable içinden headerNameIndex(header) ile geçir. (d) Toplu fonksiyonların (SUM, AVERAGE, MIN, MAX, COUNT) doğrudan argümanı satırsız başvuru ise (harf ya da ad) bütün sütun sayılsın: rangeNumbers'a {a:{col,row:null}, b:{col,row:null}} ver (kendi hücresi hariç, B:B gibi). Diğer yerlerde satırsız başvuru aynı satır kalır. Dosya başındaki açıklama yorumuna adlı başvuruyu ekle.
- src/core/markdown/formulaSuggest.ts (dalda var): sütun öğesine name alanı (başlık metni, kırpılmış) ekle; label harf olarak kalsın. insert kuralı: yazılan önek başlık adıyla eşleşiyor ve isPlainColumnName doğruysa adı yaz; önek harfle eşleşiyorsa harfi; önek boşsa düz ad varsa adı yoksa harfi. Örnek alanı adlı sütunda '=Tutar' ve '=TOPLA(Tutar)' (yerel fonksiyon adıyla), diğerlerinde eski '=B' / '=B:B'. descKey düz adda 'tableFormula.column', boşluklu/işaretli başlıkta 'tableFormula.columnLetterOnly'. tableFormula.ts'teki normalizeColumnName ve isPlainColumnName'i içe aktar, kendi normalize kopyası varsa kaldır.
- src/screens/Editor/tableWidget.ts: öneri öğesi çizilirken sütun öğesinde ad kısmı harfın yanına ' · ' ayracı ve span.cm-table-suggest__colname ile yazılsın ('B · Tutar'); fonksiyon öğesi aynı kalır. Mevcut keydown dinleyicisine ve 'Enter → finish(true)' / 'Escape → finish(false)' kalıplarına dokunma; openCellEditor içinde createElement('input') kullanma.
- src/styles/app.css: .cm-table-suggest__colname kuralı (font-weight 400; color var(--fg); max-width 160px; overflow hidden; text-overflow ellipsis; white-space nowrap) .cm-table-suggest__name kuralının altına.
- Çeviri: src/i18n/locales/{tr,en,ar}/translation.json tableFormula nesnesinde column metnini 'Sütun; harfi ya da adıyla yazılır ({{name}})' anlamına güncelle ve columnLetterOnly anahtarı ekle ('Sütun; başlığında boşluk olduğu için harfiyle yazılır'); en ve ar karşılıkları aynı anahtarlarla, üç dilde dolu.
- src/core/__test__/tableFormulaTest.ts'e ekle: header ['Ad','Tutar','Ödenen','Kalan'] ile '=Tutar-Ödenen' → 162500; Toplam satırında '=TOPLA(Tutar)' → 213500 (kendi hücresi hariç); '=ortalama(tutar)' küçük harfle çalışır; '=ÖDENEN' Türkçe büyük harfle çalışır; '=Ad*2' (sayı başlıklı küçük tablo) → ad harf yorumunu (AD=29) yener; '=Foo' → 'ref'; '=Ölçü' bilinmeyen → 'ref'; '=B2' ve '=TOPLA(B:B)' eski sonuç; '=TOPLA(B)' toplu fonksiyonda bütün sütun; '**Tutar**' başlığı adıyla bulunur; normalizeColumnName('ıpTal') === 'IPTAL'; isPlainColumnName('Birim Fiyat') false.
- src/core/__test__/formulaSuggestTest.ts'e ekle: header ['Ad','Tutar','Ödenen'] ile '=Tu' → label 'B', name 'Tutar', insert 'Tutar', uygulanınca '=Tutar' imleç 6; '=TOPLA(' boş önekle sütun öğeleri adı önerir (insert 'Ad'); header ['Birim Fiyat'] ile '=Bi' → insert 'A', descKey columnLetterOnly; '=B' harf eşleşmesi → insert 'B' (ad 'Tutar' B ile başlamadığı için); örnek '=TOPLA(Tutar)'. Kaynak denetimi: tableWidget.ts 'cm-table-suggest__colname' içeriyor, app.css'te kural var, üç dilde tableFormula.columnLetterOnly dolu. Dalda zaten varsa yalnız insert 'B' bekleyen eski kontrolü yeni kurala göre düzelt.
- LoomenWiki/modules/mimari.md: 'Tabloda formül (LOM-79)' maddesine 'sütun başlığı adıyla da (=TOPLA(Tutar), =Tutar-Ödenen); tek kelimelik başlıklar' ekle; 'Formül önerisi (LOM-88)' maddesine 'sütunlar harf · başlık olarak listelenir, seçilince ad yazılır' ekle.
- Depo kökünde npm run typecheck ve npm test koş; ikisi de yeşil olmalı (tableFormulaTest, formulaSuggestTest, tableWrapTest dahil). Kanıt satırlarını sonuç raporuna yaz. fix/LOM-88 dalında AI imzasız commit at.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/tableFormula.ts`
- `Loomen/src/core/markdown/formulaSuggest.ts`
- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/tableFormulaTest.ts`
- `Loomen/src/core/__test__/formulaSuggestTest.ts`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi temiz geçti. Tam test takımında 41 dosyanın hepsi geçti; formül ve öneri testleri de içinde (öneri testi 87/87). Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-88`
- Commit: `Loomen@5cf3d9b7ff13c337bd1f948f9ce00340f04eb03f`
- Test koşusu: `0fcc95bf-5a61-4bda-af79-5fa34be1426b` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

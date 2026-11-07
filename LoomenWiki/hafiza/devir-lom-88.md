---
name: LOM-88 — Tablo formülünde Excel gibi öneri çıksın
description: Tablo hücresi düzenleme kutusunda "=" ve harf yazınca Excel gibi fonksiyon (TOPLA, ORTALAMA…) ve sütun harfi önerileri açıklama ve örnekle listelenir; Enter, Tab ya da dokunmayla seçilince hücreye "=TOPLA(" gibi yazılır; Mac ve telefonda çalışır.
type: project
proje: loomen
kaynak: kart LOM-88 · dal fix/LOM-88 · Loomen@87918036f6adc49876176be4994f914c4eeceefb · test koşusu e3726945-cf01-4b16-b3fe-010260b87e63 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-07
---

# LOM-88 — Tablo formülünde Excel gibi öneri çıksın

## Ne yapıldı

Tablo hücresi düzenleme kutusunda "=" ve harf yazınca Excel gibi fonksiyon (TOPLA, ORTALAMA…) ve sütun harfi önerileri açıklama ve örnekle listelenir; Enter, Tab ya da dokunmayla seçilince hücreye "=TOPLA(" gibi yazılır; Mac ve telefonda çalışır.

## Adımlar

- Loomen/src/core/markdown/formulaSuggest.ts adında saf bir modül yaz (DOM, i18n, CodeMirror yok; node testinden koşulur). İçerik: fonksiyon kataloğu (7 kayıt: sum, average, min, max, count, round, abs; her birinde Türkçe ve İngilizce ad: TOPLA/SUM, ORTALAMA/AVERAGE, MIN/MIN, MAX/MAX, SAY/COUNT, YUVARLA/ROUND, ABS/ABS; açıklama için anahtar adı, örnek şablonu), `colLetter(index)` (0→A, 25→Z, 26→AA; tableFormula.ts'teki colIndex'in tersi), `suggestFormula(text, caret, header: string[], locale: string)` ve `applySuggestion(text, from, to, insert)`.
- suggestFormula kuralları: kırpılmış metin '=' ile başlamıyorsa null. İmlecin solundaki harf dizisini (yalnız A-Z, a-z ve Türkçe harfler; öncesi satır başı, '=', işleç, '(', ';', ':' ya da boşluk) 'kelime' say; imlecin hemen sağında harf/rakam/'(' varsa null; kelimeden önce rakam varsa ya da kelime rakamla bitmişse (B2 gibi) null. Kelime boşsa yalnız '=' ya da '(' hemen öncesindeyse tüm liste açılır (öncesi '(' ise sütunlar önce, yoksa fonksiyonlar önce), diğer boş durumlarda null. Eşleştirme: büyük harfe çevirip İ/ı→I normalize et; fonksiyon adı (her iki dil) ya da sütun harfi ya da başlık metni bu önekle başlıyorsa aday. Dönen her öğe: { kind: 'fn'|'column', label (TOPLA ya da B), alias (diğer dildeki ad, aynıysa boş), insert ('TOPLA(' ya da 'B'), descKey ('tableFormula.fnSum' vb. ya da sütunda 'tableFormula.column'), descParam (sütun başlığı), example ('=TOPLA(B2:B9)' gibi, yerel ada göre; sütunda '=B2' ve '=B:B') } ile replaceFrom/replaceTo (kelimenin aralığı). Fonksiyonda arayüz dili tr ise Türkçe ad önce, aksi halde İngilizce; önek yalnız diğer dildeki adla eşleşiyorsa label o ad olur. Aynı fonksiyon listede bir kez görünür.
- applySuggestion(text, from, to, insert) → { text, caret }: [from,to) aralığını insert ile değiştirir, imleç insert'in sonuna gelir ('=TO' + TOPLA( → '=TOPLA(' imleç 7; '=TO+1' imleç 3 → '=TOPLA(+1' imleç 7).
- Loomen/src/screens/Editor/tableWidget.ts openCellEditor içinde öneri kutusu: textarea'dan sonra body'ye `div.cm-table-suggest` (role='listbox', aria-label i18n 'tableFormula.suggestLabel') ekle, başta gizli. Başlık metinlerini `cellEl.closest('.cm-tablewrap')` içindeki `[data-row="-1"]` hücrelerinin dataset.raw değerinden sütun sırasıyla oku. `refreshSuggest()`: suggestFormula(input.value, input.selectionStart, header, i18n.language) çağır; sonuç yoksa kutuyu gizle; varsa öğeleri `div.cm-table-suggest__item` (role='option') olarak çiz: `__name` (label + küçük alias), `__desc` (i18n.t(descKey, {name: descParam})), `__example` (example). İlk öğe `is-active`; aktif öğe ok tuşlarıyla değişir ve scrollIntoView({block:'nearest'}) yapılır. Konum: position fixed, sol = kutunun solu, üst = textarea'nın altı + 2px; mevcut alan (window.visualViewport?.height ?? innerHeight) − alt kenar < 200px ise kutunun ÜSTÜNE yerleştir; genişlik max(kutu genişliği, 280px), ekrana sığdır. refreshSuggest'i input olayında (fitHeight sonrası) ve textarea click olayında çağır; açılışta da bir kez çağır (hücrede zaten '=' varsa).
- Tuşlar: mevcut keydown dinleyicisine DOKUNMA (tableWrapTest 'Enter → finish(true)' ve 'Escape → finish(false)' kalıplarını 80 karakter içinde arıyor). Ondan ÖNCE ayrı bir keydown dinleyicisi ekle: öneri kutusu açık ve öğe varsa ArrowDown/ArrowUp aktif öğeyi döndürür; Enter ve Tab aktif öneriyi uygular (applySuggestion → input.value, setSelectionRange(caret), fitHeight, refreshSuggest); Escape yalnız kutuyu kapatır (kapalı bayrağı: aynı kelimede yeniden açılmaz, yeni harf yazılınca açılır). Tüketilen tuşta e.preventDefault() ve e.stopImmediatePropagation() çağır; kutu kapalıysa hiçbir şey yapma, eski davranış sürer.
- Mobil: input olayındaki satır sonu kontrolünde, satır sonu varsa ve öneri kutusu açık ve öğe varsa satır sonunu kaldırıp aktif öneriyi uygula ve finish ÇAĞIRMA; kutu kapalıysa eski gibi kaydet. Öneri öğelerinde pointerdown ile seç: e.preventDefault() ve e.stopPropagation() (odak textarea'da kalır, blur → finish tetiklenmez; cm-table__add düğmelerindeki kalıp). onScroll'u (kaydırma/boyut değişince kapatma) öneri kutusunun içinden gelen scroll olaylarında yok say (e.target kutunun içindeyse dön).
- Temizlik: cleanup() içinde öneri kutusunu DOM'dan kaldır; finish ve moveTo zaten cleanup çağırıyor. openCellEditor içinde createElement('input') kullanma (tableWrapTest bunu yasaklıyor); yardımcı fonksiyonlar openCellEditor'ın içinde ya da dosyada ondan önce dursun ('\n}\n' blok sınırı korunmalı).
- Loomen/src/styles/app.css: .cm-table-editor kuralının altına `.cm-table-suggest` (position fixed; z-index 1001 — düzenleme kutusu 1000; background var(--bg-elev); border 1px solid var(--line); border-radius 10px; box-shadow var(--sh3); padding 5px; max-height 220px; overflow auto; font-size 13px; -webkit-overflow-scrolling touch), `.cm-table-suggest__item` (display flex; align-items baseline; gap 8px; padding 7px 10px; border-radius 7px; cursor pointer; min-height 36px dokunma için), `.cm-table-suggest__item.is-active` (background var(--line-soft); color var(--accent)), `.cm-table-suggest__name` (font-weight 600; font-variant-numeric tabular-nums), `.cm-table-suggest__alias` ve `.cm-table-suggest__desc` (color var(--fg2)), `.cm-table-suggest__example` (margin-inline-start auto; color var(--fg3); font-family var(--font-mono, monospace); white-space nowrap). hover kuralı @media (hover: hover) içinde (.lo-ctxmenu kalıbı).
- Çeviri: Loomen/src/i18n/locales/{tr,en,ar}/translation.json tableFormula nesnesine düz anahtarlar ekle: suggestLabel ('Formül önerileri'), fnSum ('Sayıları toplar'), fnAverage ('Ortalamasını alır'), fnMin ('En küçüğünü bulur'), fnMax ('En büyüğünü bulur'), fnCount ('Sayı olan hücreleri sayar'), fnRound ('Verilen basamağa yuvarlar'), fnAbs ('İşareti atar, mutlak değer'), column ('{{name}} sütunu'); en ve ar karşılıkları aynı anahtarlarla. Üç dilde de hepsi dolu olsun.
- Loomen/src/core/__test__/formulaSuggestTest.ts yaz (tableFormulaTest kalıbı: check(), sonunda 'x/y kontrol geçti', fails>0 → exit 1) ve Loomen/scripts/run-tests.mjs suites listesine tableFormulaTest'in altına ekle. Kontroller: '=TO' → ilk öğe TOPLA, insert 'TOPLA(', uygulanınca '=TOPLA(' imleç 7; '=to' ve '=tO' aynı; '=SU' tr dilinde SUM; '=MI' ve Türkçe '=mi' → MIN; '=' tek başına → 7 fonksiyon + sütun sayısı kadar öğe, tr'de ilk label TOPLA, en'de SUM; '=TOPLA(' → sütunlar önce; başlık ['Ad','Tutar','Ödenen'] ile '=Tu' → label 'B', descParam 'Tutar'; '=1+2' → null; '=B2' → null; '=TOPLA(B:B' imleç sonda → ('B' kelimesi öncesi ':' ) B önerisi çıkar ama '=B2' çıkmaz; 'Tutar' (eşittir yok) → null; '=TO+1' imleç 3 → replace 1..3, uygulanınca '=TOPLA(+1' imleç 7; colLetter(0)='A', (25)='Z', (26)='AA'; aynı fonksiyon listede tek. Kaynak denetimi: tableWidget.ts 'suggestFormula(' çağırıyor, 'cm-table-suggest' sınıfı var, öneri öğesinde pointerdown + preventDefault var, 'stopImmediatePropagation' var, 'ArrowDown' işleniyor; app.css'te '.cm-table-suggest {' kuralı ve z-index 1001; üç dilde tableFormula.fnSum, fnAverage, fnMin, fnMax, fnCount, fnRound, fnAbs, column, suggestLabel dolu; run-tests.mjs'de test kayıtlı.
- Loomen/LoomenWiki/modules/mimari.md 'Tabloda formül (LOM-79)' maddesinin altına tek madde: '**Formül önerisi (LOM-88).** Hücre kutusunda = ve harf yazınca fonksiyon ve sütun harfi listesi açılır; Enter/Tab/dokunma seçer, Esc yalnız listeyi kapatır. Saf mantık `src/core/markdown/formulaSuggest.ts`, kutu `tableWidget.ts` openCellEditor.'
- Depo kökünde `npm run typecheck` ve `npm test` koş; ikisi de yeşil olmalı (tableWrapTest ve tableFormulaTest dahil). Kanıt satırlarını sonuç raporuna yaz. fix/LOM-88 dalında AI imzasız commit at.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/formulaSuggest.ts`
- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/formulaSuggestTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi hatasız geçti. npm test ile 41 test dosyasının tümü geçti; formül önerisi testi 58/58. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-88`
- Commit: `Loomen@87918036f6adc49876176be4994f914c4eeceefb`
- Test koşusu: `e3726945-cf01-4b16-b3fe-010260b87e63` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

---
name: LOM-78 — Tabloda satır ve sütunlar sürükleyip bırakılarak taşınsın
description: Düzenleme modundaki tablo widget'ına sütun başlığı üstüne ve satırların sol kenarına tutma yerleri eklenir; fare ya da parmakla sürükleyip bırakınca satır/sütun kaynak metinde (markdown) yeni sırasına yazılır, böylece not kapanıp açılınca sıra kalıcıdır.
type: project
proje: loomen
kaynak: kart LOM-78 · dal fix/LOM-78 · Loomen@e4c6ea7571cd26919be4ec09f2f0ee321be96a37 · test koşusu de716641-5e62-475e-a787-8cf4a17dc384 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-05
---

# LOM-78 — Tabloda satır ve sütunlar sürükleyip bırakılarak taşınsın

## Ne yapıldı

Düzenleme modundaki tablo widget'ına sütun başlığı üstüne ve satırların sol kenarına tutma yerleri eklenir; fare ya da parmakla sürükleyip bırakınca satır/sütun kaynak metinde (markdown) yeni sırasına yazılır, böylece not kapanıp açılınca sıra kalıcıdır.

## Adımlar

- Loomen/src/screens/Editor/tableModel.ts: saf fonksiyonlar ekle. (a) rawTableCells(line): satırı kaçışsız borulardan ham parçalara böler (pipePositions kullan), satır başı/sonu boruyla başlıyor/bitiyorsa boş uç parçaları at, ham boşluklar korunur. (b) joinTableCells(cells): '|' + cells.join('|') + '|'. (c) moveTableColumn(blockLines: string[], from: number, to: number): string[] — başlık, ayraç ve gövde satırlarının her birinde hücreyi from'dan to'ya taşır (önce hücre sayısını başlık sayısına '  ' ile tamamla, fazlasını kırp); from===to ya da sınır dışıysa girdiyi aynen döndürür. (d) moveTableRow(blockLines: string[], from: number, to: number): string[] — gövde satırlarını (indeks 2'den itibaren, 0-tabanlı gövde sırası) taşır, başlık ve ayraç yerinde kalır; sınır dışı/aynı indeks girdiyi aynen döndürür. (e) dropIndex(edges: {start:number; end:number}[], pos: number): number — bir eksen boyunca hücre aralıkları ve işaretçi konumundan hedef indeks (orta noktadan önceyse o öğe, sonraysa bir sonraki; dışındaysa 0 ya da son). Hepsi DOM'suz, node testinden koşulabilir.
- Loomen/src/screens/Editor/tableWidget.ts: (a) her başlık hücresine (th) 'cm-table__colgrip' (üst kenarda yatay şerit, title/aria i18n ctx.moveColumn) ve her gövde satırının ilk hücresine 'cm-table__rowgrip' (sol kenarda dikey şerit, ctx.moveRow) ekle; pointerdown'da preventDefault + stopPropagation (hücre düzenleme kutusu açılmasın), setPointerCapture ile pointermove/pointerup/pointercancel dinle (resize tutamacı kalıbı). (b) Sürüklemeye 4 px eşikten sonra başla; sürüklerken kaynak sütun/satır hücrelerine 'is-drag-source', hedefe 'is-drop-before'/'is-drop-after' sınıfı ver; hedef indeks, th'lerin (sütun) ya da tbody tr'lerin (satır) getBoundingClientRect aralıkları ve clientX/clientY ile dropIndex'ten hesaplanır. (c) pointerup'ta sınıfları temizle; hedef kaynaktan farklıysa tableBlockRange + tableBlockAt ile güncel bloğu al, blok satırlarını moveTableColumn/moveTableRow ile yeniden üret ve tek dispatch ile blok aralığını yeni metinle değiştir (isLive kontrolü). Sütun taşımada colWidths'taki genişlik dizisini de aynı sırayla taşı. (d) ignoreEvent ve mevcut hücre/resize davranışı değişmez.
- Loomen/src/screens/Editor/CodeMirrorEditor.tsx cmTheme: '.cm-table__colgrip' (position absolute, top 0, left 8px, right 12px, height 6px, cursor grab, touchAction none, zIndex 2, opacity 0; 'th:hover' içinde opacity 1, arka plan var(--line)) ve '.cm-table__rowgrip' (absolute, left 0, top 6px, bottom 6px, width 6px, aynı mantık) kuralları; '.cm-table .is-drag-source' soluk/vurgulu arka plan; '.cm-table .is-drop-before' sol/üst kalın accent kenarlık, '.is-drop-after' sağ/alt kalın accent kenarlık (sütunda sol-sağ, satırda üst-alt). Hücrenin position: relative zaten var.
- Loomen/src/styles/app.css: '.lo-app.is-mobile .cm-table__colgrip' (height 14px, opacity hep 0.6) ve '.lo-app.is-mobile .cm-table__rowgrip' (width 18px, opacity hep 0.6) kuralları; resize tutamacının mobil kurallarının yanına (satır ~4021).
- Loomen/src/i18n/locales/tr|en|ar/translation.json: ctx bloğuna 'moveColumn' (Sütunu taşı / Move column / نقل العمود) ve 'moveRow' (Satırı taşı / Move row / نقل الصف) anahtarları, addColumn/addRow'un yanına.
- Loomen/src/core/__test__/tableMoveTest.ts (yeni, tableWrapTest kalıbı: check + 'x/y kontrol geçti' + fails>0 ise exit 1): moveTableRow ile 3 satırlık tabloda 0→2 ve 2→0 taşıma, başlık/ayraç sabit; aynı indeks değişmiyor; moveTableColumn ile başlık/ayraç/gövde hep birlikte taşınıyor, kaçışlı '\|' hücre korunuyor, başı/sonu borusuz satır ve eksik hücreli satır bozulmuyor, ayraç hizası (:--:) sütunla gidiyor; sonuç findTables ile ayrıştırılınca header ve rows yeni sırada (kalıcılık); dropIndex sınır ve orta nokta durumları. Kaynak denetimi: tableWidget.ts içinde 'cm-table__colgrip', 'cm-table__rowgrip', 'setPointerCapture' ve 'moveTableColumn'/'moveTableRow' çağrıları var; cmTheme'de colgrip kuralında touchAction none. Loomen/scripts/run-tests.mjs suites listesine ['src/core/__test__/tableMoveTest.ts', []] ekle.
- Depo kökünde npm run typecheck ve npm test koş, kanıt satırlarını rapora yaz. Commit mesajı AI imzasız, dal fix/LOM-78.

## Dokunulan dosyalar

- `Loomen/src/screens/Editor/tableModel.ts`
- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/tableMoveTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Tip denetimi temiz, yeni tableMoveTest 53/53 geçti, tam takım 38 dosyanın tümü geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-78`
- Commit: `Loomen@e4c6ea7571cd26919be4ec09f2f0ee321be96a37`
- Test koşusu: `de716641-5e62-475e-a787-8cf4a17dc384` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

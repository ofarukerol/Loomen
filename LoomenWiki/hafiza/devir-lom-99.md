---
name: LOM-99 — Formül yazarken Tab ile sütunu tamamla, satır ve sütun numaraları görünsün
description: Tablo hücresinde =TOPLA yazıp Tab'a basınca üstteki sayı aralığı kendiliğinden formüle eklenir; = yazılınca sütun harfleri ve satır numaraları tabloda belirir, formül bitince kaybolur.
type: project
proje: loomen
kaynak: kart LOM-99 · dal fix/LOM-99 · Loomen@8d8056bc132803b42324dc7a9443f24a9b8720a6 · test koşusu d16c6c32-aadc-452e-a9b7-c02dcea0cd22 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-09
---

# LOM-99 — Formül yazarken Tab ile sütunu tamamla, satır ve sütun numaraları görünsün

## Ne yapıldı

Tablo hücresinde =TOPLA yazıp Tab'a basınca üstteki sayı aralığı kendiliğinden formüle eklenir; = yazılınca sütun harfleri ve satır numaraları tabloda belirir, formül bitince kaybolur.

## Adımlar

- Dalı doğrula: çalışma ağacı fix/LOM-99 dalında olmalı; src/core/markdown/formulaSuggest.ts, src/screens/Editor/tableWidget.ts (openCellEditor, iki keydown dinleyicisi), src/screens/Editor/CodeMirrorEditor.tsx tablo tema kuralları (satır 90-200) ve src/core/__test__/formulaSuggestTest.ts dosyalarını oku.
- src/core/markdown/formulaSuggest.ts: (a) FnEntry'ye `aggregate: boolean` ekle (TOPLA, ORTALAMA, MIN, MAX, SAY true; YUVARLA, ABS false) ve FormulaSuggestion'a `aggregate` alanı koy (fonksiyonda girişten, sütunda false). (b) Saf `autoRangeRef(rows: string[][], row: number, col: number): string | null` yaz: başlık satırı (row === -1) ya da geçersiz konumda null; hücrenin hemen üstündeki boş hücreleri atla, sonra yukarı doğru kesintisiz 'sayı' hücreleri topla (sayı = tableFormula.ts'ten parseLocalizedNumber(raw) !== null ya da isFormulaCell(raw)); metinde dur. En az bir hücre bulunduysa Excel satır numarasıyla (gövde indeksi + 2) `B2:B5` döndür, tek hücreyse `B2`. Üstte hiç sayı yoksa aynı kuralı sola uygula (`A3:C3`), o da yoksa null. Harf için mevcut colLetter kullanılır. (c) `autoFunctionInsert(label: string, ref: string): string` → `TOPLA(B2:B5)` (küçük yardımcı). Dosya başı yorumuna LOM-99 notu ekle.
- src/screens/Editor/tableWidget.ts: ilk keydown dinleyicisinde (öneri açıkken) Tab (shiftsiz) dalını genişlet: aktif öğe kind 'fn' ve aggregate ise `tableBlockFrom(view.state, headerFrom)` ile blok alıp `autoRangeRef(block.rows, row, col)` hesapla; sonuç varsa applySuggestion(input.value, current.replaceFrom, current.replaceTo, autoFunctionInsert(label, ref)) uygula, imleci sona koy, fitHeight + refreshSuggest çağır (liste kendiliğinden kapanır); sonuç yoksa eski applyActive. Enter dalı değişmez. preventDefault + stopImmediatePropagation korunur ki ikinci dinleyici hücre değiştirmesin.
- src/screens/Editor/tableWidget.ts toDOM/mkCell: her başlık hücresine `el.dataset.letter = colLetter(col)`, 0. sütundaki her hücreye `el.dataset.rowno = String(row + 2)` (başlık row -1 → '1') yaz; colLetter'ı formulaSuggest'ten içe aktar. openCellEditor'da `const wrap = cellEl.closest<HTMLElement>('.cm-tablewrap')` ve `syncCoords = () => wrap?.classList.toggle('is-formula', input.value.trimStart().startsWith('='))`; açılışta ve her input olayında çağır; cleanup içinde `wrap?.classList.remove('is-formula')`.
- src/screens/Editor/CodeMirrorEditor.tsx tema (para birimi kurallarının ALTINA, mevcut kuralların içine girmeden): `.cm-tablewrap.is-formula .cm-table th::before` → content attr(data-letter), position absolute, top 1px, left 50%, transform translateX(-50%), fontSize 10px, lineHeight 1, fontWeight 600, color var(--fg3), pointerEvents none; `.cm-tablewrap.is-formula .cm-table [data-col="0"]::after` → content attr(data-rowno), position absolute, insetInlineStart 2px, top 50%, transform translateY(-50%), fontSize 10px, lineHeight 1, color var(--fg3), fontVariantNumeric tabular-nums, pointerEvents none. Kısa açıklama yorumu (LOM-99).
- src/core/__test__/formulaSuggestTest.ts'e ekle: rows [['Kira','1.200'],['Su','300'],['Elektrik','=B2*2'],['Toplam','']] ile autoRangeRef(rows,3,1) === 'B2:B4'; ['Not','x'] araya girince yalnız alttaki kesintisiz kısım; hemen üstteki boş hücre atlanır; tek sayı → 'B2'; üstte sayı yok solda var → satır aralığı; row -1 → null; col 0 row 0 → null. Birleşik kontrol: autoFunctionInsert('TOPLA', ref) ile üretilen formülü Toplam satırına yazıp evaluateTable (tableFormula) sonucu 1200+300+2400 = 3900. TOPLA öğesinde aggregate true, YUVARLA false. Kaynak denetimi: tableWidget.ts 'autoRangeRef(' ve 'is-formula' ve 'dataset.letter' ve 'dataset.rowno' içeriyor; CodeMirrorEditor.tsx 'attr(data-letter)' ve 'attr(data-rowno)' içeriyor; Tab dalında autoRangeRef kullanılıyor.
- LoomenWiki/modules/mimari.md 'Formül önerisi (LOM-88)' maddesine ekle: '=TOPLA yazıp Tab: üstteki kesintisiz sayı aralığı kendiliğinden yazılır (yoksa soldaki, o da yoksa yalnız TOPLA( ); = yazılınca başlıkta sütun harfi, ilk sütunda satır numarası görünür, kutu kapanınca kaybolur (LOM-99)'.
- Depo kökünde `npm run typecheck` ve `npm test` koş; ikisi de yeşil olmalı. Kanıt satırlarını sonuca yaz. fix/LOM-99 dalında AI imzasız commit at; push yok.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/formulaSuggest.ts`
- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/core/__test__/formulaSuggestTest.ts`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi hatasız bitti. Tam test takımı (62 dosya) geçti; formül önerisi testi 111/111. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-99`
- Commit: `Loomen@8d8056bc132803b42324dc7a9443f24a9b8720a6`
- Test koşusu: `d16c6c32-aadc-452e-a9b7-c02dcea0cd22` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

---
name: LOM-77 — Tabloda sığmayan yazı alt satıra geçsin
description: Düzenleme (CodeMirror tablo widget'ı) ve okuma modundaki tablo hücrelerinde "tek satır" (nowrap) kuralı kaldırılıp yazı hücre içinde alt satıra sarılır; sütun daraltma gerçekten daraltır (width + min-width); hücre düzenleme kutusu çok satırlı olur ve yazıyla birlikte büyür.
type: project
proje: loomen
kaynak: kart LOM-77 · dal fix/LOM-77 · Loomen@dfd8e8ba4df64af5e8c4586ef9ec15e2a31fbeae · test koşusu c92464bc-4e35-4623-88ae-6467894642ab (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-05
---

# LOM-77 — Tabloda sığmayan yazı alt satıra geçsin

## Ne yapıldı

Düzenleme (CodeMirror tablo widget'ı) ve okuma modundaki tablo hücrelerinde "tek satır" (nowrap) kuralı kaldırılıp yazı hücre içinde alt satıra sarılır; sütun daraltma gerçekten daraltır (width + min-width); hücre düzenleme kutusu çok satırlı olur ve yazıyla birlikte büyür.

## Adımlar

- Loomen/src/screens/Editor/CodeMirrorEditor.tsx cmTheme içinde '.cm-table th, .cm-table td' kuralında whiteSpace: 'nowrap' yerine whiteSpace: 'normal' yaz ve overflowWrap: 'break-word' ekle. height: '38px' tabloda en az yükseklik gibi davrandığı için satır içerik büyüyünce kendiliğinden yükselir; minWidth: '100px', verticalAlign: 'middle', touchAction ve diğer alanlar aynen kalsın. Yorumu güncelle: uzun yazı hücre içinde sarılır (LOM-77).
- Loomen/src/screens/Editor/tableWidget.ts sütun genişletme tutamacında (handle pointermove onMove) sütunun bütün hücrelerine yalnız minWidth değil hem style.width hem style.minWidth olarak w px yaz; mkCell'deki saklı genişlik uygulamasında da (widths[col]) aynı şekilde hem width hem minWidth ver. Sebep: nowrap kalkınca sütunun en küçük genişliği en uzun kelime olur, width verilince sütun daralır ve yazı sarılır; min-width ise genişletmeyi korur. Alt sınır Math.max(60, …) aynen kalsın. 'border-collapse'ta width tutmaz' yorumunu düzelt.
- Loomen/src/screens/Editor/tableWidget.ts openCellEditor'da tek satırlık <input type=text> yerine <textarea> oluştur: rows=1, className 'cm-table-editor' aynı, value=orig, left/top/width hücre dikdörtgeninden; yükseklik Math.max(rect.height, scrollHeight + kenarlık payı) (kenarlık payı = offsetHeight - clientHeight). 'input' olayında yüksekliği yeniden hesapla (önce height 'auto', sonra aynı formül) ki yazı uzadıkça kutu büyüsün. enterKeyHint 'done' ver. Enter (Shift'li dahil) → preventDefault + finish(true); Esc, Tab/Shift+Tab, blur, scroll/resize kapatma, viaTouch gecikmesi, select() davranışı aynen kalsın. 'input' olayında değerde '\n' varsa (mobil klavye Enter'ı satır sonu olarak gönderirse) satır sonunu silip finish(true) çağır. Kaydederken cellSourceText zaten satır sonlarını boşluğa çevirir; moveTo'daki seçici ve openCellEditor imzası değişmez.
- Loomen/src/styles/app.css: (a) '.lo-table th, .lo-table td' kuralında white-space: nowrap yerine white-space: normal ve overflow-wrap: break-word; min-width: 100px, height: 38px ve diğerleri kalsın (okuma modu, Markdown.tsx tablosu). (b) '.cm-table-editor' kuralına textarea için display: block; margin: 0; line-height: 1.5; white-space: pre-wrap; overflow-wrap: break-word; resize: none; overflow: hidden ekle; font-family/size, padding, kenarlık aynen. Markdown.tsx'e dokunma.
- Loomen/src/core/__test__/tableWrapTest.ts adında yeni kaynak denetim testi yaz (windowDragTest.ts kalıbı: readFileSync + check, sonunda 'x/y kontrol geçti' ve fails>0 ise process.exit(1)). Kontroller: CodeMirrorEditor.tsx'teki '.cm-table th, .cm-table td' bloğunda 'nowrap' yok ve whiteSpace 'normal' var; app.css'teki '.lo-table th,\n.lo-table td {' bloğunda 'white-space: nowrap' yok ve 'white-space: normal' var; '.cm-table-editor' bloğunda 'white-space: pre-wrap' ve 'resize: none' var; tableWidget.ts openCellEditor içinde document.createElement("textarea") var ve createElement("input") yok; tutamaç onMove'da style.width ve style.minWidth birlikte yazılıyor; ayrıca tableModel.cellSourceText('a\nb') === ' a b ' (satır sonu kaynağa sızmaz). Loomen/scripts/run-tests.mjs suites listesine ['src/core/__test__/tableWrapTest.ts', []] ekle.
- Depo kökünde npm run typecheck ve npm test koş; ikisi de yeşil olmalı, kanıt satırlarını sonuç raporuna yaz. Commit mesajında AI imzası olmasın; dal fix/LOM-77.

## Dokunulan dosyalar

- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/styles/app.css`
- `Loomen/src/core/__test__/tableWrapTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Tip denetimi hatasız bitti. Tam test takımı koştu ve 35 test dosyasının tümü geçti. Yeni tablo sarma testi 22/22 kontrolü geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-77`
- Commit: `Loomen@dfd8e8ba4df64af5e8c4586ef9ec15e2a31fbeae`
- Test koşusu: `c92464bc-4e35-4623-88ae-6467894642ab` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

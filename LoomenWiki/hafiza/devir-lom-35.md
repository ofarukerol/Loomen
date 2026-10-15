---
name: LOM-35 — Mobil: tablo üstünden sayfayı kaydırırken hücre düzenleme açılıyor
description: Tablo hücresi dokunmatikte artık pointerdown'da değil, kısa ve yerinde dokunuşta (pointerup) düzenleme kutusunu açacak; kaydırma hareketi kutuyu açmayacak, fare davranışı değişmeyecek.
type: project
proje: loomen
kaynak: kart LOM-35 · dal fix/LOM-35 · Loomen@fc769153594f4e6c209e9eefbef018d8a4cf32ac · test koşusu 4d6a0089-8b5e-44c0-ba38-b9419473a7d8 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-15
---

# LOM-35 — Mobil: tablo üstünden sayfayı kaydırırken hücre düzenleme açılıyor

## Ne yapıldı

Tablo hücresi dokunmatikte artık pointerdown'da değil, kısa ve yerinde dokunuşta (pointerup) düzenleme kutusunu açacak; kaydırma hareketi kutuyu açmayacak, fare davranışı değişmeyecek.

## Adımlar

- Loomen/src/screens/Editor/tapGesture.ts adında DOM'suz saf bir modül yaz: TAP_SLOP_PX = 10, TAP_MAX_MS = 500; isTapInput(pointerType) → pointerType !== 'mouse' (touch, pen ve boş değer dokunuş sayılır); createTapTracker({slopPx, maxMs}) → { down(id,x,y,t), move(id,x,y), up(id,x,y,t): boolean, cancel(id?) }. Kurallar: down yeni dokunuşu başlatır (farklı id ile ikinci down gelirse dokunuş iptal); move eşiği aşarsa 'kaydı' bayrağı kalıcı olur (geri dönse de dokunuş sayılmaz); up yalnız aynı id, kaymamış, süre ≤ maxMs ve bitiş noktası eşik içindeyse true döner ve sayacı sıfırlar; cancel sıfırlar. Hücre başına bir sayaç yeter.
- Loomen/src/screens/Editor/tableWidget.ts mkCell içinde pointerdown dinleyicisini değiştir: e.stopPropagation() her girdide kalsın (JS yayılımı kaydırmayı etkilemez, mevcut davranış korunur). pointerType mouse ise eskisi gibi e.preventDefault() + openCellEditor. Değilse preventDefault ÇAĞIRMA, sadece tracker.down(e.pointerId, e.clientX, e.clientY, e.timeStamp). Ayrıca hücreye pointermove → tracker.move, pointerup → tracker.up true ise openCellEditor(view, el, { viaTouch: true }), pointercancel → tracker.cancel ekle. Dokunmatikte tarayıcı pointerdown hedefini örtük yakaladığı için pointerup/pointercancel hücreye gelir; kalem için gerekirse setPointerCapture eklenebilir ama zorunlu değil. Yorumları güncelle: pointerdown'da hemen açmak kaydırmayı bozuyordu (LOM-3'teki pointerdown geçişi korunuyor, yalnız açılış anı değişiyor).
- Aynı dosyada openCellEditor'a opsiyonel üçüncü parametre ekle: { viaTouch?: boolean }. viaTouch true ise scroll/resize kapatma dinleyicileri (view.scrollDOM scroll, window resize, window scroll capture) hemen değil ~500 ms sonra setTimeout ile bağlansın; finish/cleanup bu zamanlayıcıyı clearTimeout ile temizlesin. Sebep: Android'de klavye açılınca window resize, iOS'ta kaydırma olayı geliyor ve kutu açılır açılmaz kapanıyor. Tab ile geçişte (moveTo) parametre verilmez, masaüstü davranışı aynen kalır.
- Loomen/src/screens/Editor/CodeMirrorEditor.tsx cmTheme içinde '.cm-table th, .cm-table td' kuralına touchAction: 'pan-x pan-y' ekle (dikey sayfa kaydırması ve .cm-tablewrap yatay kaydırması parmağa kalsın; pinch/çift dokunuş zoom zaten viewport'ta kapalı). .cm-table__resize üzerindeki touchAction: none aynen kalsın; çocuk eleman kendi değerini taşıdığı için tutamaç sürüklemesi bozulmaz. + düğmelerine dokunma.
- Loomen/src/core/__test__/editorTest.ts dosyasına '=== 10. Hücre dokunuşu (tapGesture) ===' bölümü ekle (tapGesture.ts'den içe aktar; dosya başındaki Kapsam yorumunu güncelle). Senaryolar: isTapInput mouse → false, touch/pen/boş → true; 0 px hareket 120 ms → up true; 12 px dikey hareket → up false; 6 px hareket → up true; 800 ms basılı → false; pointercancel sonrası up → false; farklı pointerId ile up → false; 20 px gidip geri gelen hareket → false (kaymış bayrağı kalıcı); ikinci parmak (farklı id down) → false; başarılı up sonrası ikinci up → false (sıfırlanma).
- Repo kökünde npx tsc --noEmit ve npm test koş; her ikisi de yeşil olmalı. Kanıt satırlarını sonuç raporuna yaz. Not: pointerdown'daki preventDefault spec'e göre kaydırmayı zaten engellemez (touch-action belirler), asıl bozan hemen açılan kutuydu; yine de kart isteğiyle dokunmatikte preventDefault çağrılmıyor.

## Dokunulan dosyalar

- `Loomen/src/screens/Editor/tapGesture.ts`
- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/core/__test__/editorTest.ts`

## Test

Testler geçti.

> Tip denetimi hatasız geçti. npm test ile 11 test dosyasının hepsi geçti, hiç kırmızı yok. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-35`
- Commit: `Loomen@fc769153594f4e6c209e9eefbef018d8a4cf32ac`
- Test koşusu: `4d6a0089-8b5e-44c0-ba38-b9419473a7d8` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

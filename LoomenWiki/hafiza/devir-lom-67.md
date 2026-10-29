---
name: LOM-67 — Planner genişlik ve sayaç inceliklerini düzelt
description: Planner sağ bloğunda sürükleme/klavye ekranda görünen genişlikten başlasın (Home/End/Enter eklensin), 'Yapılacak' sayacı listedeki satırlarla eşitlensin (gecikenler dahil), alışkanlık formu hata/kayıt sırasında arka plan tıklamasıyla kapanmasın ve kasa değişince formda hata gösterilmesin.
type: project
proje: loomen
kaynak: kart LOM-67 · dal fix/LOM-67 · Loomen@802168b5fa80cc519d4c179ae41cfe2a6560177a · test koşusu 89988c95-e3a4-42a3-853b-91836c0a08a8 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-29
---

# LOM-67 — Planner genişlik ve sayaç inceliklerini düzelt

## Ne yapıldı

Planner sağ bloğunda sürükleme/klavye ekranda görünen genişlikten başlasın (Home/End/Enter eklensin), 'Yapılacak' sayacı listedeki satırlarla eşitlensin (gecikenler dahil), alışkanlık formu hata/kayıt sırasında arka plan tıklamasıyla kapanmasın ve kasa değişince formda hata gösterilmesin.

## Adımlar

- rightPanel.ts: iki saf yardımcı ekle. dragStartWidth(stored, rendered): rendered sonlu ve >0 ise clampRightWidth(rendered), değilse stored. rightWidthForKey(key, current, shift, rtl): ArrowLeft/ArrowRight → mevcut nextRightWidth mantığı (adım 16, Shift ile 64), Home → RIGHT_PANEL_MIN, End → RIGHT_PANEL_MAX, Enter → RIGHT_PANEL_DEFAULT, diğer tuşlar null.
- RightPanel.tsx: .lo-side div'ine ref ver. measured() = parseFloat(getComputedStyle(el).width) (.lo-side content-box, border/padding dahil edilmez). onDown'da start ve cur = dragStartWidth(width, measured()); onKey'de rightWidthForKey(e.key, dragStartWidth(width, measured()), e.shiftKey, isRtl()) sonucu null değilse preventDefault + setWidth. Mobilde değişiklik yok.
- Çeviri (tr/en/ar translation.json planner.resizeRight): ipucuna klavye bilgisini ekle: 'ok tuşları ayarlar, Home/End uçlara, Enter varsayılana'.
- rightPanelTest.ts: dragStartWidth (ölçüm varsa onu kullanır, 0/NaN/undefined'da kayıtlıya döner, sınır dışı ölçüm clamp edilir) ve rightWidthForKey (Home/End/Enter, ok tuşu LTR/RTL, Shift, bilinmeyen tuş null) kontrolleri.
- grouping.ts focusCounts: yapilacak = açık üst düzey ve planDate'i olan BÜTÜN görevler (geciken+bugün+yaklaşan); geciken ve planlanmamis aynen. Yorumda 'mini listedeki satır sayısıyla aynı (LOM-67)' yaz.
- agendaViewTest.ts (a) bölümüne ekle: miniAgendaSections('yapilacak') satır toplamı === counts.yapilacak (örnek veride 4). planDayTest.ts: (d) bölümünde beklentiyi [3,4] → [1,4] ve açıklamayı 'Yapılacak değişmez' yap; LOM-47 bölümünde [1,2,1] → [1,3,1].
- LoomenWiki/modules/planlayici-takvim-pomodoro.md sayaç tablosu: Yapılacak = 'tarihi olan bütün açık görevler (gecikenler dahil; listedeki satır sayısı)'.
- useAppStore.ts habitCommit catch: HabitVaultChanged ise rethrow olsa da fırlatma, false dön (yalnız diğer hatalarda HabitSaveError). AppState yorumlarını (habitAdd/habitNewRound/habitEdit) 'kasa değişirse null döner' diye güncelle.
- HabitForm.tsx: arka plan onClick'i (e) => { if (e.target !== e.currentTarget || error || busy) return; onClose(); } yap. submit'te null sonuç ve süren tur yoksa (kasa değişti) onClose() çağır; hata metni gösterme.
- npm run typecheck, npm test, npm run build koş; not dosyalarına yazım olmadığını git status ile gör. Commit mesajı Türkçe, AI imzası yok.

## Dokunulan dosyalar

- `Loomen/src/core/layout/rightPanel.ts`
- `Loomen/src/components/RightPanel.tsx`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/rightPanelTest.ts`
- `Loomen/src/core/vault/grouping.ts`
- `Loomen/src/core/__test__/agendaViewTest.ts`
- `Loomen/src/core/__test__/planDayTest.ts`
- `Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Habits/HabitForm.tsx`

## Test

Testler geçti.

> Tip denetimi, 28 test dosyasının tamamı ve derleme temiz geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-67`
- Commit: `Loomen@802168b5fa80cc519d4c179ae41cfe2a6560177a`
- Test koşusu: `89988c95-e3a4-42a3-853b-91836c0a08a8` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

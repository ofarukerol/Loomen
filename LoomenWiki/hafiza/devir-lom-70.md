---
name: LOM-70 — Alışkanlıkta ikinci dokunuş yarım yapıldı olsun
description: Alışkanlık gününe dokunuş döngüsü boş → tam → yarım → boş olur; yarım gün kayda girer, bütün görünümlerde yarım dolu görünür, sayımda tam gün sayılmaz ama seriyi bozmaz ve mühür basılmaz.
type: project
proje: loomen
kaynak: kart LOM-70 · dal fix/LOM-70 · Loomen@8301ea90853f0d1873251afa5a8096bd3d535760 · test koşusu abc076b2-cc16-48b8-a730-64bbdfbcdf41 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-30
---

# LOM-70 — Alışkanlıkta ikinci dokunuş yarım yapıldı olsun

## Ne yapıldı

Alışkanlık gününe dokunuş döngüsü boş → tam → yarım → boş olur; yarım gün kayda girer, bütün görünümlerde yarım dolu görünür, sayımda tam gün sayılmaz ama seriyi bozmaz ve mühür basılmaz.

## Adımlar

- Çekirdek tür: `Loomen/src/core/habit/types.ts` içinde Habit'e `half: string[]` (sıralı, tekil) alanı ve CellState'e `"half"` değeri ekle; HabitStats'a `half: number` sayacı ekle. Dosya sürümü 1 kalır.
- Kodlayıcı: `Loomen/src/core/habit/codec.ts` encodeHabit'te `excused`'dan sonra yalnız liste doluysa `half` yaz (eski dosyalar aynen kalsın, saveHabit gereksiz yazmasın). decodeHabit'te `half` alanı keyList ile okunur, yoksa `[]`; done ve excused ile çakışan günler yarım listesinden düşer (öncelik: excused > done > half, bugünkü done/excused kuralıyla uyumlu).
- Model: `Loomen/src/core/habit/model.ts` cellState'e `half.includes(key)` kontrolü (excused ve done'dan sonra, today'den önce). toggleDay döngüsü: done ise done'dan çıkar ve half'a ekle; half ise half'tan çıkar (boş); aksi halde done'a ekle, excused ve half'tan düş. setExcused true ise half'tan da düşür. newHabit ve successor `half: []` üretir. stats: yarım gün completed'a girmez, elapsed'e girer, run'ı sıfırlamaz ve uzatmaz (excused gibi), güncel seri döngüsünde break etmez; `half` sayısı döner. outcome değişmez (yarım gün done/excused değil → Tamamlandı olmaz). editHabit, quitHabit, restart alanı korur (spread ile zaten korunur; successor'a açıkça ekle).
- Görünüm yardımcıları: `Loomen/src/core/habit/view.ts` isSealed'e dokunma (yarım gün done/excused değil → mühür yok; teste yaz). Yeni `touchedToday` (done|excused|half) ekle ve activeHabits sıralamasında onu kullan (yarım işaretlenen kart parmağın altından kaçmasın); markedToday, allDoneToday ve todayProgress done+excused olarak kalsın (yarım 'tamam' sayılmaz). lastSevenStrip cellState üzerinden kendiliğinden yarım verir.
- Çekirdek testleri: `Loomen/src/core/__test__/habitTest.ts` içine döngü (boş→done→half→boş), mazeretli→done geçişi, setExcused'un half'ı düşürmesi, encode/decode gidiş-dönüş (half yazılır/okunur), half olmayan eski JSON'un `half: []` ile açılması ve encode çıktısının eskisiyle aynı olması, done+half çakışan dosyanın temizlenmesi, stats (completed artmaz, elapsed artar, güncel ve en uzun seri bozulmaz, half sayacı), outcome'un yarım günle `ended` olması. `Loomen/src/core/__test__/habitViewTest.ts` içine: yarım günle isSealed false, lastSevenStrip'te half hücre, touchedToday sıralaması, todayProgress ve allDoneToday'in yarımı saymaması.
- Çeviriler: `Loomen/src/i18n/locales/{tr,en,ar}/translation.json` habit bölümüne `state.half` (Yarım / Half / نصف), `todayHalf` (Bugün yarım yapıldı), `menu.half` (Yarım yapıldı say), `menu.undo` yarım hücrede de kullanılır; `gridHint` metnini güncelle ('Bir güne dokun: tam, yarım, boş sırasıyla değişir. Sağ tık ya da uzun basış: mazeret ve günün notu.'). Üç dilde anahtarlar birebir aynı olsun.
- Planner kartı: `Loomen/src/screens/Planner/HabitsTodayCard.tsx` satırda `half = h.half.includes(today)`; düğmeye `is-half` sınıfı, `aria-pressed={done ? true : half ? "mixed" : false}`, etiket half ise `habit.todayHalf`; içerik half ise yarım dolu daire (SVG: alt yarısı dolu daire ya da `::before` yarım dolum). Satır sınıfı `is-done` done||excused için kalsın; half için `is-half`.
- Alışkanlık kartı: `Loomen/src/screens/Habits/HabitCard.tsx` `halfToday` oku; Bugün düğmesine `is-half` sınıfı, `aria-pressed` mixed, etiket `habit.todayHalf`, kutuda yarım dolu işaret; `is-marked` kart sınıfına half'ı da kat; halka değeri `(st.completed + st.excused + st.half / 2) / habit.days`.
- Gün dizisi: `Loomen/src/screens/Habits/HabitGrid.tsx` CellMark'a `half` dalı (yarım dolu daire SVG); hücre `aria-pressed` done→true, half→"mixed"; `toggle` içinde `fresh` yalnız boş→done geçişinde kalsın. CellMenu: cell.state done ise ilk madde `habit.menu.half` (sonraki durum yarım) ve ikon olarak yarım daire; half ise `habit.menu.undo` (Undo2); boş/mazeretli ise `habit.menu.done`.
- Ayrıntı ve Geçmiş: `Loomen/src/screens/Habits/HabitDetail.tsx` açıklama satırına `is-half` renk örneğiyle `habit.state.half` maddesi (done'dan sonra), halka değerine yarım gün yarım puan. `Loomen/src/screens/Habits/HabitHistory.tsx` RoundRow halka değerine aynı yarım puan; ısı şeridi cellState'ten half'ı zaten alır. `HabitStrip.tsx` değişmez (title `habit.state.half`'ı t ile bulur).
- Stil: `Loomen/src/styles/app.css` içine `.lo-hab-strip__day.is-half` (dikey yarım dolum: `linear-gradient(to top, var(--hab-c) 50%, var(--hab-c-soft) 50%)` + ince kenar; RTL'den bağımsız), `.lo-hab-cell.is-half` (zemin `--hab-c-soft`, kenar `--hab-c`, mark rengi `--hab-ink`), `.lo-hab-cell__half` SVG rengi, `.lo-hab-today.is-half` ve `.lo-hab-today__box` yarım dolum, `.lo-hab-side__check.is-half::before` yarım dolum, `.lo-hab-legend__sw.is-half`. Koyu tema için `[data-theme="dark"]` kenar kontrastı (mazeretli hücreyle aynı kalıp). 375px mobil kuralları mevcut seçicilerle çalışır; yeni sınıf ekstra genişlik istemiyor.
- Doğrulama: `npm test` (habitTest, habitViewTest, helpTest dahil hepsi yeşil), `npm run typecheck`, `npm run build`. Çeviri anahtarlarının üç dilde eşit olduğunu habit bölümü için elle karşılaştır (helpTest yalnız help bölümünü denetler).

## Dokunulan dosyalar

- `Loomen/src/core/habit/types.ts`
- `Loomen/src/core/habit/codec.ts`
- `Loomen/src/core/habit/model.ts`
- `Loomen/src/core/habit/view.ts`
- `Loomen/src/core/__test__/habitTest.ts`
- `Loomen/src/core/__test__/habitViewTest.ts`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/screens/Planner/HabitsTodayCard.tsx`
- `Loomen/src/screens/Habits/HabitCard.tsx`
- `Loomen/src/screens/Habits/HabitGrid.tsx`
- `Loomen/src/screens/Habits/HabitDetail.tsx`
- `Loomen/src/screens/Habits/HabitHistory.tsx`
- `Loomen/src/styles/app.css`

## Test

Testler geçti.

> Tip denetimi, tüm birim testleri (31 dosya) ve derleme geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-70`
- Commit: `Loomen@8301ea90853f0d1873251afa5a8096bd3d535760`
- Test koşusu: `abc076b2-cc16-48b8-a730-64bbdfbcdf41` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

---
name: LOM-56 — Planner'a 'Bugünün alışkanlıkları' kartı (LOM-53/3)
description: Planner sağ bloğuna, Pomodoro kartının altına, aktif alışkanlıkları tek satırda listeleyip hızlı çentik atmayı sağlayan 'Bugünün alışkanlıkları' kartı eklenir; aktif alışkanlık yoksa kart görünmez.
type: project
proje: loomen
kaynak: kart LOM-56 · dal fix/LOM-56 · Loomen@b7205a69b0385d61a38ee36bf0ce9cd39b48ac78 · test koşusu 608810d7-9938-4737-aea8-6b2464df368e (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-27
---

# LOM-56 — Planner'a 'Bugünün alışkanlıkları' kartı (LOM-53/3)

## Ne yapıldı

Planner sağ bloğuna, Pomodoro kartının altına, aktif alışkanlıkları tek satırda listeleyip hızlı çentik atmayı sağlayan 'Bugünün alışkanlıkları' kartı eklenir; aktif alışkanlık yoksa kart görünmez.

## Adımlar

- Dal temeli: fix/LOM-56 üzerinde src/screens/Habits/ ve src/core/habit/ yoksa yerel fix/LOM-55 dalını bu dala birleştir (git merge, push yok, dal değiştirme yok). npx tsc --noEmit ve npm test ile ekranın ve çekirdeğin geldiğini doğrula (habitTest ve habitViewTest listede, yeşil). Sonra HabitCard.tsx, HabitRing.tsx, HabitsScreen.tsx, core/habit/view.ts ve useAppStore'daki habit* eylemlerini oku; bu dosyalara dokunma.
- src/screens/Planner/HabitsTodayCard.tsx yaz (ReviewCard emsal): store'dan habits, habitsLoaded, habitToggleDay, setScreen, habitOpenDetail oku. today = dayKey(new Date()) her çizimde; list = activeHabits(habits, today) (çentiksizler üstte); habitsLoaded değilse ya da list boşsa null döndür. allDoneToday(habits, today) ise başlıktan sonra tek satır t('habit.allDone') göster; satırlar soluk (is-done) kalır ki yanlış çentik geri alınabilsin.
- Kart yapısı: .lo-card.lo-hab-today; başlık button.lo-hab-today__head (lucide Sprout + t('habit.todayTitle')), tıklanınca habitOpenDetail(null) ve setScreen('habits'). Her alışkanlık li/div .lo-hab-today__row, data-color ile --hab/--hab-soft (HabitCard'daki aynı yöntem): simge (emoji), ad (tek satır, text-overflow ellipsis), küçük HabitRing (size ~22, value=stats(h,today).completed, total=h.days, color=h.color) ve yanında mono 'Gün x / y' (t('habit.dayOf', {n: dayIndex(h, today), total: h.days})), sonda button.lo-hab-today__check (min 40x40, aria-pressed=bugün done, aria-label done ise t('habit.uncheck') değilse t('habit.today'), lucide Check simgesi) onClick → habitToggleDay(h.id, today). Satıra tıklama ayrıntı açmaz; yalnız başlık ve çentik düğmesi etkileşimli.
- src/components/RightPanel.tsx: HabitsTodayCard'ı içe aktar ve <PomodoroCard /> ile <CalendarCard /> arasına koy; dosya başındaki yoruma 'Alışkanlıklar' ekle.
- Çeviriler tr/en/ar translation.json 'habit' bölümüne iki anahtar: todayTitle ('Bugünün alışkanlıkları' / 'Today's habits' / Arapça kısa karşılığı) ve uncheck ('Çentiği kaldır' / 'Uncheck' / Arapça). allDone, dayOf ve today var olan anahtarlardan yeniden kullanılır; üç dilde aynı anahtar seti.
- src/styles/app.css: lo-hab bloğunun sonuna .lo-hab-today stilleri, tokenlarla: kart padding 12px 14px, margin-bottom 14px (lo-pomoc/lo-revcard dili); __head lo-revcard__head gibi (12px, 600, hover accent); __all satırı (12.5px, --fg3, Check simgesi); __row flex, gap 8px, min-height 40px, padding-block 3px, satırlar arası ince --line; __emoji sabit genişlik; __name flex:1, min-width:0, ellipsis; __ring + __day (--font-mono, 11px, --fg3, flex-shrink:0); __check 40x40, border-radius 50%, --hab-soft zemin, aria-pressed=true'da --hab dolu ve beyaz çentik, hover/focus-visible halkası, 150ms geçiş; .is-done satırda ad --fg3. Tüm boşluklar margin-inline/padding-inline (RTL). .lo-app.is-mobile ve .lo-mplan içinde aynı kart taşmadan sığar (360px: ring+gün etiketi dar, ad kırpılır). @media (prefers-reduced-motion: reduce) geçişler kapalı.
- Doğrulama: npx tsc --noEmit, npm test, npm run build yeşil. Test adımına not (Excalibur, Playwright, vite dev + örnek kasa): aktif alışkanlık yokken Planner'da kart yok; Alışkanlıklar ekranından bir alışkanlık ekle → Planner'da kart görünür; karttan çentik at → Alışkanlıklar ekranında bugün dolu ve Alışkanlık/<id>.json'da done listesinde bugün var; tekrar bas → geri alınır; hepsini çentikle → 'Bugünün hepsi tamam' satırı; başlığa tıkla → Alışkanlıklar ekranı; 360px görünümde taşma yok, çentik düğmesi ≥40px; koyu tema ve Arapça RTL göz atılır. Commit mesajı Türkçe, AI imzası yok, dal fix/LOM-56.

## Dokunulan dosyalar

- `Loomen/src/screens/Planner/HabitsTodayCard.tsx`
- `Loomen/src/components/RightPanel.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`

## Test

Testler geçti.

> Tip denetimi temiz, 26 test dosyasının hepsi geçti, derleme tamamlandı. Kartın tarayıcıda görünüşü bu adımda denenmedi; canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-56`
- Commit: `Loomen@b7205a69b0385d61a38ee36bf0ce9cd39b48ac78`
- Test koşusu: `608810d7-9938-4737-aea8-6b2464df368e` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

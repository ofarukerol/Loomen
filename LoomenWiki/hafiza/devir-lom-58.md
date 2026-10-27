---
name: LOM-58 — Alışkanlıklar: mobil menü girişi, bırakma akışı ve sabit kart sırası
description: Alışkanlıklar ekranına mobil ⋮ menüsünden giriş eklenir, Bırak sonrası ayrıntı kapanıp Geçmiş sekmesi bilgi satırıyla açılır, bırakılan turda bırakma günü gösterilir, aktif kart sırası çentik atınca sabit kalır ve dokunma hedefleri 40px'e çıkar.
type: project
proje: loomen
kaynak: kart LOM-58 · dal fix/LOM-58 · Loomen@5de51c4043a904304dfb8a1eb46ca5ba86d8f30b · test koşusu f08c3e2e-81b9-4ba3-805d-ba85f1831ec2 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-27
---

# LOM-58 — Alışkanlıklar: mobil menü girişi, bırakma akışı ve sabit kart sırası

## Ne yapıldı

Alışkanlıklar ekranına mobil ⋮ menüsünden giriş eklenir, Bırak sonrası ayrıntı kapanıp Geçmiş sekmesi bilgi satırıyla açılır, bırakılan turda bırakma günü gösterilir, aktif kart sırası çentik atınca sabit kalır ve dokunma hedefleri 40px'e çıkar.

## Adımlar

- view.ts: `finishedOn(habit)` fonksiyonunu `export` yap. Yeni `quitDayNo(habit): number | null` ekle: status 'quit' değilse null; değilse `dayIndex(habit, finishedOn(habit))` sonucunu 1..habit.days aralığına kırp (bırakma günü başlangıçtan önceyse 1). `dayIndex` model.ts'ten import edilir.
- view.ts: Yeni `keepOrder(prevIds: string[], next: Habit[]): Habit[]` ekle: önce prevIds sırasıyla next'te hâlâ bulunan turlar (güncel nesneleriyle), ardından prevIds'de olmayan yeni turlar next'teki sırayla; prevIds boşsa next olduğu gibi döner. Saf fonksiyon, React yok.
- habitUi.ts: `quitDay(habit)` gövdesini `habit.status === 'quit' ? finishedOn(habit) : null` olacak şekilde sadeleştir; `finishedOn` core/habit'ten import edilir, `dayKey` importu artık gerekmiyorsa kaldır.
- habitViewTest.ts: quitDayNo testleri ekle: 41 günlük tur (start 2026-10-01) quitAt 11 Ekim 2026 → 11; bırakma anı son günden sonra → days; quitAt yoksa → days; aktif tur → null. keepOrder testleri: aynı küme farklı sırada → önceki sıra korunur ve nesneler next'ten gelir; prevIds'de olmayan yeni kimlik sona eklenir; prevIds'de olup next'te olmayan düşer; boş prevIds → next aynen.
- Çeviriler tr/en/ar: `habit.quitOnDay` (tr '{{n}}. günde bırakıldı', en 'Quit on day {{n}}', ar '{{n}}' sayısıyla uygun Arapça) ve `habit.movedToHistory` (tr '{{name}} Geçmiş'e taşındı', en '{{name}} moved to History', ar tabHistory'deki 'السجل' sözcüğüyle). `mobile.noActions` anahtarını üç dilden sil (tek kullanım yeri MobileTopBar, grep ile doğrulandı).
- MobileTopBar.tsx: lucide'den `Sprout` import et. ⋮ açılır menüsüne her ekranda görünen `button.lo-mtop__item role=menuitem` ekle: Sprout simgesi (16px) + `t('ribbon.habit')` ('Alışkanlıklar'); onClick: `setScreen('habits')` ve `setMenuOpen(false)`. Editördeki okuma/düzenleme maddesi aynen kalır (inEditor ise onun üstünde ya da altında); `lo-mtop__item--empty` satırı ve `mobile.noActions` kullanımı kaldırılır. app.css'teki `.lo-mtop__item--empty` kuralı da silinir.
- HabitDetail.tsx: yeni `onQuit?: (h: Habit) => void` prop'u ekle. Bırak onayında `onConfirm` async olur: `await habitQuit(habit.id)`; ardından `useAppStore.getState().habits` içinde bu kimliğin status'u 'quit' ise `openDetail(null)` ve `onQuit?.(habit)` çağrılır; değilse (kayıt düştü, hata şeridi zaten gösterilir) ayrıntı açık kalır.
- HabitDetail.tsx: `quitDayNo(habit)` ile `qNo` hesapla; meta satırındaki gün yazısı quit ise `t('habit.quitOnDay', { n: qNo })`, değilse mevcut `habit.dayOf`. Kalan gün (`habit.sum.left`) kutusunu quit ise çizme; `dl.lo-hab-summary` sınıfına quit iken `lo-hab-summary--three` ekle.
- HabitsScreen.tsx: `notice` state'i (string | null) ve 3000 ms'lik temizleme useEffect'i ekle; brokenLine'ın altına, sekmelerin üstüne `div.lo-hab-notice role=status` ile `t('habit.movedToHistory', { name })` çiz. HabitDetail'e `onQuit` ver: `setTab('history')`, `setNotice(h.name)`, Geçmiş süzgeci 'completed' ise `habitSetHistoryFilter('all')`.
- HabitsScreen.tsx: sabit sıra. `order` state'i (string[]) tut; `listVisible = !detail && tab === 'active'`; `activeKey = active kimlikleri sıralı birleşik`. `useLayoutEffect([listVisible, activeKey])`: listVisible ise `setOrder(active.map(h => h.id))`. Çizilecek liste `useMemo(() => keepOrder(order, active), [order, active])`. Böylece ilk çizim, sekmeye dönüş, ayrıntıdan dönüş ve kimlik kümesi değişimi sırayı yeniler; yalnız işaret değişimi dokunmaz.
- app.css: `.lo-hab-back` min-height 36→40; `.lo-hab-actions .lo-btn` 38→40; `.lo-hab-hgroup__actions .lo-btn` 36→40 (mobil kuralı zaten 40, aynı kalır). `.lo-hab-detail__bar` üst boşluğunu 40px'e göre ayarla (ör. margin -10px 0 12px). `.lo-hab-summary--three { grid-template-columns: repeat(3, minmax(0, 1fr)); }` ekle; mobilde (`.lo-app.is-mobile .lo-hab-summary--three`) 3 sütun ya da 2 sütun kararı: 2 sütunda bir kutu tek kalır, 3 dar sütun tercih edilir. `.lo-hab-notice` stilini `.lo-hab-alldone` kalıbıyla (accent soft zemin, simge yok ya da Sprout) ekle; loFade animasyonu kullanılabilir.
- Doğrulama: `npx tsc --noEmit`, `npm test`; habitViewTest çıktısında yeni quitDayNo ve keepOrder satırlarının ✓ olduğu kanıtlanır. Vite üzerinde Playwright ile 375px'te ⋮ menüsünden habits açılışı, Bırak akışı (ayrıntı kapanır, Geçmiş sekmesi, status satırı), 41 günlük turda bırakma gün yazısı ve kalan gün kutusunun yokluğu, çentikte kart konumunun değişmediği, düğme yüksekliklerinin ≥40px olduğu ölçülür; Arapça RTL'de menü maddesi ve bilgi satırı kontrol edilir.

## Dokunulan dosyalar

- `Loomen/src/core/habit/view.ts`
- `Loomen/src/core/__test__/habitViewTest.ts`
- `Loomen/src/screens/Habits/habitUi.ts`
- `Loomen/src/screens/Habits/HabitDetail.tsx`
- `Loomen/src/screens/Habits/HabitsScreen.tsx`
- `Loomen/src/components/MobileTopBar.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`

## Test

Testler geçti.

> Tip denetimi hatasız geçti. Tam npm test takımı geçti (26 test dosyası), quitDayNo ve keepOrder testleri yeşil. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-58`
- Commit: `Loomen@5de51c4043a904304dfb8a1eb46ca5ba86d8f30b`
- Test koşusu: `f08c3e2e-81b9-4ba3-805d-ba85f1831ec2` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

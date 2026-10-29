---
name: LOM-62 — Alışkanlıklar: Planner kartı daraltılabilsin, alışkanlığın adı/rengi/simgesi düzenlenebilsin
description: Planner'daki 'Bugünün alışkanlıkları' kartı başlıktan daraltılıp açılır (tercih kalıcı, başlıkta 'yapılan/toplam' özeti) ve alışkanlık ayrıntısına 'Düzenle' eklenir: mevcut form düzenleme kipinde ad, simge, renk ve niyeti yerinde günceller; gün sayısı, başlangıç ve çentikler değişmez.
type: project
proje: loomen
kaynak: kart LOM-62 · dal fix/LOM-62 · Loomen@9f80d27b3cfe4fb90cde341d92ccde0e272e0055 · test koşusu 09d10450-68bd-4862-8dba-661ee1a2aa1d (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-29
---

# LOM-62 — Alışkanlıklar: Planner kartı daraltılabilsin, alışkanlığın adı/rengi/simgesi düzenlenebilsin

## Ne yapıldı

Planner'daki 'Bugünün alışkanlıkları' kartı başlıktan daraltılıp açılır (tercih kalıcı, başlıkta 'yapılan/toplam' özeti) ve alışkanlık ayrıntısına 'Düzenle' eklenir: mevcut form düzenleme kipinde ad, simge, renk ve niyeti yerinde günceller; gün sayısı, başlangıç ve çentikler değişmez.

## Adımlar

- Çekirdek (src/core/habit/model.ts): `EditHabitInput { name: string; emoji?: string; color?: HabitColor; intent?: string }` ve saf `editHabit(habit, input): Habit` ekle. Ad kırpılır, boşsa hata atar; emoji boşsa mevcut kalır; color HABIT_COLORS dışındaysa hata atar; intent kırpılıp boşsa alan kaldırılır (`...(intent ? { intent } : {})`). id, days, start, round, prevId, lineageId, status, done, excused, createdAt, quitAt dokunulmadan kopyalanır. Hiçbir alan değişmiyorsa aynı nesne döner (store yazmaz).
- Görünüm yardımcısı (src/core/habit/view.ts): `todayProgress(habits, today): { done: number; total: number }` ekle — aktif turlar içinde markedToday olanların sayısı / aktif tur sayısı. Planner kartı özetini buradan alır.
- Store (src/store/useAppStore.ts): AppState'e `habitEdit: (id: string, input: EditHabitInput) => Promise<Habit | null>`, `habitTodayCollapsed: boolean` ve `toggleHabitToday: () => void` ekle. habitEdit: habitById → editHabit (hata atarsa forma düşer) → next !== h ise `habitCommit([next])`, başarıda next döner. habitTodayCollapsed başlangıçta false; toggle backlinksCollapsed emsaliyle. `partialize`'a `habitTodayCollapsed: s.habitTodayCollapsed` ekle (merge'deki genel `...data` boolean'ı taşır; ek kod gerekmez). Alışkanlık verisi persist'e girmez (mevcut not korunur).
- Form (src/screens/Habits/HabitForm.tsx): `HabitFormMode`'a `{ kind: "edit"; habit: Habit }` ekle. Edit kipinde başlangıç değerleri habit'ten gelir (name, emoji, color, intent); başlık `habit.form.editTitle`, ikon lucide Pencil, gönder düğmesi `habit.form.save`; ad/simge/renk/niyet alanları gösterilir, süre, başlangıç ve tarih önizlemesi GİZLENİR; alanların altında küçük not `habit.form.editFixed` (süre ve başlangıç değişmez, çentikler korunur) ve mevcut aralık `fmtRange(habit.start, endKey(habit))` salt okunur gösterilir. submit'te `habitEdit(habit.id, { name, emoji, color, intent })` çağrılır; sonuç null ise ve hata yoksa pencere kapanır (değişiklik yok). Mevcut `from` (round) mantığı aynen kalır; `shownColor` edit kipinde seçilen renk olur. Ad kutusu edit kipinde de odaklanır.
- Ayrıntı (src/screens/Habits/HabitDetail.tsx): `onEdit: (h: Habit) => void` prop'u ekle; eylemler satırına, Sil'den önce `lo-btn` sınıfıyla lucide Pencil + `t("habit.edit")` düğmesi koy (bütün tur durumlarında görünür; newerLive dalında da gösterilir). Ekran (src/screens/Habits/HabitsScreen.tsx): `openEdit = (h) => setForm({ kind: "edit", habit: h })`, HabitDetail'e `onEdit={openEdit}` ver; `HabitForm onDone` edit kipinde ayrıntıyı kapatmaz (yalnız yeni/tur kipinde `onCreated` çalışır; form.kind'a bak). Ayrıntı, HabitCard, HabitHistory, HabitAside store'dan okuduğu için ek değişiklik gerekmez.
- Planner kartı (src/screens/Planner/HabitsTodayCard.tsx): store'dan `habitTodayCollapsed` ve `toggleHabitToday` oku. Kök `div.lo-card.lo-hab-side` + collapsed ise ` is-collapsed`. Başlık satırı `div.lo-hab-side__bar`: (1) `button.lo-hab-side__head` artık daraltma düğmesi — onClick toggle, `aria-expanded={!collapsed}`, `aria-controls="lo-hab-side-panel"`, içinde Sprout + başlık + `span.lo-hab-side__sum` (todayProgress ile `${done}/${total}`, `aria-label=t("habit.todayProgress", {done,total})`) + lucide ChevronDown `.lo-hab-side__chev` (OnThisDay emsali, collapsed'da -90° döner); (2) ayrı `button.lo-hab-iconbtn.lo-hab-side__open` lucide ArrowUpRight, `aria-label=t("habit.openScreen")`, title aynı, onClick eski `open` (habitOpenDetail(null) + setScreen('habits')). Liste ve 'hepsi tamam' satırı `div#lo-hab-side-panel.lo-hab-side__panel[aria-hidden=collapsed] > div.lo-hab-side__panelin` içine alınır; collapsed iken içindeki çentik düğmeleri `tabIndex={-1}`.
- Stil (src/styles/app.css, lo-hab-side bloğu): `.lo-hab-side__bar { display:flex; align-items:center; gap:6px; }`, `__head { flex:1; min-width:0 }`, `__sum` (font-mono 11px, --fg3, `margin-inline-start:auto`, padding-inline 6px), `__chev` (--fg3, transition transform .26s, `.is-collapsed &` rotate(-90deg)), `__open` (28px ikon düğmesi, hover accent), `__panel { display:grid; grid-template-rows:1fr; transition:grid-template-rows .26s ease }`, `.is-collapsed .__panel { grid-template-rows:0fr }`, `__panelin { overflow:hidden; min-height:0 }`. Daraltılmış kartta alt boşluk kalmasın (padding-bottom'ı panele taşı ya da `.is-collapsed { padding-bottom: 10px }`). Arapça: `html[lang="ar"] .lo-hab-side__sum { letter-spacing:0 }`, `direction: ltr` sayı için; ok simgesi döndürme RTL'de aynı. prefers-reduced-motion kuralına `__panel, __chev` ekle (mevcut `.lo-hab-side *` kuralı zaten kapsıyor, doğrula). Form edit notu için `.lo-hab-form__note { font-size:12px; color:var(--fg3) }`.
- Çeviriler (src/i18n/locales/{tr,en,ar}/translation.json, habit bölümü): `edit` (Düzenle / Edit / تعديل), `openScreen` (Alışkanlıklar ekranını aç / Open habits screen / افتح شاشة العادات), `todayProgress` ('Bugün {{done}} / {{total}} yapıldı' / '{{done}} of {{total}} done today' / 'أُنجز {{done}} من {{total}} اليوم'), `form.editTitle` (Alışkanlığı düzenle / Edit habit / تعديل العادة), `form.save` (Kaydet / Save / حفظ), `form.editFixed` ('Süre ve başlangıç günü değişmez; çentikler korunur.' / 'Duration and start day stay the same; your check marks are kept.' / Arapça karşılığı). Üç dosyada aynı anahtar seti.
- Testler: src/core/__test__/habitTest.ts'e editHabit bölümü — 7 çentikli ve 1 mazeretli örnekte ad/simge/renk/niyet değiştir: yeni değerler gelir, `done`, `excused`, `id`, `days`, `start`, `round`, `lineageId`, `prevId`, `status`, `createdAt`, `quitAt` birebir aynı (JSON karşılaştırma); boş ad hata atar; geçersiz renk hata atar; niyet boşaltılınca alan silinir; değişiklik yoksa aynı nesne döner; `encodeHabit(editHabit(...))` yeniden okunur ve bırakılmış turda da yalnız ad değişir. src/core/__test__/habitViewTest.ts'e `todayProgress`: aktif 4 turdan 2'si işaretli (1 yapıldı + 1 mazeretli) → {done:2,total:4}; bırakılan/biten sayılmaz; aktif yoksa {0,0}.
- Canlı/ekran doğrulaması test ajanınca koşturulmaz, insana kalır: Doğrulama: `npm run typecheck`, `npm test`, `npm run build` yeşil. Tarayıcıda (vite dev, örnek kasa, Playwright) masaüstü ve 375px, açık ve koyu tema, tr/ar ile ekran görüntüsü: kart başlığına bas → daralır, özet '2/4' görünür, sayfa yenilenince daraltılmış kalır; ok düğmesiyle Alışkanlıklar ekranı açılır; ayrıntıda Düzenle → ad/renk/simge değiştir → kart, ayrıntı, Planner kartı ve Geçmiş'te yeni hâl, gün sayısı ve çentikler aynı, Alışkanlık/<id>.json içinde yalnız name/emoji/color/intent değişmiş; 'bir tur daha' ve yeni alışkanlık akışları bozulmamış. Commit mesajı Türkçe, AI imzası yok, dal fix/LOM-62, push yok.

## Dokunulan dosyalar

- `Loomen/src/core/habit/model.ts`
- `Loomen/src/core/habit/view.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Habits/HabitForm.tsx`
- `Loomen/src/screens/Habits/HabitDetail.tsx`
- `Loomen/src/screens/Habits/HabitsScreen.tsx`
- `Loomen/src/screens/Planner/HabitsTodayCard.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/habitTest.ts`
- `Loomen/src/core/__test__/habitViewTest.ts`

## Test

Testler geçti.

> Tip denetimi, tam test takımı (26 dosya) ve derleme geçti. Düzenleme birim testleri yeşil: çentikler, gün sayısı ve başlangıç korunuyor. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-62`
- Commit: `Loomen@9f80d27b3cfe4fb90cde341d92ccde0e272e0055`
- Test koşusu: `09d10450-68bd-4862-8dba-661ee1a2aa1d` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

---
name: LOM-59 — Alışkanlıklar: gün dizisi, şeritler, Geçmiş kartı ve koyu tema cilası
description: Alışkanlıklar ekranının görünümü cilalanır: gün dizisi 64px hücre ve yan sütun (niyet + dönüm noktaları), kartta 7 gün şeridi gün harfleriyle, Geçmiş turlarında halka/rozet/mühür ve zaman çizgisi, boş halkada başlangıç noktası, koyu tema kontrastı; davranış ve veri değişmez.
type: project
proje: loomen
kaynak: kart LOM-59 · dal fix/LOM-59 · Loomen@d3a4401adc3ffe9193d6170e9307b0df55f27487 · test koşusu 38ff6a5a-0e13-46f5-8001-3fff9cbb968e (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-27
---

# LOM-59 — Alışkanlıklar: gün dizisi, şeritler, Geçmiş kartı ve koyu tema cilası

## Ne yapıldı

Alışkanlıklar ekranının görünümü cilalanır: gün dizisi 64px hücre ve yan sütun (niyet + dönüm noktaları), kartta 7 gün şeridi gün harfleriyle, Geçmiş turlarında halka/rozet/mühür ve zaman çizgisi, boş halkada başlangıç noktası, koyu tema kontrastı; davranış ve veri değişmez.

## Adımlar

- Dalı LOM-58 birleşmiş main'den aç (fix/LOM-59). HabitDetail.tsx'te onQuit/quitDayNo, HabitsScreen.tsx'te keepOrder/notice olduğunu görerek LOM-58'in içeride olduğunu doğrula; o kodlara dokunma.
- Çeviri: tr/en/ar translation.json 'habit' bloğuna 'milestones' anahtarı ekle (tr 'Dönüm noktaları', en 'Milestones', ar 'المحطات'). Başka anahtar gerekmez; 'N. tur · 21 gün' satırı mevcut habit.round ve habit.sealUnit ile ' · ' birleştirilerek yazılır.
- HabitRing.tsx: value 0 iken saat 12'de küçük başlangıç noktası çiz. SVG -90° döndürüldüğü için nokta svg koordinatında (c + r, c) konumuna, yarıçapı stroke/2 olan `circle.lo-hab-ring__start` olarak eklenir; v > 0 iken opacity 0 (geçişli), 0 iken 1. Rengi app.css'te var(--hab-c).
- Yeni dosya src/screens/Habits/HabitAside.tsx: `HabitAside({ habit, today, cutoff })`. Üstte niyet varsa mevcut blockquote.lo-hab-intent (etiket + q) aynen; altında başlık `habit.milestones` ve ol.lo-hab-miles: dayList(habit) üzerinde isMilestone(no, habit.days) ile 7, 14, 21… ve son gün; her maddede nokta, t('habit.dayN') ve fmtDay(key, 'd MMM'). key <= (cutoff ?? today) ise 'is-reached' (dolu nokta), key === today ise 'is-today'.
- HabitDetail.tsx: header altındaki niyet blockquote'unu kaldır. section.lo-hab-detail__grid içinde `div.lo-hab-gridwrap` aç: içine HabitGrid ve HabitAside (habit, today, cutoff); legend ve ipucu gridwrap'in altında tam genişlikte kalır. LOM-58'in quit/qNo/summary--three kodu aynen kalır.
- HabitGrid.tsx: hücrede köşe noktası yerine dönüm noktası etiketi. is-milestone hücrede `.lo-hab-cell__no` span'ına ek sınıf 'is-ms' ver (CSS'te hab-c-soft zemin, kalın, hab-ink; done hücrede hab-on zemin ve hab-c yazı). is-last sınıfı kalır (çizgi biraz kalın). Başka davranış değişmez.
- HabitStrip.tsx: `today?: string` prop'u ekle. week varyantında her gün `span.lo-hab-strip__col` içinde `span.lo-hab-strip__day` + `span.lo-hab-strip__dow` (fmtDay(key, 'EEEEEE', lang)); key === today ise col'a 'is-now'. heat varyantı yalnız hücre basar (yapı aynı). HabitCard.tsx: HabitStrip'e today ver; dayNo === 1 ve marked === 0 iken `.lo-hab-card__day` span'ına 'is-first' sınıfı ekle.
- HabitHistory.tsx RoundRow: li.lo-hab-round = `div.lo-hab-round__ring` (HabitRing 36px, stroke 3.5, value (completed+excused)/days; içinde completed→Check, quit→Flag, ended→emoji) + button.lo-hab-round__btn. Düğmede: `.lo-hab-round__title` ('N. tur · 21 gün', showRound değilse yalnız gün), `.lo-hab-round__range`, OutcomeBadge + yüzde satırı, HabitStrip heat. outcome completed ise düğmeye 'is-sealed' ve köşede `span.lo-hab-round__seal` (days + sealUnit). Çizim sırası `[...g.items].reverse()` ile 1. tur üstte; latest = g.items[0] aynı kalır, çekirdek sıralama değişmez. lucide'den Check ve Flag import edilir.
- app.css gün dizisi: .lo-hab-grid max-width kaldır; .lo-hab-grid__row grid-template-columns repeat(7, minmax(0, 64px)), gap 8px; .lo-hab-grid gap 8px. .lo-hab-gridwrap { display:flex; flex-wrap:wrap; gap: 24px; align-items:flex-start }, .lo-hab-grid { flex: 0 1 496px; min-width:0 }, .lo-hab-aside { flex: 1 1 200px; min-width:0; display:flex; flex-direction:column; gap:16px } (.lo-hab-intent içinde margin 0). Mobil: .lo-app.is-mobile .lo-hab-grid__row repeat(7, minmax(0,1fr)) gap 5px, .lo-hab-grid flex-basis 100%, aside tam genişlikte altta; .lo-hab-miles mobilde satıra kırılan yatay liste. .lo-hab-miles / __item / __dot / is-reached / is-today stilleri (dolu nokta hab-c; bugün hab-ink kalın ve halo).
- app.css dönüm noktası hücresi: .is-milestone::after ve .is-last::after nokta/baklava kurallarını kaldır; yerine alt kenarda inset-inline: 8px, height 2px (is-last 3px), hab-c çizgi; done hücrede hab-on. `.lo-hab-cell__no.is-ms` { padding 1px 3px; border-radius 4px; font-weight 700; color hab-ink; background hab-c-soft } ve `.is-done .lo-hab-cell__no.is-ms` { color hab-c; background hab-on }.
- app.css şeritler: .lo-hab-strip--week { gap: 6px }, .lo-hab-strip__col { flex:1 1 0; display:flex; flex-direction:column; align-items:center; gap:3px; min-width:0 }, .lo-hab-strip--week .lo-hab-strip__day { width:100%; max-width:28px; min-width:12px; height:auto; aspect-ratio:1; border-radius:6px }, .lo-hab-strip__dow { font-size:10px; line-height:1; color: fg3 }, .is-now .lo-hab-strip__dow { color: hab-ink; font-weight:700 }. .lo-hab-strip--heat { flex-wrap:wrap; gap:3px }, hücre flex 0 0 10px, 10x10, radius 2px; .lo-app.is-mobile'da 8px; :has(:nth-child(31/61)) aralık kurallarını kaldır. .lo-hab-card__day.is-first { color hab-ink; font-weight 700 }.
- app.css Geçmiş: .lo-hab-round { position:relative; display:flex; gap:12px; align-items:flex-start }, .lo-hab-rounds gap 10px; .lo-hab-round:not(:last-child)::after { position:absolute; inset-inline-start:17px; top:36px; bottom:-10px; width:2px; background: line } zaman çizgisi; .lo-hab-round__ring .lo-hab-ring__inner renkleri (completed hab-c, quit fg3, emoji 14px). .lo-hab-round__btn flex:1 min-width:0 position:relative; .is-sealed padding-inline-end 62px; .lo-hab-round__seal (.lo-hab-seal'in 44px küçüğü, inset-inline-end, rotate -12deg, animasyonsuz). .lo-hab-round__title, __range mono fg3. Rozet: .lo-hab-badge.is-completed { background: var(--hab-c, var(--success)); color: var(--hab-on) }, .is-quit { border:1px dashed fg3; background transparent }, .is-ended nötr kalır. .lo-hab-ring__start { fill: var(--hab-c); transition opacity }.
- app.css koyu tema ve çip: [data-theme="dark"] .lo-hab-tab__count { color: fg2; background: color-mix(in srgb, var(--bg) 70%, var(--line-soft)) }; [data-theme="dark"] .lo-hab-cell.is-future border-color color-mix(fg3 45%); [data-theme="dark"] .lo-hab-cell.is-excused border-color color-mix(hab-c 60%), hilal hab-ink; [data-theme="dark"] .lo-hab-cell__slash { color: fg2; opacity: .85 }. .lo-hab-chip transition'dan background çıkar (yalnız border-color, color). Bütün yeni konumlar mantıksal (inset-inline-*, margin-inline-*); yeni animasyon eklenmezse mevcut prefers-reduced-motion bloğu (.lo-hab *) yeterli, eklenirse aynı bloğa dahil et.
- Doğrulama: `npx tsc --noEmit` ve `npm test` koş; habitViewTest dahil 26 dosya yeşil olmalı. Değiştirilen dosyaları gözden geçir: HabitStrip week/heat varyantları, RTL için yön bağımlı (left/right) özellik kalmadığını grep ile kontrol et (`left:|right:|margin-left|padding-right` lo-hab bloğunda).

## Dokunulan dosyalar

- `Loomen/src/screens/Habits/HabitGrid.tsx`
- `Loomen/src/screens/Habits/HabitAside.tsx`
- `Loomen/src/screens/Habits/HabitDetail.tsx`
- `Loomen/src/screens/Habits/HabitStrip.tsx`
- `Loomen/src/screens/Habits/HabitCard.tsx`
- `Loomen/src/screens/Habits/HabitHistory.tsx`
- `Loomen/src/screens/Habits/HabitRing.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`

## Test

Testler geçti.

> Tip denetimi hatasız geçti, npm test 26 dosyanın tümüyle geçti. Alışkanlıklar CSS bölümünde sol/sağ sabit özellik yok. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-59`
- Commit: `Loomen@d3a4401adc3ffe9193d6170e9307b0df55f27487`
- Test koşusu: `38ff6a5a-0e13-46f5-8001-3fff9cbb968e` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

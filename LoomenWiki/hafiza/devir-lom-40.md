---
name: LOM-40 — Bugüne Odaklan: 'Günü planla' düğmesi (gecikenleri bugüne al)
description: Bugüne Odaklan kartına "Günü planla" düğmesi: geciken açık görevleri onay kutusuyla seçtirip tarihlerini dosya başına tek yazımda bugüne çeken pencere, mağaza aksiyonu ve birim testleri.
type: project
proje: loomen
kaynak: kart LOM-40 · dal fix/LOM-40 · Loomen@13c4601968922abc21806c1ef7a59a758eff934e · test koşusu 6729a52e-7ef8-4e85-a2a0-7a1e3af33594 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-16
---

# LOM-40 — Bugüne Odaklan: 'Günü planla' düğmesi (gecikenleri bugüne al)

## Ne yapıldı

Bugüne Odaklan kartına "Günü planla" düğmesi: geciken açık görevleri onay kutusuyla seçtirip tarihlerini dosya başına tek yazımda bugüne çeken pencere, mağaza aksiyonu ve birim testleri.

## Adımlar

- taskParser.ts: `rescheduleTaskLine(raw, todayISO)` ekle — satırda geçerli bir `📅 YYYY-MM-DD` varsa yalnız o tarihi bugüne çevir, yoksa `⏳` tarihini çevir, ikisi de yoksa satırı aynen döndür. ⏰ saat, 🔁 tekrar, ➕/🆔 gibi bilinmeyen belirteçler, girinti ve `\r` aynen kalır; yeni satır eklenmez.
- taskParser.ts: `rescheduleTasksInContent(content, items: {line, raw}[], todayISO): {content, changed, stale}` ekle — her satır için `taskLineMatches` kilidi uygulanır (tutmuyorsa stale++ ve atla), EOL `eolOf` ile korunur, satır sayısı değişmez.
- Yeni dosya src/core/vault/planDay.ts (saf, i18n içermez): `overdueOpenTasks(tasks, todayISO)` — focusCounts'un geciken kuralıyla aynı (indent 0, done değil, due ?? scheduled takvim gününe göre bugünden küçük), tarih sonra dosya/satır sırasıyla; `planRescheduleBatches(ids, tasks): Map<file, {line, raw}[]>` — `file:line` kimliklerini parsedTasks ile eşleyip dosyaya göre gruplar.
- useAppStore.ts: AppState'e `rescheduleTasksToToday: (ids: string[]) => Promise<void>` ekle; updateTask'ın hemen altına uygulama: `queueFileOp` içinde `flushDraft()`, `get().parsedTasks` ile gruplar, dosya başına `backend.readNote` → `rescheduleTasksInContent` → changed>0 ise `backend.writeNote`; stale toplamı; hata olursa `errors.updateTask` ile bildir ve dur; sonda tek `loadFromBackend()`; stale>0 ise `errors.taskStale` bildir.
- Yeni test src/core/__test__/planDayTest.ts (coreTest'teki check/eq kalıbı) ve scripts/run-tests.mjs suites listesine kayıt. Senaryolar: 📅 bugüne alınır ve ⏰ korunur; 🔁 korunur ve satır sayısı aynı (kopya yok); ➕/🆔 bilinmeyen belirteçler aynen kalır; yalnız ⏳ olanda ⏳ değişir; ikisi varken yalnız 📅 değişir; tarihsiz/tamamlanmış satır değişmez; CRLF korunur; aynı dosyada iki görevden yalnız seçileni değişir, seçilmeyen aynen kalır; raw uyuşmayan satır stale sayılır ve dokunulmaz; overdueOpenTasks bugün/gelecek/tarihsiz/tamamlanmış/alt görevleri dışlar ve sıralıdır; planRescheduleBatches dosyaya göre doğru gruplar; parse → focusCounts.geciken N iken k görev taşınınca geciken N-k, yapilacak +k olur.
- i18n tr/en/ar planner bölümüne anahtarlar: planDay (Günü planla / Plan the day / خطّط يومك), planDayNone (Geciken iş yok / No overdue tasks / لا مهام متأخرة), planDayHint (Seçtiğin görevlerin tarihi bugüne alınır; saat ve tekrar ayarı korunur. / Selected tasks move to today; time and repeat settings stay. / تُنقل المهام المحددة إلى اليوم؛ يُحتفظ بالوقت وإعداد التكرار.), planDaySelectAll (Tümünü seç / Select all / تحديد الكل), planDayClearAll (Seçimi kaldır / Clear selection / إلغاء التحديد), planDayMove (Bugüne al / Move to today / انقلها إلى اليوم), planDayMoveCount (Bugüne al ({{count}}) / Move to today ({{count}}) / انقلها إلى اليوم ({{count}})), planDayCount ({{count}} geciken görev / {{count}} overdue tasks / {{count}} مهام متأخرة). Üç dosyada anahtar kümesi aynı olsun.
- Yeni bileşen src/screens/Planner/PlanDayModal.tsx ({ onClose }): TrashModal kalıbı — `createPortal(document.body)`, `useModalLayer()`, Escape ve arka plana tıklama kapatır, iç tıklama stopPropagation. `parsedTasks` + `todayISO()` ile `overdueOpenTasks` listesi; her satır: onay kutusu (input type=checkbox, accent-color), görev metni, `relativeLabel(planDate, today)` kırmızımsı, varsa ⏰ saat, kaynak not adı. Seçim `Set<string>` (başta boş; listede olmayan kimlikler temizlenir). Alt şerit: Tümünü seç / Seçimi kaldır (lo-trash__ghost), Bugüne al (N) (lo-tdetail__save; seçim yokken ve meşgulken disabled). Tıklanınca `rescheduleTasksToToday([...secim])` beklenir, sonra onClose. Liste boşsa planDayNone metni.
- MiniAgenda.tsx: başlık satırındaki büyüt düğmesini `.lo-mini__actions` sarmalına al; önüne `.lo-mini__plan` düğmesi (lucide CalendarCheck 13px + planDay metni). `useFocusCounts().geciken === 0` iken `disabled` ve title/aria-label planDayNone. `planOpen` state'i; açıkken `<PlanDayModal onClose={() => setPlanOpen(false)} />`. Mevcut sürükle-bırak ve filtre mantığına dokunulmaz.
- app.css: `.lo-mini__actions` (flex, gap 4px); `.lo-mini__plan` (hayalet düğme, 12px, color fg3, hover'da accent + line-soft zemin yalnız (hover:hover) içinde, :active aynı; disabled opacity .45 ve cursor default); `.lo-planday` (.lo-trash gibi 460px, max-width 100%, max-height 80dvh, bg-elev, radius 16px); `.lo-planday__hint`, `.lo-planday__list` (flex 1, overflow-y auto), `.lo-planday__row` (flex, gap 10px, padding 8px 20px, min-height 44px, cursor pointer, hover line-soft), `.lo-planday__text` (ellipsis), `.lo-planday__meta` (12px fg3; `.is-overdue` danger), `.lo-planday__foot`. Yalnız mantıksal özellikler (margin-inline, inset-inline) — Arapça sağdan sola düzgün. `@media (max-width: 600px)`: `.lo-planday { max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 64px) }`, satır dolgusu 12px.
- Doğrulama: `npx tsc --noEmit`, `npm test` (planDayTest dahil tümü yeşil), `npm run build`. Sonuçta kanıt satırlarını yaz; çevirilerde üç dilde aynı anahtar kümesinin olduğunu kontrol et.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/taskParser.ts`
- `Loomen/src/core/vault/planDay.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/core/__test__/planDayTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/screens/Planner/PlanDayModal.tsx`
- `Loomen/src/screens/Planner/MiniAgenda.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`

## Test

Testler geçti.

> Tip denetimi, tüm birim testleri (16 dosya, planDayTest dahil) ve paketleme geçti. Üç dilde de 31 çeviri anahtarı var. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-40`
- Commit: `Loomen@13c4601968922abc21806c1ef7a59a758eff934e`
- Test koşusu: `6729a52e-7ef8-4e85-a2a0-7a1e3af33594` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

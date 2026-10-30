---
name: LOM-69 — Yeni görev bulunduğu günün en üstüne eklensin
description: Hızlı eklenen görev, kendi gününün bölümünde ilk satıra gelsin: ekleme anında o günün en küçük sıra değerinden küçük bir manuel sıra değeri verilir.
type: project
proje: loomen
kaynak: kart LOM-69 · dal fix/LOM-69 · Loomen@8f97c2d487855fa6c01445bbb146146a92c4bd35 · test koşusu b0656308-0146-4376-99f3-c459f94d8a5e (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-30
---

# LOM-69 — Yeni görev bulunduğu günün en üstüne eklensin

## Ne yapıldı

Hızlı eklenen görev, kendi gününün bölümünde ilk satıra gelsin: ekleme anında o günün en küçük sıra değerinden küçük bir manuel sıra değeri verilir.

## Adımlar

- Loomen/src/core/vault/grouping.ts: saf yardımcı ekle — `orderForNewTask(all: ParsedTask[], newTask: ParsedTask, order: Record<string, number>): Record<string, number>`. Kardeşler: `all` içinde done olmayan, indent 0 olan ve planDate'i yeni görevin planDate'iyle aynı olan görevler (gcal maddeleri de `all` içinde gelir). Kardeş varsa değer = min(taskSortVal(kardeş, order)) - 1; kardeş yoksa 0. Döndürülen harita: `{ ...order, [taskOrderKey(newTask.file, newTask.description)]: değer }`. taskSortVal üstündeki 'manuel > saat > satır' yorumuna hızlı eklemenin manuel değerle en üste konduğunu ekle.
- Loomen/src/store/useAppStore.ts addTask (satır ~2548): `const line = buildTaskLine(text, todayISO())` ayrı değişkene al; yazma başarılı olduktan sonra, loadFromBackend'den ÖNCE `const parsed = parseTaskLine(TASKS_FILE, 0, line)` ile satırı ayrıştır (description tarih/etiket/önceliksiz gelir, anahtar bu yüzden ayrıştırılmış açıklamadan üretilmeli); parsed null değilse `const s = get(); set({ taskOrder: orderForNewTask([...s.parsedTasks, ...s.gcalTasks], parsed, s.taskOrder) })`. Ardından mevcut `await loadFromBackend()` çağrısı sıra haritasını kullanarak grupları yeniden kurar. İçe aktarmalar: satır 51'deki grouping import'una `orderForNewTask`, satır 52'deki taskParser import'una `parseTaskLine` ekle. Hata dalı (catch) değişmez.
- Loomen/src/core/__test__/agendaViewTest.ts: yeni bölüm '(d) Hızlı eklenen görev gününün en üstünde (LOM-69)'. Senaryo: Yapılacaklar.md'de bugün tarihli 'Saatli iş ⏰ 09:00' (saat alanı parser'ın kullandığı biçimde), 'Sürüklenmiş iş' (order haritasında değeri 0), 'Sıradan iş'; ayrıca günlük not '2026-10-29.md' içinde satır 0'da 'Günlük nottan iş' (tarihsiz, noteDateOf ile bugüne düşer); bir de geciken 'Eski fatura'. buildTaskLine('Yeni iş #ev', TODAY) → parseTaskLine ile ayrıştır, orderForNewTask ile haritayı üret, groupTasks(tümü + yeni görev, TODAY, harita) çağır. Kontroller: bugün grubunun ilk görevi 'Yeni iş'; sürüklenmiş, saatli ve günlük nottan gelen hepsi altında; miniAgendaSections 'yapilacak' ile ilk bölüm hâlâ 'overdue'; buildTaskLine('Gelecek iş 📅 2026-11-05') ile eklenen görev 2026-11-05 grubunun ilk satırı; kardeşi olmayan günde değer 0; haritadaki anahtar `taskOrderKey('Yapılacaklar.md','Yeni iş')` (etiket/tarih açıklamadan ayıklanmış).
- Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md 'Hızlı ekleme' bölümüne tek satır: yeni görev kendi gününün bölümünde ilk sırada görünür (o günün en küçük sıra değerinden küçük manuel sıra değeri alır); 'Zaman çizelgesi' bölümündeki gün içi sıra cümlesine manuel sıranın önce geldiğini ekle.
- npm test, npm run typecheck ve npm run build koş; hepsi yeşil olmalı. Commit mesajında AI imzası yok (AGENTS.md §2).

## Dokunulan dosyalar

- `Loomen/src/core/vault/grouping.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/core/__test__/agendaViewTest.ts`
- `Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md`

## Test

Testler geçti.

> Tip denetimi, derleme ve tüm birim testleri geçti. 31 test dosyasının hepsi yeşil, yeni LOM-69 bölümü 28/28 geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-69`
- Commit: `Loomen@8f97c2d487855fa6c01445bbb146146a92c4bd35`
- Test koşusu: `b0656308-0146-4376-99f3-c459f94d8a5e` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

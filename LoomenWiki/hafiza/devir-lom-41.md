---
name: LOM-41 — Tekrar eden görev bugüne alınınca çoğalıyor (Kapılar)
description: Tekrar eden (🔁) görev tamamlanınca aynı dosyada yalnız bir sonraki örneği açan, açık örnek varken yenisini eklemeyen ve geri almada ürettiğini kaldıran korumalı tekrar mantığı kurulur; davranış birim testlerle sabitlenir.
type: project
proje: loomen
kaynak: kart LOM-41 · dal fix/LOM-41 · Loomen@7afadd3bbc14ee3d164850def122b2073b7eddb8 · test koşusu a8756464-f66e-41fa-9f18-86612c715ea4 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-16
---

# LOM-41 — Tekrar eden görev bugüne alınınca çoğalıyor (Kapılar)

## Ne yapıldı

Tekrar eden (🔁) görev tamamlanınca aynı dosyada yalnız bir sonraki örneği açan, açık örnek varken yenisini eklemeyen ve geri almada ürettiğini kaldıran korumalı tekrar mantığı kurulur; davranış birim testlerle sabitlenir.

## Adımlar

- Yeni saf modül src/core/markdown/recurrence.ts: parseRecurrence(kural) → {interval, unit (day|week|month|year), weekday?, dom?, whenDone} ya da null; nextRecurrenceDate(kural, bazISO, bugünISO) → ISO ya da undefined. Desteklenen biçimler TaskDetail.buildRecur'un ürettikleri: "every day", "every 2 days", "every week on Monday", "every month on the 15th", "every year"; ayrıca Obsidian'ın "when done" eki (baz = bugün). Aday tarih = baz + N birim (haftalıkta verilen güne hizala, aylıkta ayın günü kırpılır); aday max(baz, bugün) tarihinden büyük olana kadar ilerletilir, böylece kaçırılan tekrarlar atlanır. date-fns (addDays/addWeeks/addMonths/addYears, parseISO, format) kullan; tanınmayan kuralda undefined dön.
- src/core/markdown/taskParser.ts: toggleTaskInContent tekrar farkında olur, imzası ve expectedRaw kilidi aynen kalır. Satır 🔁 taşıyor ve tamamlanıyorsa: satır toggleDoneLine ile ✅ alır; aynı dosyada aynı girintide, aynı normalize açıklama (boşluk sadeleştir, küçük harf) ve aynı kuralla başka AÇIK görev yoksa, tamamlanan satırın çocuk bloğunun (childBlockRange) hemen altına serializeTaskLine ile yeni açık satır eklenir: due/scheduled/start plan tarihiyle aynı gün farkı kadar ileri, pomos 0, ✅ yok, öncelik/etiket/saat/kural korunur. Plan tarihi (due ?? scheduled ?? start) yoksa baz bugündür. Kural çözülemezse yalnız eski davranış (sadece işaretle). Geri alınıyorsa (done → open): ✅ kaldır; çocuk bloğunun hemen altındaki satır açık, çocuksuz, aynı açıklama+kural ve tarihi hesaplanan sonraki tarihe eşitse (yani bizim ürettiğimiz örnek) o satırı kaldır, aksi halde dokunma. CRLF/EOL korunur (splitLines/joinLines/eolOf). Yardımcıları (findOpenRecurringSibling, nextInstanceLine gibi) test edilebilir olsun diye export et.
- Store değişmez: useAppStore.toggleTask zaten toggleTaskInContent(content, line, todayISO(), task?.raw) çağırıyor; `next === content` yolu korunur. Yeni örnek tamamlanan satırın ALTINA eklendiği için kuyruktaki ikinci bir dokunuş (çift tık) aynı satırı geri alır ve üretilen örnek kaldırılır; zincirleme çoğalma olmaz. Bunu test senaryosu olarak da yaz.
- Testler: src/core/__test__/recurrenceTest.ts (coreTest.ts'deki check/eq/section kalıbıyla) ve scripts/run-tests.mjs suites listesine kayıt. Senaryolar: (a) nextRecurrenceDate — günlük/2 günde bir/haftalık Pazartesi/aylık 15'i/yıllık, when done, ay sonu kırpma; (b) "- [ ] Kapılar 🔁 every day 📅 2026-10-10" bugün 2026-10-16'da tamamlanınca dosyada Kapılar geçen tam 2 satır: biri [x] ✅ 2026-10-16, biri [ ] 📅 2026-10-17 (aradaki günler için kopya yok); (c) aynı dosyada 3 açık Kapılar varken ilk ikisi tamamlanınca yeni satır eklenmez, üçüncüsü tamamlanınca tam bir tane açılır (var olan kopyaların silinmeden erimesi); (d) tamamla → geri al → dosya başlangıçla aynı; tamamla → geri al → tamamla → yine tek açık örnek; (e) applyTaskPatch ile due bugüne çekilince satır sayısı aynı; (f) alt görevli/notlu görevde yeni örnek çocuk bloğunun altına gelir, çocuklar tamamlananda kalır; (g) CRLF dosyada EOL korunur; (h) tanınmayan kural ("🔁 her ay") yalnız işaretlenir; (i) tekrar kuralsız görev eski davranış; (j) expectedRaw uyuşmazsa içerik aynen döner. Önce testleri yazıp mevcut kodda (b),(c),(d) kaldığını göster, sonra düzeltmeyle yeşile çek.
- npm run typecheck ve npm test koş; coreTest ve vaultTest'teki eski toggle testleri de geçmeli. Kanıt satırlarını sonuca yaz.
- LoomenWiki/modules/planlayici-takvim-pomodoro.md'ye kısa "Tekrar eden görev" bölümü ekle: tek açık örnek, tamamlanınca sonraki tarih (kaçırılanlar atlanır), açık örnek varken yeni açılmaz, geri alma üretileni kaldırır, kopyalar ayrı dosyadaysa kaynak not Zaman çizelgesinde görünür.
- Bağımsız inceleme (ayrı alt ajan, yalnız okuyarak: diff + plan + test çıktısı), bulgu varsa düzelt ve testi yeniden koş; fix/LOM-41 dalına AI imzasız commit.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/recurrence.ts`
- `Loomen/src/core/markdown/taskParser.ts`
- `Loomen/src/core/__test__/recurrenceTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md`

## Test

Testler geçti.

> Tip denetimi ve tüm birim testler geçti. 15 test dosyasının hepsi yeşil; tekrar eden görev testleri de geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-41`
- Commit: `Loomen@7afadd3bbc14ee3d164850def122b2073b7eddb8`
- Test koşusu: `a8756464-f66e-41fa-9f18-86612c715ea4` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

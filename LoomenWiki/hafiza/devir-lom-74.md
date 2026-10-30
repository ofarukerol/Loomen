---
name: LOM-74 — Bugüne Odaklan: gecikenler yalnız Geciken'de, bugünün işleri en üstte
description: Bugüne Odaklan'da 'Yapılacak' süzgeci ve sayacı gecikenleri dışarıda bırakır; liste bugünün işleriyle başlar, yaklaşanlar altında; gecikenler yalnız 'Geciken' seçilince listelenir.
type: project
proje: loomen
kaynak: kart LOM-74 · dal fix/LOM-74 · Loomen@dc8bc6a12240312fc50b80b0f9248c6bd04653d2 · test koşusu 97da1800-f520-4620-aec6-268b0c9a952c (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-30
---

# LOM-74 — Bugüne Odaklan: gecikenler yalnız Geciken'de, bugünün işleri en üstte

## Ne yapıldı

Bugüne Odaklan'da 'Yapılacak' süzgeci ve sayacı gecikenleri dışarıda bırakır; liste bugünün işleriyle başlar, yaklaşanlar altında; gecikenler yalnız 'Geciken' seçilince listelenir.

## Adımlar

- src/core/vault/agendaView.ts: FILTER_KINDS.yapilacak değerini ["today", "upcoming"] yap; 'varsayılan görünüm gecikenleri de gösterir' yorumunu LOM-74 ile güncelle (gecikenler yalnız 'geciken' süzgecinde). Gecikenleri öne alan sıralama bloğu 'geciken' için zararsız; yorumunu sadeleştir ya da kaldır.
- src/core/vault/grouping.ts focusCounts: yapilacak = açık, üst düzey, tarihi olan ve tarihi bugün ya da sonrası (differenceInCalendarDays >= 0) görevler; LOM-67 yorumunu 'Yapılacak listesindeki satır sayısıyla aynı, gecikenler hariç (LOM-74)' diye değiştir. geciken ve planlanmamis aynen.
- src/screens/Planner/MiniAgenda.tsx: sectionRows yardımcısını tür listesi alacak şekilde değiştir (ör. sectionRows(["overdue"]) / (["today"]) / (["upcoming"])). Çizim sırası: geciken bölümler (yalnız geciken süzgecinde dolu) → bugün bölümü → Google Takvim bloğu (yalnız yapilacak süzgecinde) → yaklaşan bölümler. 'Sıra: geciken günler → Google Takvim → bugün/yaklaşan (LOM-63)' yorumunu yeni sıraya göre düzelt.
- src/core/__test__/agendaViewTest.ts (a) bölümü: başlığı 'Yapılacak listesi: bugün önce, geciken yok' yap; bölüm türleri ["today","upcoming"], satırlar ["Bugünkü iş","Yarınki iş"], 'listede geciken bölüm yok' kontrolü, satır sayısı = counts.yapilacak, yapilacak = 2. Geciken sayacı kontrolünü (b) bölümündeki geciken süzgeciyle sınırla. (d) bölümünde 'Gecikenler hâlâ en üstte' yerine secs[0].kind === "today" ve secs[0].tasks[0].text === "Yeni iş" (yeni görev listenin ilk satırı).
- src/core/__test__/planDayTest.ts: (d) bölüm başlığını 'Geciken düşer, Yapılacak bugüne alınanlar kadar artar' yap; beklentiler önce [3, 1], sonra [1, 3]. LOM-47 bölümünde sayaçlar [1, 2, 1].
- LoomenWiki/modules/planlayici-takvim-pomodoro.md: sayaç tablosunda Yapılacak satırını 'bugün ve sonrası tarihli açık görevler (gecikenler hariç); Yapılacak listesindeki satır sayısıyla aynı (LOM-74)' yap; Bugüne Odaklan bölümüne liste sırasını (bugün → Google Takvim → yaklaşan; gecikenler yalnız Geciken süzgecinde) ekle.
- npm test ve npm run typecheck koş; tüm test dosyaları yeşil olmalı. Sonucu kanıtla bildir.

## Dokunulan dosyalar

- `Loomen/src/core/vault/agendaView.ts`
- `Loomen/src/core/vault/grouping.ts`
- `Loomen/src/screens/Planner/MiniAgenda.tsx`
- `Loomen/src/core/__test__/agendaViewTest.ts`
- `Loomen/src/core/__test__/planDayTest.ts`
- `Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md`

## Test

Testler geçti.

> Tip denetimi hatasız bitti. Tam test takımı (33 dosya, planDayTest ve agendaViewTest dahil) tümüyle geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-74`
- Commit: `Loomen@dc8bc6a12240312fc50b80b0f9248c6bd04653d2`
- Test koşusu: `97da1800-f520-4620-aec6-268b0c9a952c` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

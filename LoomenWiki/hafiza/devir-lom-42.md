---
name: LOM-42 — Takvim kartı açıklamasındaki [ ] maddeleri o günün Yapılacaklar listesine gelsin
description: Google Takvim etkinliklerinin açıklamasındaki "- [ ] iş" / "[ ] iş" satırları eşitlemede o günün Yapılacaklar listesine sanal görev olarak alınır; listede işaretleme ve başlık düzenleme Google'daki açıklamaya yalnız o satırı değiştirerek geri yazılır, Google'daki değişiklik (işaret, metin, silme) sonraki eşitlemede listeye yansır. Varsayım: Loomen'in kendi etkinlik/kart modeli olmadığından "takvim kartı" = Google Takvim etkinliği.
type: project
proje: loomen
kaynak: kart LOM-42 · dal fix/LOM-42 · Loomen@a5849a53742dde9b3909f9bc18d491991fb47679 · test koşusu 14fef031-3ce3-4cfe-bfa7-6448c567a2f4 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-16
---

# LOM-42 — Takvim kartı açıklamasındaki [ ] maddeleri o günün Yapılacaklar listesine gelsin

## Ne yapıldı

Google Takvim etkinliklerinin açıklamasındaki "- [ ] iş" / "[ ] iş" satırları eşitlemede o günün Yapılacaklar listesine sanal görev olarak alınır; listede işaretleme ve başlık düzenleme Google'daki açıklamaya yalnız o satırı değiştirerek geri yazılır, Google'daki değişiklik (işaret, metin, silme) sonraki eşitlemede listeye yansır. Varsayım: Loomen'in kendi etkinlik/kart modeli olmadığından "takvim kartı" = Google Takvim etkinliği.

## Adımlar

- Rust GEvent'e description alanı eklenir (src-tauri/src/google.rs); etkinlik JSON→GEvent eşlemesi ayrı fonksiyona çıkarılıp Rust birim testi yazılır. TS GEvent tipine description: string | null eklenir (src/core/google.ts).
- Yeni saf modül src/core/gcalItems.ts: açıklamayı (düz metin ya da HTML: br, p, div, li, &nbsp;, CRLF) satırlara bölüp '- [ ] x' / '[ ] x' / '[x] x' maddelerini ayrıştırır; verilen sıradaki maddenin yalnız işaretini ya da metnini ham metin içinde yerinde değiştirir (beklenen metin uyuşmazsa null döner); etkinliklerden sanal ParsedTask üretir (file 'gcal://<eventId>', line = madde sırası, due = etkinlik günü, time = saatli etkinlikte HH:MM, external.{eventId,summary,link}); loomen=1 etkinlikler atlanır.
- ParsedTask tipine isteğe bağlı external alanı (src/core/vault/types.ts), UI Task tipine link alanı (src/data/sampleVault.ts); grouping.ts kaynak adı olarak etkinlik başlığını ve linki taşır.
- Store (useAppStore.ts): gcalTasks durumu (kalıcı değil); görevler+takvim maddelerini birlikte gruplayan tek yardımcı loadFromBackend, hafif kayıt ve reorderTask'ta kullanılır; gcalSync çekme sonunda ve gcalDisconnect'te gcalTasks yeniden kurulur; toggleTask/updateTask/saveTask 'gcal://' kimliğinde Google'a açıklama yaması (PATCH {description}) atar, başarısızlıkta hata mesajı verir ve yerel durumu değiştirmez; reorderTask takvim maddesini başka güne taşımaz.
- TaskRow'da takvim maddesinin kaynak çipi etkinliği tarayıcıda açar; TaskDetail'de takvim maddesi için yalnız başlık, tamamla, açıklayıcı ipucu ve 'Google Takvim'de aç' gösterilir, Kaydet başlığı Google'a yazar.
- tr/en/ar çevirilerine taskDetail.gcalHint, taskDetail.openInGcal, errors.gcalItem anahtarları; wiki planlayici-takvim-pomodoro.md Takvim bölümüne kısa not.
- Yeni src/core/__test__/gcalItemsTest.ts (düz metin, HTML, &nbsp;, CRLF, işaretleme yerinde değişim, bayat madde → null, metin düzenleme, sanal görev üretimi, loomen etkinliği atlanır) scripts/run-tests.mjs'e eklenir.
- npm run typecheck, npm test, cd src-tauri && cargo test --lib google koşulur; kanıt rapora yazılır. Gerçek Google hesabıyla canlı deneme Ömer'e bırakılır.

## Dokunulan dosyalar

- `Loomen/src-tauri/src/google.rs`
- `Loomen/src/core/google.ts`
- `Loomen/src/core/gcalItems.ts`
- `Loomen/src/core/vault/types.ts`
- `Loomen/src/core/__test__/gcalItemsTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/core/vault/grouping.ts`
- `Loomen/src/data/sampleVault.ts`
- `Loomen/src/screens/Planner/TaskDetail.tsx`
- `Loomen/src/screens/Planner/TaskRow.tsx`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md`

## Test

Testler geçti.

> Tip denetimi, 50 birim test (16 dosya) ve Rust google testleri hatasız geçti. Canlı deneme gerçek Google hesabı istediği için elle yapılacak, insana kalanlara yazdım.

## Kanıt

- Dal: `fix/LOM-42`
- Commit: `Loomen@a5849a53742dde9b3909f9bc18d491991fb47679`
- Test koşusu: `14fef031-3ce3-4cfe-bfa7-6448c567a2f4` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

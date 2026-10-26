---
name: LOM-54 — Alışkanlık çekirdeği ve kasa katmanı (LOM-53/1)
description: Loomen'e alışkanlık takibinin saf çekirdeği (tür, model, kodek) ve kasadaki Alışkanlık/ klasörüne yazan kasa katmanı eklenir; arayüz yok, node testi ile kanıtlanır.
type: project
proje: loomen
kaynak: kart LOM-54 · dal fix/LOM-54 · Loomen@c05e1cdb27e21fe071bb474035284f4df6d99c0b · test koşusu 611dcc14-b639-4a6c-b8ac-c1d403443aee (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-26
---

# LOM-54 — Alışkanlık çekirdeği ve kasa katmanı (LOM-53/1)

## Ne yapıldı

Loomen'e alışkanlık takibinin saf çekirdeği (tür, model, kodek) ve kasadaki Alışkanlık/ klasörüne yazan kasa katmanı eklenir; arayüz yok, node testi ile kanıtlanır.

## Adımlar

- src/core/habit/types.ts: Habit arayüzü (id, name, emoji, color, intent?, days, start, round, prevId?, lineageId, status 'active'|'quit', done: string[], excused: string[], createdAt, quitAt?), HabitFile {v:1, habit}, HABIT_DIR='Alışkanlık', DURATION_CHIPS=[7,21,30,40,41,66,90], MIN_DAYS=1, MAX_DAYS=365, HABIT_COLORS=['terra','teal','amber','green','purple','red','charcoal'] (tür HabitColor), HABIT_EMOJIS küçük sabit dizi, CellState ve Outcome türleri, HabitStats arayüzü.
- src/core/habit/model.ts: dayKey(d: Date) yerel yıl/ay/gün ile 'YYYY-MM-DD' (UTC yok); parseKey(key) → new Date(y, m-1, d); addDays(key, n) → new Date(y, m-1, d+n) ile; dayList(habit) start'tan days kadar anahtar; dayIndex(habit, key) 1 tabanlı gün numarası; endKey(habit).
- model.ts devam: cellState(habit, key, today): key dizide değilse 'future' yerine null; excused→'excused', done→'done', key===today→'today', key<today→'missed', aksi 'future'. stats(habit, today): completed=done sayısı (dizi içi), elapsed=today'e kadar geçen gün sayısı (bugün dahil, excused hariç), percent=round(100*done/elapsed) (elapsed 0 ise 0), currentStreak: bugünden (bugün yapılmamışsa dünden) geriye, mazeretli günler atlanarak ardışık done sayısı, longestStreak: dizi boyunca aynı kuralla en uzunu, remaining=bitmemiş gün sayısı.
- model.ts devam: isFinished(habit, today) = status==='quit' || today > endKey; outcome(habit, today): 'quit' ise 'quit'; bitmemişse null; her gün done ya da excused ise 'completed', değilse {kind:'ended', done:x, total:y}. toggleDay(habit, key, today) ve setExcused(habit, key, excused, today) saf: yeni nesne döner; key dizi dışı ya da today'den ileri ise habit'i aynen döner; excused işaretlenen gün done'dan düşer ve tersi; quit durumda değişiklik yapılmaz.
- model.ts devam: newId() zaman damgası base36 + rastgele 6 karakter (dosya adına uygun, yalnız [a-z0-9]); newHabit({name, emoji, color, intent, days, start}, today, now): ad boşsa, days 1-365 dışında ya da start>today ise Error fırlatır; round=1, lineageId=id. newRound(prev, {days, start}, today, now): aynı ad/emoji/renk/niyet, round=prev.round+1, prevId=prev.id, lineageId=prev.lineageId, done/excused boş. restart(habit, today, now): aynı alanlarla start=today, done/excused boş, status active, quitAt silinir (yeni id, round aynı, prevId bağlı). quitHabit(habit, now): status 'quit', quitAt.
- src/core/habit/codec.ts: encodeHabit(habit) sabit alan sırasıyla JSON.stringify(file, null, 2) + sonda tek satır sonu (deterministik, git farkı okunur); decodeHabit(raw): JSON.parse hatası, nesne değil, v!==1 (eski/ileri sürüm) ya da zorunlu alan eksik/yanlış türde (id, name, days, start, lineageId) ise null; isteğe bağlı alanlar güvenli varsayılanla tamamlanır (done/excused dizi değilse boş dizi, geçersiz renk 'terra', emoji boşsa ilk emoji, status bilinmiyorsa 'active', round<1 ise 1, days 1-365 dışıysa null).
- src/core/vault/types.ts: VaultBackend'e isteğe bağlı `listDir?(dir: string): Promise<DirEntry[]>` ve `DirEntry {name: string; isDirectory: boolean}` ekle; dir '' kök demek. Yorumda LOM-54 ve Alışkanlık/ kullanımını not et.
- src/core/vault/tauriBackend.ts: listDir(dir) → readDir(dir ? abs(dir) : root) sonucunu {name, isDirectory} olarak döndür; klasör yoksa boş dizi (exists kontrolü). '.' ile başlayan girdiler atlanır.
- src/core/vault/sampleBackend.ts: listDir(dir) bellek anahtarlarını `${dir}/` önekiyle (kök için öneksiz) süz, ilk parçaları tekille, kalan yolu olanları klasör say; '.' ile başlayanlar atlanır.
- src/core/habit/store.ts: findHabitDir(backend) kök listesini listDir('') ile alıp adı NFC normalize edilip 'Alışkanlık'a eşit olan klasör adını döner (yoksa HABIT_DIR); listDir yoksa HABIT_DIR. loadHabits(backend) → {habits, broken, dirName, raw: Record<id,string>}: klasördeki .json dosyaları readNote ile okunur, decodeHabit null dönenler broken'a (dosya adı) girer; dosya adı ile içteki id uyuşmazsa dosya adındaki id esas alınır ve broken sayılır (ezilmesin). saveHabit(backend, habit, ctx): habit.id broken'da ise Error ile reddeder; encodeHabit sonucu ctx.raw[id] ile aynıysa yazmaz; farklıysa ensureDir(dirName) + writeNote(`${dirName}/${id}.json`) ve ctx.raw günceller. removeHabit(backend, id, ctx): trashNote ile çöpe taşır, ctx'ten düşer. Yol daima .json ile biter; .md asla.
- src/core/habit/index.ts: types, model, codec, store dışa aktarımları.
- src/core/__test__/habitTest.ts: dosya başında process.env.TZ='Europe/Berlin' (yaz saati olan dilim; Türkiye'de yaz saati yok). Sahte VaultBackend (srsTest'teki gibi, bellek haritası + listDir + yazma günlüğü) ile: 21 ve 41 günlük dizi uzunluğu ve ilk/son tarihleri; 2026-01-25 başlangıçlı 21 gün ay geçişi, 2026-12-20 başlangıçlı yıl geçişi; Mart (29 Mart 2026) ve Ekim (25 Ekim 2026) son pazarı kapsayan dizilerde ardışık günler arasında tam 1 gün fark ve aynı gün tekrarlanmaması; seri ve mazeret (mazeretli gün seriyi bozmaz, yüzde paydasına girmez); outcome üç durum (completed, ended x/y, quit); bozuk JSON, v:0 ve v:2 dosyaları broken'da, geçerli olanlar yüklenir; NFD 'Alışkanlık' klasör adı eşleşir ve yazma o klasöre gider; aynı içerik ikinci save'de writeNote çağırmaz; broken dosyaya saveHabit hata verir ve yazma yok; newRound zinciri (round 2, prevId, lineageId); newHabit ileri tarihi ve 0/366 günü reddeder; toggleDay gelecek güne izin vermez; yazılan hiçbir yol .md ile bitmez.
- scripts/run-tests.mjs: suites listesine ["src/core/__test__/habitTest.ts", []] ekle.
- npx tsc --noEmit ve npm test koştur; her ikisi yeşil olmalı. Commit mesajı Türkçe, AI imzası yok; dal fix/LOM-54.

## Dokunulan dosyalar

- `Loomen/src/core/habit/types.ts`
- `Loomen/src/core/habit/model.ts`
- `Loomen/src/core/habit/codec.ts`
- `Loomen/src/core/habit/store.ts`
- `Loomen/src/core/habit/index.ts`
- `Loomen/src/core/vault/types.ts`
- `Loomen/src/core/vault/tauriBackend.ts`
- `Loomen/src/core/vault/sampleBackend.ts`
- `Loomen/src/core/__test__/habitTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Tip denetimi (npx tsc --noEmit) temiz geçti. npm test ile 25 test dosyasının hepsi geçti, habitTest listede ve "Hepsi geçti." dedi. Canlı doğrulama istenmediği için koşulmadı.

## Kanıt

- Dal: `fix/LOM-54`
- Commit: `Loomen@c05e1cdb27e21fe071bb474035284f4df6d99c0b`
- Test koşusu: `611dcc14-b639-4a6c-b8ac-c1d403443aee` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

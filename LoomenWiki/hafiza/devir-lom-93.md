---
name: LOM-93 — Okuma alışkanlığı: günlük sayfa hedefi kendiliğinden işlenir, okuyucudan Pomodoro
description: Alışkanlığa günlük sayfa hedefi ve isteğe bağlı kitap eklenir; okuyucuda okunan sayfalar sayılır, hedef dolunca gün kendiliğinden yapıldı olur; okuyucu üst çubuğuna Pomodoro başlat/duraklat düğmesi ve kalan süre gelir.
type: project
proje: loomen
kaynak: kart LOM-93 · dal fix/LOM-93 · Loomen@39385f0dd25efe192e0f42b14bc1e6cc0234bfbe · test koşusu f220037e-7428-4d87-bb9c-6420cf8f9040 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-08
---

# LOM-93 — Okuma alışkanlığı: günlük sayfa hedefi kendiliğinden işlenir, okuyucudan Pomodoro

## Ne yapıldı

Alışkanlığa günlük sayfa hedefi ve isteğe bağlı kitap eklenir; okuyucuda okunan sayfalar sayılır, hedef dolunca gün kendiliğinden yapıldı olur; okuyucu üst çubuğuna Pomodoro başlat/duraklat düğmesi ve kalan süre gelir.

## Adımlar

- Çekirdek tür ve model (src/core/habit/types.ts, model.ts): Habit'e isteğe bağlı `reading?: { pages: number; bookId?: string }` ve `pagesRead?: Record<gün, sayfa>` alanları ekle; sabitler `MIN_GOAL_PAGES = 1`, `MAX_GOAL_PAGES = 999`. `setReadingGoal(habit, goal | null)` (tam sayı aralığı ve kimlik biçimi `[A-Za-z0-9_-]{1,64}` denetler, değişmezse aynı nesne), `addPagesRead(habit, day, pages, today)` (hedef yoksa, tur bitmişse ya da gün düzenlenemezse aynı nesne; sayfa toplanır; yalnız `önceki < hedef && yeni >= hedef` anında ve hücre boşsa (done/half/excused değilse) gün `done`a eklenir), `readingToday(habit, today) → { read, goal } | null`. `newHabit` ve `editHabit` girdilerine `reading` ekle (`null` siler); `successor` hedefi taşır, `pagesRead` taşımaz. `toggleDay`/`setExcused` değişmez.
- Kodek (src/core/habit/codec.ts): `encodeHabit` yalnız doluyken `reading` (pages, varsa bookId) ve sıralı anahtarlı `pagesRead` (pozitif tam sayı) yazar; alanı olmayan kaydın metni birebir aynı kalır. `decodeHabit` bu alanları şüpheci okur (geçersiz hedef/kimlik → alan atılır, geçersiz gün/sayı → o giriş atılır). Dosya sürümü 1 kalır.
- Yeni saf modül src/core/habit/reading.ts (index.ts'den dışa ver): `EPUB_PAGE_BYTES = 2000`, `READ_DWELL_MS = 3000`; `pageUnit(pos, progress, textBytes?)` → PDF'te sayfa numarası, EPUB'da `floor(progress × ceil(textBytes/2000))` (textBytes yoksa null), kindle null; cihaz kütüğü `ReadingLog { day, seen: Record<bookId, number[]> }` ile `normalizeReadingLog(v, today)` (yalnız bugünün kaydı kalır) ve `logAdd(log, today, bookId, unit) → { log, added }`; bekleme `dwellStep(prev, bookId, unit, now) → { next, settled }` (birim değişince ve `now - since >= READ_DWELL_MS` ise eski birim oturur) ve `dwellFinish(prev, now)`; `applyReading(habits, bookId, pages, today)` → yalnız süren, hedefi olan ve kitabı eşleşen (bookId yok ya da aynı) turların değişen kopyaları.
- Store (src/store/useAppStore.ts): `loomen.settings` kalıcı alanlarına `readingLog` ekle (yüklemede `normalizeReadingLog`). Alışkanlık bölümüne yeni eylemler: `habitTrackReading(bookId, pos, progress, textBytes?)` — `features.habits` kapalıysa ya da `habitsLoaded` değilse çık; `pageUnit` + modül düzeyi dwell durumu (kitap değişince sıfırla); oturan birimi `logAdd` ile kütüğe yaz, yeniyse `applyReading` sonucunu `habitCommit(changed)` ile kaydet; `habitFlushReading()` — bekleyen birimi `dwellFinish` ile oturtur (okuyucu kapanınca/gizlenince). `librarySavePosition` ve `libraryFlushPosition` DEĞİŞTİRİLMEZ.
- Okuyucu kabuğu: src/screens/Library/readerTypes.ts `BookMeta`ya `textBytes?: number` ekle; src/screens/Library/views/EpubView.tsx satır 518'deki onMeta çağrısına `textBytes: spine size toplamı` ekle (tek ifade). src/screens/Library/ReaderScreen.tsx: onMeta sarmalayıcısında textBytes'ı ref'e al; `onPosition`u `useCallback` ile sar: önce `savePosition(pos, progress)`, sonra `habitTrackReading(book.id, pos, progress, textBytesRef.current)`; mevcut visibilitychange/pagehide/unmount etkisine `habitFlushReading()` ekle.
- Okuyucu üst çubuğu (src/screens/Library/ReaderToolbar.tsx): store'dan `pomoRunning`, `pomoRemaining`, `pomo.focusMin`, `pomoBreakActive`, `pomoBreakRemaining`, `togglePomo` oku; çizimler düğmesinin yanına `lo-reader-bar__pomo` düğmesi: boşta Timer simgesi; çalışırken Pause simgesi + mm:ss; duraklatılmışken (kalan ≠ odak süresi) Play + mm:ss; molada Coffee + mola kalan; tıklama `togglePomo`; `aria-pressed`, title/aria-label çevirili (`library.reader.pomoStart/pomoPause/pomoBreak`). Süre `aria-live="polite"` ve `font-variant-numeric: tabular-nums`.
- Alışkanlık formu (src/screens/Habits/HabitForm.tsx): yeni ve düzenleme kipinde (tur kipinde değil) 'Günlük sayfa hedefi (isteğe bağlı)' sayı alanı (yalnız rakam, en çok 3 hane); boş → hedef yok, 1-999 dışı → `habit.form.pagesRange` hatası ve kaydetme kapalı. Hedef girilince ve `features.library` açıkken `hasBookFile` olan kitaplardan `<select>`: 'Herhangi bir kitap' + raf başlıkları; düzenlemede kayıtlı kitap rafta yoksa '(raftan kaldırılmış kitap)' seçeneğiyle kimlik korunur. `habitAdd`/`habitEdit` girdisine `reading` (ya da null) geçir.
- Kart ve ayrıntı (src/screens/Habits/HabitCard.tsx, HabitDetail.tsx): `readingToday` doluysa seri satırının altına `lo-hab-card__pages` satırı 'Bugün {{read}} / {{goal}} sayfa' (`habit.pagesToday`); ayrıntıda başlık altına aynı satır ve varsa kitap adı.
- Çeviri (tr/en/ar translation.json): `habit.form.pagesGoal`, `habit.form.pagesHint`, `habit.form.pagesRange`, `habit.form.pagesUnit`, `habit.form.book`, `habit.form.anyBook`, `habit.form.missingBook`, `habit.pagesToday`, `library.reader.pomoStart`, `library.reader.pomoPause`, `library.reader.pomoBreak`. Stil (src/styles/app.css): `.lo-reader-bar__pomo` (süre metni, is-on durumu), `.lo-hab-card__pages`, form `<select>` için `lo-hab-input` görünümü; 480px altında süre metni görünür kalır.
- Testler: src/core/__test__/habitTest.ts'e ekle — hedefli kaydın kodek gidiş-dönüşü ve deterministik metni, hedefsiz eski dosyanın metninin değişmemesi, geçersiz hedef/kimliğin atılması, `addPagesRead` ile eşiği geçince gün yapıldı, elle yarım/mazeretli günün korunması, hedef aşıldıktan sonra işaret kaldırılınca yeniden işaretlenmemesi, bitmiş turda sayım yok, `successor` hedefi taşıyıp pagesRead'i taşımıyor, `editHabit(reading: null)` alanı siliyor. Yeni src/core/__test__/readingTest.ts (scripts/run-tests.mjs listesine ekle): `pageUnit` PDF/EPUB/kindle, `dwellStep` 3 sn eşiği, `logAdd` aynı sayfayı ikinci kez saymıyor ve gün değişince sıfırlanıyor, `normalizeReadingLog` bozuk veriyi temizliyor, `applyReading` yalnız eşleşen süren turları değiştiriyor.
- Doğrulama: `npm test` ve `npm run typecheck` koş; üç dildeki çeviri anahtarlarının eşit olduğunu kontrol et. Commit mesajı LOM-93 ile başlar, AI imzası yok; dal fix/LOM-93.

## Dokunulan dosyalar

- `Loomen/src/core/habit/types.ts`
- `Loomen/src/core/habit/model.ts`
- `Loomen/src/core/habit/codec.ts`
- `Loomen/src/core/habit/reading.ts`
- `Loomen/src/core/habit/index.ts`
- `Loomen/src/core/__test__/habitTest.ts`
- `Loomen/src/core/__test__/readingTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Library/ReaderScreen.tsx`
- `Loomen/src/screens/Library/ReaderToolbar.tsx`
- `Loomen/src/screens/Library/readerTypes.ts`
- `Loomen/src/screens/Library/views/EpubView.tsx`
- `Loomen/src/screens/Habits/HabitForm.tsx`
- `Loomen/src/screens/Habits/HabitCard.tsx`
- `Loomen/src/screens/Habits/HabitDetail.tsx`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/styles/app.css`

## Test

Testler geçti.

> Tip denetimi hatasız geçti. npm test ile 51 test dosyasının hepsi geçti; okuma hedefi ve okuma sayımı testleri de içinde. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-93`
- Commit: `Loomen@39385f0dd25efe192e0f42b14bc1e6cc0234bfbe`
- Test koşusu: `f220037e-7428-4d87-bb9c-6420cf8f9040` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

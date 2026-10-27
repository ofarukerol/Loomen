---
name: LOM-55 — Alışkanlıklar ekranı: liste, gün dizisi, ekleme, Geçmiş (LOM-53/2)
description: Loomen'e Alışkanlıklar ekranı eklenir: store eylemleri, Ribbon düğmesi, Aktif/Geçmiş listeleri, halka ve 7'li gün dizisi, ekleme ve onay pencereleri, tr/en/ar çeviri ve app.css stilleri; veri LOM-54 çekirdeğiyle Alışkanlık/ klasörüne yazılır.
type: project
proje: loomen
kaynak: kart LOM-55 · dal fix/LOM-55 · Loomen@8f48f6a1472fe58ccff2a04aea84ae675ec62823 · test koşusu bce5b40d-f1f9-4f41-9d9d-66aaf707f47c (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-27
---

# LOM-55 — Alışkanlıklar ekranı: liste, gün dizisi, ekleme, Geçmiş (LOM-53/2)

## Ne yapıldı

Loomen'e Alışkanlıklar ekranı eklenir: store eylemleri, Ribbon düğmesi, Aktif/Geçmiş listeleri, halka ve 7'li gün dizisi, ekleme ve onay pencereleri, tr/en/ar çeviri ve app.css stilleri; veri LOM-54 çekirdeğiyle Alışkanlık/ klasörüne yazılır.

## Adımlar

- Dal temeli: fix/LOM-55 üzerinde src/core/habit/ yoksa yerel fix/LOM-54 dalını bu dala birleştir (git merge, push yok, dal değiştirme yok); npx tsc --noEmit ve npm test ile çekirdeğin geldiğini doğrula (habitTest listede ve yeşil).
- Saf görünüm yardımcıları src/core/habit/view.ts: activeHabits(habits, today) (status active ve isFinished değil; bugün çentiksiz olanlar üstte, sonra createdAt), allDoneToday(habits, today), isSealed(habit, today) (tüm günler done/excused ve henüz bitmemiş), lastSevenStrip(habit, today) (son 7 günün CellState dizisi), historyGroups(habits, filter, today) (isFinished olanlar lineageId ile gruplanır, tur sırasıyla; grup en son biten üstte; filter all/completed/quit), isMilestone(index, days) (7'nin katı ya da son gün), dayLabel için parseKey'den Date. index.ts'ten dışa aktar.
- Test src/core/__test__/habitViewTest.ts (TZ sabit, habitTest kalıbı): sıralama (çentiksiz üstte), hepsi tamam, mühür yalnız son gün tüm günler doluyken, son 7 şerit uzunluğu ve durumları, soy gruplama ve süzgeç, dönüm noktaları. scripts/run-tests.mjs suites listesine ekle.
- Store src/store/useAppStore.ts: Screen birleşimine 'habits'; HabitHistoryFilter tipi; state habits: Habit[], habitsLoaded, habitBroken: string[], habitDetailId: string|null, habitHistoryFilter; modül düzeyinde habitVault, habitCtx (loadHabits'in raw/dirName'i) ve habitLoadSeq sayacı. Eylemler: habitLoad (loadHabits(backend); bayat okuma sayacı ile atılır), habitAdd(input) (newHabit(input, dayKey(new Date()), ISO now) → saveHabit → state'e ekle; hata mesajı Error olarak fırlar, form gösterir), habitToggleDay(id,key), habitToggleExcused(id,key,excused) (model saf fonksiyonları, sonuç aynı nesneyse yazma), habitQuit(id), habitDelete(id) (removeHabit ile çöpe), habitRestart(id) (restart → yeni dosya), habitNewRound(id,{days,start}) (newRound → yeni dosya), habitOpenDetail(id|null), habitSetHistoryFilter. Her yazma saveHabit(backend, h, habitCtx) ile; başarısızsa recordWriteError kalıbıyla uyarı, state geri alınır. NOTE_SAFETY yorumu: bu bölüm not dosyasına asla yazmaz.
- loadFromBackend sonuna void refreshHabits(): refreshSrs kalıbı; kasa değiştiyse ya da habitsLoaded değilse habitLoad, aksi halde yine diskten okuyup state'i tazele (dış senkron değişikliği). persist partialize'a YALNIZ habitHistoryFilter ekle; habits ve diğerleri asla girmez.
- Yerleşim: App.tsx'e {screen === 'habits' && <HabitsScreen />}; Android geri tuşu closers listesine ekran kapatıcısından SONRA 'habits ekranında ayrıntı açıksa habitOpenDetail(null)' ekle (ayrıntı önce kapanır). Ribbon.tsx'e lucide Sprout simgeli btn('habits', t('ribbon.habit')) (reports'tan önce); mobil çekmece Ribbon'u gömdüğü için ayrı iş yok.
- Çeviriler tr/en/ar translation.json: ribbon.habit ve 'habit' bölümü: title, tabs (active/history), empty (title/body/example), allDone, today (çentik düğmesi), dayOf ('Gün {{n}} / {{total}}'), streak, sealed ('{{n}} gün'), add, form alanları (name, emoji, color, duration, custom, start, intent, intentHint, save, cancel, errors), detay özet (completed, percent, longest, remaining), cell durumları (done/missed/excused/future/today) ve menü (markExcused, clearExcused, openDayNote, noDayNote), eylemler (quit, delete, restart, newRound, round 'N. tur'), onay metinleri (quitTitle/quitBody/deleteTitle/deleteBody/confirm/cancel), geçmiş (filterAll/filterCompleted/filterQuit, outcomeCompleted, outcomeEnded '{{done}}/{{total}}', outcomeQuit, empty), broken uyarısı ('{{count}} alışkanlık dosyası okunamadı'). Üç dilde aynı anahtarlar; Arapça kısa ve doğal.
- src/screens/Habits/HabitRing.tsx: SVG halka (PomodoroCard'daki R/CIRC dili), props value/total/color/size; stroke-dashoffset geçişi 400ms; data-sealed ile tam dolum; prefers-reduced-motion'da geçiş yok. Dolu kısmın rengi --hab değişkeninden.
- HabitCard.tsx: data-color ile --hab/--hab-soft set edilir; simge, ad, 'Gün 12 / 21' (--font-mono), seri (Flame simgesi + sayı), HabitRing, büyük Bugün çentik düğmesi (min 44px, aria-pressed, bugün done ise dolu), altta son 7 gün şeridi (lastSevenStrip, küçük kareler). isSealed ise halka tam ve üstünde döndürülmüş '21 gün' mührü (lo-hab__seal, kısa ölçek animasyonu, reduced-motion'da yok). Karta tıklama habitOpenDetail(id).
- HabitsScreen.tsx: başlık + Ekle düğmesi + lo-seg sekmeleri (Aktif/Geçmiş, habitHistoryFilter ile ilgisiz yerel sekme state'i). Aktif: habitBroken doluysa sade uyarı satırı; activeHabits boşsa boş durum (Sprout simgesi, 'İlk alışkanlığını ekle', açıklama, 21/41 örneği, tek düğme); allDoneToday ise başta sakin 'Bugünün hepsi tamam' satırı; kartlar. habitDetailId doluysa HabitDetail'i gösterir. Geçmiş sekmesi HabitHistory.
- HabitGrid.tsx: days kadar hücre, CSS grid 7 sütun; her hücre button (role gridcell benzeri, aria-label 'Gün n · tarih · durum', title tarih; data-state done/today/missed/excused/future; gelecek disabled). done hücrede SVG çentik path'i stroke-dashoffset ile 200ms çizilir (yalnız kullanıcı tıklamasından sonra; ilk çizimde animasyon yok; reduced-motion'da yok). İsMilestone hücrede ince alt işaret ve gün numarası vurgulu. Tıklama → habitToggleDay; onContextMenu preventDefault → hücre menüsü; pointerdown 500ms zamanlayıcı ile uzun basış → menü, pointermove/pointerup iptal, sonraki click bastırılır. Klavye: roving tabindex, ok tuşları (RTL'de yön tersi: document.dir), Home/End, Space/Enter çentik, Shift+F10 ve ContextMenu tuşu menü. Hücre menüsü küçük açılır kutu (createPortal, dışarı tıklayınca/Escape kapanır): 'Mazeretli işaretle'/'Mazereti kaldır' ve 'Günün notunu aç' (dailyPathFor(parseKey(key)) yolu notes içinde NFC karşılaştırmayla aranır; yoksa pasif 'Günün notu yok'; varsa openNote(path) ve ekran editöre geçer).
- HabitDetail.tsx: geri düğmesi, simge+ad+'N. tur' (round>1), niyet italik alıntı, HabitRing büyük, özet satırı (stats: tamamlanan, yüzde, en uzun seri, kalan; --font-mono), HabitGrid, eylem satırı: aktifse Bırak (HabitConfirm → habitQuit → Geçmiş'e iner, detay kapanır) ve Sil (ayrı HabitConfirm, tehlike rengi → habitDelete); bitmişse Yeniden başlat ve Bir tur daha (HabitForm tur modu). Mühürlü durumda üstte '21 gün' rozeti.
- HabitForm.tsx: createPortal + useModalLayer + Escape; mod 'new' ya da 'round' (ad/simge/renk kilitli, yalnız süre ve başlangıç). Alanlar: ad (zorunlu, autoFocus), HABIT_EMOJIS'ten emoji çipleri, HABIT_COLORS'tan 7 renk noktası (aria-label, seçili halka), süre çipleri DURATION_CHIPS + Özel (1-365 number input, MIN/MAX_DAYS), varsayılan 21; başlangıç tarihi input type=date max=bugün (ileri tarih seçilemez; min yok); niyet cümlesi textarea isteğe bağlı. Kaydet: habitAdd/habitNewRound; Error gelirse form içinde sade hata satırı. Dokunma hedefleri ≥40px.
- HabitConfirm.tsx: createPortal + useModalLayer, role=alertdialog, başlık, gövde, iptal ve onay düğmeleri (danger varyantı), Escape iptal, onay düğmesine ilk odak. window.confirm hiç kullanılmaz.
- HabitHistory.tsx: lo-seg süzgeç (Hepsi/Tamamlanan/Bırakılan → habitSetHistoryFilter); historyGroups ile soy grupları: grup başlığı simge+ad, altında turlar ('1. tur', '2. tur' yalnız birden çok tursa), her kartta tarih aralığı (date-fns, dil locale'i), sonuç rozeti (Tamamlandı yeşil / Bitti · 17/21 nötr / Bırakıldı soluk), başarı yüzdesi, bütün günlerin minik ısı şeridi (gün başına 1 hücre, done/excused/missed renkleri, title tarih), eylemler Yeniden başlat ve Bir tur daha; kart tıklanınca HabitDetail (salt görüntü + eylemler). Boş durum metni.
- Stiller src/styles/app.css sonuna lo-hab bloğu: renk tokenları :root ve [data-theme=dark] için --hab-terra/teal/amber/green/purple/red/charcoal ve -soft eşleri (koyu temada açık tonlar); .lo-hab ekran kabı (lo-rev dili: iç genişlik, padding, lo-scroll), sekme/segment, kart (--bg-elev, --radius-xl, --sh1, hover --sh2), halka, çentik düğmesi (44px, --hab dolgusu), 7 gün şeridi, mühür (döndürülmüş, --hab kenarlı, mono), boş durum, hepsi tamam satırı, uyarı satırı, detay başlık/özet, grid (7 sütun, hücre min 40px, 360px'te sığacak gap, mono gün numarası, durumlar: done dolgu, today vurgu halkası, missed soluk eğik çizgi ::after, excused ayrı işaret, future kesik çerçeve + cursor default), dönüm noktası işareti, çentik çizim keyframe'i (200ms), hücre menüsü, form (çipler, renk noktaları, tarih girişi), onay penceresi, geçmiş kartı + rozetler + ısı şeridi. Bütün kenar boşlukları margin-inline/padding-inline (RTL). .lo-app.is-mobile ayarları: tek sütun, grid hücresi küçülür, yatay kaydırma yok. @media (prefers-reduced-motion: reduce) ile lo-hab animasyon ve geçişleri kapatılır.
- Doğrulama: npx tsc --noEmit, npm test (habitTest + habitViewTest yeşil), npm run build. Vite dev sunucusunda tarayıcı akışı için test adımına not: ekle (21 ve 41), çentik/geri al, geçmiş gün, gelecek gün pasif, sağ tık ve uzun basış mazeret, Bırak onayı, Geçmiş süzgeci, Bir tur daha, koyu tema, Arapça RTL, 375px; localStorage'da yalnız habitHistoryFilter anahtarı. Commit mesajı Türkçe, AI imzası yok.

## Dokunulan dosyalar

- `Loomen/src/core/habit/view.ts`
- `Loomen/src/core/habit/index.ts`
- `Loomen/src/core/__test__/habitViewTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/App.tsx`
- `Loomen/src/components/Ribbon.tsx`
- `Loomen/src/screens/Habits/HabitsScreen.tsx`
- `Loomen/src/screens/Habits/HabitCard.tsx`
- `Loomen/src/screens/Habits/HabitRing.tsx`
- `Loomen/src/screens/Habits/HabitDetail.tsx`
- `Loomen/src/screens/Habits/HabitGrid.tsx`
- `Loomen/src/screens/Habits/HabitForm.tsx`
- `Loomen/src/screens/Habits/HabitConfirm.tsx`
- `Loomen/src/screens/Habits/HabitHistory.tsx`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/styles/app.css`
- `Loomen/src/screens/Habits`

## Test

Testler geçti.

> Tip denetimi, birim testleri ve derleme hatasız geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-55`
- Commit: `Loomen@8f48f6a1472fe58ccff2a04aea84ae675ec62823`
- Test koşusu: `bce5b40d-f1f9-4f41-9d9d-66aaf707f47c` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

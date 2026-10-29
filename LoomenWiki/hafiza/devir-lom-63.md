---
name: LOM-63 — Planner: sağ panel genişliği ayarlanabilsin, gecikenler görünsün, Pano'da tamamlananlar Geciken'de çıkmasın + LOM-62 iki küçük düzeltme
description: Planner sağ bloğuna sürüklenebilir genişlik tutamağı (kalıcı, çift tıkla sıfırlanır), mini ajandada gecikenlerin varsayılan görünümde en üstte listelenmesi, Pano'da tamamlananların süzülmesi ve LOM-62'den kalan iki düzeltme (form hatada açık kalır, daraltılmış kart klavyeye kapalı).
type: project
proje: loomen
kaynak: kart LOM-63 · dal fix/LOM-63 · Loomen@4d3bd21c3a78667d395a5e3ee06310d0b5785ccb · test koşusu 58bf8016-9a4e-4508-a209-a8c6910fc1e3 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-29
---

# LOM-63 — Planner: sağ panel genişliği ayarlanabilsin, gecikenler görünsün, Pano'da tamamlananlar Geciken'de çıkmasın + LOM-62 iki küçük düzeltme

## Ne yapıldı

Planner sağ bloğuna sürüklenebilir genişlik tutamağı (kalıcı, çift tıkla sıfırlanır), mini ajandada gecikenlerin varsayılan görünümde en üstte listelenmesi, Pano'da tamamlananların süzülmesi ve LOM-62'den kalan iki düzeltme (form hatada açık kalır, daraltılmış kart klavyeye kapalı).

## Adımlar

- Çekirdek yardımcı: src/core/layout/rightPanel.ts aç; RIGHT_PANEL_DEFAULT=312, MIN=260, MAX=560, clampRightWidth(n) (sayı değilse/sonsuzsa varsayılan) ve nextRightWidth(startWidth, dx, rtl) (LTR'de sola çekince büyür: start - dx; RTL'de start + dx; sonuç clamp) saf fonksiyonları.
- Store (src/store/useAppStore.ts): AppState'e rightWidth:number (başlangıç RIGHT_PANEL_DEFAULT), setRightWidth(w) (clamp eder), resetRightWidth() ekle; partialize'a rightWidth; merge'de rightWidth: clampRightWidth(p.rightWidth ?? current.rightWidth).
- RightPanel (src/components/RightPanel.tsx): useIsMobile oku; masaüstünde kök div'e style={{'--side-w': width+'px'}} ver (mobilde verme) ve inline-start kenarına div.lo-side__grip ekle: role=separator, aria-orientation=vertical, aria-valuemin/max/now, aria-label=t('planner.resizeRight'), tabIndex=0. onPointerDown (yalnız sol tuş): setPointerCapture, başlangıç x ve genişliği kaydet, lo-app'e is-resizing sınıfı; pointermove: setRightWidth(nextRightWidth(start, e.clientX - x0, document.documentElement.dir==='rtl')); pointerup/cancel: capture bırak, sınıfı kaldır. onDoubleClick → resetRightWidth. Klavye: ArrowLeft/ArrowRight ±16px (RTL'de ters), Home → varsayılan. HTML5 drag kullanılmaz.
- CSS (src/styles/app.css, .lo-side bloğu): .lo-side { position:relative; width: var(--side-w, 312px) } (mobil .lo-mplan .lo-side width:auto aynen kalır). .lo-side__grip { position:absolute; inset-block:0; inset-inline-start:-3px; width:7px; cursor:col-resize; touch-action:none; z-index:2 } hover/aktif/focus-visible'da 2px accent çizgi; .lo-app.is-resizing { cursor:col-resize; user-select:none } ve bu sırada .lo-side geçişleri kapalı.
- Çeviri (tr/en/ar translation.json, planner bölümü): resizeRight = 'Sağ panelin genişliği. Sürükle; çift tık varsayılana döndürür' / 'Right panel width. Drag; double-click resets' / Arapça karşılığı.
- Alışkanlık kayıt hatası (useAppStore.ts): habitCommit(changed, rethrow=false) imzası; catch'te habitFailed sonrası rethrow ise HabitSaveError(errText(e)) fırlat (HabitVaultChanged'da fırlatma, false dön). habitAdd, habitNewRound ve habitEdit rethrow=true ile çağırır; AppState yorumlarını 'kayıt hatası fırlatılır' diye güncelle. habitRestart ve çentik eylemleri eski davranışta kalır.
- HabitForm (src/screens/Habits/HabitForm.tsx): submit'teki catch zaten setError yapıyor; düzenleme dalında onClose yalnız başarı ya da 'değişiklik yok' (null) durumunda çağrılır, hata fırlayınca pencere açık ve alanlar dolu kalır. Hata kutusu role=alert ile görünür; busy bitince düğme yeniden açılır.
- HabitsTodayCard (src/screens/Planner/HabitsTodayCard.tsx): #lo-hab-side-panel div'ine inert={collapsed} ver (React 19 boolean), çentik düğmelerindeki tabIndex={collapsed ? -1 : undefined} geçici çözümünü kaldır, aria-hidden kalsın.
- Çekirdek görünüm yardımcısı: src/core/vault/agendaView.ts aç. AgendaFilter tipi ('yapilacak'|'geciken'|'planlanmamis'); openTasks(group); miniAgendaSections(groups, filter): yapilacak → overdue+today+upcoming, geciken → overdue; yalnız açık görevi olan gruplar, overdue olanlar başa; boardColumns(groups): overdue/today/upcoming sırasıyla yalnız açık görevler; overdueOpenCount(groups).
- StatCards (src/screens/Planner/StatCards.tsx): TaskFilter tipini agendaView'daki AgendaFilter'dan al (export type TaskFilter = AgendaFilter).
- MiniAgenda (src/screens/Planner/MiniAgenda.tsx): satır kurulumunu miniAgendaSections ile yap; sıra: geciken bölümler (lo-mini__date--overdue kırmızı başlık), sonra Google Takvim başlığı/etkinlikleri (yalnız yapilacak), sonra bugün/yaklaşan. Boş durum metni aynen.
- Board (src/screens/Planner/Board.tsx): tasksOf yerine boardColumns kullan; tamamlanan görev hiçbir sütuna girmez, sayaç açık görev sayısını gösterir. BoardCard'ın done görünümü dokunulmaz.
- Birim testi: src/core/__test__/agendaViewTest.ts (habitViewTest deseni). parseTasks ile satır içi markdown: geciken açık, geciken tamamlanmış (✅), bugün açık, yaklaşan açık, tarihsiz açık, yalnız tamamlanmış görevi olan geçmiş gün. Kontroller: boardColumns.overdue tamamlananı içermez; yalnız-tamamlanmış gün mini bölüm üretmez; miniAgendaSections('yapilacak') ilk bölümü overdue; overdueOpenCount == focusCounts(...).geciken; 'geciken' süzgeci yalnız overdue verir. Ayrıca rightPanelTest.ts: clamp sınırları, NaN → varsayılan, LTR/RTL yön. İkisini scripts/run-tests.mjs suites listesine ekle.
- Canlı/ekran doğrulaması test ajanınca koşturulmaz, insana kalır: Doğrulama: npm run typecheck, npm test, npm run build yeşil. Tarayıcıda (vite dev, demo-vault) masaüstü ve 375px, açık ve koyu tema, tr ve ar ile ekran görüntüsü: tutamak sürüklenir, yenilemede genişlik kalır, çift tık sıfırlar, telefonda tutamak yok; mini listede geciken başlık en üstte ve sayı Geciken sayacıyla aynı; Pano Geciken sütununda tamamlanmış kart yok; düzenleme kaydı başarısız senaryoda pencere açık; daraltılmış kartta Tab odağı içeri girmez. Not dosyalarına yazım olmadığı git status ile görülür. Commit mesajı Türkçe, AI imzası yok.

## Dokunulan dosyalar

- `Loomen/src/core/layout/rightPanel.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/components/RightPanel.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/screens/Habits/HabitForm.tsx`
- `Loomen/src/screens/Planner/HabitsTodayCard.tsx`
- `Loomen/src/core/vault/agendaView.ts`
- `Loomen/src/screens/Planner/StatCards.tsx`
- `Loomen/src/screens/Planner/MiniAgenda.tsx`
- `Loomen/src/screens/Planner/Board.tsx`
- `Loomen/src/core/__test__/agendaViewTest.ts`
- `Loomen/src/core/__test__/rightPanelTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Tip denetimi, 28 test dosyasının tamamı ve derleme hatasız geçti. Yeni geciken/tamamlanan testi 17/17 geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-63`
- Commit: `Loomen@4d3bd21c3a78667d395a5e3ee06310d0b5785ccb`
- Test koşusu: `58bf8016-9a4e-4508-a209-a8c6910fc1e3` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

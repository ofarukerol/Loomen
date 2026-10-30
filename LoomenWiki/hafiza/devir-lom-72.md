---
name: LOM-72 — Planner sağ blok kartlarının sırası ayarlanabilsin
description: Planner sağ bloğundaki beş kartın sırası yeni varsayılana (Pomodoro, Takvim, Bugüne Odaklan, Tekrar, Alışkanlıklar) çekilir; Ayarlar'a yukarı/aşağı ve sürükleme ile sıralanan, 'Varsayılana dön' düğmeli bir liste eklenir; sıra kalıcı kayda yazılır ve sağ blok bu sırayla çizilir.
type: project
proje: loomen
kaynak: kart LOM-72 · dal fix/LOM-72 · Loomen@52a1dd55cc2eb48bbb5c644b368255ad44215a8e · test koşusu ea96834b-de6f-47e9-a5e9-003e63dcf96b (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-30
---

# LOM-72 — Planner sağ blok kartlarının sırası ayarlanabilsin

## Ne yapıldı

Planner sağ bloğundaki beş kartın sırası yeni varsayılana (Pomodoro, Takvim, Bugüne Odaklan, Tekrar, Alışkanlıklar) çekilir; Ayarlar'a yukarı/aşağı ve sürükleme ile sıralanan, 'Varsayılana dön' düğmeli bir liste eklenir; sıra kalıcı kayda yazılır ve sağ blok bu sırayla çizilir.

## Adımlar

- Saf çekirdek modülü ekle: Loomen/src/core/layout/sideCards.ts. İçerik: kart kimlikleri sabiti ve türü (pomodoro, calendar, focus, review, habits), varsayılan sıra DEFAULT_SIDE_CARD_ORDER = [pomodoro, calendar, focus, review, habits], normalizeSideCardOrder(v: unknown) (dizi değilse/bozuksa varsayılan; bilinmeyen ve tekrar eden kimlikleri at; eksik kimlikleri varsayılan sırayla sona ekle), moveSideCard(order, id, -1|1) (sınırda aynen döner), reorderSideCards(order, fromIndex, toIndex) (sürükleme için), isDefaultSideCardOrder(order).
- Node testi ekle: Loomen/src/core/__test__/sideCardsTest.ts (rightPanelTest.ts biçiminde check/section ile): varsayılan sıra beklenen; bozuk kayıt (null, string, sayı dizisi) varsayılana döner; bilinmeyen kimlik atılır; tekrar eden kimlik tekilleşir; eksik kart sona eklenir (eski sürüm kaydı dört kartlıysa beşinci sona gelir); yukarı/aşağı hareket ve sınırda sabit kalma; reorder ileri/geri taşıma; isDefault doğru/yanlış. Ayrıca tr/en/ar JSON'larını okuyup settings.sideCards.* anahtarlarının üç dilde eşit olduğunu denetle (reviewI18nTest'teki flatten yaklaşımı). Loomen/scripts/run-tests.mjs listesine ekle.
- Store (Loomen/src/store/useAppStore.ts): AppState'e sideCardOrder: SideCardId[] alanı ve setSideCardOrder(order), moveSideCard(id, dir), resetSideCardOrder() eylemleri ekle; başlangıç değeri DEFAULT_SIDE_CARD_ORDER. partialize'a sideCardOrder ekle; merge'de sideCardOrder: normalizeSideCardOrder(p.sideCardOrder) ile güvenli geri yükle (rightWidth örneğindeki gibi). Eylemler yazarken de normalize et.
- RightPanel (Loomen/src/components/RightPanel.tsx): sabit JSX yerine store'dan sideCardOrder oku ve kimlik→bileşen eşlemesiyle (pomodoro→PomodoroCard, calendar→CalendarCard, focus→MiniAgenda, review→ReviewCard, habits→HabitsTodayCard) sırayla çiz (key olarak kimlik). Kartların kendi gizlenme kuralı (ReviewCard modül kapalıysa null, HabitsTodayCard aktif alışkanlık yoksa null) aynen kalır; böylece kapalı modülün kartı listede dursa da Planner'da görünmez. Üstteki açıklama yorumunu yeni varsayılan sıraya göre güncelle.
- Ayar bileşeni ekle: Loomen/src/screens/Settings/SideCardsSettings.tsx. Section başlığı settings.sideCards, alt yazı settings.sideCardsSub. Beş satır: kart adı (settings.sideCard.pomodoro/calendar/focus/review/habits), Tekrar için srsSettings.enabled false ise küçük 'kapalı' rozeti (settings.sideCardOff), Alışkanlıklar için 'aktif alışkanlık yoksa gizlenir' alt notu (settings.sideCardHabitsSub). Her satırda tutamak simgesi (GripVertical), yukarı/aşağı düğmeleri (ChevronUp/ChevronDown, aria-label settings.moveUp/moveDown, ilk/son satırda ilgili düğme disabled). Satırlar draggable; onDragStart/onDragOver(preventDefault)/onDrop ile reorderSideCards çağrılır, sürüklenen ve hedef satır is-dragging/is-over sınıfı alır. Altta 'Varsayılana dön' düğmesi (settings.sideCardReset), isDefaultSideCardOrder ise disabled. Sürükleme telefonda çalışmasa da düğmeler çalışır.
- SettingsScreen (Loomen/src/screens/Settings/SettingsScreen.tsx): SideCardsSettings'i Pomodoro bölümünden önce (Editör/Şablonlar'dan sonra) ya da Pomodoro zil satırından hemen sonra ekle; Section/Toggle yardımcıları aynı dosyada kaldığı için bileşen kendi küçük Section sarmalını kullanır ya da mevcut sınıflarla (lo-set__section + lo-card lo-set__card) aynı görünümü verir.
- Metinler: tr/en/ar translation.json settings altına sideCards, sideCardsSub, sideCard.pomodoro, sideCard.calendar, sideCard.focus, sideCard.review, sideCard.habits, sideCardHabitsSub, sideCardOff, moveUp, moveDown, sideCardReset anahtarlarını üç dilde ekle (Arapça gerçek çeviri, yer tutucu değil).
- CSS (Loomen/src/styles/app.css): .lo-set__cards listesi, .lo-set__cardrow (flex, gap, lo-set__row--border benzeri ayırıcı), tutamak rengi var(--fg3), düğmeler lo-hab-iconbtn benzeri 32px dokunma alanı (mobilde 40px), is-dragging yarı saydam, is-over üstte/altta vurgu çizgisi, rozet var(--bg-sunken) üstünde var(--fg3). Yalnız mantıksal özellikler (margin-inline-start, border-inline) kullan ki Arapçada doğru dursun; koyu temada mevcut değişkenler yeterli.
- Wiki: Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md içine 'Sağ blok kart sırası (LOM-72)' alt bölümü: varsayılan sıra, Ayarlar'daki liste, kalıcılık, kapalı modül davranışı.
- Doğrula: npm test (yeni sideCardsTest dahil tüm dosyalar geçer) ve npm run typecheck. Commit mesajı 'LOM-72: ...' biçiminde, AI imzası yok.

## Dokunulan dosyalar

- `Loomen/src/core/layout/sideCards.ts`
- `Loomen/src/core/__test__/sideCardsTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/components/RightPanel.tsx`
- `Loomen/src/screens/Settings/SideCardsSettings.tsx`
- `Loomen/src/screens/Settings/SettingsScreen.tsx`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/styles/app.css`
- `Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md`

## Test

Testler geçti.

> Tip denetimi hatasız geçti. Tam test takımı koştu: 32 test dosyasının tümü geçti, kart sırası testi 25/25. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-72`
- Commit: `Loomen@52a1dd55cc2eb48bbb5c644b368255ad44215a8e`
- Test koşusu: `ea96834b-de6f-47e9-a5e9-003e63dcf96b` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

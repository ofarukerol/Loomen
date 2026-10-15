---
name: LOM-33 — Mobil: klavyedeki onay tuşu görev eklesin
description: Mobilde hızlı görev ekleme kutusunda ekran klavyesinin onay tuşu da görevi eklesin: QuickAdd.tsx'teki "!isMobile" koşulu kaldırılır, IME koruması saf bir yardımcıya taşınıp test edilir, klavye tuşu etiketi "Gönder" olur, odak kutuda kalır.
type: project
proje: loomen
kaynak: kart LOM-33 · dal fix/LOM-33 · Loomen@19712f888dbf29b5a7b3f66fba5ed3c03da0275f · test koşusu 44c81e25-2c1d-4a18-99e9-f5e4592af36c (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-15
---

# LOM-33 — Mobil: klavyedeki onay tuşu görev eklesin

## Ne yapıldı

Mobilde hızlı görev ekleme kutusunda ekran klavyesinin onay tuşu da görevi eklesin: QuickAdd.tsx'teki "!isMobile" koşulu kaldırılır, IME koruması saf bir yardımcıya taşınıp test edilir, klavye tuşu etiketi "Gönder" olur, odak kutuda kalır.

## Adımlar

- Loomen/src/screens/Planner/quickAddKeys.ts adında saf bir yardımcı oluştur: isQuickAddSubmitKey({ key, keyCode, isComposing }) → boolean. Kural: isComposing true ya da keyCode 229 ise false (IME yazımı sürüyor); key 'Enter' ya da keyCode 13 ise true; diğer her şey false. Platform (mobil/masaüstü) ayrımı YOK. React ya da DOM tipine bağımlı olmasın ki node testinde koşabilsin.
- Loomen/src/screens/Planner/QuickAdd.tsx: onKeyDown içinde isQuickAddSubmitKey({ key: e.key, keyCode: e.keyCode, isComposing: e.nativeEvent.isComposing }) doğruysa e.preventDefault() ve addTask() çağır. '!isMobile' koşulunu, isMobile değişkenini ve useIsMobile importunu kaldır (tsconfig noUnusedLocals açık; kullanılmayan import tsc'yi düşürür). enterKeyHint'i 'send' yap. Yorumları güncelle: mobilde onay tuşu da ekler, kutu boşalır, odak kutuda kalır, klavye kapanmaz. blur() ya da focus() çağrısı EKLEME; addTask zaten quickText'i hemen boşaltıyor, kontrollü input odakta kalıyor.
- Loomen/src/core/__test__/coreTest.ts: '../../screens/Planner/quickAddKeys' içinden isQuickAddSubmitKey'i içe al ve mevcut check/eq deseniyle kontroller ekle: Enter → true; Enter + isComposing → false; keyCode 229 → false; key 'Unidentified' + keyCode 13 → true; 'a' → false; 'Escape' → false. Dosya başındaki kapsam yorumuna 'hızlı ekleme tuş kuralı' ekle. run-tests.mjs'e dokunmak gerekmez (coreTest zaten listede).
- Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md 'Hızlı ekleme' bölümüne tek satır ekle: mobilde ekran klavyesinin onay tuşu (Gönder) da ekler; kutu boşalır, klavye açık kalır.
- Doğrula: 'npm run typecheck' ve 'npm test' repo kökünden koş, ikisi de yeşil olsun; coreTest çıktısında yeni kontrollerin ✓ olduğunu göster. Commit mesajı repo dilinde, AI imzası yok, dal fix/LOM-33.

## Dokunulan dosyalar

- `Loomen/src/screens/Planner/QuickAdd.tsx`
- `Loomen/src/screens/Planner/quickAddKeys.ts`
- `Loomen/src/core/__test__/coreTest.ts`
- `Loomen/LoomenWiki/modules/planlayici-takvim-pomodoro.md`

## Test

Testler geçti.

> Tip denetimi ve npm test hatasız geçti. Yeni altı tuş kuralı kontrolü (LOM-33) geçti, 11 test dosyasının tümü yeşil. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-33`
- Commit: `Loomen@19712f888dbf29b5a7b3f66fba5ed3c03da0275f`
- Test koşusu: `44c81e25-2c1d-4a18-99e9-f5e4592af36c` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

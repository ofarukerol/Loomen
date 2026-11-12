---
name: LOM-105 — Mobilde otomatik senkron çalışmıyor, iki gün senkronsuz kalabiliyor
description: Telefonda senkron yalnız kesintisiz 3 dakika açık kalınca çalışan bir sayaca bağlı; açılışta, öne gelince ve arka plana geçerken de senkron yapılacak, takılan senkron zaman aşımıyla bitecek ve uzun süre senkron olmazsa ekranda uyarı şeridi çıkacak. Telefon kapalıyken kendiliğinden çalışan gerçek arka plan senkronu bu karta dahil değil.
type: project
proje: loomen
kaynak: kart LOM-105 · dal fix/LOM-105 · Loomen@634d58ec63123920bca308404ff2038ca2c0051d · test koşusu c44d028b-88a4-474f-9323-e23a9ac76d6f (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-12
---

# LOM-105 — Mobilde otomatik senkron çalışmıyor, iki gün senkronsuz kalabiliyor

## Ne yapıldı

Telefonda senkron yalnız kesintisiz 3 dakika açık kalınca çalışan bir sayaca bağlı; açılışta, öne gelince ve arka plana geçerken de senkron yapılacak, takılan senkron zaman aşımıyla bitecek ve uzun süre senkron olmazsa ekranda uyarı şeridi çıkacak. Telefon kapalıyken kendiliğinden çalışan gerçek arka plan senkronu bu karta dahil değil.

## Adımlar

- Kök sebep (kodda doğrulandı): otomatik senkron yalnız Loomen/src/App.tsx:159-163'teki 3 dakikalık setInterval'e bağlı. Açılışta ve öne gelince senkron yok (Google Takvim'de var, burada yok); telefonda arka planda sayaç donuyor; 3 dakikadan kısa kullanımda hiç senkron olmuyor. Ayrıca ağ isteğinde zaman aşımı yok ve senkron uzun süre olmayınca hiçbir uyarı çıkmıyor.
- Yeni saf modül Loomen/src/core/sync/autoSync.ts yaz: sabitler AUTO_SYNC_INTERVAL_MS (3 dk), MIN_GAP_MS (30 sn), STALE_AFTER_MS (15 dk), CHECK_EVERY_MS (30 sn). `shouldSyncNow({ enabled, syncing, reason: 'start'|'foreground'|'tick'|'background'|'online', lastAttemptAt, now })`: kapalıysa ya da senkron sürüyorsa false; start → true; foreground/online/background → son denemeden MIN_GAP_MS geçtiyse true; tick → son denemeden AUTO_SYNC_INTERVAL_MS geçtiyse true. `syncHealth({ enabled, syncing, lastSuccessAt, failed, now })` → 'ok' | 'stale' | 'error' (kapalıysa ya da sürüyorsa ok; failed → error; lastSuccessAt yok ya da STALE_AFTER_MS'ten eski → stale). Saat geri alınmışsa (now < lastAttemptAt) senkrona izin ver.
- Loomen/src/store/useAppStore.ts ghSync: modül seviyesinde tek uçuş koruması ekle (süren senkron varsa aynı promise döner, ikinci senkron başlamaz). flushDraft ve libraryFlushPosition çağrılarını try içine al; her çıkışta ghSyncing false olsun. Yeni durum alanları: `ghLastAttempt: number | null` (deneme başında yazılır, kalıcı değil) ve `ghSyncFailed: boolean` (catch'te true, başarıda false, kalıcı değil). ghStatus değerlerine yeni metin EKLEME (Explorer KNOWN_SYNC bozulmasın). ghLastSync kalıcılığı aynen kalır.
- Yeni kanca Loomen/src/hooks/useAutoSync.ts: App.tsx'teki otomatik senkron effect'inin yerini alır. Koşul aynı: features.github açık, ghAutoSync açık, ghToken var, ghRepo var; bağımlılık olarak ghRepo nesnesi değil ghRepo.full_name kullan. Kurulunca 'start' ile dene (kasa yolu henüz yoksa vaultPath gelince yeniden dener); CHECK_EVERY_MS aralıklı sayaçta 'tick' ile dene (duvar saatine bakar, donmuş sayaç uyanınca hemen yakalar); visibilitychange görünür, window focus ve pageshow → 'foreground'; window online → 'online'; yalnız platformMobile iken visibilitychange gizli → 'background'. Her kararı shouldSyncNow verir, zamanları useAppStore.getState()'ten okur.
- Loomen/src/App.tsx: 158-163 arasındaki GitHub otomatik senkron effect'ini kaldır, yerine useAutoSync() çağır; kullanılmayan ghAutoSync/ghToken/ghRepo/ghSync/ghOn seçicilerini temizle. Google Takvim effect'ine dokunma. WriteErrorBar ve VaultOpenErrorBar'ın yanına <SyncStaleBar /> ekle.
- Yeni bileşen Loomen/src/components/SyncStaleBar.tsx (emsal: WriteErrorBar.tsx): store'a bağlı dış bileşen syncHealth ile durumu hesaplar, 30 saniyede bir ve görünür olunca zamanı tazeler; 'ok' ise hiçbir şey çizmez. Saf gövde SyncStaleBarBody({ health, lastSyncText, detail, t, onRetry, busy }): stale → 'Uzun süredir senkron olmadı · Son senkron: …', error → 'Senkron yapılamıyor' + 'Ayrıntılar' altında ham hata (dir=ltr), ikisinde de 'Şimdi dene' düğmesi (ghSync çağırır, sürerken pasif). Stilleri Loomen/src/styles/app.css içinde lo-writebar kurallarının yanına lo-syncbar olarak ekle; dar ekranda taşmasın.
- Loomen/src-tauri/src/github_api.rs http(): reqwest istemcisine connect_timeout(15 sn) ve timeout(120 sn) ekle (yeni bağımlılık yok, reqwest'in kendi ayarı). Zaman aşımı hatası mevcut hata yolundan arayüze döner.
- Çeviriler (tr, en, ar üçü birden): yeni syncBar.stale, syncBar.failed, syncBar.lastSync, syncBar.never, syncBar.retry, syncBar.details anahtarlarını ekle. github.autoSyncSub ve yardım metnindeki '3 dakikada bir' cümlesini gerçeğe göre güncelle: açılışta, öne gelince ve açıkken 3 dakikada bir.
- Testler: yeni Loomen/src/core/__test__/autoSyncTest.ts (shouldSyncNow'ın her nedeni, eşik sınırları, senkron sürerken false, saat geri alınması; syncHealth'in ok/stale/error dalları) ve Loomen/src/core/__test__/syncStaleBarTest.ts (gövde react-dom/server ile çizilir: stale ve error metinleri, düğme, ok iken boş; emsal writeErrorBarTest.ts). İkisini Loomen/scripts/run-tests.mjs listesine ekle. Loomen/src/core/__test__/featuresTest.ts:146'daki 'Yedekleme kapalıyken otomatik eşitleme yok' denetimini App.tsx yerine useAutoSync.ts'i okuyacak şekilde güncelle.
- Doğrula: npm run typecheck, npm test ve cd src-tauri && cargo check yeşil olsun. Sonuçta telefonda denenmediğini ve gerçek arka plan senkronunun ayrı kart işi olduğunu açıkça yaz.

## Dokunulan dosyalar

- `Loomen/src/core/sync/autoSync.ts`
- `Loomen/src/hooks/useAutoSync.ts`
- `Loomen/src/components/SyncStaleBar.tsx`
- `Loomen/src/App.tsx`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/styles/app.css`
- `Loomen/src-tauri/src/github_api.rs`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/autoSyncTest.ts`
- `Loomen/src/core/__test__/syncStaleBarTest.ts`
- `Loomen/src/core/__test__/featuresTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Tip denetimi, tüm birim testler (67 dosya) ve Rust derlemesi yeşil. Yeni autoSyncTest ve syncStaleBarTest dosyaları koştu. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-105`
- Commit: `Loomen@634d58ec63123920bca308404ff2038ca2c0051d`
- Test koşusu: `c44d028b-88a4-474f-9323-e23a9ac76d6f` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

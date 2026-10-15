---
name: LOM-32 — Loomen mobil: yeni sürüm geldiğinde kibar, göz yormayan güncelleme uyarısı
description: Loomen mobilde (iOS/Android) açılışta günde en fazla bir kez loomen.org/surum.json Rust üzerinden okunup uygulama sürümüyle karşılaştırılır; yeni sürüm varsa yüzen alt çubuğun hemen üstünde "Yeni sürüm hazır · Güncelle · Sonra" şeridi çıkar, Sonra aynı sürümü 3 gün gizler, ağ hatası sessiz geçer, masaüstünde hiç görünmez.
type: project
proje: loomen
kaynak: kart LOM-32 · dal fix/LOM-32 · Loomen@9ff8da978283c8d75bb01ccfbd9705bea1e747dd · test koşusu 1e7df313-1d5b-418f-b8ea-dd252c6a3f5f (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-15
---

# LOM-32 — Loomen mobil: yeni sürüm geldiğinde kibar, göz yormayan güncelleme uyarısı

## Ne yapıldı

Loomen mobilde (iOS/Android) açılışta günde en fazla bir kez loomen.org/surum.json Rust üzerinden okunup uygulama sürümüyle karşılaştırılır; yeni sürüm varsa yüzen alt çubuğun hemen üstünde "Yeni sürüm hazır · Güncelle · Sonra" şeridi çıkar, Sonra aynı sürümü 3 gün gizler, ağ hatası sessiz geçer, masaüstünde hiç görünmez.

## Adımlar

- KARAR (kod yok, uygulayan bilsin): kontrol yolu loomen.org/surum.json. Play In-App Updates için resmi Tauri eklentisi yok, gen/android içine Kotlin ve Play Core bağımlılığı gerekir, iOS'u kapsamaz. surum.json ise sıfır yeni bağımlılık (reqwest zaten Cargo.toml'da), iki platformu da kapsar ve Rust'tan çekildiği için webview CORS sorunu yok. Dosya biçimi: { "android": { "version": "0.1.1", "url": opsiyonel }, "ios": { "version": "0.1.1", "url": opsiyonel }, "version": opsiyonel ortak }. Semver metni kullanılır çünkü uygulama kendi sürümünü yalnız tauri.conf.json'daki 0.1.0 biçiminde bilir (Tauri Android versionCode'u bundan türetir: 0.1.0 → 1000); versionCode alanı gelirse yok sayılır.
- YENİ SAF MODÜL Loomen/src/core/update/mobileUpdate.ts (React/Tauri/i18n import etmez, node testinde koşar): STORE_URLS { android: 'https://play.google.com/store/apps/details?id=org.loomen.notes', ios: 'https://apps.apple.com/app/id6821169163' }; type MobilePlatform = 'android'|'ios'; parseVersion(v): baştaki 'v'yi at, '-'/'+' sonrasını yok say, nokta ile böl, sayı değilse null; compareVersions(a,b): -1/0/1, eksik parça 0 sayılır ('0.1' == '0.1.0'), ikisinden biri parse edilemezse 0; latestVersionFor(platform, file: unknown): önce file[platform].version, yoksa file.version; parse edilebilir metin değilse null; storeUrlFor(platform, file?): file[platform].url 'https://' ile başlıyorsa o, yoksa STORE_URLS[platform]; interface UpdatePrefs { lastCheckAt: number|null; snoozedVersion: string|null; snoozedUntil: number|null }, EMPTY_PREFS; CHECK_INTERVAL_MS = 24 saat, SNOOZE_MS = 3 gün; shouldCheck(prefs, now): lastCheckAt null ya da now - lastCheckAt >= 24s ya da lastCheckAt > now (saat geri alınmış) → true; markChecked(prefs, now); isUpdateAvailable(current, latest): latest parse edilir ve compare(latest, current) > 0; isSnoozed(prefs, version, now): snoozedVersion === version ve snoozedUntil doluysa ve now < snoozedUntil; shouldShowBanner({current, latest, prefs, now}): latest dolu, isUpdateAvailable ve !isSnoozed; snooze(prefs, version, now): snoozedVersion=version, snoozedUntil=now+SNOOZE_MS; PREFS_KEY = 'loomen.update'; loadPrefs(storage: { getItem(k): string|null }): bozuk JSON ya da eksik alanlarda EMPTY_PREFS'e düş; savePrefs(storage: { setItem(k, v) }, prefs). Her fonksiyonun üstüne neden böyle olduğunu anlatan kısa Türkçe yorum.
- TEST Loomen/src/core/__test__/mobileUpdateTest.ts (mobileTest.ts'teki check/eq deseni, yeni bağımlılık yok): parseVersion ('v0.1.2' → [0,1,2], '1.0.0-beta' → [1,0,0], 'abc' → null); compareVersions ('0.1.0'<'0.1.1', '0.1.0'=='0.1.0', '0.1'=='0.1.0', '0.2.0'<'0.10.0' sayısal, '1.0.0-beta'=='1.0.0', bozuk metin 0); latestVersionFor (platform girdisi ortak version'ı ezer; yalnız ortak version varsa o; yalnız versionCode varsa null; null/metin/dizi girdisi null); storeUrlFor (varsayılan Play ve App Store adresleri; https url ezer; http ya da boş url ezmez); shouldCheck (null → true; 23 saat → false; 25 saat → true; gelecekteki lastCheckAt → true); markChecked; shouldShowBanner (eski sürüm → true; aynı → false; daha yeni kurulu → false; aynı sürüm 3 gün içinde ertelenmiş → false; başka sürüm ertelenmiş → true; erteleme süresi dolmuş → true; latest null → false); snooze until = now + 3 gün; loadPrefs bozuk JSON → EMPTY_PREFS, eksik alan → null; Map tabanlı sahte storage ile save/load gidiş-dönüş. Sonda ✅/❌ özet ve process.exit. Loomen/scripts/run-tests.mjs suites listesine ['src/core/__test__/mobileUpdateTest.ts', []] ekle.
- RUST Loomen/src-tauri/src/surum.rs (yeni): const SURUM_URL = 'https://loomen.org/surum.json'; #[derive(Serialize)] pub struct SurumKontrol { current: String, remote: serde_json::Value }; #[tauri::command] pub async fn surum_kontrol(app: tauri::AppHandle) -> Result<SurumKontrol, String>: reqwest::Client::builder().user_agent('Loomen-App').timeout(Duration::from_secs(8)).build(); GET SURUM_URL header Cache-Control: no-cache; 2xx değilse Err(durum kodu); gövdeyi serde_json::Value olarak parse et; current = app.package_info().version.to_string(). Hata metinleri Türkçe (github.rs üslubu). Loomen/src-tauri/src/lib.rs: baştaki modül listesine 'surum : loomen.org sürüm dosyası (mobil güncelleme uyarısı)' satırı, mod surum; ve surum::surum_kontrol'ü HEM masaüstü HEM mobil invoke_handler listesine ekle (çağrı yalnız mobilde yapılır, kayıt iki listede olsun ki derleme simetrik kalsın). Capability dosyalarına dokunma (uygulama komutu ACL istemez).
- KANCA Loomen/src/hooks/useMobileUpdate.ts (yeni): store'dan platformMobile ve platformOs oku; dönüş { update: { version, url } | null, later(), openStore() }. useEffect (bağımlılık platformMobile, platformOs): platformMobile false, isTauri() false ya da platformOs 'ios'/'android' değilse hiçbir şey yapma. tick(): prefs = loadPrefs(localStorage); shouldCheck(prefs, Date.now()) değilse çık; önce savePrefs(markChecked) yaz (başarılı ya da başarısız fark etmez — 'günde en fazla bir' kuralı harfiyen, ağ dövülmez); sonra invoke<SurumKontrol>('surum_kontrol'); latest = latestVersionFor(platform, remote); shouldShowBanner({ current, latest, prefs, now }) ise setUpdate({ version: latest, url: storeUrlFor(platform, remote) }); tüm yol try/catch içinde, hata yalnız console.debug (pencere/şerit yok). Açılışta 4 sn gecikmeyle (setTimeout) bir kez; ayrıca document visibilitychange → visible olunca aynı tick (24 saat kısıtı zaten içinde; iOS'ta uygulama nadiren soğuk açılır). Temizlikte timer ve dinleyici kaldırılır. later(): savePrefs(snooze(prefs, version, now)) ve setUpdate(null). openStore(): @tauri-apps/plugin-opener openUrl(url).catch(() => {}) + later() ile aynı erteleme (mağazadan dönünce şerit yeniden dürtmesin).
- ŞERİT Loomen/src/components/MobileUpdateBanner.tsx (yeni): useMobileUpdate(); update null ise null döndür. <div className="lo-mupd" role="status">: lucide ArrowUpCircle (18px) ikonu; <span className="lo-mupd__text">{t('update.ready', { version })}</span>; <button className="lo-mupd__btn lo-mupd__btn--primary" onClick={openStore}>{t('update.now')}</button>; <button className="lo-mupd__btn" onClick={later}>{t('update.later')}</button>. Ayrı X yok: Sonra kapatma işlevidir. Loomen/src/App.tsx: mobil bloğunda (<MobileBar /> satırının hemen altında) {platformMobile && <MobileUpdateBanner />} — isMobile değil platformMobile (dar masaüstü penceresi göstermesin). Android geri tuşu katman listesine (closers) EKLEME.
- STİL Loomen/src/styles/app.css, .lo-mbar__count bloğundan sonra '---- Mobil güncelleme şeridi ----' bölümü: .lo-mupd { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom) + 20px + 52px + 10px + var(--kb)); z-index: 59 (alt çubuğun 60'ının altında, scrim 70'in altında — çekmece açılınca kararır); display: flex; align-items: center; gap: 8px; max-width: calc(100vw - 28px); padding: 8px 8px 8px 14px; background: var(--bg-elev); border: 1px solid var(--line); border-radius: 14px; box-shadow alt çubukla aynı; color: var(--fg1); font-size: 13px; .lo-mtop__dropdown'daki loFade animasyonu tanımlıysa aynısı }; .lo-mupd > svg { color: var(--accent); flex-shrink: 0 }; .lo-mupd__text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }; .lo-mupd__btn { height: 32px; padding: 0 12px; border: none; border-radius: 9px; background: none; color: var(--fg2); font-size: 13px; font-weight: 600; cursor: pointer; -webkit-tap-highlight-color: transparent }; .lo-mupd__btn:active { background: var(--line-soft) }; .lo-mupd__btn--primary { background: var(--accent-soft); color: var(--accent) }. Yalnız tema değişkenleri (koyu/açık otomatik), fiziksel left/right yerine gap ve ortalama (RTL'de sıra kendiliğinden döner).
- ÇEVİRİ üç dosyada aynı anahtarlar ve {{version}} yer tutucusu, 'mobile' grubunun hemen ardına 'update' grubu: tr → ready: 'Yeni sürüm hazır: {{version}}', now: 'Güncelle', later: 'Sonra'; en → 'New version ready: {{version}}', 'Update', 'Later'; ar → 'إصدار جديد جاهز: {{version}}', 'تحديث', 'لاحقًا'. Üç dosyanın anahtar kümesi birebir aynı mı: küçük bir node tek-satırlık karşılaştırmayla kontrol et (LOM-20'deki uygulama), çıktıyı rapora koy.
- BELGE Loomen/docs/surum.json (yeni, siteye yüklenecek örnek): { "android": { "version": "0.1.0" }, "ios": { "version": "0.1.0" } }. Loomen/docs/yayinlama.md sonuna '8. Mobil güncelleme uyarısı' bölümü: nasıl çalışır (açılışta günde en fazla bir kontrol, Sonra 3 gün erteler, ağ yoksa sessiz, masaüstünde yok), dosya biçimi ve opsiyonel url alanı, dosyanın https://loomen.org/surum.json adresinde durması gerektiği, sürüm numarasının mağazada yeni sürüm YAYINA GİRDİKTEN SONRA artırılması (erken artırılırsa kullanıcı mağazada eski sürümü bulur), dosya yoksa (404) özelliğin sessizce kapalı kaldığı, loomen.org sitesinin bu depoda olmadığı ve yüklemenin elle yapıldığı.
- DOĞRULAMA: npm test (mobileUpdateTest dahil tüm takımlar yeşil), npm run typecheck çıktısız, cd src-tauri && cargo check ve cargo test geçer. Kod üzerinden gözden geçir: masaüstü yolunda surum_kontrol çağrısı yok, isMobile (dar pencere) ile değil platformMobile ile gösteriliyor, hiçbir hata yolu pencere açmıyor, useAppStore.ts değişmedi. Commit mesajı repo dilinde, AI imzası YOK, fix/LOM-32 dalı. Telefonda gerçek deneme Ömer'de: raporda 'telefonda denenmedi' diye açıkça yaz ve surum.json'un siteye yüklenmesi gerektiğini hatırlat.

## Dokunulan dosyalar

- `Loomen/src/core/update/mobileUpdate.ts`
- `Loomen/src/core/__test__/mobileUpdateTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src-tauri/src/surum.rs`
- `Loomen/src-tauri/src/lib.rs`
- `Loomen/src/hooks/useMobileUpdate.ts`
- `Loomen/src/components/MobileUpdateBanner.tsx`
- `Loomen/src/App.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/docs/yayinlama.md`
- `Loomen/docs/surum.json`

## Test

Testler geçti.

> Hepsi geçti: npm test (12 dosya, mobileUpdateTest 73 kontrol), tsc, cargo check ve cargo test (17 test). tr/en/ar çevirilerinde update.ready/now/later anahtarları aynı. Telefonda gözle bakış Ömer'de kaldı.

## Kanıt

- Dal: `fix/LOM-32`
- Commit: `Loomen@9ff8da978283c8d75bb01ccfbd9705bea1e747dd`
- Test koşusu: `1e7df313-1d5b-418f-b8ea-dd252c6a3f5f` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

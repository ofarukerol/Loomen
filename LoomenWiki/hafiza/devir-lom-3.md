---
name: LOM-3 — Mobil Test
description: Mobil sürüm (iPhone/Android) mağazaya gitmeden önce kod üzerinden denetlendi; dokunmatik kullanımda çalışmayan yerler (not silme/yeniden adlandırma, planlayıcıda kaydırma, klavye altında kalan alanlar, Android geri tuşu), çentik/ekran kenarı boşlukları ve mağaza paketindeki eksikler (TV girdileri, gizlilik bildirimi, mikrofon izni metni, yedekleme ayarı) düzeltilecek, sonra derleme ve testlerle doğrulanıp elle denenecekler raporlanacak.
type: project
proje: loomen
kaynak: kart LOM-3 · dal fix/LOM-3 · Loomen@571e9a955b93e738b8a7120b96c166f20a51782b · test koşusu 1bf93006-8bb5-4da9-9ade-797fdbc57539 (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-09-20
---

# LOM-3 — Mobil Test

## Ne yapıldı

Mobil sürüm (iPhone/Android) mağazaya gitmeden önce kod üzerinden denetlendi; dokunmatik kullanımda çalışmayan yerler (not silme/yeniden adlandırma, planlayıcıda kaydırma, klavye altında kalan alanlar, Android geri tuşu), çentik/ekran kenarı boşlukları ve mağaza paketindeki eksikler (TV girdileri, gizlilik bildirimi, mikrofon izni metni, yedekleme ayarı) düzeltilecek, sonra derleme ve testlerle doğrulanıp elle denenecekler raporlanacak.

## Adımlar

- ÖN KONTROL: Bu dalda LOM-1 ve LOM-2 işi YOK (src/core/__test__/coreTest.ts, editorTest.ts, src/screens/Editor/tableModel.ts bulunmuyor; package.json'da 'test' betiği yok). O dallarla aynı dosyalara (useAppStore.ts, App.tsx, EditorScreen.tsx, tableWidget.ts, AndroidManifest, çeviri dosyaları) dokunurken değişikliği küçük tut ve sonuç raporunda 'LOM-1/LOM-2 ile birleştirirken çakışabilir' diye yaz. Başka dala geçme, push yok.
- DOKUNMATİK 1 (not silinemiyor/yeniden adlandırılamıyor): Explorer.tsx:129,171,429 ve CodeMirrorEditor.tsx:158 menüleri yalnız sağ tıkla (onContextMenu) açılıyor; iPhone'da uzun basma bu olayı üretmez. ~500 ms uzun basma (pointer olayları, parmak kayarsa iptal) ile aynı setMenu çağrılsın; mobilde satırlara '⋯' düğmesi de eklenebilir. EditorContextMenu.tsx:159-162 alt menü yalnız fareyle üstüne gelince açılıyor ve 375px ekrandan taşıyor (app.css:2358) → mobilde tıklayınca açılan, içe gömülü akordeon olsun.
- DOKUNMATİK 2: app.css:1784 '.lo-mini__row { touch-action: none }' yüzünden mobil planlayıcı görev satırından kaydırılamıyor (MiniAgenda.tsx:64 4px'te sürüklemeye başlıyor) → mobilde touch-action: pan-y, sıralama sürüklemesi yalnız uzun basınca başlasın. tableWidget.ts:217-237 sütun genişletme mousedown/mousemove/mouseup kullanıyor → pointerdown/move/up + setPointerCapture; hücre/ekle düğmeleri (:179,203) dokunuşta çalışsın.
- DOKUNMATİK 3: Çekmece içinden açılan pencereler çekmeceye sıkışıyor (çekmecede transform var: app.css:2571,2576; TrashModal.tsx:34 ve Explorer.tsx:565-568 bağlam menüsü) → ikisini createPortal(document.body) ile çiz; Arapçada (sağdan sola) menü konumunu ekran içine sıkıştır. Alt çubuk (.lo-mbar z-index 60, app.css:2502) pencerelerin (.lo-modal 50, :1602) üstünde kalıyor → modal z-index'ini yükselt, .lo-tdetail mobilde dvh kullansın.
- ANDROID GERİ TUŞU: src içinde popstate/pushState yok; geri tuşu her yerden uygulamayı kapatıyor. App.tsx'te çekmece/alt sayfa/pencere/planlayıcı dışı ekran açılınca geçmişe kayıt it, popstate'te önce açık olanı kapat, sonra planlayıcıya dön.
- YERLEŞİM: index.html:7 viewport meta'ya 'viewport-fit=cover' ekle (yoksa app.css'teki bütün safe-area boşlukları 0 kalıyor). app.css:10 ve :765 '100vh' → '100dvh'; App.tsx'te visualViewport.resize ile '--kb' değişkeni kur, Asistan yazma alanı (.lo-ai__composer :2721), görev ayrıntı altlığı ve editör alt boşluğu klavye yüksekliğini hesaba katsın. .lo-drawer'a (:2560-2575) alt safe-area boşluğu ekle. Mobilde dokunma hedeflerini 40-44px yap (.lo-fmt__btn :2343, .lo-sheet__x :2625, .lo-explorer__collapse/open :136, .lo-ai__chipx :2788, .lo-mtop__btn :2450). Yalnız :hover geri bildirimi olan düğmeleri '@media (hover: hover)' içine al ve :active ekle (:2347, :1636-1666).
- EDİTÖR/KLAVYE: CodeMirrorEditor.tsx:182 her not açılışında view.focus() çağırıyor → mobilde otomatik odaklama yapma (klavye her notta fırlamasın).
- MASAÜSTÜ ARTIKLARI: Explorer.tsx:528 alt düğmesi mobilde klasör seçici açıyor (core/vault/index.ts:74; mobilde yok) → platformMobile ise addMobileVault/Ayarlar'a yönlendir. Explorer.tsx:344-350 'paneli daralt' düğmesi ve :407 '⌘K' ipucu mobilde gizlensin. useIsMobile genişliğe bakıyor (768px); tablet/yatay ekranda VaultManager.tsx:276 ve GitHubSync.tsx:253 masaüstü yoluna düşüyor → 'platformMobile || isMobile' kullan. useAppStore.ts:1107 watchVaultRoot mobilde hiç çağrılmasın. ReviewSession.tsx:48-51 'notu aç' ve 'oturumu bitir' yalnız klavyeyle ise görünür düğme ekle.
- MOBİL KASA: useAppStore.ts:896-898 açılışta hep 'vault' klasörünü açıyor, ikinci mobil kasa etkin olarak geri gelmiyor → son etkin kasayı aç. Mobil kasalar mutlak yol ile saklanıyor (:938-942, :1025-1039); iOS güncellemede uygulama klasör yolunu değiştirebilir → mobilde kasayı appDataDir()'e göre klasör adıyla sakla, açılışta tam yolu yeniden kur; eski mutlak kayıtları klasör adına çeviren küçük bir geçiş yaz (veri silme yok).
- SES KAYDI: VoiceRecorder.tsx:229-231 gerçek hatayı yutup hep 'izin verilmedi' diyor → izin reddi ile diğer hataları ayır. Uzun kayıtta bellek (~11 MB/dk, :193, :245 her duraklatmada baştan kodlama) → mobilde kayıt süresine üst sınır koy ve kullanıcıya bildir (yeni bağımlılık yok).
- ÇEVİRİ/ERİŞİLEBİLİRLİK: Gömülü Türkçe metinleri anahtara taşı (tr kaynak, en ve ar'a da ekle, yer tutuculu): Explorer.tsx:315, core/vault/index.ts:74, useAppStore.ts:944,1118 ve diğer düz metinli notifyError çağrıları, core/ai/llm.ts:50. EditorScreen.tsx:87 'Ses Kayıtları' başlığı kullanıcı notuna yazıldığı için DOKUNMA, raporla. Explorer.tsx:157-158,312-313 sıralamada sabit 'tr' → etkin dil. MobileBar.tsx:33-58 ve MobileTopBar.tsx:52-78 simge düğmelerine aria-label; MobileDrawer.tsx:82-85,115 kapalıyken inert.
- MAĞAZA PAKETİ 1 (kalıcılık): .gitignore:17 src-tauri/gen/ klasörünün tamamını yok sayıyor; elle yapılan mobil ayarlar kayda girmiyor ve yeniden üretimde kayboluyor. Kalıcı yol: src-tauri/Info.ios.plist oluştur (NSMicrophoneUsageDescription, ITSAppUsesNonExemptEncryption=false, CFBundleURLTypes), tauri.conf.json:29-35 deep-link bölümüne mobil şemaları ekle; .gitignore'da yalnız elle düzenlenen dosyaları (AndroidManifest.xml, app/build.gradle.kts, apple/project.yml, apple/ExportOptions.plist, PrivacyInfo.xcprivacy) istisna yap, üretilen geri kalan yok sayılmaya devam etsin.
- MAĞAZA PAKETİ 2: AndroidManifest.xml:9 ve :26 LEANBACK/TV girdilerini sil (Play uygulamayı TV uygulaması sayıyor). application etiketine android:allowBackup="false" ekle (anahtarlar ve oturum bilgileri bulut yedeğine gitmesin). src-tauri/gen/apple/loomen_iOS/PrivacyInfo.xcprivacy ekle (izleme yok; dosya zaman damgası ve UserDefaults gerekçeleri). .env.example'a VITE_GOOGLE_IOS_CLIENT_ID ve VITE_GOOGLE_ANDROID_CLIENT_ID satırlarını DEĞERSİZ ekle (src/core/google.ts:20-23 okuyor).
- MAĞAZA PAKETİ 3 (güvenlik): capabilities/default.json:14,22 web görünümüne $APPDATA/** okuma veriyor; AI anahtarları $APPDATA/ai/keys.json'da (keys.rs:50-55) → '$APPDATA/ai/**' için deny kapsamı ekle. İzin dosyasını masaüstü ve mobil diye ikiye böl ('platforms' alanı); mobilde $HOME/** olmasın, yalnız $APPDATA. Masaüstü davranışı DEĞİŞMESİN. Rust'ta kalan çökme noktalarını hata döndürür yap: google.rs:28, github.rs:12, github_api.rs:18, ai/llm.rs:99 expect → map_err + ?.
- DOKUNMA, RAPORLA (insan işi / onay ister): Android Google giriş şeması yer tutucu (AndroidManifest.xml:36 — gerçek Android istemci kimliği + imza SHA-1 gerekir); Android imza dosyası ~/.loomen/keystore.properties; iOS ExportOptions.plist 'debugging' ve geliştirici ekibi (developmentTeam) ayarı; iOS'ta notların Dosyalar uygulamasında görünmesi (UIFileSharingEnabled — ürün kararı); tauri-plugin-fs 'watch' özelliği kapalı olduğu için masaüstünde otomatik yenileme çalışmıyor (açmak yeni bağımlılık indirir → onay ister); csp: null; AI anahtarlarının mobilde düz dosyada durması; iOS sürüm/yapı numarasının her yüklemede artırılması; mobil derleme betiği/CI yok.
- DOĞRULAMA: mevcut node testlerini depo deseniyle koş (src/core/__test__/vaultTest.ts, aiTest.ts, srsTest.ts — esbuild + node, dosya başlığındaki komut); mobil kasa yolu geçişi için saf bir yardımcı yazıp aynı desenle küçük bir test ekle. 'npx tsc --noEmit', 'npm run build', src-tauri içinde 'cargo check' temiz geçsin. Üç çeviri dosyasının anahtar kümeleri ve {{yer tutucu}}ları birebir aynı mı kontrol et. İzin (capabilities) dosyalarının şemaya uyduğunu cargo check ile doğrula. Android/iOS hedef derlemesi araçlar kuruluysa dene; kurulu değilse KURMA, raporla. Commit repo dilinde, AI imzası yok, push YOK.
- SONUÇ RAPORU (sade Türkçe): düzeltilenler, test çıktısı, dokunulmayanlar ve nedenleri; telefonda elle deneme listesi: notu uzun basıp yeniden adlandır/sil, çöp kutusunu çekmeceden aç, planlayıcıyı görev satırından kaydır ve uzun basıp sırala, tabloda sütun genişlet, Asistan'da ve görev ayrıntısında klavye açıkken yazma alanı görünüyor mu, çentik/alt çizgi boşlukları, Android geri tuşu (çekmece → ekran → çıkış), ses kaydı izni ve kayıt, ikinci kasa açıp uygulamayı kapat-aç, dili Arapça yapıp çekmece ve menüleri dene, tablet/yatay ekranda kasa ekleme ve GitHub depo seçimi.

## Dokunulan dosyalar

- `Loomen/index.html`
- `Loomen/src/App.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/components/Explorer.tsx`
- `Loomen/src/components/TrashModal.tsx`
- `Loomen/src/components/MobileBar.tsx`
- `Loomen/src/components/MobileTopBar.tsx`
- `Loomen/src/components/MobileDrawer.tsx`
- `Loomen/src/components/MiniAgenda.tsx`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/screens/Editor/EditorContextMenu.tsx`
- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/screens/Editor/VoiceRecorder.tsx`
- `Loomen/src/screens/Review/ReviewSession.tsx`
- `Loomen/src/screens/Settings/VaultManager.tsx`
- `Loomen/src/screens/Settings/GitHubSync.tsx`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/core/vault/index.ts`
- `Loomen/src/core/vault/mobileVaultPath.ts`
- `Loomen/src/core/__test__/mobileTest.ts`
- `Loomen/src/core/ai/llm.ts`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/.gitignore`
- `Loomen/.env.example`
- `Loomen/src-tauri/Info.ios.plist`
- `Loomen/src-tauri/tauri.conf.json`
- `Loomen/src-tauri/capabilities/default.json`
- `Loomen/src-tauri/capabilities/mobile.json`
- `Loomen/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- `Loomen/src-tauri/gen/apple/loomen_iOS/PrivacyInfo.xcprivacy`
- `Loomen/src-tauri/src/google.rs`
- `Loomen/src-tauri/src/github.rs`
- `Loomen/src-tauri/src/github_api.rs`
- `Loomen/src-tauri/src/ai/llm.rs`

## Test

Testler geçti.

> Calisma kopyasinda (fix/LOM-3 icerigi) butun dogrulamalar temiz gecti. npm test: 3 test dosyasi (coreTest, vaultTest, mobileTest), mobileTest'teki 35 kontrolun tumu dahil hepsi gecti. npx tsc --noEmit ciktisiz, cikis kodu 0. npm run build 11.58 s'de basarili (yalnizca bilinen 500 kB ustu parca boyutu uyarisi, hata degil). src-tauri icinde cargo check --all-targets 59.70 s'de uyarisiz bitti. Uc cev

## Kanıt

- Dal: `fix/LOM-3`
- Commit: `Loomen@571e9a955b93e738b8a7120b96c166f20a51782b`
- Test koşusu: `1bf93006-8bb5-4da9-9ade-797fdbc57539` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

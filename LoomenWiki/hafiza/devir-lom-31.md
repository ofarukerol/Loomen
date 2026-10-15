---
name: LOM-31 — Loomen masaüstü: uygulama içi otomatik güncelleme (Datha Desktop gibi) + Air'e kurulum
description: Testler kaldı: Loomen masaüstüne özellik bayrağıyla açılıp kapanan uygulama içi güncelleme (tauri-plugin-updater, Rust tarafında komutlar + React şeridi) eklenir; imza anahtarı üretilip pubkey ayara girer, release.yml macOS arm64/x86_64 + Windows imzalı paket ve latest.json üretir, Air'e ilk .app kurulumu yapılır.
type: project
proje: loomen
kaynak: kart LOM-31 · dal fix/LOM-31 · commit yok · test koşusu e76655c0-a618-4ee2-a42b-58b0c21379d9 (Air)
guven: iddia
durum: gelistirildi
---

# LOM-31 — Loomen masaüstü: uygulama içi otomatik güncelleme (Datha Desktop gibi) + Air'e kurulum

## Ne yapıldı

Loomen masaüstüne özellik bayrağıyla açılıp kapanan uygulama içi güncelleme (tauri-plugin-updater, Rust tarafında komutlar + React şeridi) eklenir; imza anahtarı üretilip pubkey ayara girer, release.yml macOS arm64/x86_64 + Windows imzalı paket ve latest.json üretir, Air'e ilk .app kurulumu yapılır.

## Adımlar

- Cargo.toml: [features] default=["updater"], updater=["dep:tauri-plugin-updater"]; masaüstü target bloğuna tauri-plugin-updater = { version="2", optional=true } ekle (bağımlılık ekleme onay ister, brifingteki izinle yap). Cargo.lock güncellenir.
- İmza anahtar çifti: mkdir -p ~/.loomen-keys; npm run tauri signer generate -- -w ~/.loomen-keys/loomen.key (parolasız). Pubkey'i tauri.conf.json plugins.updater.pubkey'e yaz; özel anahtar depoya girmez, .gitignore'a *.key ekle.
- tauri.conf.json: plugins.updater { endpoints: ["https://github.com/<sahip>/Loomen/releases/latest/download/latest.json"], pubkey, windows.installMode: "passive" }; bundle.createUpdaterArtifacts: true. Sahip adını git remote get-url origin ile bul.
- tauri.mas.conf.json: bundle.createUpdaterArtifacts: false ekle (MAS derlemesi imzasız artefakt üretmez, özel anahtar istemez).
- src-tauri/src/updater.rs (yeni, #[cfg(desktop)]): komutlar app_update_supported() -> bool (cfg!(feature="updater")), update_check() -> Option<{version, notes, date}> ve update_install(). feature açıkken app.updater_builder() kullan; LOOMEN_UPDATE_URL ortam değişkeni varsa .endpoints() ile onu kullan (sahte latest.json testi için; pubkey doğrulaması yine zorunlu). İndirme ilerlemesini 'update://progress' olayıyla yayınla, bitince app.restart(). feature kapalıyken komutlar Err('Bu sürümde güncelleme yok') döner.
- lib.rs: mod updater; #[cfg(all(desktop, feature="updater"))] builder.plugin(tauri_plugin_updater::Builder::new().build()); masaüstü invoke_handler listesine üç komutu ekle. Capability dosyalarına updater izni EKLEME (Rust tarafı kullanıldığı için gerekmez; eklenirse MAS derlemesi kırılır).
- src/core/updater.ts (yeni): invoke sarmalayıcıları + compareVersions(a,b) saf fonksiyonu + durum tipi (idle/checking/available/downloading/error). Mobilde ve app_update_supported false iken hiç çağrılmaz.
- src/components/UpdateBanner.tsx (yeni): üstte tek şerit: 'Yeni sürüm X hazır' + Güncelle + Sonra; indirme yüzdesi; hata metni sade Türkçe. App.tsx'te masaüstü düzeninin tepesine koy; açılıştan ~5 sn sonra bir kez update_check çağır.
- SettingsScreen.tsx: 'Güncelleme' bölümü (yalnız app_update_supported true iken): mevcut sürüm, 'Güncellemeleri denetle' düğmesi, sonuç metni.
- compareVersions ve şerit durum geçişleri için mevcut test düzenine (scripts/run-tests.mjs'in taradığı yer) uygun test dosyası yaz.
- release.yml'i yeniden yaz: matrix macos-latest (--target aarch64-apple-darwin), macos-latest (--target x86_64-apple-darwin), windows-latest; tauri-apps/tauri-action@v0 ile tagName: ${{ github.ref_name }}, releaseDraft: true, includeUpdaterJson: true; env TAURI_SIGNING_PRIVATE_KEY ve TAURI_SIGNING_PRIVATE_KEY_PASSWORD (boş) secrets'tan; mevcut VITE_* env'leri koru; Apple secret'ları (APPLE_CERTIFICATE, APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID) varsa geçir.
- GitHub secret'ı gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.loomen-keys/loomen.key ile ekle (gh yetkisi yoksa Ömer'e not düş).
- docs/yayinlama.md: 'Uygulama içi güncelleme' bölümü: anahtar/yedek, secret, createUpdaterArtifacts nedeniyle yerel derlemede env gerekliliği, MAS derlemesinde --no-default-features --config src-tauri/tauri.mas.conf.json, sahte latest.json ile yerel deneme, Release'i yayınlama şartı.
- Doğrulama: npm test, npm run typecheck, cargo check, cargo check --no-default-features. Sahte test: --config '{"version":"0.1.1"}' ile app paketini imzalı derle, geçici klasörde latest.json (version, pub_date, platforms.darwin-aarch64 {signature, url}) yaz, python3 -m http.server ile sun, 0.1.0 uygulamayı LOOMEN_UPDATE_URL ile aç ve şeridin çıkıp kurduğunu doğrula.
- Air'e kurulum: TAURI_SIGNING_PRIVATE_KEY ile npm run tauri build -- --bundles app,dmg; /Applications/Loomen.app varsa ~/Desktop/Loomen-eski.app diye yedekle, sonra ditto ile yeni .app'i /Applications'a kopyala ve açılışını kontrol et.
- Commit (AI imzası yok), fix/LOM-31 dalına push; ilk gerçek uçtan uca kontrol (eski sürüm kurulu, v0.1.1 etiketi, yayınlanan Release, uygulama içinden güncelleme) Ömer'in canlı testi.

## Dokunulan dosyalar

- `Loomen/src-tauri/Cargo.toml`
- `Loomen/src-tauri/Cargo.lock`
- `Loomen/src-tauri/tauri.conf.json`
- `Loomen/src-tauri/tauri.mas.conf.json`
- `Loomen/src-tauri/src/lib.rs`
- `Loomen/src-tauri/src/updater.rs`
- `Loomen/src/core/updater.ts`
- `Loomen/src/components/UpdateBanner.tsx`
- `Loomen/src/App.tsx`
- `Loomen/src/screens/Settings/SettingsScreen.tsx`
- `Loomen/.github/workflows/release.yml`
- `Loomen/docs/yayinlama.md`
- `Loomen/.gitignore`

## Test

Testler KALDI; iş doğrulanmadı.

> İş yarıda durduruldu; testler koşmadı.

## Kanıt

- Dal: `fix/LOM-31`
- Test koşusu: `e76655c0-a618-4ee2-a42b-58b0c21379d9` (Air)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.

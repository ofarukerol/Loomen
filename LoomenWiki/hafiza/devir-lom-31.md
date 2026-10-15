---
name: LOM-31 — Loomen masaüstü: uygulama içi otomatik güncelleme (Datha Desktop gibi) + Air'e kurulum
description: LOM-31'in dalda zaten yazılmış güncelleme kodunu (updater eklentisi, Rust komutları, şerit, release.yml, anahtar) derleyip test ederek doğrulamak; eksik kalan sürüm karşılaştırma testini, MAS derleme betiğindeki updater kapatmayı, GitHub secret'ını ve Air kurulumunu tamamlamak.
type: project
proje: loomen
kaynak: kart LOM-31 · dal fix/LOM-31 · Loomen@705f19a3c5810e5ad49c158119c530753d0b62dd · test koşusu 5ab4e251-f754-448a-ac57-8f9f21e5f08f (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-15
---

# LOM-31 — Loomen masaüstü: uygulama içi otomatik güncelleme (Datha Desktop gibi) + Air'e kurulum

## Ne yapıldı

LOM-31'in dalda zaten yazılmış güncelleme kodunu (updater eklentisi, Rust komutları, şerit, release.yml, anahtar) derleyip test ederek doğrulamak; eksik kalan sürüm karşılaştırma testini, MAS derleme betiğindeki updater kapatmayı, GitHub secret'ını ve Air kurulumunu tamamlamak.

## Adımlar

- Dalda 722b108 commit'inin dosyalarını aç ve içeriği brifingle karşılaştır: Cargo.toml'da updater özelliği ve tauri-plugin-updater, tauri.conf.json'da plugins.updater (endpoints, pubkey, windows.installMode) ve bundle.createUpdaterArtifacts, tauri.mas.conf.json'da createUpdaterArtifacts false, lib.rs'de cfg(all(desktop, feature="updater")) ile eklenti ve üç komut, .gitignore'da *.key.
- npm run typecheck, npm test, cargo check ve cargo check --no-default-features koş; kırmızı varsa önce onu düzelt.
- scripts/mas-build.sh'daki tauri build çağrısına --no-default-features ekle ki App Store paketinde updater derlenmesin; betiğin yorumuna tek satır neden yaz.
- src/core/__test__/updaterTest.ts yaz: compareVersions için eşit, büyük, küçük, farklı uzunluk ve ön ek 'v' durumları; scripts/run-tests.mjs suites listesine ekle; npm test ile koşturup geçtiğini göster.
- docs/yayinlama.md §6 kontrol listesindeki 'updater şu an kurulu değil' satırını güncelle ve 'Uygulama içi güncelleme' bölümünün anahtar yedeği, secret, MAS'ta --no-default-features ve sahte latest.json denemesini anlattığını doğrula; eksikse tamamla.
- gh secret list ile TAURI_SIGNING_PRIVATE_KEY var mı bak; yoksa ~/.loomen-keys/loomen.key'den gh secret set ile ekle (TAURI_SIGNING_PRIVATE_KEY_PASSWORD boş). gh yetkisi yoksa karta yorum düş.
- Sahte güncelleme denemesi: TAURI_SIGNING_PRIVATE_KEY ile --config '{"version":"0.1.1"}' app paketi derle, geçici klasörde latest.json (version, pub_date, platforms.darwin-aarch64 signature+url) yaz, python3 -m http.server ile sun, 0.1.0 uygulamayı LOOMEN_UPDATE_URL ile aç; şeridin çıktığını ve indirmenin bittiğini doğrula, sonucu karta kanıt olarak yaz.
- Air kurulumu: /Applications/Loomen.app varsa sürümünü oku; updater'lı 0.1.0 değilse önce ~/Desktop/Loomen-eski.app diye yedekle, TAURI_SIGNING_PRIVATE_KEY ile npm run tauri build -- --bundles app,dmg derle, ditto ile /Applications'a kopyala ve açılışını kontrol et.
- git grep ile özel anahtarın depoda olmadığını doğrula; AI imzasız commit at, fix/LOM-31'e push et; karta test kanıtı ve Ömer'in yapacağı gerçek yayın adımını (v0.1.1 etiketi, taslak Release'i yayınlama, Air'de güncelleme) yorum olarak yaz.

## Dokunulan dosyalar

- `Loomen/scripts/mas-build.sh`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/core/__test__/updaterTest.ts`
- `Loomen/docs/yayinlama.md`

## Test

Testler geçti.

> Tip denetimi, npm test ve iki cargo check yeşil. Sürüm karşılaştırma testi npm test içinde koşuyor. Özel anahtar depoda yok. Sahte latest.json ile güncelleme denemesi ve Air kurulumu önceki adımlarda Air'de yapılmıştı. Bu Windows makinesinde yeniden koşmadım, çünkü imza anahtarı burada yok. Air'de gözle son bakış kaldı.

## Kanıt

- Dal: `fix/LOM-31`
- Commit: `Loomen@705f19a3c5810e5ad49c158119c530753d0b62dd`
- Test koşusu: `5ab4e251-f754-448a-ac57-8f9f21e5f08f` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

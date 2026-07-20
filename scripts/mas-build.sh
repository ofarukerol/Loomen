#!/usr/bin/env bash
# Loomen — Mac App Store paketi üretir (.pkg) ve App Store Connect'e yükler.
#
# Ön koşullar (bir kez, Apple Developer portalından):
#   1) App ID: org.loomen.notes  (Certificates, Identifiers & Profiles → Identifiers)
#   2) Provisioning profile: "Mac App Store Connect" türü, bu App ID için
#      → indir, src-tauri/Loomen_MAS.provisionprofile olarak kaydet
#   3) Sertifikalar (Anahtar Zinciri'nde kurulu olmalı):
#      - 3rd Party Mac Developer Application  (uygulamayı imzalar)  ✅ mevcut
#      - 3rd Party Mac Developer Installer    (.pkg'yi imzalar)     ← oluşturulmalı
#   4) App Store Connect API anahtarı (Users and Access → Integrations):
#      export APPLE_API_KEY_ID=...  APPLE_API_ISSUER=...  APPLE_API_KEY_PATH=...
set -euo pipefail
cd "$(dirname "$0")/.."

TEAM="X82U3597A7"
APP_CERT="3rd Party Mac Developer Application: DATHA YAZILIM VE TEKNOLOJI GELISTIRME TICARET LIMITED SIRKETI ($TEAM)"
PKG_CERT="3rd Party Mac Developer Installer: DATHA YAZILIM VE TEKNOLOJI GELISTIRME TICARET LIMITED SIRKETI ($TEAM)"

if [ ! -f src-tauri/Loomen_MAS.provisionprofile ]; then
  echo "HATA: src-tauri/Loomen_MAS.provisionprofile yok. Apple portalından indirin." >&2
  exit 1
fi
if ! security find-identity -v -p codesigning | grep -q "3rd Party Mac Developer Installer"; then
  echo "HATA: 'Mac Installer Distribution' sertifikası kurulu değil (.pkg imzalanamaz)." >&2
  exit 1
fi

echo "==> Universal (Intel + Apple Silicon) derleniyor…"
rustup target add x86_64-apple-darwin aarch64-apple-darwin >/dev/null 2>&1 || true
APPLE_SIGNING_IDENTITY="$APP_CERT" \
  npm run tauri build -- --bundles app --target universal-apple-darwin \
    --config src-tauri/tauri.mas.conf.json

APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/Loomen.app"
echo "==> Entitlements doğrulanıyor…"
codesign -d --entitlements :- "$APP" | plutil -p - | grep -E "sandbox|application-identifier"

echo "==> .pkg üretiliyor…"
xcrun productbuild --sign "$PKG_CERT" --component "$APP" /Applications Loomen.pkg

echo "==> App Store Connect'e yükleniyor…"
xcrun notarytool submit Loomen.pkg \
  --key "${APPLE_API_KEY_PATH:?APPLE_API_KEY_PATH gerekli}" \
  --key-id "${APPLE_API_KEY_ID:?}" --issuer "${APPLE_API_ISSUER:?}" --wait || \
  xcrun altool --upload-app --type macos --file Loomen.pkg \
    --apiKey "${APPLE_API_KEY_ID}" --apiIssuer "${APPLE_API_ISSUER}"

echo "==> Bitti. App Store Connect → Loomen → sürümü doldurup incelemeye gönderin."

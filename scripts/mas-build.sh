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
# Sertifika kontrolü. DİKKAT: Installer sertifikası bir *kod imzalama* kimliği değildir,
# bu yüzden `-p codesigning` ile ARANMAZ (orada hiç görünmez ve kontrol hep başarısız olur).
# Tüm kimlikler için filtresiz `security find-identity -v` kullanılır.
IDENTITIES="$(security find-identity -v)"
if ! grep -qF "$APP_CERT" <<<"$IDENTITIES"; then
  echo "HATA: 'Apple Distribution / 3rd Party Mac Developer Application' sertifikası kurulu değil:" >&2
  echo "      $APP_CERT" >&2
  exit 1
fi
if ! grep -qF "$PKG_CERT" <<<"$IDENTITIES"; then
  echo "HATA: 'Mac Installer Distribution (3rd Party Mac Developer Installer)' sertifikası kurulu değil" >&2
  echo "      (.pkg imzalanamaz): $PKG_CERT" >&2
  exit 1
fi

echo "==> Universal (Intel + Apple Silicon) derleniyor…"
rustup target add x86_64-apple-darwin aarch64-apple-darwin >/dev/null 2>&1 || true
APPLE_SIGNING_IDENTITY="$APP_CERT" \
  npm run tauri build -- --bundles app --target universal-apple-darwin \
    --config src-tauri/tauri.mas.conf.json

APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/Loomen.app"
echo "==> Entitlements doğrulanıyor…"
# pipefail açık: grep eşleşme bulamazsa (sandbox/app-id gömülmemişse) betik burada durur —
# imzasız/eksik entitlement'lı bir paketi yüklemeye çalışmaktansa erken hata vermek daha iyi.
if ! codesign -d --entitlements :- "$APP" 2>/dev/null | plutil -p - | grep -E "sandbox|application-identifier"; then
  echo "HATA: app-sandbox / application-identifier entitlement'ı pakette yok — imzalama başarısız." >&2
  exit 1
fi

echo "==> .pkg üretiliyor…"
xcrun productbuild --sign "$PKG_CERT" --component "$APP" /Applications Loomen.pkg

# App Store'a yükleme notarizasyon DEĞİLDİR: notarytool paketi Developer ID dağıtımı için
# damgalar, App Store Connect'e hiçbir şey göndermez. Mağaza yüklemesi altool ile yapılır.
# altool, .p8 anahtarını --apiKey'e verilen kimlikten türeterek şu klasörlerde arar; bu yüzden
# APPLE_API_KEY_PATH'i oraya kopyalamak yerine varlığını doğrulayıp kullanıcıyı yönlendiriyoruz.
: "${APPLE_API_KEY_ID:?APPLE_API_KEY_ID gerekli (App Store Connect API anahtar kimliği)}"
: "${APPLE_API_ISSUER:?APPLE_API_ISSUER gerekli (App Store Connect issuer id)}"

KEY_FILE="AuthKey_${APPLE_API_KEY_ID}.p8"
# `ls A B C D` operandlardan HERHANGİ biri yoksa sıfırdan farklı döner, hepsi
# yoksa değil. Anahtar gerçek hayattaki gibi dört klasörden yalnız BİRİNDE
# durduğunda betik "bulunamadı" deyip çıkıyordu; mağazaya gönderme yolu fiilen
# kapalıydı. Doğru soru "herhangi birinde var mı".
if [ ! -f "./private_keys/$KEY_FILE" ] \
   && [ ! -f "$HOME/private_keys/$KEY_FILE" ] \
   && [ ! -f "$HOME/.private_keys/$KEY_FILE" ] \
   && [ ! -f "$HOME/.appstoreconnect/private_keys/$KEY_FILE" ]; then
  echo "HATA: $KEY_FILE bulunamadı. altool anahtarı yalnız şu klasörlerde arar:" >&2
  echo "      ./private_keys, ~/private_keys, ~/.private_keys, ~/.appstoreconnect/private_keys" >&2
  echo "      Çözüm: mkdir -p ~/.appstoreconnect/private_keys && cp \"\$APPLE_API_KEY_PATH\" ~/.appstoreconnect/private_keys/$KEY_FILE" >&2
  exit 1
fi

echo "==> Paket doğrulanıyor…"
xcrun altool --validate-app --type macos --file Loomen.pkg \
  --apiKey "$APPLE_API_KEY_ID" --apiIssuer "$APPLE_API_ISSUER"

echo "==> App Store Connect'e yükleniyor…"
xcrun altool --upload-app --type macos --file Loomen.pkg \
  --apiKey "$APPLE_API_KEY_ID" --apiIssuer "$APPLE_API_ISSUER"

echo "==> Bitti. App Store Connect → Loomen → sürümü doldurup incelemeye gönderin."

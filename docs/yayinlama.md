# Loomen — Yayınlama Rehberi (macOS + Windows)

Bu belge Loomen'i son kullanıcıya ulaştırmanın adımlarını anlatır. İki platform için de
**iki yol** vardır: mağaza dışı (imzalı kurulum dosyası) ve mağaza içi. Her adımın neden
gerektiği de yazılıdır.

> **Durum:** Sürüm `0.1.0`, henüz yayınlanmadı. Aşağıdaki "Yayın öncesi kararlar" bölümü
> **ilk yayından önce** halledilmelidir; sonradan değiştirmek zor veya kullanıcı verisini bozar.

---

## 0. Yayın öncesi kararlar (önce bunlar)

### 0.1 Uygulama kimliği (`identifier`) — ✅ yapıldı

`org.loomen.app` → **`org.loomen.notes`** olarak değiştirildi.

**Neden gerekiyordu:** `.app` ile biten kimlik macOS'ta uygulama paketi uzantısıyla çakışıyor
(Tauri her derlemede uyarıyordu). Kimlik; uygulama veri klasörünü, TCC izinlerini (mikrofon),
kod imzasını ve mağaza kaydını belirler ve **yayından sonra değiştirilemez** — App Store'da
kimlik kalıcıdır, değiştirmek "yeni uygulama" demektir. Bu yüzden ilk yayından önce halledildi.

**Neden `.desktop` değil:** Aynı kimlik iOS bundle ID ve Android paket adı olarak da kullanılıyor.

**Yan etki:** Uygulama veri klasörü değişti → yerel ayarlar (tema, kasa listesi, Pomodoro
geçmişi) bir kez sıfırlanır ve mikrofon izni yeniden sorulur. **Notlar etkilenmez** (kasa
klasöründe düz `.md` dosyaları). Mobil projeler (`src-tauri/gen/`) yeniden üretilmelidir:
`npm run tauri ios init` / `android init`. Google OAuth mobil istemcileri kayıtlıysa
bundle ID / package adı yeni kimliğe göre güncellenmelidir.

### 0.2 Sürüm numarası

`tauri.conf.json` → `version` ve `package.json` → `version` **aynı** olmalı. Her mağaza
gönderiminde artırılır (mağazalar aynı sürümü iki kez kabul etmez).

### 0.3 Apple Developer / Microsoft hesabı

| | Ücret | Süre |
|---|---|---|
| Apple Developer Program | 99 USD/yıl | Onay 24–48 saat |
| Microsoft Partner Center (bireysel) | ~19 USD tek seferlik | Onay 1–5 gün |

Hesap onayı beklediği için **en başta** açılmalı.

---

## 1. macOS — Yol A: Mağaza dışı dağıtım (önerilen)

Kendi sitenden `.dmg` dağıtırsın. Loomen için **önerilen yol budur** (sebebi §2'de).

### 1.1 Sertifika

1. [developer.apple.com](https://developer.apple.com) → Certificates → **+**
2. Tür: **Developer ID Application** (App Store dışı dağıtım içindir; hesap sahibi rolü gerekir)
3. İndir, çift tıkla → Anahtar Zinciri'ne kurulur
4. Doğrula:
   ```bash
   security find-identity -v -p codesigning
   ```
   Çıktıda `Developer ID Application: Ömer Faruk Erol (TEAMID)` görünmeli.

### 1.2 Notarization kimlik bilgileri

Apple, Developer ID ile imzalanan her uygulamayı **notarize** etmeni zorunlu tutar
(yoksa kullanıcıda "geliştirici doğrulanamıyor" hatası çıkar).

1. [appleid.apple.com](https://appleid.apple.com) → Oturum açma ve güvenlik →
   **Uygulamaya özel parola** oluştur
2. Team ID'yi developer.apple.com → Membership'ten al

### 1.3 Derle + imzala + notarize

Tauri bunların hepsini tek komutta yapar — ortam değişkenlerini vermen yeterli:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Ömer Faruk Erol (TEAMID)"
export APPLE_ID="farukerol.tr@gmail.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # uygulamaya özel parola
export APPLE_TEAM_ID="TEAMID"

npm run tauri build -- --bundles dmg
```

Çıktı: `src-tauri/target/release/bundle/dmg/Loomen_0.1.0_aarch64.dmg`

> **Intel + Apple Silicon tek dosyada** istersen evrensel derleme:
> ```bash
> rustup target add x86_64-apple-darwin aarch64-apple-darwin
> npm run tauri build -- --target universal-apple-darwin --bundles dmg
> ```

### 1.4 Doğrulama

```bash
# İmza geçerli mi
codesign --verify --deep --strict --verbose=2 "…/Loomen.app"
# Notarization yapışmış mı (Gatekeeper testi)
spctl -a -vvv -t install "…/Loomen.app"
```
`accepted` + `source=Notarized Developer ID` görmelisin.

---

## 2. macOS — Yol B: Mac App Store (sandbox)

### 2.1 Sandbox nedir, sade anlatım

Mac App Store'daki her uygulama **kum havuzunda (sandbox)** çalışmak zorundadır. Basitçe:

> Uygulama, kullanıcının diskine serbestçe uzanamaz. Yalnızca **kendi klasörüne** ve
> **kullanıcının bir dosya seçiciyle bizzat gösterdiği** yerlere erişebilir.

Loomen bugün bunun tersini yapıyor: kullanıcı bir kasa klasörü seçiyor ve uygulama o klasörü
sonsuza kadar okuyup yazıyor (`capabilities/default.json` → `$HOME/**`). Sandbox'ta bu geçersiz.

İki ayrı sorun var, karıştırmamak önemli:

| | Sorun | Çözümü |
|---|---|---|
| **A** | Uygulama açıkken seçilen klasöre erişim | **Zaten çözülü.** Tauri'nin dosya seçicisi macOS'un yerel panelidir; kullanıcı bir klasör seçtiğinde sandbox o oturum için erişimi kendiliğinden verir. |
| **B** | Uygulama **kapanıp yeniden açılınca** aynı klasöre erişim | Çözülmesi gereken tek şey. macOS bunu "**security-scoped bookmark**" ile yapar: seçilen klasör için bir anahtar üretip saklarsın, açılışta o anahtarla erişimi geri alırsın. |

Yani iş, sanıldığı kadar büyük değil: **tek eksik, klasör iznini kalıcı kılmak.**

> Tauri'de bu hazır gelmiyor ([tauri#3716](https://github.com/tauri-apps/tauri/issues/3716) açık),
> küçük bir Rust modülü yazmak gerekiyor.

### 2.2 Üç seviyenin tamamı uygulandı ✅

**Seviye 1 — İzin gerektirmeyen kasa.** Sandbox'ta Ayarlar → Kasa'da "Uygulama depolamasında
kasa oluştur" seçeneği çıkar; kasa uygulamanın kendi konteynerine yazılır, hiçbir izin gerekmez.
Bu seçenek yalnızca sandbox'ta görünür (`app_is_sandboxed` ile tespit edilir).

**Seviye 2 — Klasör seçimi + kalıcı erişim.** Kullanıcı istediği klasörü seçmeye devam eder.
Seçim anında bir security-scoped bookmark üretilip kasa kaydına yazılır; uygulama açılışında
bu bookmark çözülerek erişim geri alınır. Klasör taşınırsa bookmark "stale" döner ve
kendiliğinden yenilenir.

**Seviye 3 — Çoklu kasa.** Her kasa kendi bookmark'ını taşır (`VaultEntry.bookmark`).
Kasa değiştirilirken öncekinin erişimi bırakılır, yenisininki açılır.

#### Kaynak sızıntısına karşı

`startAccessingSecurityScopedResource` çağrılıp `stop...` çağrılmazsa çekirdek kaynağı sızar ve
uygulama sandbox dışına erişimini tamamen kaybeder. Bu yüzden:
- açılan her erişim `ACTIVE` kaydında tutulur, aynı yol iki kez açılmaz,
- kasa değişiminde önceki bırakılır,
- pencere kapanışında hepsi bırakılır (`release_all`).

#### İlgili dosyalar

| Dosya | Görevi |
|---|---|
| `src-tauri/src/macos_bookmark.rs` | NSURL bookmark üret/çöz/bırak (objc2) |
| `src-tauri/Entitlements.plist` | Sandbox + dosya + bookmark + mikrofon + ağ izinleri |
| `src-tauri/tauri.mas.conf.json` | Yalnız App Store derlemesinde birleştirilen yapılandırma |
| `src/core/bookmark.ts` | Frontend köprüsü |
| `src/store/useAppStore.ts` | Kasa yaşam döngüsüne bağlama |

#### Önemli: sandbox varsayılan derlemede KAPALI

Entitlements dosyası varsayılan yapılandırmaya **bağlanmadı**. Sebebi: sandbox'ı açmak,
mağaza dışı (Developer ID) sürümde de `$HOME` erişimini kısıtlar ve mevcut kullanıcıların
kasalarını bozardı. App Store derlemesi ayrı yapılandırmayla alınır:

```bash
# Normal (Developer ID) derleme — sandbox yok
npm run tauri build -- --bundles dmg

# App Store derlemesi — sandbox + entitlements
npm run tauri build -- --bundles app --config src-tauri/tauri.mas.conf.json
```

> Entitlements yalnızca gerçek bir sertifikayla imzalanırken gömülür; sertifikasız derlemede
> Tauri codesign adımını atlar (`linker-signed`). Doğrulamak için:
> ```bash
> codesign -d --entitlements :- "…/Loomen.app" | plutil -p -
> ```

### 2.3 Dürüst tavsiye

Kod artık hazır olsa da **önce App Store'suz yayınlamak** hâlâ mantıklı: Developer ID +
notarization bugün ek iş gerektirmiyor, App Store ise hesap onayı, ekran görüntüleri ve
inceleme süreci demek. Sandbox tarafı artık engel değil — hazır olduğunda gönderebilirsin.

### 2.4 App Store'a gidilecekse teknik adımlar

1. Sertifika: **Apple Distribution** (Developer ID değil)
2. Xcode → provisioning profile oluştur
3. `src-tauri/Entitlements.plist`:
   ```xml
   <key>com.apple.security.app-sandbox</key><true/>
   <key>com.apple.security.files.user-selected.read-write</key><true/>
   <key>com.apple.security.files.bookmarks.app-scope</key><true/>
   <key>com.apple.security.device.audio-input</key><true/>   <!-- ses notu -->
   <key>com.apple.security.network.client</key><true/>       <!-- GitHub/Google senkron -->
   ```
   `tauri.conf.json` → `bundle.macOS.entitlements` ile bağla.
4. Seviye 2'yi (bookmark) uygula.
5. `.pkg` üret, **Transporter** ile App Store Connect'e yükle.

---

## 3. Windows — Yol A: İmzalı kurulum dosyası (önerilen başlangıç)

### 3.1 Sertifika seçenekleri

| Seçenek | Maliyet | Not |
|---|---|---|
| **Azure Artifact Signing** | ~10 USD/ay | En ucuz ve modern yol; donanım anahtarı gerekmez |
| EV sertifika (DigiCert, Sectigo…) | 300–600 USD/yıl | Donanım token'ı ile gelir; SmartScreen itibarı anında |
| OV sertifika | 200–400 USD/yıl | 1 Haziran 2023 sonrası artık donanım gerektiriyor |

> **İmzalamazsan ne olur:** Windows SmartScreen "Bilinmeyen yayımcı" uyarısı verir ve kullanıcı
> "Yine de çalıştır" demek zorunda kalır. Ciddi bir kayıp — imzalamak şiddetle önerilir.

### 3.2 Azure Artifact Signing ile (önerilen)

```jsonc
// src-tauri/tauri.conf.json
"bundle": {
  "windows": {
    "signCommand": "artifact-signing-cli -e https://eus.codesigning.azure.net -a HESAP -c PROFIL -d Loomen %1"
  }
}
```
Ön koşul: .NET 8, Azure CLI, `artifact-signing-cli`; ortam değişkenleri `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`.

### 3.3 Klasik sertifika ile

```jsonc
"bundle": {
  "windows": {
    "certificateThumbprint": "A1B2C3…",       // certmgr.msc → sertifika → Ayrıntılar → Parmak izi
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

### 3.4 Derle

**Windows makinede** (çapraz derleme desteklenmez):

```powershell
npm install
npm run tauri build -- --bundles nsis,msi
```

Çıktı: `src-tauri/target/release/bundle/nsis/Loomen_0.1.0_x64-setup.exe`

> Windows makinen yoksa: GitHub Actions'ta `windows-latest` runner ile derle (§5).

---

## 4. Windows — Yol B: Microsoft Store

Microsoft Store artık **Win32 kurulum dosyalarını** (EXE/MSI) doğrudan kabul ediyor —
MSIX'e paketlemek **zorunlu değil**. Bu, Tauri için en kolay yoldur.

1. [partner.microsoft.com](https://partner.microsoft.com) → Windows & Xbox → hesap aç
2. **Yeni uygulama** → ad rezerve et ("Loomen")
3. Ürün kurulumu:
   - Paket türü: **EXE veya MSI** (App type: *Not packaged / MSI or EXE*)
   - `Loomen_0.1.0_x64-setup.exe` dosyasını yükle (imzalı olmalı)
   - Sessiz kurulum parametresi: `/S` (NSIS), kaldırma parametresi: `/S`
4. Mağaza kaydı: açıklama, en az 1 ekran görüntüsü (1366×768 veya üstü), yaş sınırı anketi,
   gizlilik politikası **URL'si** (zorunlu — Loomen veri toplamıyor olsa bile bir sayfa gerekir)
5. Gönder → inceleme genelde 1–3 iş günü

> **Gizlilik politikası:** Loomen tamamen yerel çalışıyor; "hiçbir veri toplanmaz, notlar
> cihazda kalır; GitHub/Google entegrasyonları yalnızca kullanıcı bağlarsa devreye girer"
> diyen kısa bir sayfa yeterli. loomen.org altında yayınlanabilir.

---

## 5. CI ile otomatik derleme (isteğe bağlı ama önerilir)

Her iki platformu tek akışta üretmek için GitHub Actions:

```yaml
name: Release
on:
  push:
    tags: ["v*"]
jobs:
  build:
    strategy:
      matrix:
        include:
          - platform: macos-latest
            args: --target universal-apple-darwin --bundles dmg
          - platform: windows-latest
            args: --bundles nsis
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        with:
          tagName: ${{ github.ref_name }}
          releaseDraft: true
          args: ${{ matrix.args }}
```

Sertifikayı secret'a koymak için:
```bash
openssl base64 -A -in sertifika.p12 -out sertifika-base64.txt
```

---

## 6. Yayın öncesi kontrol listesi

- [ ] `identifier` `.app` ile bitmiyor (§0.1)
- [ ] `version` üç yerde de aynı (`tauri.conf.json`, `package.json`, git etiketi)
- [ ] Gizlilik politikası sayfası yayında (her iki mağaza da zorunlu tutuyor)
- [ ] `.env` **repoda değil** (kontrol edildi: gitignore'da ✅)
- [ ] macOS: `spctl -a -vvv` → `accepted / Notarized Developer ID`
- [ ] Windows: kurulum dosyası imzalı, SmartScreen uyarısı yok
- [ ] Temiz bir makinede/VM'de kurulum testi (ilk açılış, kasa seçimi, mikrofon izni)
- [ ] Uygulama içi güncelleme istiyorsan Tauri updater'ı ayrıca kur (şu an kurulu değil)

---

## 7. Bilinen teknik notlar

- **Sesli yazma (macOS dikte)** yalnızca paketlenmiş `.app`'te çalışır; `tauri dev`'in çıplak
  binary'sinde macOS dikte servisi sunulmaz. Bu bir hata değildir.
- **`lodash-es` güvenlik uyarısı** Excalidraw'ın alt bağımlılığından gelir
  (`mermaid-to-excalidraw → langium → chevrotain`). Üst akış güncellenene kadar giderilemiyor;
  yalnızca kullanıcının kendi çizim verisi işlendiği için risk düşüktür.
- **Google OAuth client secret** frontend paketine gömülür. Masaüstü OAuth istemcilerinde
  Google bunu gizli kabul etmez ve akış PKCE ile korunur — beklenen davranıştır.
- **CSP** şu an tanımsız (`security.csp: null`). Mağaza için zorunlu değil ama sertleştirme
  olarak eklenmesi önerilir; eklerken Excalidraw, ses oynatma (blob:) ve senkron uç noktaları
  (GitHub/Google) izin listesine alınmalıdır.

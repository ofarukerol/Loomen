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

## 3. Windows — önce şunu bil: imzalama maliyeti seçtiğin pakete bağlı

Bu, Windows tarafındaki en önemli karar ve çoğu rehberde atlanıyor:

| Paket türü | Store'a gönderirsen | Sertifika maliyeti |
|---|---|---|
| **MSIX** | **Microsoft kendi sertifikasıyla yeniden imzalar** | **0 TL** |
| EXE / MSI | Store yeniden imzalamaz, kendin imzalarsın | ~10 USD/ay veya 300+ USD/yıl |

Yani **yalnızca Microsoft Store'da yayınlayacaksan MSIX ile sertifikaya hiç para vermezsin.**
Buna karşılık kendi sitenden de dağıtacaksan (ki SmartScreen uyarısı çıkmasın istiyorsan)
imzalı bir EXE gerekir ve sertifika almak zorundasın.

> Tauri MSIX üretmez; NSIS (.exe) ve MSI üretir. MSIX gerekiyorsa üretilen kurulum dosyası
> Windows'ta **MSIX Packaging Tool** ile sarmalanır (§3.3).

### 3.1 Windows makinen yoksa — CI ile derle

macOS'tan Windows'a çapraz derleme **yoktur**. Bu iş için depoda hazır bir akış var:
[`.github/workflows/release.yml`](../.github/workflows/release.yml)

- Elle çalıştırma: GitHub → **Actions** → *Release* → **Run workflow**
- Ya da sürüm etiketi at:
  ```bash
  git tag v0.1.0 && git push origin v0.1.0
  ```

Çıktılar (`.exe`, `.msi`, `.msix` ve macOS `.dmg`) koşu sayfasındaki **Artifacts** bölümünden
indirilir; ayrıca taslak bir GitHub Release'e eklenir (ayrıntı §4).

### 3.2 Yol A — Microsoft Store (sertifikasız, en ucuz)

1. [partner.microsoft.com](https://partner.microsoft.com) → Windows & Xbox → şirket hesabı
   (DATHA YAZILIM ile; hesap doğrulaması birkaç gün sürebilir)
2. **Yeni uygulama** → ad rezerve et: `Loomen`
3. CI'dan `.msi` dosyasını indir
4. Bir Windows makinede (ya da Windows VM) **MSIX Packaging Tool** ile `.msi` → `.msix`
   - Publisher alanı Partner Center'daki kimliğinle **birebir** eşleşmeli
     (Partner Center → Product → Product identity ekranındaki değerler)
5. Partner Center'a `.msix` yükle → Microsoft imzalar
6. Mağaza kaydı: açıklama, en az 1 ekran görüntüsü (1366×768+), yaş sınırı anketi,
   **gizlilik politikası URL'si** (zorunlu)
7. Gönder → inceleme 1–3 iş günü

### 3.3 Yol B — İmzalı EXE (kendi siten + istersen Store)

Sertifika seçenekleri:

| Seçenek | Maliyet | Not |
|---|---|---|
| **Azure Artifact Signing** | ~10 USD/ay | Donanım token'ı gerekmez, CI ile çalışır — önerilen |
| EV sertifika | 300–600 USD/yıl | Donanım token'ı gelir; SmartScreen itibarı anında |
| OV sertifika | 200–400 USD/yıl | 2023'ten beri donanım token'ı zorunlu |

Azure Artifact Signing ile:
```jsonc
// src-tauri/tauri.conf.json → bundle.windows
"signCommand": "artifact-signing-cli -e https://eus.codesigning.azure.net -a HESAP -c PROFIL -d Loomen %1"
```
Ön koşul: .NET 8, Azure CLI, `artifact-signing-cli`; gizli değişkenler `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` (CI'da repo secret olarak).

Klasik sertifika ile:
```jsonc
"windows": {
  "certificateThumbprint": "A1B2C3…",   // certmgr.msc → sertifika → Ayrıntılar → Parmak izi
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

> **İmzalamazsan:** Windows SmartScreen "Bilinmeyen yayımcı" uyarısı verir; kullanıcı
> "Daha fazla bilgi → Yine de çalıştır" demek zorunda kalır. Store dışı dağıtımda ciddi kayıp.

### 3.4 Store'a EXE/MSI gönderirken ek kurallar

Store, Win32 kurulum dosyalarını kabul eder ama şunları ister:
- Sessiz kurulum ve kaldırma parametreleri (NSIS'te ikisi de `/S`)
- Denetim Masası'nda düzgün bir "Programlar ve Özellikler" kaydı (Tauri bunu üretir)
- Kurulum dosyası ve içindeki tüm çalıştırılabilirler Authenticode imzalı olmalı
- Kurulum sırasında başka yazılım önerilmemeli

---

## 4. Uygulama içi güncelleme (mağaza dışı masaüstü)

Mağaza dışı kurulan Loomen (macOS `.app`/`.dmg`, Windows `.exe`) açılıştan birkaç saniye sonra
yeni sürüm var mı diye bakar; varsa üstte **Güncelle** şeridi çıkar, paketi indirip uygulamayı
yeniden başlatır. Ayarlar'da "Güncellemeleri denetle" de aynı işi elle yapar.

Uygulama yeni sürümü şu adresten öğrenir (`tauri.conf.json` → `plugins.updater.endpoints`):

```
https://github.com/ofarukerol/Loomen/releases/latest/download/latest.json
```

App Store, iOS ve Android sürümlerinde bu özellik **yoktur** — mağaza kendi günceller.

### 4.1 İmza anahtarı — kaybetme

İndirilen her güncelleme bir özel anahtarla imzalanır, uygulama da içindeki açık anahtarla
(`plugins.updater.pubkey`) bu imzayı doğrular. İmza tutmazsa güncelleme kurulmaz.

| Ne | Nerede |
|---|---|
| Özel anahtar (parolasız) | `~/.loomen-keys/loomen.key` + GitHub secret `TAURI_SIGNING_PRIVATE_KEY` |
| Açık anahtar | `~/.loomen-keys/loomen.key.pub` + `tauri.conf.json` → `plugins.updater.pubkey` |

- Özel anahtar **depoya girmez**. `~/.loomen-keys` klasörünü ayrıca yedekle.
- Anahtar kaybolursa, kurulu uygulamalar yeni anahtarla imzalanmış güncellemeyi kabul etmez;
  herkesin yeni sürümü bir kez elle kurması gerekir.
- Secret'ı yeniden yüklemek için:
  ```bash
  gh secret set TAURI_SIGNING_PRIVATE_KEY -R ofarukerol/Loomen < ~/.loomen-keys/loomen.key
  ```

### 4.2 Yeni sürüm yayınlama

1. Sürümü artır: `tauri.conf.json` → `version` ve `package.json` → `version` (aynı değer).
   Uygulama yalnız **daha yüksek** sürümü güncelleme sayar.
2. Commit + etiket:
   ```bash
   git tag v1.0.1 && git push origin v1.0.1
   ```
3. [`release.yml`](../.github/workflows/release.yml) üç paketi derler: macOS Apple Silicon,
   macOS Intel ve Windows. Her biri imzalanır (`.sig`), taslak Release'e yüklenir ve
   `latest.json`'a kendi girdisini ekler (`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`).
   Son adım (*latest.json denetimi*) üç girdinin de yerinde olduğunu kontrol eder. Kırmızıysa
   eksik platformun derleme işini Actions'tan yeniden çalıştır; girdisi geri eklenir.
   Elle çalıştırmada (etiketsiz) Release `v<sürüm>` adıyla açılır, etiket yayınlanınca o
   koşunun commit'ine konur.
4. GitHub → Releases → taslağı aç, değişiklik notunu yaz, **Publish release**.
   **Taslak yayınlanmadan uygulamalar güncellemeyi görmez** (`releases/latest` adresi
   taslakları göstermez).

### 4.3 Yerel derleme

`bundle.createUpdaterArtifacts` açık olduğu için yerel derlemede de özel anahtar gerekir;
yoksa derleme imza adımında düşer:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.loomen-keys/loomen.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri build -- --bundles app,dmg
```

### 4.4 App Store derlemesi — güncelleme kapalı

App Store kuralı gereği mağaza sürümü kendini güncelleyemez. Bu derlemede güncelleme kodu hiç
derlenmez (`updater` özelliği kapatılır) ve güncelleme dosyası üretilmez
(`tauri.mas.conf.json` → `createUpdaterArtifacts: false`):

```bash
npm run tauri build -- --bundles app --config src-tauri/tauri.mas.conf.json \
  -- --no-default-features
```

İkinci `--` önemli: `--no-default-features` Tauri'nin değil cargo'nun seçeneğidir, ondan sonra
yazılan her şey doğrudan cargo'ya geçer.
[`scripts/mas-build.sh`](../scripts/mas-build.sh) bu bayrağı kendisi verir; mağaza paketini
elle değil o betikle üret.

### 4.5 Yerel deneme — sahte latest.json

Gerçek Release açmadan güncelleme akışını denemek için:

1. Yeni sürümü imzalı derle (`version` yalnız bu derleme için yükselir, dosyaya yazılmaz):
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.loomen-keys/loomen.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
   npm run tauri build -- --bundles app --config '{"version":"1.0.1"}'
   ```
   Çıktı: `src-tauri/target/release/bundle/macos/Loomen.app.tar.gz` ve `.tar.gz.sig`.
2. Geçici bir klasöre `.tar.gz`'yi kopyala, yanına `latest.json` yaz:
   ```json
   { "version": "1.0.1", "pub_date": "2026-01-01T00:00:00Z",
     "platforms": { "darwin-aarch64": {
       "signature": "<.sig dosyasının içeriği>",
       "url": "http://127.0.0.1:8765/Loomen.app.tar.gz" } } }
   ```
   ve `python3 -m http.server 8765` ile sun.
3. Kurulu sürümü **debug** derlemeyle aç (`http://` adresi yalnız debug derlemede kabul edilir):
   ```bash
   npm run tauri build -- --debug --bundles app
   LOOMEN_UPDATE_URL=http://127.0.0.1:8765/latest.json \
     src-tauri/target/debug/bundle/macos/Loomen.app/Contents/MacOS/Loomen
   ```
   Birkaç saniye sonra **Güncelle** şeridi çıkmalı; basınca indirip yeniden başlatır.
   Uygulamayı `/tmp` altından açma: macOS'ta `/tmp` bir kısayoldur (symlink), güncelleme
   eklentisi bunu reddeder ve kontrol "Sürüm bilgisi alınamadı" diye düşer. Geçici klasör
   gerekiyorsa `/private/tmp/...` yolunu kullan.

### 4.6 Bilinen sınırlar

- macOS paketleri şu an **Developer ID ile imzalı ve noter onaylı değil** (Apple secret'ları
  GitHub'da yok). Tarayıcıdan indirilen `.dmg`'deki uygulamayı macOS çoğu zaman "hasarlı" ya da
  "açılamıyor" diye engeller. İlk kurulumda geçici çare: `/Applications`'a kopyaladıktan sonra
  `xattr -cr /Applications/Loomen.app` ya da Finder'da sağ tık → Aç. Uygulama içinden gelen
  güncellemeler bu karantina işaretini almaz, sorunsuz açılması beklenir ama ilk sürümde
  doğrulanmalı. Kalıcı çözüm §1'deki sertifika + noter onayı, secret'lar eklenince `release.yml`'deki
  derleme adımına `APPLE_*` değişkenleri verilir.
- Windows kurulum dosyası imzasız; SmartScreen uyarısı sürer (§3.3).
- Release'i yayınladıktan sonra `latest.json`'u değiştirmek gerekirse Release'teki dosyayı
  elle düzenlemek yeterli; uygulamalar bir sonraki açılışta yeni içeriği okur.

---

## 5. CI ile otomatik derleme

Depodaki [`release.yml`](../.github/workflows/release.yml) etiketle (`v*`) ya da elle
(Actions → Release → Run workflow) çalışır:

- Önce tek bir taslak Release açar (varsa bulur), sonra üç derleme aynı anda koşar:
  `macos-latest` + `aarch64-apple-darwin`, `macos-latest` + `x86_64-apple-darwin`,
  `windows-latest` (`nsis,msi`).
- Derleme, imza ve yükleme `tauri-apps/tauri-action` ile yapılır; `latest.json` da bu adımda
  üretilir.
- Windows işi ayrıca Microsoft Store için MSIX üretir (Artifacts'ta).
- Gerekli secret'lar: `TAURI_SIGNING_PRIVATE_KEY` (zorunlu), `VITE_*` (yoksa ilgili
  entegrasyon kapalı kalır).

Developer ID kurulunca derleme adımına eklenecek secret'lar:
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `KEYCHAIN_PASSWORD`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. Sertifikayı secret'a koymak için:
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
- [ ] Taslak Release yayınlandı; `releases/latest/download/latest.json` açılıyor ve
      üç platform girdisi var (§4.2)

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

---

## 8. Mobil güncelleme uyarısı

Mağaza güncellemesi telefona her zaman kendiliğinden gelmiyor. Bu yüzden iOS ve Android
uygulaması, mağazada daha yeni sürüm olduğunda alt çubuğun hemen üstünde küçük bir şerit
gösterir: "Yeni sürüm hazır: 1.0.1 · Güncelle · Sonra". Masaüstünde bu şerit yoktur.

**Nasıl çalışır**
- Uygulama açılışta (ve öne geldiğinde) günde **en fazla bir kez**
  `https://loomen.org/surum.json` dosyasını okur. Dosya Rust tarafından çekilir
  (`src-tauri/src/surum.rs`), bu yüzden sitenin CORS ayarı gerekmez.
- Dosyadaki sürüm, kurulu sürümden (`tauri.conf.json` → `version`) büyükse şerit çıkar.
- **Sonra** aynı sürümü 3 gün gizler. **Güncelle** mağaza sayfasını açar ve aynı şekilde
  3 gün erteler (mağazadan dönünce şerit tekrar dürtmesin). Daha yeni bir sürüm yayınlanırsa
  şerit erteleme beklenmeden yeniden görünür.
- Ağ yoksa, dosya yoksa (404) ya da bozuksa hiçbir şey gösterilmez; özellik sessizce kapalı kalır.

**Dosya biçimi** (örneği: `docs/surum.json`)
```json
{
  "android": { "version": "1.0.1" },
  "ios": { "version": "1.0.1", "url": "https://apps.apple.com/app/id6821169163" }
}
```
- `version`: mağazadaki sürüm, `tauri.conf.json` ile aynı biçimde (`1.0.1`). Platform girdisi
  yoksa kök düzeydeki ortak `"version"` kullanılır. Android `versionCode` alanı yazılırsa yok sayılır.
- `url` (isteğe bağlı): yalnız `https://` ile başlıyorsa kullanılır; yoksa varsayılan mağaza
  sayfası açılır (Play: `org.loomen.notes`, App Store: `id6821169163`).

**Yayın sırası — önemli**
1. Yeni sürümü mağazaya gönder.
2. Mağaza onaylayıp **yayına girdikten sonra** `surum.json`'daki o platformun sürümünü artır.
   Erken artırılırsa kullanıcı "Güncelle"ye basar ama mağazada hâlâ eski sürümü bulur.
   Bir mağaza diğerinden geç onaylayabileceği için iki platformun sürümü ayrı tutulur.

**Yükleme:** loomen.org sitesi bu depoda değil. `surum.json` dosyası siteye elle yüklenir;
yüklenene kadar uyarı hiç çıkmaz.

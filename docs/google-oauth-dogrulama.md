# Google OAuth Doğrulaması — Yönelge

Bu doküman, Loomen'in Google Takvim entegrasyonunu **herkesin** kullanabilmesi için gereken
Google doğrulama sürecini adım adım anlatır.

## Neden gerekli?

Şu an OAuth uygulaması **"Testing"** modunda. Bu modda:

- Yalnızca **elle eklenen test kullanıcıları** (en fazla 100 e-posta) bağlanabilir.
- **Refresh token'lar 7 günde ölür** — bağlanan herkes haftada bir yeniden yetki vermek zorunda kalır.

Kullandığımız scope `https://www.googleapis.com/auth/calendar` Google'ın **"sensitive"** (hassas)
sınıfında olduğu için, uygulamayı yayınlamak (Production) doğrulama gerektirir.

> **İyi haber:** Calendar *sensitive* ama *restricted* değil — yani **CASA üçüncü taraf güvenlik
> denetimi GEREKMİYOR** (o, Gmail/Drive gibi scope'lar için; pahalı ve uzun). Bizim durum hafif.

---

## Başvuruda kullanılacak sabit bilgiler

| Alan | Değer |
|---|---|
| Proje numarası | `246428543418` |
| Uygulama adı | `Loomen` |
| Ana sayfa | `https://loomen.org` |
| Gizlilik politikası | `https://loomen.org/gizlilik.html` |
| Destek e-postası | `hello@loomen.org` (→ faruk@datha.com.tr) |
| Yetki alanı (scope) | `https://www.googleapis.com/auth/calendar` |

---

## Ön koşullar (hazır olanlar)

- [x] Canlı ana sayfa — `https://loomen.org` (200)
- [x] Herkese açık gizlilik politikası — `https://loomen.org/gizlilik.html` (200)
- [x] Gizlilik politikası Google veri kullanımını açıkça anlatıyor (local-first, sunucu yok)
- [x] Desktop + iOS OAuth client'ları oluşturulmuş
- [x] `hello@loomen.org` mail yönlendirmesi (MX + SPF + DKIM + DMARC kuruldu)
- [ ] **Yapılacak:** `hello@loomen.org`'a test maili at, faruk@datha.com.tr'ye düştüğünü DOĞRULA

---

## Adım adım

### 1. Alan adı sahipliğini doğrula (Brand Verification)
1. [Google Search Console](https://search.google.com/search-console) → aç
2. Property ekle → **Domain** → `loomen.org`
3. Verdiği **TXT kaydını** Cloudflare DNS'e ekle (Type: TXT, Name: `@`, içerik: Google'ın verdiği `google-site-verification=...`)
4. Search Console'da **Verify**'a bas
5. Aynı Google hesabının Cloud projesinin de sahibi olduğundan emin ol

### 2. OAuth consent screen'i eksiksiz doldur
Google Cloud Console → **APIs & Services → OAuth consent screen** (yeni arayüzde: **Google Auth Platform → Branding**):
- User type: **External**
- App name: **Loomen**
- User support email: **hello@loomen.org**
- App logo: uygulama ikonu (isteğe bağlı ama güven artırır — `src-tauri/icons/128x128.png`)
- Application home page: **https://loomen.org**
- Application privacy policy link: **https://loomen.org/gizlilik.html**
- Authorized domains: **loomen.org**
- Developer contact information: kendi e-postan

### 3. Scope gerekçesini yaz
**Data Access** (eski adı Scopes) → `.../auth/calendar` ekli olmalı → **"Why do you need this scope?"** kutusuna:

> Loomen is a local-first personal planning app. With the user's explicit consent, it writes the
> user's own dated tasks to their Google Calendar as events, and reads the user's calendar events
> to display them inside the app's agenda. The full calendar scope is required because the app both
> creates/updates/deletes its own events and reads existing events for two-way sync. All data flows
> directly between the user's device and Google; nothing is sent to or stored on any server of ours
> (we have no backend).

### 4. Demo videosu çek (YouTube, unlisted)
Şunları göstermeli:
1. Uygulamada **Ayarlar → Google Takvim → Bağlan**
2. Açılan Google onay ekranında **scope'un görünmesi** (takvim izni)
3. Bağlandıktan sonra bir görevin takvime yazılması / etkinliklerin ajandada görünmesi (scope'un gerçekten kullanıldığını kanıtlar)

Videoyu YouTube'a **Unlisted** yükle, linkini başvuruya yapıştır.

### 5. Yayınla ve gönder
- OAuth consent screen → **PUBLISH APP** → "Prepare for verification"
- Formu tamamla, gönder.
- **İnceleme süresi: ~10 güne kadar.** Google ek bilgi isterse **hello@loomen.org**'a mail atar —
  o yüzden mail yönlendirmesinin çalıştığından emin ol (yukarıdaki test).

---

## Doğrulama gelene kadar ne olur?

- Uygulama Production'da ama "unverified" → kullanıcılar **"Google bu uygulamayı doğrulamadı"**
  uyarı ekranı görür ve bir kullanıcı tavanına takılırsın.
- O yüzden asıl çözüm doğrulamanın tamamlanması.

## Şimdilik birkaç kişiye açmak için (doğrulama beklemeden)

Consent screen → **Audience → Test users** → e-postalarını ekle (100'e kadar). Doğrulama gerekmez,
ama **7 gün refresh-token** sorunu bu kullanıcılarda da olur.

---

## Masaüstüne özgü not (client secret)

`VITE_GOOGLE_CLIENT_SECRET` build sırasında JS bundle'ına gömülür ve dağıtılan binary'den
çıkarılabilir. Google'ın resmi duruşu: **installed/desktop app'lerde client secret "gizli sayılmaz"**,
güvenliği PKCE sağlar. Yani bu beklenen ve kabul edilebilir bir durumdur. Loomen açık kaynak
olduğundan `.env` asla commit'lenmez (gitignore'da) — fakat yayınlanan build'lerde secret pratikte
herkese açık olur; bu normaldir.

## Açık kaynak dağıtım için alternatif (BYO client)

İstersen ileride "kendi Google client id'ni gir" seçeneğini Ayarlar'a ekleyebiliriz. Bu, resmi
doğrulama ihtiyacını tamamen kaldırır (her kullanıcı kendi client'ını kullanır) ama teknik olmayan
kullanıcı için UX kötüdür. Genelde ikisi birden sunulur: varsayılan resmi client + isteyene kendi client'ı.

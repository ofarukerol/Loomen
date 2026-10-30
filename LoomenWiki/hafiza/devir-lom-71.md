---
name: LOM-71 — Güncellemeden sonra Tekrar kapalı görünüyor
description: Tekrar ayarı kasa açılır açılmaz ve her kasa yenilemesinde ayrı okunur; dosya yok / okunamadı / bozuk ayrılır, okunmamış dosyanın üstüne yazılmaz, Ayarlar ve Tekrar ekranında yükleniyor/uyarı durumu gösterilir.
type: project
proje: loomen
kaynak: kart LOM-71 · dal fix/LOM-71 · Loomen@6472510c2247c6deb361732e85b6e35f0db034d2 · test koşusu 96825868-baab-40d1-a355-29ca3e6e264e (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-30
---

# LOM-71 — Güncellemeden sonra Tekrar kapalı görünüyor

## Ne yapıldı

Tekrar ayarı kasa açılır açılmaz ve her kasa yenilemesinde ayrı okunur; dosya yok / okunamadı / bozuk ayrılır, okunmamış dosyanın üstüne yazılmaz, Ayarlar ve Tekrar ekranında yükleniyor/uyarı durumu gösterilir.

## Adımlar

- Kök sebep (doğrulandı): Tekrar ayarı yalnız srsLoad içinde okunuyor; srsLoad yalnız refreshSrs'den, o da yalnız loadFromBackend sonunda (bütün notlar okunduktan sonra) çağrılıyor (useAppStore.ts:907, :1018, :3259). readJson (core/srs/store.ts:48) her hatayı yutup null döndürüyor; loadSettings null'u varsayılan (enabled:false) sayıyor; 'dosya yok' ile 'okunamadı' ayırt edilmiyor. refreshSrs, srsLoaded true olduktan sonra ayarı bir daha hiç okumuyor (yalnız listeleri okuyor); ilk okuma senkron/izleyici yarışına denk gelip düşerse oturum boyunca kapalı kalıyor. srsSetSettings (:3289) bellekteki (varsayılan) ayarı doğrudan dosyaya yazıyor: kişinin desteleri ve sınırları eziliyor.
- core/srs/store.ts: readJson yerine ayar dosyasına özel `readSettings(backend)` yaz. Dönüş tipi `SettingsRead = { kind: 'ok'; settings; raw } | { kind: 'missing' } | { kind: 'error'; detail }`. exists false → missing; exists/readNote fırlatırsa → error (detail = hata metni); boş metin, geçersiz JSON ya da nesne olmayan içerik → error (boş dosya senkronun ara hâli olabilir, varsayılan sayılmaz). Mevcut varsayılanla tamamlama mantığını `normalizeSettings(raw: Partial<SrsSettings>)` olarak ayır ve ok dalında kullan. loadSettings dışa aktarımını kaldır (tek çağıran useAppStore).
- core/srs/store.ts: `saveSettings(backend, s, knownRaw: string | null)` imzasına geç. Metni JSON.stringify(s, null, 2) ile üret; metin knownRaw ile aynıysa diske dokunma (null dön); knownRaw null iken dosya diskte VARSA fırlat ('Okunmamış Tekrar ayar dosyasının üstüne yazılmaz'); yoksa ensureDir + writeNote ve yazılan metni dön. Emsal: core/habit/store.ts saveHabit.
- core/srs/store.ts: saf karar fonksiyonu `resolveSettingsRead(read: SettingsRead, knownRaw: string | null | undefined)` ekle (undefined = bu kasa için hiç okunmadı). ok ve raw === knownRaw → { action: 'keep' }; ok ve farklı → { action: 'adopt', settings, raw }; missing → knownRaw undefined ya da string ise { action: 'adopt', settings: varsayılan, raw: null }, knownRaw null ise keep; error → { action: 'error', detail }. Store bu fonksiyonu kullanır; test burada koşar.
- useAppStore.ts: durum alanları ekle: `srsSettingsStatus: 'loading' | 'ready' | 'error'` (başlangıç 'loading'), `srsSettingsError: string | null`; eylem `srsRetrySettings: () => Promise<void>`. Modül seviyesinde `srsSettingsRaw: string | null | undefined`, `srsSettingsOf: VaultBackend | null`, okuma sıra sayacı, `srsSettingsWriting` sayacı ve yeniden deneme zamanlayıcısı tut.
- useAppStore.ts: `srsReadSettings()` iç fonksiyonu yaz: src = backend; readSettings(src); dönüşte backend değiştiyse ya da daha yeni okuma başladıysa ya da yazma sürüyorsa (srsSettingsWriting > 0) sonucu at. resolveSettingsRead ile karar ver: adopt → set({ srsSettings, srsSettingsStatus: 'ready', srsSettingsError: null }), raw/of güncelle; enabled/syntax/excluded değiştiyse ve srsLoaded ise kartları yeniden topla (srsSetSettings'teki aynı blok; ortak yardımcıya çıkar). keep → status 'ready'. error → status 'error' + detail, srsSettings'e DOKUNMA, 10 saniyelik yeniden deneme zamanlayıcısı kur (tek zamanlayıcı; ready olunca temizle). console.error ile logla.
- useAppStore.ts reopenVault: `backend = next;` satırından hemen sonra, ensureTemplates ve loadFromBackend'den ÖNCE: srsSettingsOf !== next ise set({ srsSettings: varsayılan, srsSettingsStatus: 'loading', srsSettingsError: null }), raw = undefined; ardından `void srsReadSettings()` (beklenmez, notlar paralel yüklenir). removeVault'ta örnek backend'e dönüşte ve bootstrap'ta kasa açılmadığında (tarayıcı/örnek kasa) da aynı sıfırla + oku; aksi hâlde yükleniyor durumunda takılır.
- useAppStore.ts srsLoad: `loadSettings` çağrısını `await srsReadSettings()` ile değiştir, cfg = get().srsSettings. refreshSrs'in ikinci dalında (srsLoaded iken) reloadSrsLists'ten önce `await srsReadSettings()` çağır: böylece izleyici, senkron sonrası reloadVault ve gün değişimi her seferinde ayarı yeniden okur; dışarıdan değişen dosya benimsenir, hata yeniden denenir. srsRetrySettings eylemi de aynı fonksiyonu çağırır.
- useAppStore.ts srsSetSettings: status 'ready' değilse console.warn ile dön, yazma (UI zaten engeller). Aksi hâlde prev'i sakla, belleği güncelle, srsSettingsWriting++; try { raw = await saveSettings(backend, next, srsSettingsRaw ?? null); backend değişmediyse srsSettingsRaw = raw ?? eski } catch { belleği prev'e döndür, set({ srsSettingsStatus: 'error', srsSettingsError: detay }), console.error } finally { srsSettingsWriting-- }. Mevcut kart yeniden toplama bloğu yalnız yazma başarılıysa çalışsın.
- src/screens/Review/ReviewSettingsGate.tsx (yeni, saf, store'suz): props { status, detail, t, onRetry }. loading → 'Tekrarı kullan' satırında anahtar yerine 'Yükleniyor…' metni (aria-busy). error → AlertTriangle, başlık 'Tekrar ayarları okunamadı', alt metin 'Ayarların korunması için şimdilik değiştirilemiyor; dosya düzelince kendiliğinden gelir', 'Yeniden dene' ve 'Ayrıntılar' (hidden code, dir=ltr) düğmeleri. Emsal: components/WriteErrorBar.tsx WriteErrorBarBody.
- ReviewSettings.tsx: srsSettingsStatus ve srsSettingsError oku; status 'ready' değilse yalnız bölüm başlığı + ReviewSettingsGate çiz (anahtar, sekmeler ve tahmin kutusu yok). ReviewScreen.tsx: cfg.enabled false iken status loading/error ise tanıtım kartı ve 'Tekrarı aç' düğmesi yerine ReviewSettingsGate göster (düğme varsayılanı dosyaya yazardı).
- Ribbon.tsx: srsSettingsStatus oku; (enabled || status === 'loading') iken düğmeyi çiz, loading'de `is-placeholder` sınıfı + disabled + aria-hidden (styles/app.css: visibility hidden, pointer-events none) — simge yeri önceden ayrılır, zıplamaz.
- i18n tr/en/ar translation.json review.set altına: loading, readErrorTitle, readErrorSub, retry, details, saveError anahtarları (üç dilde birebir aynı anahtar seti; reviewI18nTest eşitliği zorlar). Türkçe sade: 'Yükleniyor…', 'Tekrar ayarları okunamadı', vb.
- src/core/__test__/srsSettingsTest.ts (yeni) ve scripts/run-tests.mjs listesine ekle. srsListTest'teki fakeVault kalıbıyla okuma/varlık hatası fırlatabilen sahte kasa kur. Testler: readSettings missing / ok+varsayılan birleşimi+raw / boş dosya error / bozuk JSON error / readNote fırlatır error (detail dolu) / exists fırlatır error; saveSettings: known null + dosya var → fırlatır ve yazmaz; known null + dosya yok → yazar; known aynı → yazmaz; known farklı → yazar ve yeni metni döner; resolveSettingsRead: keep/adopt/missing→varsayılan/error; ReviewSettingsGate renderToString: loading'de lo-switch yok ve loading anahtarı var, error'da retry düğmesi var ve detay hidden.
- npm run typecheck ve npm test koş; kırmızı varsa düzelt. Commit mesajı LOM-71 ile, AI imzası yok; dal fix/LOM-71.

## Dokunulan dosyalar

- `Loomen/src/core/srs/store.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Review/ReviewSettingsGate.tsx`
- `Loomen/src/screens/Settings/ReviewSettings.tsx`
- `Loomen/src/screens/Review/ReviewScreen.tsx`
- `Loomen/src/components/Ribbon.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/core/__test__/srsSettingsTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Tip denetimi hatasız bitti. Tüm test takımı geçti: 32 test dosyası, Tekrar ayar testinin 48 kontrolü dahil. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-71`
- Commit: `Loomen@6472510c2247c6deb361732e85b6e35f0db034d2`
- Test koşusu: `96825868-baab-40d1-a355-29ca3e6e264e` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

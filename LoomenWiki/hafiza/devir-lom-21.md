---
name: LOM-21 — Kayıt hatası şeridi: dar pencerede kapat düğmesi görünmüyor, Ayrıntılar açık kalıyor
description: Testler kaldı: Kayıt hatası şeridini (WriteErrorBar) iki satırlı yapıya geçirip kapat düğmesini dar sütunda da görünür tutmak ve her yeni hatada Ayrıntılar bölümünün kapalı açılmasını sağlamak; LOM-20 henüz main'de olmadığı için fix/LOM-21 dalı fix/LOM-20 üzerine kurulacak.
type: project
proje: loomen
kaynak: kart LOM-21 · dal fix/LOM-21 · commit yok · test koşusu 79cb7867-222f-457e-aa06-3c90ce9f5ff5 (Excalibur)
guven: iddia
durum: gelistirildi
---

# LOM-21 — Kayıt hatası şeridi: dar pencerede kapat düğmesi görünmüyor, Ayrıntılar açık kalıyor

## Ne yapıldı

Kayıt hatası şeridini (WriteErrorBar) iki satırlı yapıya geçirip kapat düğmesini dar sütunda da görünür tutmak ve her yeni hatada Ayrıntılar bölümünün kapalı açılmasını sağlamak; LOM-20 henüz main'de olmadığı için fix/LOM-21 dalı fix/LOM-20 üzerine kurulacak.

## Adımlar

- DAL TABANI: Çalışma ağacı şu an main'de ve WriteErrorBar main'de YOK (grep boş); LOM-20 işi yalnız yerel fix/LOM-20 dalında (Loomen@eceb80e). fix/LOM-21 dalına geçtikten sonra önce `git merge fix/LOM-20` yap (yerel, push YOK; kart 'fix/LOM-20 üzerine' seçeneğini açıkça izin veriyor). Birleştirme sonrası src/components/WriteErrorBar.tsx, src/core/vault/writeError.ts ve src/core/__test__/writeErrorTest.ts'nin var olduğunu, `npm test`in yeşil olduğunu doğrula; ancak ondan sonra değişikliğe başla.
- KÖK SEBEP 2 (Ayrıntılar açık kalıyor): WriteErrorBar App.tsx içinde hep mount halinde; writeError null/dismissed olunca bileşen null döndürüyor ama unmount OLMUYOR, bu yüzden 'open' useState değeri korunuyor ve şerit geri gelince açık geliyor. KÖK SEBEP 1 (X taşıyor): tek satırlık flex dizilimde metin + üç düğme 184 px sütuna sığmıyor; düğme grubu taşıp .lo-app'in overflow:hidden alanında kalıyor.
- Loomen/src/core/vault/writeError.ts: `writeErrorKey(s: WriteErrorState): string` ekle, dönüş `${s.code}:${s.firstAt}`. recordWriteError aynı kodda firstAt'ı koruduğu, farklı kodda ya da null'dan yeniden başlarken firstAt=now verdiği için bu anahtar 'yeni hata durumu' ile birebir örtüşür. React/i18n import etme (modül saf kalsın).
- Loomen/src/components/WriteErrorBar.tsx: ikiye böl. (a) Dışa aktarılan `WriteErrorBar`: store'dan writeError, retryWrite, dismissWriteError ve useTranslation'dan t alır; writeError null ya da dismissed ise null döndürür; aksi halde `<WriteErrorBarBody key={writeErrorKey(err)} error={err} t={t} onRetry={retryWrite} onDismiss={dismissWriteError} />` çizer. (b) Dışa aktarılan saf `WriteErrorBarBody` (store ve i18n hook'u KULLANMAZ, yalnız props): 'open' useState burada; şerit gizlenince gövde unmount olur, yeni hatada key değiştiği için yeniden mount olur → Ayrıntılar her yeni hatada kapalı başlar. Yapı: <div class="lo-writebar" role="alert"> içinde ÜST SATIR <div class="lo-writebar__head">: AlertTriangle ikonu (class lo-writebar__icon) + <div class="lo-writebar__text"> (ana metin + notSaved satırı) + X kapat düğmesi (class "lo-writebar__btn lo-writebar__close", aria-label t('writeBar.dismiss')); ALT SATIR <div class="lo-writebar__actions">: 'Yeniden dene' ve 'Ayrıntılar' düğmeleri (aria-expanded={open}); open ise <code class="lo-writebar__detail">{error.detail}</code>. Metin anahtarları ve düğme işlevleri LOM-20'dekiyle aynı kalsın; çeviri dosyalarına dokunma.
- Loomen/src/styles/app.css: .lo-writebar bloğunu yeniden yaz: display:flex; flex-direction:column; gap:6px; flex-shrink:0; max-width:100%; box-sizing:border-box; overflow:hidden; padding/border/arka plan LOM-20'deki gibi. .lo-writebar__head { display:flex; align-items:flex-start; gap:8px; min-width:0 } .lo-writebar__icon { flex-shrink:0; margin-top:2px } .lo-writebar__text { flex:1 1 auto; min-width:0; overflow-wrap:anywhere } .lo-writebar__close { flex-shrink:0; margin-inline-start:auto } .lo-writebar__actions { display:flex; flex-wrap:wrap; gap:6px; padding-inline-start:24px } .lo-writebar__detail { display:block; monospace; font-size 12px; word-break:break-all; max-height:120px; overflow:auto; color var(--fg3) }. RTL için yalnız inline mantıksal özellikler (margin-inline-start, padding-inline-start, border-inline-start). Mobil (.lo-app.is-mobile) için ayrı kural gerekmiyor; eski flex-wrap kuralı varsa kaldır.
- Loomen/src/core/__test__/writeErrorTest.ts: writeErrorKey testleri ekle (mevcut check/eq deseni): aynı kodla ikinci hata → anahtar DEĞİŞMEZ; farklı kod → anahtar değişir; null'dan (clearWriteError sonrası) yeniden hata, farklı now ile → anahtar değişir; anahtar `${code}:${firstAt}` biçiminde.
- Loomen/src/core/__test__/writeErrorBarTest.ts (yeni, JSX yok, createElement ile; yeni bağımlılık YOK, react-dom zaten kurulu): `renderToString` (react-dom/server) ile WriteErrorBarBody'yi error={code:'permission', detail:'Access is denied. (os error 5)', kind:'note', path:'a.md', count:2, firstAt:1, lastAt:2, dismissed:false}, t=(k)=>k, boş onRetry/onDismiss ile çiz. Kontroller: çıktı `aria-label="writeBar.dismiss"` içeren bir <button> barındırıyor; `lo-writebar__close` sınıfı `lo-writebar__head` içinde; ilk çizimde `lo-writebar__detail` YOK (Ayrıntılar kapalı başlar) ve ham detail metni HTML'de geçmiyor; `errors.writePermission` ve `writeBar.notSaved` anahtarları geçiyor; `role="alert"` var. Loomen/scripts/run-tests.mjs suites listesine ['src/core/__test__/writeErrorBarTest.ts', []] ekle. Bu test yalnız başlangıç durumunu ve yapıyı kanıtlar; gerçek genişlik davranışı canlı denemede.
- DOĞRULAMA: `npm test` (writeErrorTest + writeErrorBarTest dahil hepsi yeşil), `npx tsc --noEmit` çıktısız, `npm run build` başarılı. Kod üzerinden gözden geçir: App.tsx'te mount yeri değişmedi (TopBar/MobileTopBar sonrası, .lo-main öncesi); dismissWriteError/retryWrite davranışı aynı; çeviri anahtarları değişmedi.
- CANLI DENEME (Excalibur, paketli ya da tauri dev; raporda denenmediyse açıkça yaz): kasa klasörünü salt okunur yapıp hata şeridini çıkar; pencereyi 800x600'e getir, sağ paneli AÇ (orta sütun ~184 px) → X düğmesi görünür ve tıklanabilir, 'Yeniden dene' ve 'Ayrıntılar' görünür, hiçbir şey sütun dışına taşmıyor; sağ panel kapalıyken de aynı. Ayrıntılar'ı aç, izni geri verip şeridin kalkmasını bekle, izni yeniden kaldırıp yeni hata üret → şerit Ayrıntılar KAPALI gelir. Arapça (RTL) dilde X'in sol kenarda ve şeridin düzgün olduğunu bir kez kontrol et.
- COMMIT: repo dilinde mesaj, AI imzası YOK, dal fix/LOM-21, push YOK. Sonuç raporunda: fix/LOM-21'in fix/LOM-20 commit'lerini de içerdiğini (main'e alınırken LOM-20 ile birlikte gideceğini) açıkça yaz; test çıktısı (komut + geçti/kaldı satırı) ve canlı denenmeyen kısımlar.

## Dokunulan dosyalar

- `Loomen/src/components/WriteErrorBar.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/core/vault/writeError.ts`
- `Loomen/src/core/__test__/writeErrorTest.ts`
- `Loomen/src/core/__test__/writeErrorBarTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler KALDI; iş doğrulanmadı.

> İş yarıda durduruldu; testler koşmadı.

## Kanıt

- Dal: `fix/LOM-21`
- Test koşusu: `79cb7867-222f-457e-aa06-3c90ce9f5ff5` (Excalibur)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.

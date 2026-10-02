---
name: LOM-27 — Kasa açılamadığında örnek nottaki taslak gerçek kasadaki aynı adlı notun üstüne yazılabiliyor (veri kaybı)
description: Kayıtlı kasa açılamayıp örnek kasa gösterilirken gerçek kasa sonradan açılırsa bunu kasa değişimi sayan korumayı (origin/fix/LOM-25-koruma, 6a1401e) main'deki güncel koda elle uyarlamak; böylece örnek nottaki taslak gerçek kasaya yazılamaz, açılış düşerse açık not kapanmaz.
type: project
proje: loomen
kaynak: kart LOM-27 · dal fix/LOM-27 · Loomen@24cf09ea238cd09085ea0a298fa62d35d61cf9ab · test koşusu 36de48e1-5341-4f3a-a358-ab40738b95e4 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-02
---

# LOM-27 — Kasa açılamadığında örnek nottaki taslak gerçek kasadaki aynı adlı notun üstüne yazılabiliyor (veri kaybı)

## Ne yapıldı

Kayıtlı kasa açılamayıp örnek kasa gösterilirken gerçek kasa sonradan açılırsa bunu kasa değişimi sayan korumayı (origin/fix/LOM-25-koruma, 6a1401e) main'deki güncel koda elle uyarlamak; böylece örnek nottaki taslak gerçek kasaya yazılamaz, açılış düşerse açık not kapanmaz.

## Adımlar

- TABAN KONTROLÜ (koda dokunmadan): Dal fix/LOM-27 olmalı ve b5c58b9'u içermeli (`git merge-base --is-ancestor b5c58b9 HEAD`). İçermiyorsa yerelde `git merge origin/main` yap (push yok) ve rapora yaz. Not: analiz adımında kesici yalnız ~/Github/Loomen kopyasını okuttu; o kopya eski main'de (2d73969) ve LOM-20..25 kodu orada yok. Bu yüzden aşağıdaki satır numaraları değil işlev adları esas; güncel main'de reopenVault kartın dediği gibi ~1618'de.
- ÖNCE OKU: (a) Korumanın tam farkı: `git diff 9019762 6a1401e` ve `git show --stat 6a1401e` (9019762 = o daldaki LOM-25, 6a1401e = üstündeki koruma commit'i). (b) Güncel main'de src/store/useAppStore.ts içinde reopenVault, repickFailedVault, şeritteki Yeniden dene ve pencere odağındaki sessiz yeniden deneme, openError'ın kurulduğu/temizlendiği yerler, removeVault ve `createSampleBackend()` atanan her yer, flushDraft ve saveNote. (c) NOTE_SAFETY_RULES.md. Cherry-pick deneme; koruma dalı main'den farklı bir LOM-25 üstünde, elle uyarla.
- BAYRAK: useAppStore.ts'te modül düzeyindeki `backend` değişkeninin yanına `backendOpened` (başlangıç false) ekle. reopenVault'ta `backend = next` atandığı anda true yap. backend'in yeniden örnek kasaya döndüğü her yerde (removeVault'un son kasa dalı ve main'de varsa diğerleri) false yap.
- KASA DEĞİŞİMİ KARARI: reopenVault'ta `isSwitch = prevPath !== path` yerine `isVaultSwitch = !backendOpened || prevPath !== path` kullan. Yani gerçek kasa bu oturumda hiç açılmadıysa (ekranda örnek kasa varsa) her başarılı açılış kasa değişimidir; gerçek kasa açıkken aynı yolun yeniden açılması (HMR, rehydrate+bootstrap çifti, sessiz yeniden deneme) değişim sayılmaz ve taslağa/sekmelere dokunmaz.
- SIRA (koruma dalındaki openVaultGuarded sırası esas; hedef davranış şu): 1) Önce yeni kasayı doğrula: bookmark çöz, allowVaultPath, createTauriBackend(target), `await next.listNotes()`. Bu aşamada taslak, activeNote, sekmeler ve backend'e DOKUNMA. 2) Doğrulama düşerse catch'e git: hiçbir şey temizlenmez, açık not kapanmaz; main'deki openError/şerit davranışı (LOM-23/24/25) aynen kalır. 3) Doğrulama geçtiyse ve isVaultSwitch ise bekleyen taslağı HÂLÂ ETKİN olan backend'e (örnek kasa ya da eski kasa) flushDraft ile yaz; yazılamazsa mevcut `errors.vaultSwitchAborted` uyarısıyla çık, backend'i değiştirme. 4) Araya await sokmadan, tek senkron blokta: sekmeleri sakla, `set({draft:"", draftPath:null, activeNote:null, activeDraw:null})`, `backend = next`, `backendOpened = true`. Taslak temizliği ile backend değişimi arasında await OLMAMALI; yoksa bekleyen otomatik kayıt araya girip yeni kasaya yazar.
- SEKMELER VE İZİNLER: Mevcut sekmeleri `tabsByVault[prevPath]` altına YALNIZ gerçek kasa açıkken (değişimden önce backendOpened true iken) sakla; örnek kasanın sekmeleri gerçek kasanın sekmesi diye saklanmasın. Hedef kasanın sekmelerini geri yükleme koşulu `isVaultSwitch || openTabs boş` olsun (var olmayan notlar zaten süzülüyor; draft+draftPath aynı set içinde atomik kalmalı). `releaseBookmark(prevPath)` yalnız prevPath gerçekten farklı bir yolsa (prevPath !== path ve !== target) çağrılsın — aynı kasa örnek kasadan sonra açılırken kendi iznini bırakmasın. resetIndex isVaultSwitch'te çalışsın.
- İŞLEVE ÇIKAR: Bu koruma sırasını koruma dalındaki gibi `openVaultGuarded` adlı, bağımlılıkları dışarıdan alan saf bir işleve taşı (varsayılan dosya: src/core/vault/openGuard.ts; React, i18n, Tauri içe aktarmasın ki node testinde koşabilsin). reopenVault bu işlevi çağırsın. Koruma dalı aynı işi başka dosya adıyla yapmışsa o adı korumak serbest; raporda belirt.
- LOM-25 DAVRANIŞINI KORU: 'Klasörü yeniden seç' (aynı klasörde izin yenileyip açma), 'bu klasör zaten başka bir kasa' uyarısı, Yeniden dene ve odakta sessiz yeniden deneme main'deki gibi çalışmaya devam etmeli; hepsi reopenVault'tan geçtiği için yeni korumayı kendiliğinden almalı. Bu akışların reopenVault'u atlayıp backend'e doğrudan dokunan bir yolu varsa aynı korumadan geçir. Başarısız sessiz denemede uyarı penceresi açılmamalı, şerit tek kalmalı.
- BİRİM TESTİ: src/core/__test__/openGuardTest.ts ekle (koruma dalındaki testi uyarlayarak) ve scripts/run-tests.mjs içindeki `suites` listesine yaz. En az şu durumlar: (1) örnek kasa açıkken (backendOpened=false) vaultPath ile AYNI yol açılır, 'Yapılacaklar.md' taslağı kirli → taslak eski (örnek) backend'e yazılır, yeni backend'e HİÇ yazma gitmez, taslak/aktif not temizlenir, örnek sekmeler gerçek yol altına saklanmaz, izin bırakma çağrılmaz; (2) doğrulama (listNotes) hata verir → yazma yok, temizlik yok, backend aynı, açık not duruyor; (3) gerçek kasa açık + aynı yol → değişim sayılmaz, taslak ve aktif not korunur; (4) gerçek A'dan B'ye geçiş → taslak A'ya yazılır, sekmeler A altına saklanır, A'nın izni bırakılır; (5) taslak yazılamaz → geçiş iptal, backend değişmez, taslak durur.
- KURAL BELGESİ: NOTE_SAFETY_RULES.md'ye kısa bir madde ekle: gerçek kasa açılmamışken (örnek kasa gösterilirken) her açılış kasa değişimidir; taslak önce eski backend'e yazılır, temizlik ile backend değişimi arasında bekleme olmaz, açılış düşerse hiçbir şey temizlenmez.
- TEST VE KANIT: `npx tsc --noEmit` ve `npm test` koş; komutu ve geçti/kaldı satırını rapora yaz (main'deki mevcut LOM-23/24/25 testleri de yeşil kalmalı). Kırmızıysa sebebini yaz, düzelt, yeniden koş. Canlı test gerekmiyor.
- İNCELEME VE COMMIT: Temiz bağlamlı ayrı bir alt ajan `git diff`'i, bu planı ve test kanıtını yalnız okuyarak incelesin; özellikle 'taslak temizliği ile backend değişimi arasında await var mı', 'açılış düşünce bir şey temizleniyor mu', 'aynı yol için izin bırakılıyor mu' sorularına baksın. Gerçek bulguyu düzelt, testi yeniden koş. Commit mesajı repo dilinde, AI imzası YOK, dal fix/LOM-27, push YOK. Sonuç raporu sade Türkçe: yapılanlar, test çıktısı, koruma dalından farklı kalan yerler, kapsam dışı gözlemler (düzeltmeden not et).

## Dokunulan dosyalar

- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/core/vault/openGuard.ts`
- `Loomen/src/core/__test__/openGuardTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/NOTE_SAFETY_RULES.md`

## Test

Testler geçti.

> Hızlı kontrol yeşil. `npx tsc --noEmit` hatasız bitti (çıkış 0). `npm test` çıkış 0 verdi: "✅ 31 kontrolün tümü geçti", "✅ 11 test dosyasının tümü geçti". Korumayı deneyen openGuardTest de geçti: taslak örnek kasaya yazılıyor, gerçek kasaya yazılmıyor, açılış düşerse hiçbir şey temizlenmiyor. Canlı test gerekmiyor, kartta da öyle yazıyor.

## Kanıt

- Dal: `fix/LOM-27`
- Commit: `Loomen@24cf09ea238cd09085ea0a298fa62d35d61cf9ab`
- Test koşusu: `36de48e1-5341-4f3a-a358-ab40738b95e4` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

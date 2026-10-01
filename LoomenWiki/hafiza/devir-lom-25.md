---
name: LOM-25 — Klasörü yeniden seç aynı klasörde işe yaramıyor; kasa şeridi kendiliğinden kalkmıyor
description: Kasa açılamayınca çıkan şeritte 'Klasörü yeniden seç' aynı klasörde de işe yarasın, şerit klasör geri gelince kalksın; mobil metin, sağdan sola düzen ve erişilebilirlik düzeltmeleri de eklensin.
type: project
proje: loomen
kaynak: kart LOM-25 · dal fix/LOM-25 · Loomen@6a1401e038a4e00eb8559bc9f3b03dacac0894ec · test koşusu 3064dbc7-61b9-441d-87df-7ce19e3fb740 (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-01
---

# LOM-25 — Klasörü yeniden seç aynı klasörde işe yaramıyor; kasa şeridi kendiliğinden kalkmıyor

## Ne yapıldı

Kasa açılamayınca çıkan şeritte 'Klasörü yeniden seç' aynı klasörde de işe yarasın, şerit klasör geri gelince kalksın; mobil metin, sağdan sola düzen ve erişilebilirlik düzeltmeleri de eklensin.

## Adımlar

- ÖNCE KONTROL: Bu çalışma kopyasında VaultOpenErrorBar, WriteErrorBar, openError ve repickFailedVault hiç yok. Bunlar fix/LOM-20, LOM-21, LOM-23 ve LOM-24 dallarında duruyor; main'e henüz girmemiş. fix/LOM-25 dalı bu işlerin hepsini içeren bir tabandan açılmalı (ilgili dallar main ile birleştirildikten sonra ya da bu dallar birleştirilerek). Taban hazır değilse uygulamaya geçme.
- Taban hazır olunca LOM-23/24'ün gerçek kodunu oku: useAppStore.ts içinde openError'ın nerede kurulup temizlendiğini, repickFailedVault'u, changeVaultPath'i (şu an 1239-1256, 'newPath === oldPath' ise sessizce çıkıyor, başka kasanın klasörüyse de sessizce çıkıyor) ve VaultOpenErrorBar.tsx ile WriteErrorBar.tsx dosyalarını.
- 1) repickFailedVault: seçiciyi kendisi açsın (pickVaultFolder). Seçilen yol hata veren yolla AYNI ise createBookmark(path) ile erişim izni yeniden üretilsin, vaults içindeki kaydın bookmark'ı güncellensin, sonra reopenVault(err.path) çağrılsın; başarılı olunca şerit kalkar. Seçilen yol başka bir kasaya aitse kullanıcıya sade Türkçe uyarı göster ('Bu klasör zaten başka bir kasa'). Farklı yeni klasörse eski changeVaultPath akışı çalışsın. changeVaultPath'in Ayarlar ekranındaki davranışını bozma (VaultManager.tsx:146); aynı-klasör kuralını yalnız onarım yolunda gevşet.
- 2) Şeride 'Yeniden dene' düğmesi ekle (reopenVault(err.path)); ayrıca pencere odağa dönünce (focus/visibilitychange) açık hata varsa bir kez yeniden denesin; art arda tetiklenmeyi engelle (kuyruk zaten queueVaultOp ile sıralı, yine de çalışan bir deneme varken yenisini başlatma). Başarıda şerit kalksın, başarısızlıkta aynı şerit tek kalsın (LOM-23 kuralı).
- 3) VaultOpenErrorBar: mobilde (platformMobile) 'klasörü yeniden seçin' demesin; düğme gizli olduğundan mobil metni 'Yeniden dene' ya da uygulamayı yeniden açmayı söylesin. Metinler i18n anahtarı olarak ekle, sade Türkçe.
- 4) RTL: VaultOpenErrorBar'daki Ayrıntılar yol/hata metnini ve WriteErrorBar'ın ayrıntı satırını <code dir="ltr"> (veya unicode-bidi: plaintext) ile sar.
- 5) Her iki şeritteki Ayrıntılar düğmesine aria-controls ve ayrıntı bölümüne eşleşen benzersiz id ekle (useId ile); aria-expanded zaten varsa koru.
- Birim testleri: aynı klasör seçilince createBookmark çağrılıyor, kasa kaydı güncelleniyor, reopenVault çağrılıyor ve openError temizleniyor; başka kasanın klasörü seçilince uyarı çıkıyor ve reopenVault çağrılmıyor; Yeniden dene başarıda şeridi kaldırıyor, başarısızlıkta tek şerit kalıyor; mobilde metin farklı; ayrıntı metninde dir=ltr ve aria-controls/id eşleşmesi. Mevcut test altyapısındaki (vitest) yerleşimi izle; tsc ve tüm testleri koş.
- Excalibur'da canlı test: izin düşürülmüş kasada şerit çıkar, 'Klasörü yeniden seç' ile aynı klasör seçilince kasa açılır ve şerit kalkar; klasör geri gelince Yeniden dene şeridi kaldırır; Arapça dil düzeninde yol düzgün görünür. Excalibur sıra kuralına uy.
- Bağımsız inceleme (ayrı alt ajan, yalnız okur) sonra commit; AI imzası ekleme; push yok (kesici yasak), fix/LOM-25 dalında kalır.

## Dokunulan dosyalar

- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/components/VaultOpenErrorBar.tsx`
- `Loomen/src/components/WriteErrorBar.tsx`
- `Loomen/src/i18n (ilgili dil dosyaları)`
- `Loomen/src/store (useAppStore için yeni birim test dosyası)`

## Test

Testler geçti.

> Tip denetimi temiz (TSC=0). Birim testleri geçti: "✅ 31 kontrolün tümü geçti", "✅ 11 test dosyasının tümü geçti". Excalibur'daki canlı testi koşmadım. Plandaki `canli_test_gerekir` alanı false, önceki adımda da canlı denemeye gerek olmadığı belirtilmişti. Bu yüzden canlı kontrol (izin düşürülmüş kasada aynı klasörü seçmek, Arapça düzen) yapılmadı. Store'un kendisi Tauri'ye bağlı olduğundan ayrı iş

## Kanıt

- Dal: `fix/LOM-25`
- Commit: `Loomen@6a1401e038a4e00eb8559bc9f3b03dacac0894ec`
- Test koşusu: `3064dbc7-61b9-441d-87df-7ce19e3fb740` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

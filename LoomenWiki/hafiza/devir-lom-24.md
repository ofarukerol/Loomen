---
name: LOM-24 — Kasa klasörü silinmiş ya da taşınmışken şerit 'izin düşmüş olabilir' diyor
description: Kasa açılamadığında klasörün gerçekten var olup olmadığı ayrıca denetlenecek; klasör yoksa şerit "klasör bulunamadı, taşınmış ya da silinmiş olabilir" diyecek, "izin düşmüş olabilir" yalnız klasör yerindeyken söylenecek.
type: project
proje: loomen
kaynak: kart LOM-24 · dal fix/LOM-24 · Loomen@a664ababb16d24d88803d2c3b36b8d22c301a7d3 · test koşusu e806fdb0-2eed-487c-85df-d363899985e7 (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-01
---

# LOM-24 — Kasa klasörü silinmiş ya da taşınmışken şerit 'izin düşmüş olabilir' diyor

## Ne yapıldı

Kasa açılamadığında klasörün gerçekten var olup olmadığı ayrıca denetlenecek; klasör yoksa şerit "klasör bulunamadı, taşınmış ya da silinmiş olabilir" diyecek, "izin düşmüş olabilir" yalnız klasör yerindeyken söylenecek.

## Adımlar

- ÖN KOŞUL (ilk iş, atlanmaz): dalda Loomen/src/core/vault/openError.ts, Loomen/src/core/__test__/openErrorTest.ts ve Loomen/src/components/VaultOpenErrorBar.tsx var mı bak. Bu analizde (1 Eki) yeniden bakıldı: ana kodda hâlâ YOKLAR; useAppStore.ts satır ~1407'de eski `void notifyError(... errors.vaultOpenFailed ...)` duruyor, fix/LOM-23 dalında hiç commit yok (iş yalnız LOM-23 zincirinin çalışma klasöründe), fix/LOM-24 dalı da depoda henüz açılmamış. Dosyalar yoksa LOM-23'ü yeniden YAZMA; dur ve 'LOM-23 ana koda girmeden bu iş yapılamaz' diye bildir. Varsa önce openError.ts'i ve useAppStore.ts'teki reopenVault catch bloğunu oku; aşağıdaki adlar LOM-23 planından alındı, gerçek adlar farklıysa gerçeğe uy.
- KÖK SEBEP (bilgi): reopenVault önce allowVaultPath(target) çağırıyor (Loomen/src/store/useAppStore.ts ~1332, Loomen/src/core/bookmark.ts:71). Rust tarafındaki vault_allow klasör yoksa hata veriyor ama allowVaultPath bunu yutuyor. Klasör izin kapsamına girmediği için ardından gelen next.listNotes() 'forbidden path' ile patlıyor ve classifyOpenError bunu 'permission' sayıyor; asıl bilgi (klasör yok) kayboluyor. Kasa ev klasörünün altındaysa hata zaten 'os error 3' gelir; sorun ev klasörü dışındaki kasada görünür. Var-yok denetimi arayüzün dosya eklentisiyle YAPILAMAZ (o da 'forbidden path' döner); Rust tarafında yapılmalı.
- RUST Loomen/src-tauri/src/lib.rs: saf yardımcı `fn kasa_yolu_durumu(path: &str) -> &'static str` ekle: std::fs::metadata(path) Ok ve is_dir → "dir"; Ok ama klasör değil → "not_dir"; Err kind NotFound → "missing"; Err kind PermissionDenied → "denied"; diğer → "unknown"; boş ya da göreli yol → "unknown". Üstüne `#[tauri::command] fn vault_path_state(path: String) -> String` yaz. DİKKAT: run() içinde vault_allow İKİ ayrı invoke_handler listesinde geçiyor (satır ~194 ve ~230); yeni komutu İKİSİNE de ekle. Komut yalnız okur, kapsama hiçbir şey eklemez; vault_allow ve dogrula_kasa_yolu'na DOKUNMA. Dosya sonundaki `mod tests` içine mevcut desenle üç test ekle: olmayan yol → missing, dosya → not_dir, gerçek klasör → dir. Yeni bağımlılık YOK.
- ARAYÜZ SARMALAYICI Loomen/src/core/bookmark.ts: allowVaultPath'in altına `export type VaultPathState = 'dir' | 'missing' | 'not_dir' | 'denied' | 'unknown'` ve `export async function vaultPathState(path: string): Promise<VaultPathState>` ekle: invoke('vault_path_state', { path }) çağırır; boş yol, tanınmayan değer ya da hata (tarayıcı/örnek kip dahil) → 'unknown'. allowVaultPath'in davranışını değiştirme.
- SAF KURAL Loomen/src/core/vault/openError.ts: `refineOpenErrorCode(code: OpenErrorCode, state: 'dir' | 'missing' | 'not_dir' | 'denied' | 'unknown'): OpenErrorCode` ekle (tür burada yerel tanımlansın; modül Tauri/React import etmemeye devam etsin). Kural: state 'missing' ya da 'not_dir' → 'missing'; state 'denied' → 'permission'; state 'dir' ve code 'missing' → 'unknown' (klasör yerinde, 'klasör bulunamadı' demek yanlış olur); state 'dir' ve diğer kodlar → code aynen; state 'unknown' → code aynen (Mac App Store kum havuzunda var-yok anlaşılamayabilir, eski davranış korunur). classifyOpenError'ın mevcut eşlemelerine dokunma.
- STORE Loomen/src/store/useAppStore.ts reopenVault: catch bloğunda hata kaydı yazılmadan önce `const state = await vaultPathState(target)` çağır ve kodu `refineOpenErrorCode(classifyOpenError(detail), state)` ile belirle. `target` try içinde tanımlıysa catch'ten görünecek şekilde try'ın üstüne al (başlangıç değeri `path`); yer imi çözülünce güncel yolu taşımaya devam etsin. Kayıttaki `path` alanı eskisi gibi kasanın kayıtlı yolu kalsın (şerit ve 'yeniden seç' ona bakıyor). console.error satırı ve recordOpenError kullanımı aynen kalsın; başarı yolu, vaultPath'in korunması ve NOTE_SAFETY davranışları DEĞİŞMEZ. Çeviri dosyalarına dokunma: errors.vaultMissing ve errors.vaultNoAccess metinleri LOM-23'te geliyor; yalnız var olduklarını ve tr metninin 'bulunamadı. Taşınmış ya da silinmiş olabilir' dediğini doğrula.
- BİRİM TESTİ Loomen/src/core/__test__/openErrorTest.ts (mevcut check/eq deseni): kartın durumu — classifyOpenError('forbidden path: C:\\LoomenTest\\Kasa') 'permission' verir, refineOpenErrorCode ile state 'missing' → 'missing' ve openErrorMessageKey → 'errors.vaultMissing'; state 'not_dir' → 'missing'; aynı hata state 'dir' → 'permission' (izin yalnız klasör varken); state 'denied' → 'permission'; code 'missing' + state 'dir' → 'unknown'; state 'unknown' üç kodu da aynen bırakır; code 'unknown' + state 'missing' → 'missing'.
- OTOMATİK DOĞRULAMA: `npm test` (bütün takımlar yeşil, openErrorTest dahil), `npx tsc --noEmit` çıktısız, `npm run build` başarılı, `cargo test` (Loomen/src-tauri içinde; yeni üç test dahil yeşil). Komut ve geçti/kaldı satırlarını rapora koy.
- CANLI DENEME (Excalibur, gerçek uygulamada Playwright/CDP; önce hafızadaki `excalibur-test-sirasi` kuralına uy): 1) Ev klasörünün DIŞINDA geçici bir klasör (ör. C:\\LoomenTest\\Kasa) kasa olarak açılır, uygulama kapatılır, klasörün adı değiştirilir (silme yerine geri alınabilir yol), uygulama açılır → `.lo-vaultbar` tek, metin 'bulunamadı' ve 'Taşınmış ya da silinmiş' içeriyor, 'İzin düşmüş' İÇERMİYOR. 2) Aynı deneme ev klasörünün altındaki bir kasayla → yine 'bulunamadı'. 3) Klasör eski adına döndürülüp uygulama açılır → şerit yok, notlar geliyor. 4) Yapılabiliyorsa klasör yerindeyken erişim icacls ile engellenir → şerit 'erişilemiyor. İzin düşmüş olabilir' der; sonra izin geri verilir. Yapılamazsa raporda açıkça 'denenmedi' yaz (birim testi bu kuralı kapsıyor).
- COMMIT: mesaj repo dilinde, AI imzası YOK, dal fix/LOM-24, push YOK. Sonuç raporu sade Türkçe: yapılanlar, test çıktısı, canlıda denenen ve denenmeyen kısımlar. Bilinen sınır olarak yaz: Mac App Store kum havuzunda izin düşmüşken klasörün var olup olmadığı anlaşılamayabilir; o durumda eski metin kalır.

## Dokunulan dosyalar

- `Loomen/src-tauri/src/lib.rs`
- `Loomen/src/core/bookmark.ts`
- `Loomen/src/core/vault/openError.ts`
- `Loomen/src/core/__test__/openErrorTest.ts`
- `Loomen/src/store/useAppStore.ts`

## Test

Testler geçti.

> Hızlı kontrol yeşil: tsc hatasız, npm test 9 dosyanın tümü geçti (openError testleri dahil 27 kontrol), npm run build tamam, cargo test 15 geçti 0 kaldı. Canlı test Excalibur'da gerçek uygulamada koşuldu (C:\TestDerleme\Loomen-lom24 derlemesi, CDP 9244). Makine yavaş: açılış ~50 sn, sayfa yüklemesi dakikalar sürdü; bu yüzden bekleme sürelerini uzattım. Sonuçlar: (A) ev dışı klasör yok → tek şerit

## Kanıt

- Dal: `fix/LOM-24`
- Commit: `Loomen@a664ababb16d24d88803d2c3b36b8d22c301a7d3`
- Test koşusu: `e806fdb0-2eed-487c-85df-d363899985e7` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

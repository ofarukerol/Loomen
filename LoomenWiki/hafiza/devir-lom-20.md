---
name: LOM-20 — Kasa yazılamazken kayıt hatası pencereleri üst üste birikiyor, metin teknik ve İngilizce
description: Otomatik kayıt (not, taslak boşaltma, çizim) hatalarında üst üste açılan yerel hata pencereleri yerine tek bir sabit uyarı şeridi gösterilecek; metin sade Türkçe olacak, teknik ayrıntı "Ayrıntılar" altında kalacak ve şerit ilk başarılı yazmada kendiliğinden kalkacak.
type: project
proje: loomen
kaynak: kart LOM-20 · dal fix/LOM-20 · Loomen@eceb80e8ef9c2e365bde1723d402b39696dbba50 · test koşusu d99b0dee-9a72-4230-8e01-eef442741b35 (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-09-27
---

# LOM-20 — Kasa yazılamazken kayıt hatası pencereleri üst üste birikiyor, metin teknik ve İngilizce

## Ne yapıldı

Otomatik kayıt (not, taslak boşaltma, çizim) hatalarında üst üste açılan yerel hata pencereleri yerine tek bir sabit uyarı şeridi gösterilecek; metin sade Türkçe olacak, teknik ayrıntı "Ayrıntılar" altında kalacak ve şerit ilk başarılı yazmada kendiliğinden kalkacak.

## Adımlar

- KÖK SEBEP (kod değişikliği yok, uygulayan bilsin): useAppStore.ts içinde saveNote (satır ~944), flushDraft (~653) ve saveDraw (~1478) her başarısız yazmada notifyError ile YERLİ bir hata penceresi (plugin-dialog message) açıyor. Çizimde döngü: Excalidraw onChange yalnız çizince değil, pencere odak alıp verince de ateşliyor; açılan hata penceresi odağı alıp geri verince yeni onChange → DrawScreen 700 ms sonra yeniden saveDraw → yine hata → yeni pencere. Pencere kendi kendini besliyor; 1,5 saatte 7-8 pencere bundan. Ayrıca detail metni Rust/plugin-fs'ten ham geliyor ('failed to open file … (os error 5)'). Çözüm: otomatik kayıt yollarında pencere YOK, tek sabit şerit; aynı hata sürerken yeniden bildirim yok; başarılı yazma şeridi temizler.
- YENİ SAF MODÜL Loomen/src/core/vault/writeError.ts (React/i18n/Tauri import etmez, node testinde koşacak): (a) type WriteErrorCode = 'permission' | 'diskFull' | 'missing' | 'unknown'. (b) classifyWriteError(raw: string): metni küçük harfe indirip sınıflandır — permission: 'permission denied', 'access is denied', 'forbidden path', 'not allowed', os error 5 (Windows ERROR_ACCESS_DENIED), os error 13 (EACCES); diskFull: 'no space left', 'not enough space', os error 28, os error 112; missing: 'no such file', 'cannot find the file', 'cannot find the path', os error 2, os error 3; kalanı unknown. 'os error N' değerini /\(os error (\d+)\)/ ile yakala. (c) errorDetail(e: unknown): Error ise message, değilse String(e); 300 karakterle kırp. (d) messageKeyFor(code): permission → 'errors.writePermission', diskFull → 'errors.writeDiskFull', missing → 'errors.writeMissing', unknown → null (şerit unknown için 'errors.writeVault' genel metnini kullanır). (e) type WriteErrorState = { code, detail, kind: 'note'|'draw', path, count, firstAt, lastAt, dismissed }. (f) recordWriteError(prev: WriteErrorState|null, next: {code, detail, kind, path}, now): prev yoksa ya da prev.code farklıysa yeni durum (count 1, firstAt=lastAt=now, dismissed false); aynı kodsa count+1, lastAt=now, detail/kind/path güncel, dismissed KORUNUR (kapatılan şerit aynı hata sürerken yeniden açılmaz).
- TEST Loomen/src/core/__test__/writeErrorTest.ts (mobileTest.ts'teki check/eq deseni, yeni bağımlılık YOK): sınıflandırma — 'failed to open file at path: C:/x/y.md.tmp with error: Access is denied. (os error 5)' → permission; 'Permission denied (os error 13)' → permission; 'forbidden path: /Users/x' → permission; 'No space left on device (os error 28)' → diskFull; 'There is not enough space on the disk. (os error 112)' → diskFull; 'No such file or directory (os error 2)' ve 'The system cannot find the path specified. (os error 3)' → missing; 'tuhaf bir şey' → unknown. errorDetail: Error, string, 300 kırpma. recordWriteError: ilk hata count 1 / dismissed false; aynı kod ikinci hata count 2 ve dismissed=true korunur; farklı kod count 1 ve dismissed false; firstAt sabit, lastAt güncel. messageKeyFor eşlemeleri ve unknown → null. Loomen/scripts/run-tests.mjs suites listesine ['src/core/__test__/writeErrorTest.ts', []] ekle.
- STORE Loomen/src/store/useAppStore.ts: (a) State'e writeError: WriteErrorState | null ekle (başlangıç null; partialize listesi açık sayım olduğu için kalıcı OLMAZ, oraya dokunma). (b) Modül seviyesinde let lastFailedWrite: { kind: 'note'|'draw'; path: string; content: string } | null = null. (c) Yardımcı reportWriteError(kind, path, content, e): console.error ile ham hatayı logla, lastFailedWrite'ı ayarla, set({ writeError: recordWriteError(get().writeError, { code: classifyWriteError(detail), detail, kind, path }, Date.now()) }). Pencere AÇMAZ. (d) Yardımcı clearWriteError(): writeError doluysa null'a çek, lastFailedWrite=null. (e) saveNote catch → reportWriteError('note', s.activeNote, s.draft, e); başarılı yazmadan hemen sonra clearWriteError(). (f) flushDraft catch → reportWriteError('note', p, text, e) ve false dönmeye DEVAM (reopenVault'taki vaultSwitchAborted penceresi kalır: kullanıcı eylemi); başarıda clearWriteError(). (g) saveDraw: varlık kontrolünden sonra 'if (json === get().noteContents[target]) return;' (gereksiz yazma yok, NOTE_SAFETY_RULES kural 5 ile aynı); catch → reportWriteError('draw', target, json, e); başarıda clearWriteError(). (h) Aksiyonlar: dismissWriteError() → writeError varsa dismissed=true; retryWrite() → lastFailedWrite.kind 'note' ise get().saveNote(), 'draw' ise get().saveDraw(content, path), yoksa hiçbir şey. (i) reopenVault'ta isSwitch dalındaki set({ draft: '', draftPath: null, ... }) yamasına writeError: null ekle ve lastFailedWrite = null (eski kasanın hatası yeni kasada görünmesin). (j) errText(e) gövdesi: detail = errorDetail(e); key = messageKeyFor(classifyWriteError(detail)); key varsa `${i18n.t(key)} (${detail})`, yoksa detail — böylece kalan pencereler (yeniden adlandırma, silme, görev, kasa oluşturma) de önce sade Türkçe, teknik ayrıntı parantezde. vaultOpenFailed satırındaki reason olduğu gibi kalır. NOTE_SAFETY davranışlarına (sahipsiz taslak, hedef doğrulama, geri dönüş değerleri) DOKUNMA.
- ŞERİT Loomen/src/components/WriteErrorBar.tsx (yeni): writeError null ya da dismissed ise null döndür. Aksi halde <div className="lo-writebar" role="alert">: AlertTriangle (lucide, repoda zaten kullanılıyor) ikonu; ana metin t(messageKeyFor(code) ?? 'errors.writeVault'); ikinci satır t('writeBar.notSaved', { n: count }); düğmeler: 'Yeniden dene' (retryWrite), 'Ayrıntılar' (yerel useState ile aç/kapa; açıkken <code> içinde ham detail), 'Kapat' (X ikonu, aria-label t('writeBar.dismiss'), dismissWriteError). Loomen/src/App.tsx: .lo-maincol içinde TopBar/MobileTopBar'dan SONRA, .lo-main'den ÖNCE <WriteErrorBar /> mount et (masaüstü ve mobilde her ekranda görünür). Loomen/src/styles/app.css: .lo-writebar (display:flex; align-items:center; gap; flex-shrink:0; padding 8px 12px; font-size 13px; border-bottom 1px solid var(--line); sol/başlangıç kenarında 3px var(--danger) şerit; arka plan tokens.css'te varsa --danger-soft, yoksa color-mix(in srgb, var(--danger) 12%, var(--bg))), .lo-writebar__text (flex:1; min-width:0), .lo-writebar__btn (mevcut .lo-topbar__toggle tarzında sade düğme), .lo-writebar__detail (monospace, font-size 12px, word-break: break-all, color var(--fg3)). RTL için margin-inline / border-inline-start kullan; mobilde düğmeler sığmazsa flex-wrap.
- ÇEVİRİ tr kaynak, en ve ar birebir aynı anahtar ve {{yer tutucu}}: errors.writeVault: 'Kasa klasörüne yazılamıyor — izinleri ya da diski kontrol edin.'; errors.writePermission: 'Kasa klasörüne yazma izni yok — klasörün izinlerini kontrol edin.'; errors.writeDiskFull: 'Diskte yer kalmadı; notlar kaydedilemiyor. Yer açıp yeniden deneyin.'; errors.writeMissing: 'Kasa klasörü bulunamıyor; taşınmış ya da silinmiş olabilir. Ayarlar → Kasa bölümünden yeniden seçin.'; writeBar.notSaved: 'Son değişiklikler kaydedilmedi · {{n}} deneme'; writeBar.retry: 'Yeniden dene'; writeBar.details: 'Ayrıntılar'; writeBar.dismiss: 'Kapat'. errors.saveNote ve errors.saveDraw artık hiçbir yerde kullanılmıyorsa (grep ile doğrula) üç dosyadan sil — kullanılmayan anahtar bırakma (LOM-2'deki kural).
- DOĞRULAMA: npm test (writeErrorTest dahil tüm takımlar yeşil), npx tsc --noEmit çıktısız, npm run build başarılı. Üç çeviri dosyasının anahtar kümesi ve {{yer tutucu}} kümesi birebir aynı mı: küçük bir node tek-satırlık karşılaştırmayla kontrol et, çıktıyı rapora koy. Kod üzerinden gözden geçir: otomatik kayıt yollarında (saveNote, flushDraft, saveDraw) artık notifyError çağrısı KALMADI, kullanıcı eylemi pencereleri (rename/delete/task/createVault/vaultSwitchAborted/vaultOpenFailed) yerinde.
- CANLI DENEME (paketli ya da tauri dev uygulamada, insan yapar; raporda 'denenmedi' diye açıkça yaz): kasa klasörünü salt okunur yap (macOS: chmod -w, Windows: klasör izinlerinden yazmayı kaldır); bir notta yaz ve bir çizimde çiz → TEK şerit çıkmalı, 2 dk boyunca hiç pencere açılmamalı, 'Ayrıntılar' ham 'os error' metnini göstermeli, sayaç artmalı; izni geri ver → sonraki otomatik kayıtta şerit kendiliğinden kalkmalı; 'Kapat' sonrası aynı hata sürerken şerit dönmemeli, izin düzelip yeniden bozulunca geri gelmeli; not/çizim yeniden adlandırma gibi kullanıcı eylemlerinde pencere hâlâ çıkmalı ama önce Türkçe cümle, parantezde teknik ayrıntı.
- COMMIT: mesaj repo dilinde, AI imzası YOK, dal fix/LOM-20, push YOK. Sonuç raporu sade Türkçe: yapılanlar, test çıktısı (komut + geçti/kaldı satırı), canlı denenmeyen kısımlar, kapsam dışı bırakılan gözlem: closeTab bekleyen taslağı flushDraft sonucuna bakmadan temizliyor; disk yazılamazken sekme kapatınca taslak kaybolabilir (LOM-20 kapsamı dışı, ayrı kart).

## Dokunulan dosyalar

- `Loomen/src/core/vault/writeError.ts`
- `Loomen/src/core/__test__/writeErrorTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/components/WriteErrorBar.tsx`
- `Loomen/src/App.tsx`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`

## Test

Testler geçti.

> npm test: 7 test dosyasının hepsi geçti (writeErrorTest 27/27, çekirdek 159/159, 35/35 vb.). npx tsc --noEmit çıkış 0. npm run build başarılı (✓ built in 7.93s, yalnız dosya boyutu uyarısı). Çeviri anahtarları tr/en/ar'da 626'şar, eksik/fazla 0. Otomatik kayıtta (not, taslak, çizim) hata penceresi yerine şerit kullanılıyor; DrawScreen'de pencere çağrısı kalmadı. Kullanıcı eylemlerindeki pencereler

## Kanıt

- Dal: `fix/LOM-20`
- Commit: `Loomen@eceb80e8ef9c2e365bde1723d402b39696dbba50`
- Test koşusu: `d99b0dee-9a72-4230-8e01-eef442741b35` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

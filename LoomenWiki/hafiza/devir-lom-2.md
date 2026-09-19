---
name: LOM-2 — Genel Test
description: Mağazaya göndermeden önce uygulamanın tamamı kod üzerinden denetlendi; veri kaybı, tarih/sayaç, çeviri ve paketleme tarafında bulunan hatalar düzeltilecek, çekirdek mantık için otomatik testler eklenecek ve elle denenmesi gerekenler raporlanacak.
type: project
proje: loomen
kaynak: kart LOM-2 · dal fix/LOM-2 · Loomen@715bcd24cf2aa1eecf670999019f42b386e59739 · test koşusu 7d695e36-6cee-4f70-b942-366429a1ca54 (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-09-19
---

# LOM-2 — Genel Test

## Ne yapıldı

Mağazaya göndermeden önce uygulamanın tamamı kod üzerinden denetlendi; veri kaybı, tarih/sayaç, çeviri ve paketleme tarafında bulunan hatalar düzeltilecek, çekirdek mantık için otomatik testler eklenecek ve elle denenmesi gerekenler raporlanacak.

## Adımlar

- ÖN KONTROL: fix/LOM-2 dalında LOM-1 işi var mı bak (src/screens/Editor/tableModel.ts ve src/core/__test__/editorTest.ts var mı). Varsa not değiştirirken/pencere arka plana geçerken taslak kaydı zaten yapılmıştır; tekrar yazma, yalnız doğrula. Yoksa (LOM-1 henüz main'e girmedi) useAppStore.ts ve EditorScreen.tsx'te LOM-1 ile aynı satırlara dokunurken değişikliği küçük tut ve raporda 'LOM-1 ile birleştirirken çakışabilir' diye belirt.
- ÇEKİRDEK 1 (kasa hiç açılmıyor): taskParser.ts matchDate geçersiz tarihi (📅 2026-02-30, 2026-13-01) kabul ediyor; grouping.ts'te format() hata fırlatıp bütün kasanın yüklenmesini durduruyor. Geçersiz tarihi 'tarihsiz' say.
- ÇEKİRDEK 2: taskParser görev satırı regex'i CRLF (Windows) dosyalarda hiç görev bulmuyor → satır sonunda \r'yi tolere et ve yazarken koru. Etiket ayıklama 'https://site/p#bolum' ve 'Issue #123' gibi metinleri bozuyor → etiket yalnız satır başı/boşluktan sonra ve harfle başlıyorsa etiket sayılsın (links.ts ile aynı kural). applyTaskPatch/toggleTaskInContent yazmadan önce lines[line] === task.raw doğrulasın; tutmuyorsa değişiklik yapmadan null dönsün.
- ÇEKİRDEK 3: search.ts Türkçe küçültme 'I'→'ı' yaptığı için 'inbox' araması 'Inbox'u bulamıyor → ortak fold: normalize('NFC') + toLocaleLowerCase('tr') + ı→i, hem sorguya hem metne. links.ts'e tek resolveLink/normalizeLinkTarget ekle: '#başlık' ve '|takma ad' kısmını at, NFC uygula, '![[...]]' gömülerini bağlantı sayma; ayrıca rewriteWikiLinks(content, eskiAd, yeniAd) saf fonksiyonu yaz ([[Eski]], [[Eski|..]], [[Eski#..]]). BacklinksPanel.tsx yeni çözümleyiciyi kullansın.
- ÇEKİRDEK 4: google.ts addDaysISO toISOString yüzünden Türkiye saatinde +1 günü aynı gün döndürüyor (tüm günlük etkinlik başlangıç=bitiş) → yerel bileşenlerle/date-fns format ile yaz. tauriBackend.ts: '..' içeren ve mutlak yolları reddet; writeNote önce 'x.md.tmp'ye yazıp sonra rename ile yerine koysun (yarım dosya kalmasın), tmp dosyaları listelemede görünmesin.
- ÇEKİRDEK TEST: mevcut desenle (esbuild + node, bkz. src/core/__test__/srsTest.ts başlığı) src/core/__test__/coreTest.ts yaz: görev satırı gidiş-dönüş (boş yama → satır aynı kalır), URL'de #, 'Issue #123', CRLF, geçersiz tarih, satır kaymışken yama reddi, arama (inbox/Inbox, IŞIK/ışık, İstanbul/istanbul), bağlantı çözümü (takma ad, #başlık, NFD/NFC, gömü hariç), rewriteWikiLinks, addDaysISO, çöp adı kodlama gidiş-dönüşü (Türkçe yol, '../'), migrateDailyContent ikinci çağrıda null, sampleBackend ile çöpe at → geri yükle içerik aynı. Yeni bağımlılık KURMA.
- DEPO (useAppStore.ts) 1 — veri kaybı: (a) kasa değiştirirken (reopenVault) önce bekleyen taslağı yaz, backend'i değiştirirken activeNote/draftPath/draft'ı aynı anda sıfırla; reopenVault'u tek seferde çalışacak şekilde sırala (açılışta iki kez paralel çağrılıyor, izleyici sızıyor); loadFromBackend'e 'backend değiştiyse sonucu atla' koruması koy. (b) görev işaretleme/dış değişiklik/git çekme sonrası açık notun taslağı temizse yeni içerikle güncellensin ki sonraki otomatik kayıt değişikliği geri almasın. (c) saveNote hatasını yutma: try/catch + notifyError. (d) LOM-1 dalda yoksa: openNote/setActiveTab/closeTab başında ve pencere kapanırken/visibilitychange'de bekleyen taslağı yaz.
- DEPO 2 — yeniden adlandırma: renameNote/renameFolder hedefi diskte backend.exists ile kontrol etsin (macOS harf duyarsız; yalnız harf değişimi hariç doluysa iptal + uyarı); renameNote diğer notlardaki [[EskiAd]] bağlantılarını rewriteWikiLinks ile güncellesin, pinnedTabs/favorites/taskOrder/sekmeler yeni yola taşınsın. openNote'taki günlük not dönüştürmesi yalnız 'Günlük/' altındaki dosyalara uygulansın ve içeriği diskten okusun. changeVaultPath yeni klasör için yer imi üretsin; resolveBookmark'tan dönen güncel yol (r.path) kullanılıp kayıtlı kasa yolu güncellensin.
- DEPO 3 — sayaç ve gün: Pomodoro/mola sayacı saniye saymak yerine bitiş zamanını (pomoEndsAt) saklasın, tick'te kalan = bitiş − şimdi; pomoEndsAt, pomoCompleted ve mola alanları kalıcı olsun, açılışta kalan süre yeniden hesaplansın (süre geçmişse temiz sıfırla). App.tsx: visibilitychange + dakikalık kontrolle tarih değiştiyse loadFromBackend çağır (gece yarısından sonra 'Bugün/Geciken' güncellensin). Persist'e merge koruması: vaults/editorSettings gibi alanlar yanlış tipteyse varsayılanı kullan.
- DEPO 4 — küçükler: addTask metni okur okumaz quickText'i temizlesin (çift Enter aynı görevi iki kez yazıyor). Asistan geçmişinden boş içerikli cevapları ve hatalı turun soru mesajını çıkar. core/ai/context.ts sistem istemine 'kullanıcının sorusunun dilinde cevap ver' ekle. DrawScreen.tsx: kaydedilecek çizim yolunu zamanlayıcı kurulurken yakala, ekran kapanırken/çizim değişirken bekleyen kaydı yaz.
- EKRAN + ÇEVİRİ: gömülü Türkçe metinleri anahtara taşı (tr kaynak, en ve ar'a da ekle, yer tutucu kullan, cümle birleştirme): relativeDate.ts (ayrıca 28 günden büyük her fark 'bir ay' çıkıyor → hafta/ay/yıl kademesi), grouping.ts grup etiketleri ve gün başlığı (aktif dil yerel ayarı), DatePicker.tsx gün/ay adları + ok butonlarına aria-label, ReportsScreen.tsx gün etiketleri ve '3s 20dk', fsrs.ts humanInterval birimleri, ReviewScreen.tsx 'dk', TaskRow.tsx:24, tableWidget.ts:255 (LOM-1 dalda değilse tableWidget'a dokunma, raporla). TasksAgenda.tsx:20 sabit '2026' → içinde bulunulan yıl. Kullanılmayan anahtarları (planner.today, calendar.month, pomodoro.currentTask, pomodoro.focusOn, ribbon.rtl) üç dosyadan sil.
- EKRAN HATALARI: ReviewScreen deste sayısı etiket süzgecini hesaba katmıyor → core/srs/queue.ts'e cardsForDeck yardımcıyı koy, ekranda onu kullan (Başla aktif ama kuyruk boş hatası). ReviewSession tuş işleyicisi: e.repeat / Cmd / Ctrl / Alt ise yok say. QuickAdd ve AssistantScreen: isComposing kontrolü; mobilde Enter göndermesin (çok satır yazılabilsin). Timeline: görev yokken t('planner.allClear') göster. GraphScreen: pointercancel'ı bırakma işleyicisine bağla, iptal edilen dokunuş not açmasın; mobilde ipucu metni tekerlek demesin.
- MAĞAZA PAKETİ 1 (Mac App Store'da kasa yeniden açılmıyor): dosya izinleri yalnız $HOME/** kapsamında; sandbox'ta kullanıcı klasörü yeniden başlatınca reddedilir. Yeni bağımlılık kurmadan macos_bookmark.rs/lib.rs içinde yer imi çözülünce (ve yeni kasa seçilince) tauri_plugin_fs FsExt ile app.fs_scope().allow_directory(yol, true) çağır; Windows/Linux için de kayıtlı kasa yolunu açılışta kapsamın içine alan bir komut ekle. expect("ACTIVE") ve expect("reqwest client") çağrılarını hata döndürecek biçime çevir.
- MAĞAZA PAKETİ 2: scripts/mas-build.sh — Installer sertifikası kontrolünden '-p codesigning' kaldır; yükleme adımından notarytool'u çıkar, doğrudan 'xcrun altool --upload-package/--upload-app -t macos' kullan ve .p8 dosyasının ~/.appstoreconnect/private_keys/ altında beklendiğini yaz; başarısızlıkta 'Bitti' yazmasın. release.yml: 'permissions: contents: write' ekle ve derleme adımına VITE_* değerlerini repo sırlarından okuyan env bloğu koy (sır değeri YAZMA). tauri.conf.json minimumSystemVersion 11.0; kullanılmayan loomen:// şemasını yalnız gerçekten kullanılmıyorsa kaldır (OAuth akışını grep'le doğrula). AndroidManifest: LEANBACK_LAUNCHER/TV girdilerini kaldır. src-tauri/gen/apple altına PrivacyInfo.xcprivacy ekle ve project.yml kaynaklarına yaz.
- DOKUNMA, RAPORLA (insan işi ya da canlı deneme ister): içerik güvenlik politikası (csp: null) — çizim/graf ekranlarını bozabileceği için yalnız öneri olarak yaz; GitHub ve Google oturum bilgilerinin düz metin saklanması (anahtar kasasına taşıma ayrı iş); Google istemci sırrının pakete gömülmesi; Android Google giriş şeması yer tutucu (gerçek istemci kimliği + SHA-1 gerekli); Google 'doğrulanmamış uygulama' ekranı (OAuth doğrulaması); Android imza dosyası ~/.loomen/keystore.properties; mobilde AI anahtarlarının düz dosyada durması; Pomodoro bitiş bildirimi (yeni eklenti = bağımlılık onayı ister).
- DOĞRULAMA: bütün node testlerini koş (vaultTest, aiTest, srsTest, coreTest, varsa editorTest), 'npx tsc --noEmit', 'npm run build' ve src-tauri içinde 'cargo check' temiz geçsin; üç çeviri dosyasının anahtar kümeleri ve {{yer tutucu}}ları birebir aynı mı kontrol et. Commit mesajı repo dilinde, AI imzası yok; push YOK, dal fix/LOM-2.
- SONUÇ RAPORU (sade Türkçe): düzeltilenler, test çıktısı, dokunulmayıp bırakılanlar ve nedenleri; elle deneme listesi: hızlı not/sekme/kasa değiştirip son yazılanın kaldığını gör, notu yeniden adlandırıp bağlantıların güncellendiğini gör, Pomodoro'yu başlatıp uygulamayı arka plana al/kapat-aç, dili İngilizce ve Arapça yapıp planlayıcı-tarih seçici-raporlar-tekrar ekranlarında Türkçe kalan yer var mı bak, paketli Mac uygulamasında kasayı seçip uygulamayı kapat-aç, mobilde graf ve asistan.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/taskParser.ts`
- `Loomen/src/core/markdown/links.ts`
- `Loomen/src/core/search/search.ts`
- `Loomen/src/core/google.ts`
- `Loomen/src/core/vault/tauriBackend.ts`
- `Loomen/src/core/vault/trash.ts`
- `Loomen/src/screens/Editor/BacklinksPanel.tsx`
- `Loomen/src/core/__test__/coreTest.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/App.tsx`
- `Loomen/src/screens/Editor/EditorScreen.tsx`
- `Loomen/src/screens/Draw/DrawScreen.tsx`
- `Loomen/src/core/ai/context.ts`
- `Loomen/src/core/bookmark.ts`
- `Loomen/src/lib/relativeDate.ts`
- `Loomen/src/core/vault/grouping.ts`
- `Loomen/src/core/srs/fsrs.ts`
- `Loomen/src/core/srs/queue.ts`
- `Loomen/src/screens/Planner/DatePicker.tsx`
- `Loomen/src/screens/Planner/TasksAgenda.tsx`
- `Loomen/src/screens/Planner/Timeline.tsx`
- `Loomen/src/screens/Planner/QuickAdd.tsx`
- `Loomen/src/screens/Planner/TaskRow.tsx`
- `Loomen/src/screens/Reports/ReportsScreen.tsx`
- `Loomen/src/screens/Review/ReviewScreen.tsx`
- `Loomen/src/screens/Review/ReviewSession.tsx`
- `Loomen/src/screens/Assistant/AssistantScreen.tsx`
- `Loomen/src/screens/Graph/GraphScreen.tsx`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src-tauri/src/lib.rs`
- `Loomen/src-tauri/src/macos_bookmark.rs`
- `Loomen/src-tauri/src/google.rs`
- `Loomen/src-tauri/src/github.rs`
- `Loomen/src-tauri/src/github_api.rs`
- `Loomen/src-tauri/src/ai/llm.rs`
- `Loomen/src-tauri/tauri.conf.json`
- `Loomen/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- `Loomen/src-tauri/gen/apple/project.yml`
- `Loomen/src-tauri/gen/apple/PrivacyInfo.xcprivacy`
- `Loomen/scripts/mas-build.sh`
- `Loomen/.github/workflows/release.yml`

## Test

Testler geçti.

> Dört doğrulama kapısının tamamı temiz: coreTest 93/93, vaultTest 18/18, `npx tsc --noEmit` çıkış 0, `npm run build` çıkış 0, src-tauri'de `cargo check` çıkış 0 ve uyarısız. Ek olarak tr/en/ar çeviri dosyalarının anahtar kümesini ve {{yer tutucu}}larını betikle karşılaştırdım — 375 anahtar, üçünde birebir aynı; `bash -n scripts/mas-build.sh` temiz. Nokta doğrulamaları tuttu: Rust'ta `.expect("` kal

## Kanıt

- Dal: `fix/LOM-2`
- Commit: `Loomen@715bcd24cf2aa1eecf670999019f42b386e59739`
- Test koşusu: `7d695e36-6cee-4f70-b942-366429a1ca54` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

# 05 — Acceptance Criteria (Kabul Kriterleri / Definition of Done)

> **Rol:** Senior QA Engineer
> **Soru:** "Bir özellik ne zaman gerçekten 'bitti' sayılır?"
> **Önceki:** [`04-tech-stack.md`](04-tech-stack.md) · **Sonraki:** [`06-planlayici-pomodoro.md`](06-planlayici-pomodoro.md)

Bu doküman geliştirme sırasında **rehber**, test sırasında **checklist** olarak kullanılır.
Her MVP özelliği için: **Functional**, **Cross-Platform Consistency**, **Non-Functional**, **Edge Cases**.
Kriterler `01`'deki `FR/NFR` kodlarına bağlanır. Format: Given/When/Then.

> Onay kutusu `[ ]` = test edilecek madde.

---

## 1. Vault & Dosya Yönetimi (FR-1..4)

**Functional**
- [ ] Given uygulama ilk açılışta, When kullanıcı bir klasör seçer, Then o klasör vault olur ve ağaç görünür.
- [ ] Given vault açık, When yeni not/klasör oluşturulur, Then ağaçta **anında** belirir ve diskte dosya oluşur.
- [ ] Given bir dosya, When yeniden adlandırılır/taşınır, Then ona gelen `[[wiki-link]]`'ler kırılmaz (güncellenir veya uyarılır).
- [ ] Given bir dosya silinir, When onaylanır, Then dosya `.trash`'e taşınır (kalıcı kaybolmaz) ve geri alınabilir.

**Cross-Platform Consistency**
- [ ] Masaüstünde oluşturulan dosya, 3. parti sync sonrası mobilde aynı ağaç konumunda görünür.
- [ ] Aynı vault hem masaüstü hem mobilde aynı klasör yapısıyla açılır.

**Non-Functional**
- [ ] 1.000+ notluk vault açılışı < 3 sn (NFR-1).
- [ ] Kaydetme atomik: kaydederken çökme dosyayı bozmaz (NFR-5).

**Edge Cases**
- [ ] Uygulama açıkken dosya diskte harici değişirse, ağaç/önizleme watcher ile güncellenir (NFR-10).
- [ ] Vault klasörü taşınır/silinirse, uygulama çökmek yerine "vault bulunamadı" akışı sunar.
- [ ] Salt-okunur dizinde yazma denenirse anlamlı hata (sessiz kayıp yok).

---

## 2. Editör & Live Preview (FR-5,6)

**Functional**
- [ ] Given bir not açık, When kullanıcı markdown yazar, Then başlık/kalın/liste/kod/tablo/görev kutusu doğru render olur.
- [ ] Given live preview açık, When imleç bir satıra gelir, Then o satır ham markdown, diğerleri render gösterir.
- [ ] Given değişiklik yapıldı, When kısa süre geçer / kaydet, Then içerik diske yazılır (kayıp yok).

**Cross-Platform Consistency**
- [ ] Aynı not masaüstü ve mobilde **aynı** render sonucunu verir.

**Non-Functional**
- [ ] Tuş vuruşu → ekrana yansıma algılanan gecikme < 100 ms (NFR-2).

**Edge Cases**
- [ ] Çok büyük not (örn. 10.000+ satır) editörde donmadan açılır (gerekirse aşamalı).
- [ ] Bozuk/eksik frontmatter not açılmayı engellemez; içerik yine düzenlenebilir.

---

## 3. Wiki-Link & Backlink (FR-9,10,11)

**Functional**
- [ ] Given `[[` yazılır, When kullanıcı yazmaya devam eder, Then not adı otomatik tamamlanır.
- [ ] Given bir link tıklanır, When hedef varsa açılır; **yoksa** o adla yeni not oluşturup açar.
- [ ] Given B notu A'ya link veriyor, When A açılır, Then backlink panelinde B listelenir.

**Cross-Platform Consistency**
- [ ] Masaüstünde eklenen bir link, sync sonrası mobilde backlink olarak görünür.

**Non-Functional**
- [ ] Backlink paneli 1.000 notluk vault'ta < 300 ms hesaplanır.

**Edge Cases**
- [ ] Aynı ada sahip iki not olduğunda link belirsizliği kullanıcıya net gösterilir.
- [ ] Hedef not silinince link "kırık" olarak işaretlenir, uygulama çökmez.

---

## 4. Arama & Hızlı Açıcı (FR-14,15)

**Functional**
- [ ] Given arama kutusu, When metin girilir, Then dosya adı + içerik eşleşmeleri listelenir, tıkla-aç çalışır.
- [ ] Given hızlı açıcı (kısayol), When dosya adı yazılır, Then bulanık (fuzzy) eşleşme ile not açılır.

**Cross-Platform Consistency**
- [ ] Arama sonuçları masaüstü ve mobilde aynı sıralama/sonuç verir.

**Non-Functional**
- [ ] 1.000+ not içinde arama sonucu < 500 ms (NFR-3).

**Edge Cases**
- [ ] Türkçe karakter (ç, ş, ı, ğ) ve büyük/küçük harf duyarsız arama doğru çalışır.
- [ ] Yeni eklenen not, indekslendikten hemen sonra aramada çıkar.

---

## 5. Görev Motoru (FR-16,17,18)

**Functional**
- [ ] Given bir notta `- [ ]` görev, When kutu tıklanır, Then `- [x]` olur ve `✅ <bugün>` tarihi yazılır, **dosya güncellenir**.
- [ ] Given görevde `📅 2026-06-20` gibi tarihler, When parse edilir, Then due/scheduled/start doğru ayrışır.
- [ ] Given vault genelinde görevler, When toplanır, Then planlayıcı/takvim bunları tek kaynaktan görür.

**Cross-Platform Consistency**
- [ ] Mobilde tamamlanan görev, sync sonrası masaüstünde tamamlanmış görünür (aynı satır).

**Non-Functional**
- [ ] Görev satırı round-trip **kayıpsız**: parse→serialize sonrası dosya farkı yalnız amaçlanan değişikliktir (NFR-9).

**Edge Cases**
- [ ] Tanınmayan/ekstra emoji içeren görev satırı bozulmadan korunur (bilinmeyen alanlar saklanır).
- [ ] Aynı anda iki cihazda aynı görev değişirse, dosya-düzeyi çakışma `03 §7`'deki gibi ele alınır (sessiz ezme yok).

---

## 6. Planlayıcı / Timeline (FR-19..22)  ·  *detay [`06`](06-planlayici-pomodoro.md)*

**Functional**
- [ ] Given görevler, When planlayıcı açılır, Then tarihe göre gruplu dikey timeline (geçmiş+gelecek) gösterilir.
- [ ] Given bir görev satırı, Then **göreli tarih** ("bir gün önce", "6 gün sonra"), kaynak-not linki ve etiket görünür.
- [ ] Given "Focus On Today" bölümü, Then **Todo / Overdue / Unplanned** sayaçları doğru ve **canlı** güncellenir.
- [ ] Given Inbox kutusu, When tek satır görev girilip onaylanır, Then görev doğru dosyaya yazılır ve timeline'da anında belirir.

**Cross-Platform Consistency**
- [ ] Aynı timeline masaüstü ve mobilde aynı gruplama/sayaçları gösterir.
- [ ] Masaüstünde Inbox'a eklenen görev, sync sonrası mobil timeline'da görünür.

**Non-Functional**
- [ ] Görev değişince (tamamla/ekle) sayaçlar < 200 ms içinde güncellenir.

**Edge Cases**
- [ ] Tarihsiz görevler "Unplanned" sayacına düşer, timeline'da uygun bölümde gösterilir.
- [ ] Geçmiş tarihli açık görevler "Overdue" sayılır.
- [ ] Gün/ay/yıl sınırlarında göreli tarih ("bir ay sonra") doğru hesaplanır (date-fns, tr-TR).

---

## 7. Takvim (FR-23..25)  ·  *detay [`06`](06-planlayici-pomodoro.md)*

**Functional**
- [ ] Given aylık takvim, Then görev/not içeren günler işaretli görünür.
- [ ] Given bir güne tıklanır, When o günün daily note'u yoksa oluşturulur, Then açılır ve o güne ait görevler listelenir.
- [ ] Given timeline'da bir görev tarihlenir, Then takvimde de aynı gün yansır (FR-25 tutarlılık).

**Cross-Platform Consistency**
- [ ] Takvim aynı ayı/işaretleri masaüstü ve mobilde aynı gösterir.

**Non-Functional**
- [ ] Ay değiştirme (ileri/geri) < 150 ms.

**Edge Cases**
- [ ] Hafta başlangıcı/locale (Pazartesi, tr-TR) doğru.
- [ ] Aynı güne ait birden çok daily note adlandırma çakışması zarifçe ele alınır.

---

## 8. Pomodoro (FR-26..29)  ·  *detay [`06`](06-planlayici-pomodoro.md)*

**Functional**
- [ ] Given Pomodoro, When başlatılır, Then çalışma/kısa-mola/uzun-mola döngüsü ayarlı sürelerle ilerler.
- [ ] Given bir görev seçili, When oturum tamamlanır, Then oturum o görevle ilişkilenir ve sayısı artar.
- [ ] Given oturum biter, Then özet daily note'a/loga yazılır ve **yerel bildirim** gelir.

**Cross-Platform Consistency**
- [ ] Pomodoro ayarları (süreler) masaüstü ve mobilde aynı davranır.
- [ ] Tamamlanan oturum logu sync sonrası diğer cihazda görünür (daily note üzerinden).

**Non-Functional**
- [ ] Timer doğruluğu: 25 dk oturum gerçek süreye ±1 sn.
- [ ] **Mobilde arka plan:** uygulama arka plandayken/uykudayken oturum bitişi doğru hesaplanır ve
      bildirim zamanında gelir (bitiş zaman damgası tabanlı — `03 §6`).

**Edge Cases**
- [ ] Oturum ortasında uygulama kapanıp açılırsa durum kurtarılır veya temiz şekilde sıfırlanır (veri kaybı/yanlış log yok).
- [ ] Bildirim izni reddedilmişse timer yine çalışır; kullanıcı görsel olarak bilgilendirilir.

---

## 9. Graph View (FR-12)

**Functional**
- [ ] Given vault, When graph açılır, Then notlar düğüm, `[[link]]`'ler kenar olarak görselleşir; düğüme tıklayınca not açılır.

**Cross-Platform Consistency**
- [ ] Masaüstü tam etkileşimli; **mobilde** sınırlı/salt-görüntüleme kabul edilir (`02 §5`).

**Non-Functional**
- [ ] 1.000 düğüme kadar akıcı pan/zoom; üzerinde aşamalı yükleme/uyarı (NFR-4).

**Edge Cases**
- [ ] Bağlantısız (yetim) notlar graph'ta ayrı gösterilir, çökmeye yol açmaz.
- [ ] Mobilde büyük graph pil/ısınma koruması için düğüm sınırı uygular.

---

## 10. Genel: Tema, i18n, Ayarlar (FR-30,32,33)

**Functional**
- [ ] Açık/koyu tema anında değişir ve tüm görünümlere uygulanır.
- [ ] Dil **TR↔EN↔AR** değişince **tüm** UI metinleri uygulama yeniden başlamadan çevrilir (hardcoded string yok).
- [ ] **Arapça seçilince layout `dir="rtl"`'ye geçer**; paneller/ikonlar/akış aynalanır, bozulma yok.
- [ ] Çoğul ifadeler her dilde doğru (ICU): "1 görev / 5 görev"; Arapça çoğul biçimleri doğru seçilir.
- [ ] Ayarlar: vault yolu, Pomodoro süreleri, tema, dil, daily note klasörü/şablonu kaydedilir ve kalıcıdır.

**Cross-Platform Consistency**
- [ ] Tema ve dil tercihi her platformda aynı davranır; RTL masaüstü + mobilde tutarlı.

**Non-Functional**
- [ ] Tarih/saat ve sayı biçimleri seçilen locale'e duyarlı (Intl/date-fns) (NFR-13).
- [ ] **Çeviri eksiksizliği:** TR'deki her anahtarın EN/AR karşılığı vardır; eksikse TR'ye fallback (kırık metin yok).
- [ ] Yeni dil eklemek **kod değişikliği gerektirmez** (yalnız locale + çeviri) → 20 dile ölçek (`07`).

**Edge Cases**
- [ ] Ayar dosyası bozuksa varsayılanlara güvenli düşüş (uygulama açılır).
- [ ] Türkçe içine gömülü Arapça metin (veya tersi) bidi izolasyonuyla doğru yön gösterir.
- [ ] Çevirisi henüz yapılmamış bir anahtar prod'da TR fallback ile görünür (boş/anahtar-adı görünmez).

---

## 11. Genel Non-Functional & Güvenlik (DoD geneli)

- [ ] **Ağ yok:** uygulama hiçbir uzak uca istek atmaz; ağ izinleri kapalı (NFR-8).
- [ ] **Veri sahipliği:** tüm veri vault'ta düz dosyalarda; uygulama silinse veri kalır (NFR-9).
- [ ] **İndeks dayanıklılığı:** `index.sqlite` silinip uygulama açılınca dosyalardan yeniden kurulur (NFR-7).
- [ ] **Reindex:** kullanıcı manuel "yeniden indeksle" tetikleyebilir.
- [ ] Mobil temel akışlar tek elle erişilebilir; dokunma hedefleri yeterli (NFR-11).

---

## 12. "MVP Bitti" (Definition of Done) — üst düzey

MVP, ancak şunların **hepsi** işaretlendiğinde tamamlanmış sayılır:
- [ ] Bölüm 1–8 ve 10–11'deki tüm **Functional** + **Non-Functional** kriterler masaüstünde geçer.
- [ ] Bölüm 9 (Graph) masaüstünde geçer; mobilde sınırlı sürüm kabul edilir.
- [ ] iOS + Android'de temel özellik seti (`02 §5`) çalışır durumda doğrulanır.
- [ ] Birincil kullanıcı (Persona A) mevcut Obsidian planlama kurulumunu Loomen ile değiştirebilir (`01 §6`).
- [ ] 30 gün gerçek kullanımda **0** veri kaybı/bozulma.

---

*Sonraki adım: [`06-planlayici-pomodoro.md`](06-planlayici-pomodoro.md) — planlayıcının ekran-görüntüsü
düzeyinde detay spesifikasyonu.*

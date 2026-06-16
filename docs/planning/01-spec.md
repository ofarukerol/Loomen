# 01 — Spec Belirleme (Ürün Gereksinimleri)

> **Rol:** Senior Product Manager & Business Analyst
> **Soru:** "Teknoloji bağımsız olarak — bu ürün **ne yapmalı?**"
> **Önceki:** [`00-README.md`](00-README.md) · **Sonraki:** [`02-mvp-scope.md`](02-mvp-scope.md)

Bu doküman projenin anayasasıdır. Tüm sonraki dokümanlar (MVP, mimari, tech stack, kabul
kriterleri) buradaki gereksinimlere dayanır. Henüz teknoloji seçimi yapılmamıştır; odak
**kullanıcı ihtiyacı** ve **temel iş mantığıdır**.

---

## 1. Vizyon ve Konumlandırma

### 1.1 Problem

Modern bilgi-işçileri, notlarını ve günlük planlarını birbirinden kopuk araçlara dağıtır:
notlar bir uygulamada, görevler/takvim başka bir uygulamada, odak zamanlayıcısı (Pomodoro)
üçüncü bir yerde. Üstelik çoğu çözüm **buluta bağımlıdır** — veriler tescilli formatlarda
kilitlenir, internet olmadan çalışmaz, gizlilik şüphelidir ve servis kapanırsa veri kaybolur.

### 1.2 Çözüm

Loomen; **notları, görevleri, günlük planı, takvimi ve Pomodoro odak sistemini tek bir yerel
uygulamada** birleştirir. Tüm veri kullanıcının diskinde, **açık Markdown formatında** durur.
İnternet gerektirmez. Masaüstünde tam, mobilde temel deneyim sunar.

### 1.3 Farklılaşma (Obsidian, Notion, Logseq'e karşı)

| Kıstas | Obsidian | Notion | Logseq | **Loomen** |
|--------|----------|--------|--------|--------------|
| Tamamen lokal / offline | ✅ (sync ücretli) | ❌ (bulut) | ✅ | ✅ |
| Açık `.md` dosya formatı | ✅ | ❌ | ✅ (md/org) | ✅ |
| **Gömülü** günlük planlayıcı | ❌ (plugin'lerle) | kısmen | kısmen | ✅ **çekirdek** |
| **Gömülü** Pomodoro | ❌ (plugin) | ❌ | ❌ | ✅ **çekirdek** |
| **Gömülü** takvim+görev birleşimi | ❌ (plugin) | ✅ | kısmen | ✅ **çekirdek** |
| Eklenti gerektirmeden "hazır gelir" | ❌ | — | kısmen | ✅ |
| Mobil + masaüstü tek kod tabanı | ✅ | ✅ | kısmen | ✅ (Tauri) |

> **Loomen'ın tezi:** Obsidian güçlüdür ama planlama deneyimi (Tasks + Tasks Timeline +
> Calendar) **bir dizi eklentinin elle kurulup yapılandırılmasını** gerektirir. Loomen bu
> deneyimi **kutudan çıkar çıkmaz, gömülü ve cilalı** sunar. "Obsidian'ın esnekliği + bir
> üretkenlik uygulamasının hazır deneyimi."

---

## 2. User Personas (Kullanıcı Personaları)

### Persona A — "Faruk, Üretkenlik-Odaklı Güç Kullanıcısı" *(birincil)*

- **Kim:** Notlarını ve gününü Obsidian + eklentilerle yöneten, teknik konfora sahip biri.
- **Neden kullanır:** Mevcut Obsidian planlama kurulumunu (Tasks Timeline + Calendar + Pomodoro
  eklentileri) tek tek kurup bakımını yapmaktan yorulmuş; aynı deneyimi **gömülü ve stabil**
  istiyor. Verisinin tamamen kendisinde, lokalde kalmasını şart koşuyor.
- **Acı noktaları:** Eklenti güncellemelerinin kurulumu bozması; mobilde planlama eklentilerinin
  zayıf çalışması; senkron için aylık ücret ödememe isteği.
- **Başarı:** "Sabah uygulamayı açıyorum, bugünün ajandası, geciken görevler ve Pomodoro tek
  ekranda — hiçbir şey kurmadan."

### Persona B — "Elif, Gizlilik-Duyarlı Öğrenci/Araştırmacı" *(ikincil)*

- **Kim:** Ders/araştırma notlarını bağlantılı tutmak isteyen, buluta veri vermek istemeyen biri.
- **Neden kullanır:** `[[wiki-link]]` ve graph ile bilgi ağı kurmak; tüm bunları çevrimdışı,
  ücretsiz ve kendi cihazında yapmak.
- **Acı noktaları:** Notion'ın bulut zorunluluğu ve veri kilidi; karmaşık araçların öğrenme eğrisi.
- **Başarı:** "Notlarım arası bağlantıları görebiliyorum, her şey kendi klasörümde duruyor."

### Persona C — "Mert, Mobil-İlk Hızlı Notçu" *(üçüncül / mobil senaryo)*

- **Kim:** Gün içinde telefonda hızlı not/görev yakalayan, akşam masaüstünde derleyen biri.
- **Neden kullanır:** Aklına geleni anında Inbox'a düşürmek; sonra masaüstünde işlemek.
- **Acı noktaları:** Mobil PKM uygulamalarının ağır/yavaş olması; sync karmaşası.
- **Başarı:** "Telefondan tek satır görev ekliyorum, masaüstünde (Syncthing ile) beliriyor."

---

## 3. Core Business Logic (Temel İş Mantığı)

Personalardan türeyen, ürünün özünü oluşturan değişmez kurallar:

1. **Vault = tek doğruluk kaynağı.** Tüm not ve görev verisi, kullanıcının seçtiği yerel klasördeki
   düz `.md` dosyalarında yaşar. Uygulama bu dosyaların üstünde bir **görüntüleyici/düzenleyicidir**;
   veriyi tescilli bir veritabanına hapsetmez.
2. **Türetilen her şey yeniden üretilebilir.** Arama dizini, backlink grafiği, görev listesi —
   hepsi dosyalardan **türetilir** ve dosyalar silinse bile yeniden inşa edilebilir (cache).
3. **Görev = Markdown satırı.** Bir görev, bir not içindeki `- [ ]` onay kutusu satırıdır; tarih ve
   meta veriler taşınabilir emoji/işaret syntax'ıyla eklenir. Planlayıcı/takvim/Pomodoro bu
   satırları **okur ve yazar**, ayrı bir görev veritabanı tutmaz.
4. **Offline-first, çatışmasız.** Çekirdek hiçbir işlem internet beklemez. Çoklu cihaz, dosya
   düzeyinde 3. parti sync ile sağlanır; uygulama sync'i empoze etmez.
5. **Yıkıcı işlem yok (güvenli varsayılan).** Silme işlemleri geri alınabilir olmalı (sistem çöp
   kutusu / `.trash`); kullanıcı verisi sessizce kaybolmamalı.

---

## 4. Functional Requirements (Fonksiyonel Gereksinimler)

> Önceliklendirme `02-mvp-scope.md`'de yapılır; burada **tam liste** verilir.
> Kod: `FR-x` referansları sonraki dokümanlarda kullanılır.

### 4.1 Vault & Dosya Yönetimi
- **FR-1** Kullanıcı yerel bir klasörü "vault" olarak açabilir/değiştirebilir.
- **FR-2** Klasör ağacı gezgini: klasör/dosya oluşturma, yeniden adlandırma, taşıma, silme.
- **FR-3** Markdown dosyalarını okuma/yazma; YAML frontmatter desteği.
- **FR-4** Silinen öğeler geri-alınabilir çöp kutusuna gider (kalıcı silme ayrı onay).

### 4.2 Editör & Görüntüleme
- **FR-5** Markdown editör: başlık, kalın/italik, liste, alıntı, kod bloğu, tablo, görev kutusu.
- **FR-6** **Live preview** (yazarken render) ve salt-okuma önizleme modları.
- **FR-7** Görsel/dosya ekleme (vault içine kopyalama + göreli link).
- **FR-8** Sözdizimi vurgulama (kod blokları), matematik (KaTeX) — *ileri seviye, sonraki faz aday*.

### 4.3 Bağlantılar & Bilgi Ağı
- **FR-9** `[[wiki-link]]` ile notlar arası bağlantı; otomatik tamamlama.
- **FR-10** **Backlink** paneli: "bu nota nereler bağlanıyor?".
- **FR-11** Kırık link tespiti; var olmayan nota link tıklayınca oluşturma.
- **FR-12** **Graph view:** notları (düğüm) ve bağlantıları (kenar) görselleştirir; tıklayınca aç.
- **FR-13** `#etiket` desteği ve etikete göre filtreleme.

### 4.4 Arama
- **FR-14** Tam metin arama (dosya adı + içerik); hızlı sonuç.
- **FR-15** Hızlı dosya açıcı (komut paleti tarzı "git/aç").

### 4.5 Görevler (Tasks)
- **FR-16** Not içindeki `- [ ]` / `- [x]` görevlerini tanıma; tıkla-tamamla.
- **FR-17** Görevlere tarih meta verisi: **due** (📅), **scheduled** (⏳), **start** (🛫),
  **done** (✅), öncelik, tekrar (🔁) — Obsidian Tasks uyumlu syntax.
- **FR-18** Tüm vault'tan görevleri toplayıp tek akışta sunma (query/filtre).

### 4.6 Planlayıcı (Timeline / Agenda)  ·  *detay: [`06`](06-planlayici-pomodoro.md)*
- **FR-19** Tarihe göre gruplu **dikey timeline**; geçmiş + gelecek görevler tek akışta.
- **FR-20** Her görev satırında **göreli tarih** ("bir gün önce", "6 gün sonra"), kaynak-not linki, etiket.
- **FR-21** **"Focus On Today"** üst bölümü + **Todo / Overdue / Unplanned** canlı sayaç kartları.
- **FR-22** **Hızlı görev ekleme** kutusu (Inbox): tek satır doğal-dil/markdown ile görev oluşturma.

### 4.7 Takvim  ·  *detay: [`06`](06-planlayici-pomodoro.md)*
- **FR-23** Aylık takvim görünümü; günlerde görev/not yoğunluğu göstergesi.
- **FR-24** Bir güne tıklayınca o günün **daily note**'unu aç/oluştur ve o güne ait görevleri listele.
- **FR-25** Takvim ↔ Timeline çift yönlü tutarlı (aynı veri, iki görünüm).

### 4.8 Pomodoro  ·  *detay: [`06`](06-planlayici-pomodoro.md)*
- **FR-26** Yapılandırılabilir Pomodoro zamanlayıcı (çalışma/kısa mola/uzun mola süreleri).
- **FR-27** Bir **göreve bağlanabilir** Pomodoro oturumu; tamamlanan oturum sayısını görevle ilişkilendir.
- **FR-28** Tamamlanan oturumları günlük log'a/daily note'a işleme (istatistik için).
- **FR-29** Oturum sonu / mola bildirimleri (yerel masaüstü & mobil notification).

### 4.9 Genel Uygulama
- **FR-30** Açık/koyu tema; temel görsel özelleştirme.
- **FR-31** Klavye kısayolları (masaüstü) ve komut paleti.
- **FR-32** Çok dilli arayüz — ilk fazda **Türkçe (varsayılan/kaynak) + İngilizce + Arapça**.
  Türkçe kaynak dildir; EN/AR otomatik çeviri pipeline'ı ile üretilir (build-time). Arapça için
  **RTL (sağdan-sola)** birinci sınıf. Yapı **20 dile** kod değişmeden ölçeklenir. → detay [`07-i18n.md`](07-i18n.md)
- **FR-33** Ayarlar ekranı (vault yolu, Pomodoro süreleri, tema, dil, daily note şablonu/klasörü).

---

## 5. Non-Functional Requirements (Non-Fonksiyonel Gereksinimler)

### 5.1 Performans
- **NFR-1** Soğuk açılış (vault yüklü): masaüstünde **< 3 sn**.
- **NFR-2** Not açma/kaydetme algılanan gecikme **< 100 ms** (yerel disk).
- **NFR-3** **1.000+ notluk** vault'ta arama sonucu **< 500 ms**.
- **NFR-4** Graph view 1.000 düğüme kadar etkileşimli (akıcı pan/zoom); üstünde aşamalı yükleme.

### 5.2 Güvenilirlik & Veri Güvenliği
- **NFR-5** Asla sessiz veri kaybı yok: kaydetme atomik; çökme sonrası dosyalar bozulmaz.
- **NFR-6** Silme geri-alınabilir (çöp kutusu); kalıcı silme açık onay ister.
- **NFR-7** İndeks bozulursa dosyalardan **yeniden inşa** edilebilir (cache asla tek kaynak değil).
- **NFR-8** Uygulama, vault dışına veri yazmaz; ağ trafiği üretmez (telemetri opt-in dahi olsa MVP'de yok).

### 5.3 Taşınabilirlik & Birlikte Çalışabilirlik
- **NFR-9** Dosyalar Obsidian/diğer Markdown editörleriyle **çift yönlü uyumlu** (vendor lock-in yok).
- **NFR-10** 3. parti dosya sync (iCloud/Syncthing/Git) ile çakışmadan çalışır; harici dosya
  değişiklikleri uygulama açıkken algılanır (file watcher).

### 5.4 Kullanılabilirlik & Erişilebilirlik
- **NFR-11** Mobilde temel akışlar tek elle erişilebilir; dokunma hedefleri yeterli.
- **NFR-12** Klavye-öncelikli kullanım (masaüstü): fare olmadan not açma/arama/görev tamamlama.
- **NFR-13** Tutarlı i18n: tüm UI metinleri anahtar-tabanlı çevrilebilir (hardcoded string yok);
  ICU MessageFormat ile çoğul/cinsiyet; bidi izolasyonu; logical CSS (RTL); tarih/saat/sayı yerele
  duyarlı (Intl/date-fns). → detay [`07-i18n.md`](07-i18n.md)

### 5.5 Bakım & Geliştirme Kısıtı
- **NFR-14** **Tek geliştirici** sürdürebilmeli: az bağımlılık, az hareketli parça, net katmanlar.
- **NFR-15** Masaüstü + mobil **maksimum kod paylaşımı** (UI/iş mantığı çekirdeği ortak).

---

## 6. Success Metrics (Başarı Metrikleri)

Ürün tek kişilik/kişisel olduğundan metrikler "pazar payı" değil, **deneyim ve sağlamlık** odaklıdır.

| Kategori | Metrik | Hedef |
|----------|--------|-------|
| Benimseme | Birincil kullanıcının Obsidian planlama kurulumunu Loomen ile **değiştirmesi** | MVP sonrası tam geçiş |
| Verimlilik | "Sabah açılış → bugünün ajandası görünür" süresi | < 3 sn, sıfır kurulum |
| Güvenilirlik | 30 günde veri kaybı / bozulma olayı | **0** |
| Taşınabilirlik | Aynı vault'un Obsidian'da sorunsuz açılması | %100 uyumlu |
| Bütünleşiklik | Planlama için harici eklenti/uygulama ihtiyacı | **0** (gömülü) |
| Çoklu cihaz | Masaüstünde eklenen görevin mobilde (3. parti sync sonrası) görünmesi | Tutarlı, çakışmasız |
| Odak | Pomodoro oturumlarının göreve bağlı loglanması | Çalışır + istatistik üretir |

---

## 7. Kapsam Dışı (bu üründe yok — netlik için)

- ❌ Web/tarayıcı uygulaması (yalnızca Tauri masaüstü + mobil).
- ❌ Kendi bulut senkron sunucusu / hesap sistemi (3. parti sync kullanılır).
- ❌ Çok kullanıcılı işbirliği / paylaşım / yorum.
- ❌ Yapay zeka / LLM entegrasyonu (MVP'de değil; gelecekte değerlendirilebilir).
- ❌ Tam eklenti (plugin) ekosistemi (MVP'de değil; mimari buna **kapalı olmayacak** ama
  ilk sürümde inşa edilmeyecek).

---

*Sonraki adım: [`02-mvp-scope.md`](02-mvp-scope.md) — bu listeyi acımasızca önceliklendirip
ilk sürümün kapsamını çıkar.*

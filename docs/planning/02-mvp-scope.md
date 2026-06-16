# 02 — MVP Tanımlama (Acımasız Önceliklendirme)

> **Rol:** Acımasız (Ruthless) Yalın Ürün Yöneticisi
> **Soru:** "Bu özellik olmadan ürün ana fonksiyonunu yerine getiremez mi? Hayırsa — ertele."
> **Önceki:** [`01-spec.md`](01-spec.md) · **Sonraki:** [`03-system-design.md`](03-system-design.md)

`01-spec.md`'deki gereksinim listesini alıp **en kısa sürede değer üreten** kapsama indiriyoruz.
Yöntem: **MoSCoW** (Must / Should / Could / Won't) + her Must-have için sorgulama + teknik risk.

> **Bu projenin değer önerisi:** "Obsidian'ın açık-dosya PKM'i **+ gömülü günlük planlama/takvim/
> Pomodoro**." Dolayısıyla iki kalp aynı anda atmalı: (1) çalışan bir not editörü/vault, (2) çalışan
> bir planlayıcı. Birini çıkarırsak ürün, var olan bir alternatiften ayrışmaz. Bu yüzden bazı
> "planlama" özellikleri, normalde "lüks" sayılsa da burada **Must**'tır.

---

## 1. MoSCoW Tablosu

### 🔴 MUST-HAVE — MVP olmazsa olmaz

| FR | Özellik | Neden Must? |
|----|---------|-------------|
| FR-1,2,3,4 | Vault aç + klasör/dosya CRUD + md oku/yaz + çöp kutusu | Uygulamanın iskeleti; bunlar olmadan hiçbir şey yok |
| FR-5,6 | Markdown editör + **live preview** | Çekirdek not deneyimi |
| FR-9,10,11 | `[[wiki-link]]` + backlink + eksik nota link'le oluştur | "PKM" kimliğinin özü; ayrışmanın temeli |
| FR-14,15 | Tam metin arama + hızlı dosya açıcı | Birkaç yüz not sonrası vazgeçilmez |
| FR-16,17,18 | Görev tanıma + tarih meta verisi + toplama | Planlayıcının **yakıtı**; olmadan planlayıcı boş kalır |
| FR-19,20,21,22 | **Planlayıcı:** timeline + göreli tarih + Focus/Todo/Overdue/Unplanned + Inbox hızlı-ekle | Ürünün ayırt edici kalbi (ekran görüntüsü referansı) |
| FR-23,24,25 | **Takvim:** aylık görünüm + daily note + timeline ile tutarlılık | Kullanıcının açık talebi; planlama deneyiminin yarısı |
| FR-26,27,28,29 | **Pomodoro:** zamanlayıcı + göreve bağlama + log + bildirim | Kullanıcının açık talebi ("profesyonel, gömülü") |
| FR-30 | Açık/koyu tema | Günlük kullanılabilirlik; düşük maliyet |
| FR-32 | **TR + EN + AR** i18n (+ RTL) | Birincil kullanıcı TR (kaynak dil); i18n + RTL baştan kurulmazsa sonradan **çok** pahalı. 20 dile ölçek için doğru iskelet şart. → [`07`](07-i18n.md) |
| FR-33 | Ayarlar (vault yolu, Pomodoro süreleri, tema, dil, daily note şablonu) | Yukarıdakileri kullanılabilir kılar |
| FR-12 | **Graph view** | Kullanıcı açıkça MVP'de istedi → Must (ancak masaüstü-öncelikli, aşağıya bak) |
| FR-13 | `#etiket` + etikete filtre | Görev/not organizasyonu ve planlayıcı etiketleri (🎯) için gerekli |

### 🟡 SHOULD-HAVE — Önemli ama MVP'yi bloke etmez

| FR | Özellik | Neden ertelenebilir? |
|----|---------|----------------------|
| FR-7 | Görsel/dosya ekleme (vault'a kopyalama) | Metin-öncelikli kullanımda ilk gün şart değil; yakın takip |
| FR-31 | Kapsamlı klavye kısayolları + komut paleti | Temel kısayollar Must; gelişmiş palet hemen sonrası |
| — | Daily note otomasyonu (şablon, otomatik bugünü aç) | Temel daily note Must; gelişmiş şablonlama Should |
| — | Görev düzenleme UI'ı (tarih seçici ile due/scheduled atama) | MVP'de görev metnini elle yazmak yeterli; görsel editör Should |

### 🟢 COULD-HAVE — Hoş olur, sonraki fazlar

| FR | Özellik |
|----|---------|
| FR-8 | KaTeX matematik, gelişmiş kod vurgulama, Mermaid render |
| — | Canvas / beyaz tahta görünümü |
| — | Tema mağazası / CSS snippet desteği |
| — | Görev tekrarlama (🔁) için gelişmiş kurallar (RRULE benzeri) |
| — | Haftalık/günlük ajanda alternatif görünümleri, ısı haritası istatistikleri |
| — | Global "quick capture" kısayolu (uygulama kapalıyken yakala) |

### ⚪ WON'T-HAVE (bu sürümde) — Bilinçli olarak dışarıda

| Özellik | Gerekçe |
|---------|---------|
| Kendi sync sunucusu / hesap sistemi | **Karar:** 3. parti sync (iCloud/Syncthing/Git). Backend = en büyük karmaşıklık ve risk; değer/maliyet dengesi MVP'de tutmaz |
| Tam eklenti (plugin) ekosistemi | Güvenlik/sandbox/API yüzeyi çok büyük; mimari kapalı olmayacak ama inşa MVP dışı |
| Çok kullanıcılı işbirliği / paylaşım | Ürün kişisel; kapsam dışı (`01 §7`) |
| Yapay zeka / LLM | MVP dışı; sonraki değerlendirme |
| Web/tarayıcı sürümü | Ürün kararı: yalnızca Tauri masaüstü + mobil |

---

## 2. Must-have Sorgulaması ("Bu olmadan ürün çalışır mı?")

Acımasız test — her Must, gerçekten Must mı?

- **Graph view (FR-12):** *"Olmadan PKM çalışır mı?"* → Teknik olarak evet. **Ancak kullanıcı MVP'de
  açıkça istedi.** Uzlaşma: **Must olarak kalır ama masaüstü-öncelikli**; mobilde graph "temel/salt
  görüntüleme" olarak işaretlenir, performans riski nedeniyle aşamalı yüklenir. (Risk: ⚠️ Orta)
- **Pomodoro (FR-26-29):** *"PKM için şart mı?"* → Hayır. **Ama bu ürünün vaadinin parçası**
  (gömülü, profesyonel). Çıkarılırsa ürün "sadece bir Obsidian klonu" olur ve ayrışmaz. → **Must.**
- **Takvim (FR-23-25):** Planlayıcı varken takvim "ikinci görünüm" gibi görünebilir; ama kullanıcı
  "takvim ile planlamayı birleştir" dedi. Timeline + takvim **aynı verinin iki yüzü** → birlikte Must.
- **i18n (FR-32):** *"Tek dille başlayıp sonra eklesek?"* → Sonradan retrofit etmek **pahalı ve
  hataya açık** (hardcoded string avı + RTL'yi sonradan eklemek mimari kırılma). Baştan iskeleti
  kurmak ucuz → **Must.** İlk fazda **3 dil: TR/EN/AR** ve **RTL** (Arapça) ile en zor i18n problemi
  baştan çözülür; 20 dile ölçek kod değiştirmeden gelir. → [`07-i18n.md`](07-i18n.md)
- **Görsel ekleme (FR-7):** *"İlk gün şart mı?"* → Hayır; metin notları tek başına değer üretir →
  **Should**, hızlı takip.

---

## 3. Teknik Risk Analizi (MVP kalemleri)

| Alan | Karmaşıklık | Risk Notu & Azaltma |
|------|-------------|---------------------|
| Vault FS + file watcher | Orta | Tauri FS + watch plugin; harici sync değişikliklerini yakalamak kritik. **En erken çözülmeli** |
| CodeMirror 6 live preview | Yüksek | Editör en zor parça; Obsidian da CM6 kullanır. Hazır eklentilerden yararlan, "MVP'de mükemmel değil çalışır" hedefle |
| Markdown ↔ görev parse | Orta | Tasks syntax'ı iyi tanımlı; sağlam bir parser + serializer yaz, **round-trip kayıpsız** olmalı |
| Arama dizini | Orta | SQLite FTS5 veya JS (MiniSearch). Vault değişince artımlı güncelle |
| Graph view (mobil) | Yüksek (mobil) | Force simülasyonu mobilde ısınma/pil riski. Masaüstü-öncelikli, mobilde sınırlı düğüm |
| Pomodoro arka plan timer (mobil) | Orta-Yüksek | Mobilde uygulama arka plana atılınca timer doğruluğu; "bitiş zamanı" tabanlı hesap + yerel bildirim |
| Tauri mobil (iOS+Android) | Orta | Tauri 2.0 mobil görece yeni; plugin uyumu erkenden doğrulanmalı (spike) |
| i18n + ICU iskeleti | Düşük | Baştan kur, ucuz; anahtar-tabanlı + namespace |
| **RTL (Arapça)** | Orta | Yön/simetri en zor i18n problemi. **Azaltma:** logical CSS baştan, her ekran LTR+RTL test. MVP'de çözülürse 20 dile ölçek bedava → [`07`](07-i18n.md) |
| Otomatik çeviri pipeline | Düşük-Orta | Build-time script + translation-memory; runtime ağsız kalır |

> **Önerilen ilk teknik spike (kod fazında):** Tauri 2.0 ile boş bir uygulamayı iOS + Android'de
> çalıştırıp FS erişimi + yerel bildirim + CodeMirror webview'i doğrula. Bu, en büyük belirsizliği
> erken kapatır.

---

## 4. MVP — Öncelik Sıralı İş Listesi (Build Order)

Bağımlılık sırasına göre, "her adım çalışan bir şey bırakır" mantığıyla:

1. **İskelet:** Tauri 2.0 projesi (desktop) + React/TS + temel pencere + tema (FR-30) +
   **i18n iskeleti baştan** (anahtar-tabanlı + ICU + RTL/logical CSS + TR/EN/AR) (FR-32 → [`07`](07-i18n.md)).
   *i18n/RTL en başta kurulur ki her yeni ekran doğru anahtarla ve çift yönlü doğsun.*
2. **Vault katmanı:** klasör açma, dosya ağacı, md oku/yaz, çöp kutusu, file watcher (FR-1,2,3,4).
3. **Editör:** CodeMirror 6 + live preview + temel markdown (FR-5,6).
4. **Bağlantılar:** `[[wiki-link]]` autocomplete + backlink paneli + eksik link oluştur + `#etiket` (FR-9,10,11,13).
5. **Arama:** indeks + tam metin arama + hızlı açıcı (FR-14,15).
6. **Görev motoru:** parse/serialize + tarih meta + tüm vault'tan toplama (FR-16,17,18).
7. **Planlayıcı:** timeline + göreli tarih + Focus/Todo/Overdue/Unplanned + Inbox hızlı-ekle (FR-19-22). → [`06`](06-planlayici-pomodoro.md)
8. **Takvim:** aylık görünüm + daily note + timeline tutarlılığı (FR-23-25). → [`06`](06-planlayici-pomodoro.md)
9. **Pomodoro:** timer + göreve bağla + log + bildirim (FR-26-29). → [`06`](06-planlayici-pomodoro.md)
10. **Graph view:** masaüstü (FR-12).
11. **Ayarlar** ekranını tamamla (FR-33) + cila.
12. **Mobil derleme:** iOS + Android build; mobilde temel özellik seti (editör, gezgin, arama,
    wiki-link, planlayıcı/takvim/Pomodoro temel; graph opsiyonel).

> Adım 1–6 "bir Obsidian klonu" üretir; 7–9 onu **Loomen** yapan farkı ekler. İkisi de MVP'dedir.

---

## 5. MVP'de mobil kapsamı (netlik)

Mobil = **temel özellikler**, masaüstünün birebir kopyası değil:

- ✅ Vault gezgini, not aç/düzenle (live preview), arama, wiki-link/backlink.
- ✅ Planlayıcı (timeline), takvim, **hızlı görev ekleme (Inbox)** — mobilin en kritik senaryosu (Persona C).
- ✅ Pomodoro temel (timer + bildirim).
- 🔸 Graph view: opsiyonel / sınırlı (performans).
- 🔸 Gelişmiş klavye kısayolları: masaüstüne özel.

---

*Sonraki adım: [`03-system-design.md`](03-system-design.md) — bu MVP'yi hayata geçirecek
teknoloji-bağımsız mimari.*

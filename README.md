# Loomen

**Tamamen lokal çalışan bir kişisel bilgi yönetimi (PKM) uygulaması** — notlarını düz `.md`
dosyalarında tutar, gömülü bir günlük planlayıcı, takvim ve Pomodoro ile birlikte gelir.

Sunucu yok, hesap yok, abonelik yok. Notların senin diskinde, senin klasöründe, açık formatta durur.

- **Platform:** macOS · Windows · Linux · iOS · Android (Tauri 2.0)
- **Lisans:** [PolyForm Noncommercial 1.0.0](LICENSE) — kişisel kullanım serbest, ticari kullanım yasak
- **Durum:** Aktif geliştirme (`v0.1.0`) — henüz yayınlanmış bir sürüm yok
- **Domain:** loomen.org

---

![Loomen editörü — canlı Markdown, wiki-link ve geri bağlantı paneli](docs/screenshots/editor.png)

<table>
<tr>
<td width="50%"><img src="docs/screenshots/planner.png" alt="Planlayıcı — günlük plan, zaman çizelgesi ve Pomodoro"></td>
<td width="50%"><img src="docs/screenshots/graph.png" alt="Graph görünümü — notlar ve etiketler arası bağlantılar"></td>
</tr>
<tr>
<td align="center"><em>Planlayıcı — görevler, zaman çizelgesi, Pomodoro</em></td>
<td align="center"><em>Graph — notlar ve etiketler arası bağlantılar</em></td>
</tr>
</table>

---

## Neden Loomen?

Çoğu not uygulaması ya notlarını kendi sunucusunda tutar, ya kapalı bir formatta kilitler, ya da
planlama tarafını ayrı bir uygulamaya bırakır. Loomen üçünü birden reddeder:

- **Veri sahipliği sende.** Notlar düz Markdown + YAML frontmatter. Uygulamayı silsen notların kalır.
- **İnternet gerekmez.** Çekirdek işlevlerin hiçbiri ağa çıkmaz.
- **Planlama not almanın içinde.** Görevler, takvim ve Pomodoro ayrı bir uygulama değil, notlarının yanında.

## Özellikler

### Notlar ve editör
- CodeMirror 6 tabanlı Markdown editörü, **canlı önizleme** (live preview)
- **Çift yönlü bağlantı** — `[[wiki-link]]` ve geri bağlantı (backlinks) paneli
- Tablo düzenleme widget'ı, biçimlendirme araç çubuğu, sağ tık menüsü
- Düz metin editörü modu (Markdown sözdizimi istemeyenler için)
- Tam metin arama
- **Günlük not** — tarih şablonundan otomatik oluşturma
- **Çöp kutusu** — silinen notlar 30 gün saklanır, geri yüklenebilir

### Planlayıcı, takvim ve Pomodoro
- Günlük plan görünümü, görev panosu ve zaman çizelgesi (timeline)
- Takvim kartı, mini ajanda ve istatistik kartları
- Görev detayı: alt görevler, tekrar, notlar
- Hızlı görev ekleme (quick add)
- Gömülü **Pomodoro** sayacı

### Görselleştirme
- **Graph görünümü** — notlar arası bağlantı grafiği (d3-force)
- **Çizim** — Excalidraw entegrasyonu
- Raporlar ekranı

### Ses
- Uygulama içi **ses kaydı** (VoiceRecorder), WAV ve FLAC kodlama
- Notlara gömülü ses oynatıcı

### Senkronizasyon (isteğe bağlı)
Kendi sync sunucumuz **yok**. Vault düz `.md` olduğu için iCloud / Syncthing / Git ile senkronlanır.
Ek olarak uygulama içinden:
- **GitHub senkronu** — OAuth Device Flow *(git tabanlı senkron yalnızca masaüstünde)*
- **Google Takvim** — OAuth 2.0 loopback + PKCE

### Çok dilli
Türkçe · İngilizce · **Arapça (RTL birinci sınıf)**. Mimari kod değişmeden 20 dile ölçeklenir.

---

## Geliştirme

**Gereksinimler:** Node.js 20+, Rust (stable), platformuna göre
[Tauri ön koşulları](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/ofarukerol/Loomen.git
cd Loomen
npm install
cp .env.example .env      # entegrasyonlar için (isteğe bağlı, aşağıya bak)
npm run tauri dev
```

Diğer komutlar:

```bash
npm run build             # tsc typecheck + Vite derleme
npm run tauri build       # dağıtılabilir masaüstü paketi
```

### Yapılandırma

GitHub ve Google Takvim entegrasyonları kendi OAuth istemcini gerektirir. `.env.example`
dosyasında adım adım kurulum yazılı — kopyalayıp `.env` yap ve doldur. **Bu entegrasyonlar
isteğe bağlıdır; uygulama onlarsız da tam çalışır.**

### Bilinmesi gerekenler

- `src-tauri/capabilities/` veya Rust tarafını değiştirdiysen uygulamayı **yeniden başlat** —
  bunlar binary'ye derlenir, HMR almaz.
- Sürükle-bırakta **pointer-event** kullan; Tauri'nin WKWebView'ı native HTML5 DnD'yi güvenilir
  desteklemez.
- `src-tauri/gen/` sürüm kontrolüne dahil değildir; `tauri ios init` / `tauri android init` ile üretilir.

---

## Mimari

**Frontend:** React 19 · TypeScript · Zustand · CodeMirror 6 · i18next · Excalidraw · d3-force
**Backend (yerel):** Rust / Tauri 2.0 — dosya sistemi, OAuth (PKCE), GitHub Git Data API

Sunucu bileşeni ve veritabanı **yoktur**. Tek gerçek kaynak diskteki `.md` dosyalarıdır;
bellekteki her şey önbellektir.

> ⚠️ Not içeriğine dokunan her değişiklik [`NOTE_SAFETY_RULES.md`](NOTE_SAFETY_RULES.md)
> kurallarına uymak zorundadır. Bu kurallar gerçek bir veri kaybı olayından sonra yazıldı.

### Planlama dokümanları

Ürün gereksinimleri ve tasarım kararları [`docs/planning/`](docs/planning/) altında —
spec, MVP kapsamı, sistem tasarımı, tech stack, kabul kriterleri, planlayıcı spesifikasyonu,
i18n mimarisi ve tasarım sistemi.

---

## Katkı

PR'lara açığız. Katkı yapmadan önce [`CONTRIBUTING.md`](CONTRIBUTING.md) dosyasını oku —
[`CLA.md`](CLA.md) (Katkıcı Lisans Sözleşmesi) kabulü **zorunludur** ve PR'larda otomatik kontrol edilir.

## Lisans

[PolyForm Noncommercial 1.0.0](LICENSE) — kişisel, eğitim, hobi ve ticari **olmayan** her amaçla
kullanım serbesttir. **Ticari kullanım yasaktır.** Ticari lisans için proje sahibiyle iletişime geç.

Copyright © 2026 Ömer Faruk Erol

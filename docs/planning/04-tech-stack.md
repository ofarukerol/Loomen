# 04 — Tech Stack (Teknoloji Referans Belgesi)

> **Rol:** CTO
> **Soru:** "Bu mimariyi (özellikle offline-first, masaüstü+mobil, tek geliştirici) en verimli
> hayata geçirecek teknoloji yığını hangisi?"
> **Önceki:** [`03-system-design.md`](03-system-design.md) · **Sonraki:** [`05-acceptance-criteria.md`](05-acceptance-criteria.md)

Kullanıcı çatıyı (Tauri) ve genel yönü belirledi; bu doküman seçimi **gerekçelendirir** ve
ekosistemin geri kalanını netleştirir.

---

## 1. Stack Karşılaştırması

Mimarinin (`03`) gerektirdikleri: yerel FS erişimi, küçük ikili boyut, masaüstü+mobil tek kod,
CodeMirror gibi olgun bir web-editör motorunu barındırabilme, tek geliştiricinin sürdürebilmesi.

### Seçenek A — **Tauri 2.0 + React + TypeScript** ✅ *(seçilen)*

| Artı | Eksi |
|------|------|
| Tek kod tabanı: **masaüstü (Win/macOS/Linux) + mobil (iOS/Android)** — Tauri 2.0 mobil | Tauri mobil görece **yeni**; bazı plugin'ler olgunlaşıyor (risk: spike ile kapat) |
| Küçük ikili, düşük RAM (sistem WebView'i; Electron'a kıyasla hafif) | Platform WebView farkları (WKWebView/WebView2/WebKitGTK) test gerektirir |
| Rust backend → güvenli, hızlı FS/watcher/native bildirim | Rust öğrenme eğrisi (ama adapter'lar ince; çoğu iş JS tarafında) |
| **React + CodeMirror 6** dev ekosistemi devasa; Obsidian da CM6 kullanır → editör için kanıtlı yol | — |
| Kullanıcının mevcut ekosistemi React/TS → **bilgi transferi**, tek kişi için hız | — |
| Tauri capability/izin sistemi → "ağ yok, yalnız vault dizini" (NFR-8) mimariyle birebir | — |

### Seçenek B — Tauri 2.0 + **Svelte** + TypeScript

| Artı | Eksi |
|------|------|
| Daha küçük bundle, çok hızlı reaktivite | Editör/graph için hazır React bileşen ekosistemi daha zengin; Svelte'de daha çok elle iş |
| Sade, az boilerplate | Kullanıcının React deneyimi avantajı kaybolur (tek geliştirici hızını düşürür) |
| CodeMirror 6 framework-agnostik → Svelte'de de çalışır | Topluluk örnekleri (Obsidian-benzeri) ağırlıkla React/TS dünyasında |

### Seçenek C — **Electron** + React

| Artı | Eksi |
|------|------|
| En olgun masaüstü ekosistemi, her şey hazır | **Mobil yok** → projenin iOS+Android şartını **karşılamaz** (eleyici) |
| Node.js FS doğrudan | Büyük ikili, yüksek RAM; "hafif yerel uygulama" hedefiyle çelişir |

> **Capacitor/React Native + ayrı masaüstü** gibi melezler de değerlendirildi ama **iki ayrı
> çatı = iki kod tabanı** demek; tek geliştirici kısıtı (NFR-14) altında reddedildi.

---

## 2. Optimum Seçim ve Gerekçe

> **Seçim: Tauri 2.0 + React 18 + TypeScript + Vite.**

Nedenler, `03`'teki kriterlere göre:
1. **Tek kod, dört+iki platform:** Tauri 2.0 hem masaüstü hem mobil verir → NFR-15 (maks. kod paylaşımı)
   doğrudan karşılanır. Electron'u (mobil yok) eler.
2. **Hafiflik & yerel güç:** Sistem WebView + Rust çekirdeği → küçük ikili, hızlı FS/watcher/bildirim,
   sıkı izin modeli (ağ yok). NFR-1/8 ile uyumlu.
3. **Editör kanıtlı yolu:** CodeMirror 6, React ile sorunsuz; Obsidian'ın da motoru → en riskli parça
   (`02 §3`) için en az sürpriz.
4. **Tek geliştirici hızı:** Kullanıcının React/TS hâkimiyeti + en geniş topluluk → vibe coding ile
   en yüksek ilerleme. Svelte teknik olarak güzel ama burada hız kaybı.

**Kabul edilen risk:** Tauri mobil yeniliği. **Azaltma:** kod fazının ilk işi, boş bir uygulamayı
iOS+Android'de çalıştırıp FS + bildirim + CodeMirror WebView'i doğrulayan **spike** (`02 §3`).

---

## 3. Ekosistem Detayları (önerilen kütüphaneler)

> İlke (`03 §1`, NFR-14): **az bağımlılık.** Her kütüphane bir mimari ihtiyaca eşlenir.

| Katman | Seçim | Gerekçe / Mimari karşılığı |
|--------|-------|----------------------------|
| **Çatı** | Tauri 2.0 | masaüstü + mobil, yerel, güvenli |
| **UI** | React 18 + TypeScript | ekosistem, tek geliştirici hızı |
| **Build** | Vite | hızlı dev, Tauri ile standart |
| **Editör** | **CodeMirror 6** | markdown editör + live preview; en kritik bileşen (FR-5,6) |
| **Markdown render/parse** | `remark`/`unified` + `mdast` (önizleme & AST) | parser/serializer (`03 §3.2`), görev satırı round-trip |
| **State** | **Zustand** | hafif, az boilerplate; store'lar (`useVaultStore`, `useTaskStore`, `usePomodoroStore`) |
| **Yerel indeks** | **SQLite** (`tauri-plugin-sql`) + **FTS5** | arama + görev/link cache (`03 §3.4`). Alternatif/tamamlayıcı: MiniSearch (saf JS) |
| **FS & watcher** | `@tauri-apps/plugin-fs` + `tauri-plugin-fs-watch` | Vault Service adapter (FR-1..4, NFR-10) |
| **Bildirim** | `@tauri-apps/plugin-notification` | Pomodoro/mola (FR-29) |
| **Graph görselleştirme** | `d3-force` + canvas (veya `sigma.js`) | force-directed graph (FR-12), masaüstü-öncelikli |
| **Tarih** | `date-fns` (+ `date-fns-tz`) | göreli tarih ("6 gün sonra"), takvim hesapları, tr-TR locale |
| **i18n** | `i18next` + `react-i18next` + **`i18next-icu`** | TR/EN/AR; ICU çoğul/cinsiyet; namespace + lazy-load (FR-32, NFR-13) → [`07`](07-i18n.md) |
| **Çeviri pipeline** | build-time script (DeepL/LLM API) + translation-memory | TR→EN/AR otomatik üretim, elle override korunur (runtime ağsız) |
| **RTL** | Tailwind logical utility (`ms/me/ps/pe`) + `dir` yöneticisi | Arapça sağdan-sola; 20 dile ölçek |
| **Takvim UI** | hafif özel bileşen (gerekirse `react-day-picker`) | aylık görünüm (FR-23); ağır takvim kütüphanesinden kaçın |
| **Stil** | Tailwind CSS (veya CSS Modules) | hızlı, tutarlı tema (FR-30) |
| **Stil/Tema** | CSS değişkenleri (light/dark token seti) | tema değişimi; ileride snippet'e açık |

> **Bilinçli olarak ELENEN:** ağır takvim/takım kütüphaneleri, ORM (SQL yeterince basit), Redux
> (Zustand yeter), harici bildirim servisleri. Az parça = sürdürülebilir (`03 §9`).

---

## 4. Kod Paylaşım Modeli (masaüstü ↔ mobil)

`03 §2/§6`'daki katmanlı mimariyi koda yansıtan **monorepo** önerisi:

```
loomen/
├── src/
│   ├── core/            # PLATFORMDAN BAĞIMSIZ — masaüstü+mobil ORTAK
│   │   ├── markdown/    # parser/serializer
│   │   ├── vault/       # vault service (port'lar üzerinden)
│   │   ├── tasks/       # task engine
│   │   ├── planner/     # planner/calendar logic
│   │   ├── pomodoro/    # pomodoro engine
│   │   ├── search/      # search index sorgu mantığı
│   │   ├── graph/       # graph builder
│   │   └── ports/       # FS, Notification, IndexStore, Clock arayüzleri
│   ├── ui/              # React bileşenleri (responsive; platform-uyarlamalı)
│   │   ├── editor/  explorer/  planner/  calendar/  pomodoro/  graph/  search/
│   └── platform/        # ADAPTERS — Tauri'ye özgü
│       ├── desktop/     # masaüstü farkları
│       └── mobile/      # mobil farkları (FS kapsamı, timer, watcher telafisi)
├── src-tauri/           # Rust tarafı (komutlar, capability, plugin config)
│   ├── capabilities/    # izinler: yalnız vault dizini, ağ yok
│   └── ...
└── docs/                # bu planlama dokümanları
```

**Paylaşım stratejisi:**
- `core/` ve `ui/` her iki platformda **birebir aynı** çalışır; platform farkları yalnız
  `platform/*` adapter'larında ve birkaç responsive UI dalında.
- Adapter'lar port arayüzlerini (`core/ports`) gerçekler → çekirdek Tauri'yi hiç import etmez,
  bu yüzden **test edilebilir** (sahte adapter) ve mobil/masaüstüne taşınabilir.
- Hedef: kodun **%85+'i ortak**; platforma özel kısım ince ve izole.

---

## 5. Dağıtım / Build (özet — detay sonraki SDLC fazı)

- **Masaüstü:** Tauri bundler → `.dmg` (macOS), `.msi/.exe` (Windows), `.AppImage/.deb` (Linux).
- **Mobil:** Tauri 2.0 iOS (Xcode/TestFlight) + Android (Gradle/APK-AAB).
- **Güncelleme:** masaüstünde Tauri updater (sonraki faz); mobilde mağaza/sideload.
- **CI:** tek geliştirici için basit; platform build'leri ayrı (GitHub Actions matris — opsiyonel).

---

## 6. Stack ↔ Gereksinim İzlenebilirliği

| Gereksinim | Karşılayan seçim |
|------------|------------------|
| NFR-1/2 (hız) | Tauri hafif + Vite + SQLite yerel |
| NFR-8 (ağ yok) | Tauri capability: ağ izni kapalı |
| NFR-9 (taşınabilirlik) | düz `.md` + remark; tescilli format yok |
| NFR-10 (3. parti sync) | fs-watch + reindex |
| NFR-15 (kod paylaşımı) | core/ui ortak, platform/ ince |
| FR-5,6 (editör) | CodeMirror 6 |
| FR-12 (graph) | d3-force/sigma |
| FR-19-29 (planner/pomodoro) | Zustand store + date-fns + notification plugin |
| FR-32 (i18n TR/EN/AR + RTL) | i18next + i18next-icu + Tailwind logical utils + çeviri pipeline → [`07`](07-i18n.md) |

---

*Sonraki adım: [`05-acceptance-criteria.md`](05-acceptance-criteria.md) — her özelliğin "bitti" tanımı.*

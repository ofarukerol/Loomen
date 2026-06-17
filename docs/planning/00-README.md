# Loomen — Planlama Dokümantasyonu

> **Loomen** — proje adı (domain: **loomen.org**)
> Tauri 2.0 ile geliştirilen, **tamamen lokal** çalışan bir Obsidian klonu + gömülü
> günlük planlayıcı, takvim ve Pomodoro sistemi.

Bu klasör, projenin **anayasasını** oluşturan planlama dokümanlarını içerir. Henüz bir satır
kod yazılmadı; amaç "ürün ne yapmalı?" ve "nasıl inşa edilmeli?" sorularını netleştirmektir.
Yapı, klasik yazılım yaşam döngüsünün (SDLC) **"Gereksinimlerin Tanımlanması"** fazını
5 alt başlığa böler.

---

## Proje tek cümlede

Notları düz `.md` dosyaları olarak yerel bir vault klasöründe tutan; masaüstü (macOS/Windows/Linux)
ve mobil (iOS/Android) çalışan; internet/sunucu **gerektirmeyen**; çift yönlü bağlantı (`[[wiki-link]]`),
graph görünümü, tam metin arama ve **gömülü bir günlük planlama + takvim + Pomodoro** deneyimi sunan
kişisel bilgi yönetimi (PKM) uygulaması.

---

## SDLC Fazları (referans yapı)

| # | İngilizce | Türkçe | Bu fazdaki çıktı |
|---|-----------|--------|------------------|
| 1 | Planning & Requirement Analysis | Planlama ve Gereksinim Analizi | (bu doküman seti) |
| 2 | Defining Requirements | Gereksinimlerin Tanımlanması | `01`–`06` dokümanları |
| 3 | Coding | Kodlama / Geliştirme | (sonraki faz) |
| 4 | Testing | Test Etme | `05` kabul kriterleri rehberliğinde |
| 5 | Deployment | Dağıtım / Yayına Alma | (sonraki faz) |
| 6 | Maintenance | Bakım | (sonraki faz) |

Faz 2 ("Defining Requirements") şu 5 alt başlıktan oluşur:
**a.** Spec Belirleme · **b.** MVP Tanımlama · **c.** System Design · **d.** Tech Stack · **e.** Acceptance Criteria

---

## Doküman okuma sırası

Dokümanlar bir **zincir** oluşturur — her biri bir öncekine dayanır. Sırayla okuyun:

| Sıra | Dosya | Rol | Ne anlatır? |
|------|-------|-----|-------------|
| 1 | [`01-spec.md`](01-spec.md) | Senior Product Manager / Business Analyst | Ürün **ne yapmalı?** Personalar, fonksiyonel/non-fonksiyonel gereksinimler, başarı metrikleri |
| 2 | [`02-mvp-scope.md`](02-mvp-scope.md) | Acımasız Yalın Ürün Yöneticisi | İlk sürümde **ne yapılacak, ne ertelenecek?** MoSCoW önceliklendirme |
| 3 | [`03-system-design.md`](03-system-design.md) | Senior System Architect | Sistem **nasıl kurgulanacak?** Katmanlar, veri modeli, akış diyagramları |
| 4 | [`04-tech-stack.md`](04-tech-stack.md) | CTO | **Hangi teknolojiler?** Stack karşılaştırması ve seçim gerekçesi |
| 5 | [`05-acceptance-criteria.md`](05-acceptance-criteria.md) | Senior QA Engineer | Bir özellik **ne zaman "bitti" sayılır?** Test checklist'i |
| 6 | [`06-planlayici-pomodoro.md`](06-planlayici-pomodoro.md) | Ürün + Mimari (derinlemesine) | Gömülü **Planlayıcı + Takvim + Pomodoro** detay spesifikasyonu |
| 7 | [`07-i18n.md`](07-i18n.md) | Senior Frontend (i18n) | **Çok dilli mimari:** TR/EN/AR + RTL, otomatik çeviri pipeline, 20 dile ölçek |
| 8 | [`08-design-system.md`](08-design-system.md) | Ürün Tasarımcısı | **Tasarım sistemi:** renk/tipografi token'ları, ölçüler, 6 ekran, etkileşimler (Claude Design prototipinden) |

> `06` (planlayıcı), `07` (i18n) ve `08` (tasarım sistemi), MVP'nin en ayırt edici / en çok
> vurgulanan parçaları olduğu için ayrı ve derinlemesine ele alınmıştır; `01`–`05` ile çapraz tutarlıdır.
> Tasarım prototipi `design/` altında; token'lar `design/tokens.css`'te kullanıma hazır.

---

## Sabitlenmiş temel kararlar

Bu kararlar tüm dokümanlar boyunca geçerlidir ve değiştirilmeden korunur:

- **Tamamen lokal:** Çekirdek işlevsellik için **sunucu/internet yok**. Vault = yerel dosya sistemi.
- **Web arayüzü yok:** Sadece Tauri masaüstü + mobil. (Tarayıcı uygulaması hedeflenmiyor.)
- **Mobil:** iOS **ve** Android (Tauri 2.0 mobil). Mobilde *temel* özellikler — her şey değil.
- **Çok dilli:** Varsayılan/kaynak dil **Türkçe**; ilk fazda **+İngilizce +Arapça** (otomatik çeviri).
  **RTL** (Arapça) birinci sınıf; mimari **20 dile** kod değişmeden ölçeklenir. → [`07-i18n.md`](07-i18n.md)
- **Senkronizasyon:** **3. parti / manuel** (iCloud, Syncthing, Git). Kendi sync sunucusu
  **MVP'de inşa edilmeyecek**. Düz `.md` dosyaları bu modeli mümkün kılar.
- **Veri formatı:** Notlar düz Markdown + YAML frontmatter. Görevler Obsidian **Tasks** plugin
  uyumlu syntax. Hiçbir veri tescilli/kapalı bir formatta kilitlenmez → **veri sahipliği kullanıcıda**.
- **Tek geliştirici:** Proje tek kişi tarafından, AI-destekli (vibe coding) geliştirilecek.
  Bu, basitliği ve "az parça" mimariyi bir tasarım kısıtı yapar.

---

## Bu proje Datha ekosisteminin parçası mı?

**Hayır.** Loomen bağımsız, kişisel bir uygulamadır. Datha global kuralları
(`tenant_id`, PostgreSQL, multi-tenancy, NestJS backend vb.) **burada geçerli değildir** —
Loomen'ın backend'i yoktur, local-first çalışır. Yalnızca iyi dokümantasyon ve isimlendirme
pratikleri ortaktır.

---

*Hazırlayan: planlama oturumu · Durum: Faz 2 taslağı, kullanıcı onayı bekleniyor.*

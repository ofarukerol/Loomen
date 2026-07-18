# Loomen

Tauri 2.0 ile geliştirilen, **tamamen lokal** çalışan bir Obsidian klonu — gömülü günlük
planlayıcı, takvim ve Pomodoro sistemiyle. Masaüstü (macOS/Windows/Linux) + mobil (iOS/Android),
web arayüzü yok. Notlar düz `.md` dosyaları olarak yerel bir vault'ta tutulur.

- **Domain:** loomen.org
- **Durum:** Planlama (Faz 2 — Gereksinimlerin Tanımlanması). Henüz kod yazılmadı.

## Planlama Dokümanları

Projenin anayasası [`docs/planning/`](docs/planning/) altındadır — sırayla okuyun:

1. [00 — README / İndeks](docs/planning/00-README.md)
2. [01 — Spec (Gereksinimler)](docs/planning/01-spec.md)
3. [02 — MVP Kapsamı](docs/planning/02-mvp-scope.md)
4. [03 — System Design](docs/planning/03-system-design.md)
5. [04 — Tech Stack](docs/planning/04-tech-stack.md)
6. [05 — Acceptance Criteria](docs/planning/05-acceptance-criteria.md)
7. [06 — Planlayıcı + Takvim + Pomodoro](docs/planning/06-planlayici-pomodoro.md)
8. [07 — Çok Dilli Mimari (i18n)](docs/planning/07-i18n.md)

## Temel Kararlar

- **Tamamen lokal:** sunucu/internet yok; vault = yerel `.md` klasörü.
- **Platform:** Tauri 2.0 — masaüstü + iOS/Android. Web yok.
- **Senkron:** 3. parti / manuel (iCloud / Syncthing / Git). Kendi sync sunucusu yok.
- **Dil:** kaynak Türkçe + İngilizce + Arapça (RTL); 20 dile ölçeklenebilir i18n.
- **Tech:** Tauri 2.0 + React + TypeScript + CodeMirror 6 + SQLite (cache) + Zustand.

## Lisans

Loomen **açık kaynak-görünür ama ticari kullanıma kapalıdır.**

- Lisans: **[PolyForm Noncommercial 1.0.0](LICENSE)** — kişisel, eğitim, hobi ve ticari-olmayan
  her amaçla kullanım **serbest**; **ticari kullanım yasaktır.**
- Ticari lisans mi lazım? Proje sahibiyle iletişime geç — çift lisanslama mümkündür.
- Copyright © 2026 Ömer Faruk Erol.

## Katkı

PR'lara açığız. Katkı yapmadan önce [`CONTRIBUTING.md`](CONTRIBUTING.md) ve
[`CLA.md`](CLA.md) (Katkıcı Lisans Sözleşmesi — zorunlu) dosyalarını oku.

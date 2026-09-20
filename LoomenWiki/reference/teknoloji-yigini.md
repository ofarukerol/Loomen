---
module: teknoloji-yigini
repos: [Loomen]
status: aktif
last_updated: 2026-09-13
related_docs:
  - docs/planning/04-tech-stack.md
---

# Loomen — Teknoloji Yığını

## Seçim: Tauri 2 + React + TypeScript + Vite
- **Tauri 2:** tek kodla masaüstü ve mobil. Electron mobil vermediği için elendi; iki ayrı çatı (ör. React Native + masaüstü) tek geliştirici için iki kod tabanı demek, o da elendi. Svelte teknik olarak güzel ama React bilgisi ve hazır bileşen bolluğu tek kişilik hızda ağır bastı.
- **Kabul edilen risk:** Tauri mobil görece yeni. Azaltma: boş bir uygulamayı iOS + Android'de çalıştırıp dosya erişimi, bildirim ve CodeMirror'ı sınayan erken deneme.

## Kütüphaneler (bugün `package.json`'da olanlar)
| İş | Kullanılan |
|---|---|
| Editör | CodeMirror 6 (`@codemirror/*`) — Obsidian'ın da motoru |
| Durum | Zustand (`src/store/useAppStore.ts`) |
| Tarih | date-fns (göreli tarih: `src/lib/relativeDate.ts`) |
| Çok dil | i18next + react-i18next |
| Graf | d3-force |
| Çizim | Excalidraw |
| Ses | libflacjs + kendi WAV kodlayıcısı |
| İkonlar | lucide-react |
| Tauri eklentileri | fs, dialog, opener, deep-link |

Sürümler: React 19, Vite 7, TypeScript 5.8. Plan React 18 diyordu; 19'a geçildi.

## Planda olup henüz olmayanlar
- SQLite + FTS5 dizini (`tauri-plugin-sql`) — arama şu an JavaScript'te.
- `i18next-icu` (ICU çoğul biçimleri) ve derleme anında otomatik çeviri betiği.
- Tauri bildirim eklentisi (Pomodoro bildirimi için planlanmıştı).
- Tailwind / mantıksal CSS araçları — stil `src/styles/` altında.

## Bilerek dışarıda bırakılanlar
Ağır takvim kütüphaneleri, ORM, Redux, dış bildirim servisleri. Kural: her yeni bağımlılık bir mimari ihtiyaca karşılık gelmeli.

## Dağıtım
Masaüstü: `.dmg` / `.msi`-`.exe` / `.AppImage`-`.deb`. Mobil: Xcode ve Gradle. Uygulama kimliği `org.loomen.notes` (yayından sonra değiştirilemez). Mağaza ve imza adımları: `docs/yayinlama.md`.

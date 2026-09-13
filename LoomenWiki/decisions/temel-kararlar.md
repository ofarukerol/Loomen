---
module: temel-kararlar
repos: [Loomen]
status: aktif
last_updated: 2026-09-13
related_docs:
  - docs/planning/00-README.md
  - docs/planning/06-planlayici-pomodoro.md
  - docs/planning/08-design-system.md
---

# Loomen — Sabit Kararlar

Planlama fazında alınan ve bütün belgelerde geçerli kararlar. Değiştirmek için
kullanıcı onayı gerekir.

## Ürün
- **Tamamen lokal.** Çekirdek işlevler için sunucu ya da internet yok. Kasa (vault) = kullanıcının seçtiği yerel klasör.
- **Web sürümü yok.** Yalnız Tauri: masaüstü (macOS / Windows / Linux) + mobil (iOS / Android). Mobilde temel özellikler, masaüstünün birebir kopyası değil.
- **Veri formatı açık.** Notlar düz Markdown + YAML frontmatter. Görevler Obsidian **Tasks** sözdizimiyle (`- [ ]`, 📅 ⏳ 🛫 ✅ 🔁, 🔺🔼🔽). Tescilli format yok; aynı kasa Obsidian'da sorunsuz açılmalı.
- **Kendi eşitleme sunucusu yok.** Çoklu cihaz iCloud / Syncthing / Git gibi dışarıdaki araçlarla. Uygulama içi GitHub ve Google Takvim bağlantıları isteğe bağlı ek (bkz. [[mimari]]).
- **Tek geliştirici, yapay zekâ destekli.** Az parça, az bağımlılık bir tasarım kısıtıdır.
- **Datha'nın parçası değil.** `tenant_id`, PostgreSQL, NestJS gibi Datha kuralları burada geçersiz.

## Dil
- Kaynak ve varsayılan dil **Türkçe**; ilk fazda **İngilizce + Arapça**. Arapça yüzünden sağdan sola yazım (RTL) ilk günden birinci sınıf. Yeni dil eklemek kod değişikliği istememeli (hedef 20 dil). Ayrıntı: [[cok-dilli-altyapi]].
- Arayüzde "vault" yerine **"Kasa"** yazılır; kod içinde değişken adı `vault` kalır.

## Planlayıcı (kullanıcının verdiği dört karar)
1. Günlük not adı: `Daily/YYYY-MM-DD-Gün.md`, gün adı Türkçe (ör. `2026-06-12-Cuma.md`).
2. Hızlı ekleme (Inbox) sabit bir `Inbox.md`'ye değil, **bugünün günlük notuna** yazar; tarih verilirse o günün notuna.
3. Pomodoro tur sayısı görev satırına görünür yazılır: `- [ ] Rapor yaz 🍅×3`.
4. Zaman çizelgesi varsayılan olarak "son 30 gün + bütün gelecek"i gösterir; gecikenler tarihi ne olursa olsun her zaman görünür.

Ayrıntı: [[planlayici-takvim-pomodoro]].

## Veri güvenliği
- **Disk her zaman kazanır.** Dizin ve önbellek türetilmiştir, silinse dosyalardan yeniden kurulur.
- **Sessiz veri kaybı yok.** Kayıt atomik (geçici dosya + yeniden adlandırma), silme çöp kutusuna gider. Kalıcı silme ayrıca onay ister. Kasa üzerinde çalışırken `NOTE_SAFETY_RULES.md` kuralları geçerli.

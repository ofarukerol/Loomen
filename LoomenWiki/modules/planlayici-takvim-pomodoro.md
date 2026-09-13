---
module: planlayici-takvim-pomodoro
repos: [Loomen]
status: aktif
last_updated: 2026-09-13
related_docs:
  - docs/planning/06-planlayici-pomodoro.md
---

# Loomen — Planlayıcı, Takvim ve Pomodoro

Loomen'i Obsidian klonundan ayıran parça. Kaynak: kullanıcının kendi Obsidian planlama ekranı
(Tasks + Tasks Timeline + Calendar). Hedef his: hiçbir eklenti kurmadan, açılışta tam o ekran.
Kod: `src/screens/Planner/`.

## Zaman çizelgesi
- Bütün kasadaki görevler tek akışta, **tarihe göre gruplu**, kronolojik. Boş gün başlığı gösterilmez; bugün vurgulu.
- Tarih önceliği: bitiş (📅), yoksa planlanan (⏳), ikisi de yoksa **Planlanmamış** bölümü. Aynı gün içinde önce öncelik (🔺 > 🔼 > normal > 🔽), sonra dosya/satır sırası.
- Görev satırı: durum dairesi (tıkla → tamamla, dosyaya yaz) · metin · göreli tarih ("6 gün sonra") · kaynak not (tıkla → notun o satırına git) · `#etiket` (tıkla → süz) · varsa `🍅×N`. Geciken görev kırmızımsı vurgulu.
- Varsayılan pencere: son 30 gün + bütün gelecek; gecikenler her zaman görünür, eskisi "daha fazla yükle" ile.

## Bugüne Odaklan + sayaçlar
| Sayaç | Hesap (açık görevler) |
|---|---|
| Yapılacak | bitiş ya da planlanan tarih = bugün |
| Geciken | bitiş tarihi < bugün |
| Planlanmamış | bitiş ve planlanan tarih yok |

Karta tıklamak çizelgeyi o kümeye süzer; ikinci tıklama kaldırır. "Bugün" kullanıcının yerel saatine göre.

## Hızlı ekleme
- Tek satır + Enter. Hedef **bugünün günlük notu**; tarih verilirse o günün notu.
- Kısa yazımlar: `📅 2026-06-20`, `@bugün` / `@yarın` / `@pzt`, `#etiket`, `🔼`, `🔁 every week`.
- Doğal dil tarihi çözülemezse metin olduğu gibi yazılır; veri kaybolmaz.

## Takvim
Aylık ızgara, hafta Pazartesi başlar; görevli günlerde nokta. Güne tıklamak o günün günlük notunu
açar (yoksa şablondan oluşturur: `src/core/vault/dailyTemplate.ts`) ve o günün görevlerini listeler.
Takvim ve çizelge **aynı görev verisini** okur; ayrıca eşitleme yok.

## Pomodoro
- Durumlar: boşta → çalışma → kısa/uzun mola → çalışma. Her 4 turda bir uzun mola.
- Varsayılanlar 25 / 5 / 15 dk, 4 tur; otomatik mola ve otomatik sonraki tur açılıp kapanabilir.
- Bir göreve bağlanır; biten her çalışma turu satırdaki `🍅×N` sayacını artırır.
- Oturum özeti günlük nota yazılır. Mobilde bitiş zamanı saklanır ve zamanlanmış bildirim kurulur; bildirim izni yoksa sayaç görsel olarak yine çalışır.

## Kodla plan arasındaki fark (2026-09-13)
Planın ötesinde bir **pano** görünümü (Geciken / Bugün / Yaklaşan sütunları), görev detayı (alt görev,
tekrar, not), mini ajanda ve istatistik kartları var. Pomodoro bildirimi için Tauri bildirim eklentisi
henüz bağlı değil. Aralıklı tekrar çalışması (`docs/planning/09-tekrar.md`) ayrı bir dalda, `main`'de değil.

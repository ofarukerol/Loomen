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
- Tarih önceliği: bitiş (📅), yoksa planlanan (⏳), ikisi de yoksa **Planlanmamış** bölümü. Aynı gün içinde önce manuel sıra (sürükle-bırak ya da hızlı ekleme), sonra öncelik (🔺 > 🔼 > normal > 🔽), sonra dosya/satır sırası.
- Görev satırı: durum dairesi (tıkla → tamamla, dosyaya yaz) · metin · göreli tarih ("6 gün sonra") · kaynak not (tıkla → notun o satırına git) · `#etiket` (tıkla → süz) · varsa `🍅×N`. Geciken görev kırmızımsı vurgulu.
- Varsayılan pencere: son 30 gün + bütün gelecek; gecikenler her zaman görünür, eskisi "daha fazla yükle" ile.

## Bugüne Odaklan + sayaçlar
| Sayaç | Hesap (açık görevler) |
|---|---|
| Yapılacak | bitiş ya da planlanan tarihi olan bütün açık görevler (gecikenler dahil); mini listenin varsayılan görünümündeki satır sayısıyla aynı (LOM-67) |
| Geciken | bitiş tarihi < bugün |
| Planlanmamış | bitiş ve planlanan tarih yok |

Karta tıklamak çizelgeyi o kümeye süzer; ikinci tıklama kaldırır. "Bugün" kullanıcının yerel saatine göre.

## Hızlı ekleme
- Tek satır + Enter. Hedef **bugünün günlük notu**; tarih verilirse o günün notu.
- Mobilde ekran klavyesinin onay tuşu (Gönder) da ekler; kutu boşalır, klavye açık kalır. Yazım önerisi sürerken (IME) Enter eklemez.
- Kısa yazımlar: `📅 2026-06-20`, `@bugün` / `@yarın` / `@pzt`, `#etiket`, `🔼`, `🔁 every week`.
- Doğal dil tarihi çözülemezse metin olduğu gibi yazılır; veri kaybolmaz.
- Yeni görev kendi gününün bölümünde ilk sırada görünür: o günün en küçük sıra değerinden küçük bir manuel sıra değeri alır (LOM-69).

## Takvim
Aylık ızgara, hafta Pazartesi başlar; görevli günlerde nokta. Güne tıklamak o günün günlük notunu
açar (yoksa şablondan oluşturur: `src/core/vault/dailyTemplate.ts`) ve o günün görevlerini listeler.
Takvim ve çizelge **aynı görev verisini** okur; ayrıca eşitleme yok.

Google Takvim bağlıysa, etkinlik açıklamasındaki `- [ ] iş` / `[ ] iş` satırları (LOM-42) eşitlemede o
günün listesine sanal görev olarak gelir (`src/core/gcalItems.ts`, store'da `gcalTasks`; kasaya ve
Google'a gönderilen görevlere karışmaz). Listeden işaretleme ve başlık düzenleme açıklamanın yalnız o
satırını değiştirip Google'a yazar; yeni madde ekleme, silme, tarih değiştirme Google'dan yapılır.

## Tekrar eden görev (🔁, LOM-41)
- Kural ve sonraki tarih: `src/core/markdown/recurrence.ts` (`every day`, `every 2 days`, `every week on Monday`, `every month on the 15th`, `every year`, sonda `when done`). Tanınmayan kural görevi bozmaz; satır yalnız tamamlanır.
- Tamamlanınca satır ✅ ile kalır, altına (alt görev/not bloğundan sonra) **tek** yeni açık örnek açılır. Tarihler aynı gün farkıyla kayar; kaçırılan geçmiş tekrarlar atlanır (6 gün geciken günlük görev bugün kapanırsa yeni örnek yarına düşer). 🍅 sayacı sıfırlanır.
- Aynı dosyada aynı girinti, açıklama ve kuralla açık örnek zaten varsa yeni satır eklenmez; var olan kopyalar silinmez, kapatıldıkça erir.
- Geri alma, hemen alttaki satır birebir üretilen örnekse onu kaldırır; kullanıcı onu değiştirdiyse dokunmaz.
- Tarihi bugüne çekmek yalnız satırı günceller, kopya üretmez.
- Kopyalar ayrı dosyalardaysa (çakışma kopyası, günlük not) bu koruma kapsamaz; Zaman çizelgesindeki kaynak not hangisi olduğunu gösterir.

## Pomodoro
- Durumlar: boşta → çalışma → kısa/uzun mola → çalışma. Her 4 turda bir uzun mola.
- Varsayılanlar 25 / 5 / 15 dk, 4 tur; otomatik mola ve otomatik sonraki tur açılıp kapanabilir.
- Bir göreve bağlanır; biten her çalışma turu satırdaki `🍅×N` sayacını artırır.
- Oturum özeti günlük nota yazılır. Mobilde bitiş zamanı saklanır ve zamanlanmış bildirim kurulur; bildirim izni yoksa sayaç görsel olarak yine çalışır.

## Sağ blok kart sırası (LOM-72)
- Varsayılan sıra: Pomodoro, Takvim, Bugüne Odaklan, Tekrar, Alışkanlıklar (`src/core/layout/sideCards.ts`).
- Ayarlar → "Sağ blok kartları": beş kart her zaman listelenir; yukarı/aşağı düğmeleri (telefonda da) ve masaüstünde sürükleme sırayı değiştirir; "Varsayılana dön" sıra zaten varsayılansa pasif.
- Sıra `loomen.settings` kaydında (`sideCardOrder`) kalıcı. Açılışta temizlenir: bilinmeyen/tekrarlı kimlik atılır, eksik kart varsayılan sırayla sona eklenir.
- Kartlar kendi gizlenme kuralını korur: Tekrar modülü kapalıyken (listede "kapalı" rozeti) ve aktif alışkanlık yokken kart Planner'da çizilmez.

## Kodla plan arasındaki fark (2026-09-13)
Planın ötesinde bir **pano** görünümü (Geciken / Bugün / Yaklaşan sütunları), görev detayı (alt görev,
tekrar, not), mini ajanda ve istatistik kartları var. Pomodoro bildirimi için Tauri bildirim eklentisi
henüz bağlı değil. Aralıklı tekrar çalışması (`docs/planning/09-tekrar.md`) ayrı bir dalda, `main`'de değil.

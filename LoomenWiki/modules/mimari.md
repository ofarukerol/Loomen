---
module: mimari
repos: [Loomen]
status: aktif
last_updated: 2026-09-13
related_docs:
  - docs/planning/03-system-design.md
---

# Loomen — Mimari

## En riskli alan: disk ile dizinin kopması
Kasa düz `.md` dosyalarıdır ve dışarıdaki eşitleme araçları (iCloud, Syncthing, Git) bu dosyaları
uygulamanın arkasından değiştirir. Uygulamanın da bir dizini vardır. İkisi koparsa yanlış arama
sonucu, hayalet geri bağlantı ya da kaybolmuş görev çıkar. Bütün tasarım dört kurala dayanır:

1. **Disk her zaman kazanır.** Dizin yalnız türetilmiş önbellektir.
2. **Dosya izleyici zorunlu.** Oluştur / değiştir / sil / taşı olayları dinlenir, dizin parça parça güncellenir.
3. **Dizin her an atılıp yeniden kurulabilir.** Hiçbir kullanıcı verisi yalnız dizinde yaşamaz.
4. **Atomik yazma.** Geçici dosya + yeniden adlandırma; yarım yazılmış dosya kalmaz.

## Katmanlar
- **Arayüz** (React): editör, gezgin, planlayıcı, takvim, Pomodoro, graf, arama. İnce tutulur.
- **Çekirdek** (`src/core/`): kasa servisi, Markdown ayrıştırıcı, bağlantı dizini, görev motoru, planlayıcı mantığı, Pomodoro motoru, arama, graf. Platformu bilmez; arayüzü de bilmez.
- **Kapılar (port):** dosya sistemi, bildirim, dizin deposu, saat. Çekirdek yalnız bunları tanır.
- **Platform bağdaştırıcıları:** Tauri'ye özgü kod yalnız burada. Kodda `src/core/vault/tauriBackend.ts` (gerçek) ve `sampleBackend.ts` (örnek veri, ekran görüntüleri için) bu ayrımın karşılığı.

Hedef: kodun %85'ten fazlası masaüstü ve mobilde ortak.

## Veri modeli
- Kasa içinde `.loomen/` (önbellek, çalışma alanı, kasaya özel ayar) ve `.trash/` bulunur. İkisinin eşitlemeden hariç tutulması önerilir.
- **Görev bir satırdır.** Ayrıştırılıp nesneye çevrilir; değişince **aynı satıra, kayıpsız** geri yazılır. Tanınmayan emoji ve alanlar korunur. Kodda karşılığı `src/core/markdown/taskParser.ts`.
- Pomodoro geçmişi doğal olarak Markdown'da durmadığı için özeti günlük nota yazılır (taşınabilir kaynak), ayrıntısı hızlı istatistik için yerel kayıtta tutulur.

## Dışarıdan gelen değişiklik ve çakışma
- Uygulama kapalıyken değişen dosya açılışta yakalanır.
- Açık editördeki dosya diskte değişirse kullanıcıya sorulur ("yeniden yükle / benimkini koru"); sessizce ezilmez.
- Syncthing'in çakışma dosyaları normal not olarak görünür, kullanıcı elle birleştirir. Kendi birleştirme motorunu yazmak kapsam dışı.
- Mobilde izleyici sınırlı: uygulama öne gelince yeniden taranır. Pomodoro sayacı mobilde bitiş zamanına göre hesaplanır ve zamanlanmış bildirim kurulur.

## Güvenlik
Çekirdek hiçbir yere veri göndermez. Tauri izinleri yalnız seçilen kasa klasörüne açılır.
Şifreleme ilk sürümde yok. macOS'ta kalıcı kasa erişimi için sandbox yer imi (security-scoped bookmark) kullanılır (`src/core/bookmark.ts`).

## Plandan sapma (2026-09-13)
- Plan SQLite + FTS5 dizini öngörüyordu; kodda SQLite eklentisi yok, arama JavaScript tarafında (`src/core/search/search.ts`).
- Plan "ağ yok" diyordu; isteğe bağlı GitHub eşitleme ve Google Takvim bağlantısı eklendi. Çekirdek yine ağsız çalışır; bağlantılar kullanıcı açarsa devreye girer.

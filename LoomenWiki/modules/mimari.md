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
- **Başlıktan otomatik ad (LOM-76).** Elle ad verilmemiş not ("Adsız", "Adsız 2" deseni ya da bu oturumda oluşturulmuş not) yazma durunca ilk başlığına göre yeniden adlandırılır; içerik değişmez, ad doluysa "Ad 2" seçilir. Gezginden elle ad verilince izleme biter. Kodda `src/core/markdown/autoTitle.ts`.
- **Tabloda formül (LOM-79).** = ile başlayan hücre formüldür; sonuç yalnız ekranda hesaplanır, dosyada formül metni kalır. Başvuru Excel gibi (B2, B:B, aynı satır için B); sütun başlığı adıyla da (=TOPLA(Tutar), =Tutar-Ödenen), yalnız tek kelimelik başlıklar. Toplu fonksiyona adıyla verilen sütun (TOPLA(Tutar)) bütün sütundur; satırsız harf (TOPLA(B;C)) eskisi gibi aynı satırdır (LOM-88). Kodda `src/core/markdown/tableFormula.ts`.
- **Formül önerisi (LOM-88).** Hücre kutusunda = ve harf yazınca fonksiyon ve sütun listesi açılır; sütunlar harf · başlık (B · Tutar) olarak listelenir, seçilince tek kelimelik başlıkta ad, diğerinde harf yazılır; Enter/Tab/dokunma seçer, Esc yalnız listeyi kapatır. Saf mantık `src/core/markdown/formulaSuggest.ts`, kutu `tableWidget.ts` openCellEditor.
- **Sütun para birimi (LOM-89).** Başlık hücresinin kutusunun altındaki şeritten sütuna Yok/₺/$/€/£ seçilir. Seçim tablonun HEMEN altındaki gizli satırda saklanır: `<!-- loomen: para B=TRY -->` (anahtar sütun harfi, değer ISO kodu); "Yok" ile boşalırsa satır silinir. Not satırı tabloya aittir (blok sonu `metaLine ?? endLine`): düzenleme modunda dekorasyonla, okuma modunda ayrıştırıcıda gizlenir; Backspace koruması, blok ekleme ve belge sonu boş satırı onu da kapsar; sütun taşınınca para birimi aynı dispatch'te taşınır. Sayı ve formül sonucu ekranda "212.500 ₺" (sayı + boşluk + simge, ayraçlar arayüz dilinden); metin ve boş hücre olduğu gibi, dosyadaki sayılar değişmez. Saf mantık `src/core/markdown/tableMeta.ts`, testi `src/core/__test__/tableCurrencyTest.ts`.
- **Kütüphane (LOM-83).** Kitap dosyası (PDF/EPUB) kasaya girmez, cihazın uygulama klasöründe `loomen#library/` altında durur. Kasada yalnız `Kütüphane/<id>.json` kaydı (durum, kalınan yer, çizimler) ve kitabın Markdown notu bulunur; çizimler nota alıntı + bağlantı bloğu olarak yazılır. Kindle'ın `My Clippings.txt` çizimleri de (LOM-84) dosyasız `kindle` kaydı ve aynı not biçimiyle, tekrarsız alınır. Ayrıntı: [kutuphane](kutuphane.md).

## Dışarıdan gelen değişiklik ve çakışma
- Uygulama kapalıyken değişen dosya açılışta yakalanır.
- Açık editördeki dosya diskte değişirse kullanıcıya sorulur ("yeniden yükle / benimkini koru"); sessizce ezilmez.
- Syncthing'in çakışma dosyaları normal not olarak görünür, kullanıcı elle birleştirir. Kendi birleştirme motorunu yazmak kapsam dışı.
- Mobilde izleyici sınırlı: uygulama öne gelince yeniden taranır. Pomodoro sayacı mobilde bitiş zamanına göre hesaplanır ve zamanlanmış bildirim kurulur.

## Güvenlik
Çekirdek hiçbir yere veri göndermez. Tauri izinleri yalnız seçilen kasa klasörüne açılır.
Şifreleme ilk sürümde yok. macOS'ta kalıcı kasa erişimi için sandbox yer imi (security-scoped bookmark) kullanılır (`src/core/bookmark.ts`).

## Pencere sürükleme (masaüstü)
Üst çubuktan pencere taşımak iki şey ister: öğede `data-tauri-drag-region` işareti ve `src-tauri/capabilities/default.json` içinde `core:window:allow-start-dragging` izni. `core:default` bu izni içermez (çift tıklamayla büyütmeyi, `internal-toggle-maximize`, içerir). Tauri'nin sürükleme betiği yalnız doğrudan basılan öğedeki işarete bakar; bu yüzden düğmeler ve sekmeler işaretsiz bırakılır, tıklanabilir kalır. Testi: `src/core/__test__/windowDragTest.ts` (LOM-39).

## Plandan sapma (2026-09-13)
- Plan SQLite + FTS5 dizini öngörüyordu; kodda SQLite eklentisi yok, arama JavaScript tarafında (`src/core/search/search.ts`). Arama tire, boşluk, aksan ve büyük-küçük harf farkına ve küçük yazım hatasına dayanıklıdır; kelimeler ayrı yerde olsa da bulunur, en iyi eşleşme üstte sıralanır (LOM-81).
- Plan "ağ yok" diyordu; isteğe bağlı GitHub eşitleme ve Google Takvim bağlantısı eklendi. Çekirdek yine ağsız çalışır; bağlantılar kullanıcı açarsa devreye girer.

## Ayarlar: özellik kartları (LOM-82)
- Ayarlar'ın en üstünde altı kart: Yedekleme (GitHub), Takvim, Tekrar, Asistan, Alışkanlık Takibi, Kütüphane (LOM-83) (`src/screens/Settings/FeatureCards.tsx`, kimlik ve kural `src/core/settings/features.ts`). Her kartta ad, açıklama, durum (bağlı mı, kaç kart/sağlayıcı/alışkanlık) ve açma/kapama düğmesi.
- Bayraklar: Yedekleme, Takvim, Alışkanlık, Kütüphane `features` olarak `loomen.settings` kaydında (varsayılan hepsi açık; bozuk/eksik alan açığa döner). Tekrar kasadaki ayar dosyasındaki `enabled`, Asistan `aiEnabled` — ikinci kopya tutulmaz.
- Kapalıyken: o özelliğin Ayarlar bölümü çizilmez. Yedekleme/Takvim kapalıysa otomatik eşitleme kurulmaz, gezgin alt şeridi yerel kasa gibi görünür. Alışkanlık kapalıysa şerit düğmesi, telefon menüsü maddesi ve sağ blok kartı gizlenir. Kütüphane kapalıysa şerit düğmesi ve telefon menüsü maddesi gizlenir; açık okuyucu kapanır, nottaki kitap bağlantısı "Kütüphane kapalı" der. Kapatılan özelliğin ekranı açıksa Planner'a dönülür.
- Kapatmak veri silmez: GitHub/Google bağlantısı, anahtar zinciri, kasadaki alışkanlık ve tekrar dosyaları yerinde kalır.
- Tekrar ayarı okunmadan (yükleniyor/okunamadı) kartın düğmesi kilitlidir, okunamadıysa kartta Yeniden dene çıkar (LOM-71 koruması).
- Testi: `src/core/__test__/featuresTest.ts`.

# Loomen — Tekrar (Aralıklı Tekrar)

> **Amaç:** Öğrendiğin şey aklında kalsın. Bunun için her gün her notu okumak gerekmiyor —
> her bilgiyi, onu unutmaya en yakın olduğun gün bir kez karşına çıkarmak yetiyor.
>
> **Bu doküman, özelliğin neden böyle kurgulandığını anlatır.** Kod: `src/core/srs/`,
> ekran: `src/screens/Review/`, ayarlar: `src/screens/Settings/ReviewSettings.tsx`.

---

## 1. Temel kural: hiçbir not kendiliğinden girmez

Kasanda 2000 not olması 2000 kart demek değil. Bir not tekrara ancak sen işaretlersen girer:

| Nasıl işaretlenir | Ne olur |
|---|---|
| `Soru :: Cevap` | O satır tek yönlü bir soru olur |
| `Soru ::: Cevap` | İki kart olur — ileri ve geri |
| Soru satırları, tek başına `?`, cevap satırları | Çok satırlı soru |
| `Cümlede ==gizlenen== kelime` | Gizlenen her yer ayrı bir soru |
| Notta `#tekrar` etiketi | Notun tamamı, ara ara okuman için |

Hiçbirini yapmazsan o not sisteme hiç girmez. Modülün kendisi de varsayılan olarak **kapalıdır**;
kapalıyken hiçbir tarama yapılmaz ve kasada hiçbir dosya oluşmaz.

Bu işaretlemeler Obsidian'ın Spaced Repetition eklentisiyle uyumlu seçildi — dışarıdan
gelen not setleri çalışsın diye.

---

## 2. Bir kartın tarihi nasıl belirlenir

Her kart için iki sayı tutulur:

- **Ne kadar oturmuş** (`stability`) — bugün çalışırsan kaç gün sonra hâlâ hatırlarsın
- **Ne kadar zor** (`difficulty`) — bu kart senin için ne kadar çetin

Bir sorunun tarihi şu soruyla bulunur: *"bunu hatırlama ihtimalim ne zaman hedefimin altına düşer?"*
Cevap hangi günse, kart o gün çıkar. Yani tarihi kimse elle vermiyor; **hatırlama hedefi** belirliyor.

Doğru cevap verince "oturmuşluk" büyür, aralık uzar. Yanlış cevap verince küçülür ama
**sıfırlanmaz** — daha önce öğrendiğin bir kart, hiç görmediğin bir kart gibi baştan başlamaz.
Zorluk da zamanla ortalamaya geri çekilir; "bir kez zorlaştı, ömür boyu zor kaldı" durumu olmaz.
Eski yöntemin (SM-2) en bilinen derdi buydu.

Ayarlarda **eski yöntem** de seçilebilir: daha basit çalışır, unutunca aralığı sıfırlar.

> **Meraklısına · atlayabilirsin.** Yeni yöntem FSRS-6. Üç değişkenli bir bellek modeli:
> `R(t,S) = (1 + FACTOR·t/S)^(-decay)`, `FACTOR = 0.9^(1/-decay) − 1`. Aralık,
> `R` hedef orana düştüğü an. `R(S,S) = 0.90` özdeşliği gereği hedef %90 iken aralık = `S`.
> 21 parametre `src/core/srs/fsrs.ts` içinde `W` dizisinde; dışarıdan paket kullanılmıyor.

---

## 3. Günlük yükün yedi freni

İstenen şey buydu: "her gün her şeyi tekrar etmek" olmasın, günlük yük gerçekten kontrol
edilebilsin. Tek ayar yetmez; üst üste binen yedi fren var.

| # | Fren | Ne yapar | Varsayılan |
|---|---|---|---|
| 0 | **Açık kayıt** | İşaretlenmemiş not kart üretmez | — |
| 1 | **Günlük tavanlar** | Günde kaç yeni, günde en fazla kaç kart | 10 · 60 |
| 2 | **Yeni kart en son** | Yeniler, tekrarlardan **artan** yeri kullanır | açık |
| 3 | **Süre bütçesi** | Ölçülen cevap süresinden kuyruğu kırpar | 15 dk |
| 4 | **Hatırlama hedefi** | Aralıkları uzatır → yükü kaynağında azaltır | %90 |
| 5 | **Aynı güne yığmama** | Kartı, kabul edilebilir pencere içinde en boş güne kaydırır | açık |
| 6 | **Kolay günler + tatil** | Haftalık: normal / yarısı / kapalı; tatil aralığı | hepsi normal |

**En kritiği 2 numara.** Kuyruk şu sırayla toplanır: aynı gün öğrenme → tekrar → yeni.
Yeni kartlar en sona kaldığı için, birikme varken kendiliğinden durur; birikme kapanınca
geri açılır. Kullanıcı hiç müdahale etmese de yük patlamaz. `newIgnoresLimit` ile kapatılabilir.

**5 numara aralığı bozmaz.** Yalnızca zaten kabul edilebilir olan gün aralığında hangi günün
seçileceğini belirler (Anki'nin fuzz bantları: <2,5g yok · 2,5–7g %15 · 7–20g %10 · >20g %5).

Ayrıca birikme araçları var: **birikeni N güne yay**, **kartı dondur**, **bugünlük ertele**,
**en çok unutma riski olan önce** sıralaması.

---

## 4. Ayarlar üç kademeli

Boğmasın diye:

- **Basit** — hazır profil (Hafif/Dengeli/Yoğun), hatırlama hedefi, günlük dakika, kolay günler, tatil
- **Gelişmiş** — sayısal tavanlar, sıralama, yığmama, kardeş erteleme, çok unutulan kart işareti,
  hangi işaretlemelerin taranacağı, taranmayacak klasörler
- **Uzman** — hesap yöntemi, öğrenme adımları, en uzun aralık, desteler

Her üç sekmenin üstünde **canlı tahmin** durur: mevcut ayarlarla en yoğun dönemde günde kaç
kart çıkacağı. Kapalı formülle hesaplanamaz (asıl yükü unutmalar üretir), o yüzden bir yıl
ileri sarılıp en yoğun 30 günün ortalaması alınır. Sabit tohumlu, yani sayı ekranda zıplamaz.

---

## 5. Veri nerede durur

```
<kasa>/Tekrar/durum.json     — kart durumları + günlük sayaçlar
<kasa>/Tekrar/gecmis.jsonl   — her cevabın kaydı, yalnızca eklenir
<kasa>/Tekrar/ayarlar.json   — ayarlar ve desteler
```

Görünür bir klasör, çünkü **GitHub senkronu yalnız görünür dosyaları taşır** — gizli bir
`.loomen/` klasörü cihazlar arasında senkronlanmazdı. Dosya ağacında görünmez, çünkü ağaç
yalnız `.md` ve `.excalidraw` listeler.

**`NOTE_SAFETY_RULES.md` kural 5 gereği not dosyalarına hiç yazılmaz.** Obsidian'ın SR eklentisi
durumu notun içine yorum olarak (`<!--SR:...-->`) gömer; Loomen bunu yapmaz — her cevapta not
dosyasını yeniden yazmak tablo/frontmatter bozma riski taşır. Testte bu doğrulanır
(`src/core/__test__/srsTest.ts`).

**Kart kimliği** = `hash(not yolu + normalize edilmiş soru metni)`. Satır numarası kullanılmaz,
çünkü satırlar kayar. Not yeniden adlandırılınca kimlikler yeniden hesaplanır ve geçmiş taşınır.
Soru metni düzenlenirse kimlik değişir; bu durumda **aynı nottaki** eşleşmemiş kayıtlar arasında
en yakın metin aranır ve geçmiş oraya taşınır (eşik %60 benzerlik). Bulunamazsa yeni kart sayılır.

---

## 6. İsimlendirme

"Tekrar" adı bu özelliğe verildi. Görev panelindeki eski `🔁` alanı, karışmasın diye
**"Sıklık"** olarak yeniden adlandırıldı (`taskDetail.recurrence`).

---

## 7. Sonraki adımlar

- **Kişiye özel ayar öğrenme:** `gecmis.jsonl` biriktikçe, kullanıcının kendi verisinden
  FSRS parametreleri eğitilebilir. Kayıt baştan doğru tutulduğu için bu sonradan mümkün.
- **Raporlar ekranına entegrasyon:** tutma oranı, ısı haritası, gelecek yük.
- **Nottan otomatik kart üretimi:** mevcut `src/core/ai/llm.ts` ile.
- **Anki `.apkg` içe/dışa aktarma.**

---

## 8. Test

```bash
npx esbuild src/core/__test__/srsTest.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/srsTest.mjs && node /tmp/srsTest.mjs
```

41 test: ayrıştırma, aralık hesabı, kimlik kararlılığı, yeniden adlandırma göçü,
soru düzenlemede kurtarma, yedi frenin her biri ve NOTE_SAFETY doğrulaması.

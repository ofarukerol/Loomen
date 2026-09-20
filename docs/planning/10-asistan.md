# Loomen — Yapay Zekâ Asistanı

> **Amaç:** Kendi notlarına soru sorabilmek. "Geçen ay o toplantıda ne konuşmuştuk?" diye
> sorduğunda, cevabı notlarından bulup **nereden aldığını göstererek** söyleyen bir yardımcı.
>
> **Bu doküman özelliğin neden böyle kurgulandığını anlatır.** Kod: `src/core/ai/`, ekran:
> `src/screens/Assistant/`, ayarlar: `src/screens/Settings/AiSettings.tsx`, ağ tarafı:
> `src-tauri/src/ai/`.

---

## 1. Modül tamamen opsiyoneldir

Loomen'ın sözü "tamamen lokal çalışır". Asistan bu sözü bozmaz, çünkü:

- Modül **varsayılan kapalıdır**. Kapalıyken asistan kodu hiç çalışmaz, ribbon'da düğmesi
  bile görünmez, ağa tek bir istek çıkmaz.
- Açmak tek başına yetmez: kullanıcı bir sağlayıcı seçip kendi API anahtarını girmelidir.
- **Tamamen çevrimdışı da kullanılabilir:** sağlayıcı türü "Kendi sunucum" seçilip Ollama /
  LM Studio gibi kendi bilgisayarındaki bir adres verilirse hiçbir veri cihazdan çıkmaz.

Açıkken ne gönderildiği gizlenmez: sorulan soru ve **yalnızca soruyla ilgili bulunan not
bölümleri** gider. Ayarlardaki "Gönderilen bağlamı sakla" açılırsa her cevabın altında
sağlayıcıya giden ham metin birebir görülebilir.

---

## 2. API anahtarı webview'e hiç girmez

Anahtar, işletim sisteminin anahtar zincirinde durur (macOS Keychain, Windows Credential
Manager, Linux Secret Service); mobilde uygulama konteynerinde. Arayüz anahtarı **yazar ama
okuyamaz** — kutu her zaman boş açılır, yalnızca "kayıtlı" rozeti gösterilir.

Bunun pratik sonucu: ağa çıkan bütün istekler Rust tarafında kurulur (`ai/llm.rs`,
`ai/stt.rs`). Webview'de `fetch` yok. Bir gün arayüzde bir açık çıksa bile anahtar orada
değildir.

---

## 3. Cevap notlardan gelir (arama + alıntı)

Soru geldiğinde kasadaki notlarda arama yapılır ve yalnızca en alakalı bölümler modele
gönderilir. Bütün kasa gönderilmez: hem pahalı olurdu hem de modelin dikkatini dağıtırdı.

| Aşama | Dosya | Ne yapar |
|---|---|---|
| Bölümleme | `chunk.ts` | Notu başlık hiyerarşisini koruyarak parçalara böler; kod bloğu ve tablo ortadan bölünmez, frontmatter atlanır |
| Arama | `bm25.ts` | Sözcük tabanlı arama. Türkçe ekleri yakalamak için her sözcük hem tam hâliyle hem ilk 5 harfiyle indekslenir — "toplantıda" sorgusu "toplantı" notunu bulur, tam eşleşme yine üstte kalır |
| Getirme | `retrieve.ts` | Not başına parça önbelleği (değişmeyen not yeniden bölünmez) + sonuç birleştirme |
| Bağlam | `context.ts` | Modele giden metni ve alıntı numaralarını kurar |

Modelden kullandığı her bölümü `[1]`, `[2]` diye göstermesi istenir; arayüz bu numaraları
tıklanabilir not bağlantısına çevirir. **"Uydurdu mu?" sorusunun tek dürüst cevabı budur:**
kaynağa tıklayıp bakarsın.

Editördeki **kaydedilmemiş taslak da** aramaya dahildir — kullanıcının ekranda gördüğü metin
sorulabilsin diye. Ayarlardan klasör bazında dışlama yapılabilir; oradaki notlar hiç okunmaz.

---

## 4. Sesle sorma

Mikrofona basılır, konuşulur, tekrar basılır. Kayıt ham PCM olarak yakalanıp 16 kHz mono
WAV'a kodlanır ve sağlayıcıya gönderilip metne çevrilir (`hooks/useMicRecorder.ts` →
`core/ai/stt.ts` → `src-tauri/src/ai/stt.rs`).

`MediaRecorder` **kullanılmaz**; ses notu kaydedicisinde olduğu gibi ham PCM yakalanır.
Sebebi orada yazılı: MediaRecorder'ın konteyner çıktısı platformdan platforma değişiyor.

Sağlayıcıya göre iki yol var:

| Sağlayıcı | Nasıl |
|---|---|
| Google Gemini | Ses `inline_data` olarak sohbet modeline gider; ayrı model gerekmez |
| OpenAI / Kendi sunucum | `/audio/transcriptions` ucu. **Buradaki model sohbet modeli değildir** — ayrı bir "Ses modeli" alanı var, boş bırakılırsa `whisper-1`. Kendi sunucusunda yerel bir whisper de kullanılabilir |
| Anthropic | Ses desteği yok; ne yapılacağını söyleyen bir hata döner |

**Anlaşılan metin doğrudan gönderilmez**, soru kutusuna düşer: kullanıcı ne anlaşıldığını
görür, yanlışsa düzeltir. Akıcı kullanım isteyen "Sesi çevirince doğrudan gönder" ayarını
açar. Kayıt üst sınırı 2 dakikadır (durdurmayı unutmak devasa bir dosyaya dönüşmesin).

---

## 5. Not yazma: öneri + onay

Asistan "şunu not et" isteğini karşılayabilir ama **dosyaya kendi yazmaz**. Ne yapacağını bir
blok hâlinde söyler, arayüz bunu önizlemeli bir karta çevirir, kullanıcı **Uygula** derse
yazılır (`core/ai/proposal.ts`).

**Yalnız iki işlem var: nota EKLEME ve YENİ NOT.** Üzerine yazma ve silme bilerek yoktur. En
kötü ihtimalle fazladan bir paragraf ya da fazladan bir not oluşur; ikisi de geri alınabilir.
"Asistan notumu bozdu" diye bir hikâye bu yüzden mümkün değildir.

Denetimler:

- Yol kasa köküne göreli olmalı. `..` ile yukarı tırmanan, mutlak, gizli klasöre giren ya da
  uygulamanın kendi verisine (`Tekrar/`, `.trash`) dokunan yollar reddedilir.
- Yeni notta ad çakışırsa **üzerine yazılmaz**, sıradaki boş ad kullanılır.
- Olmayan bir nota ekleme istenirse sessizce oluşturulmaz, kullanıcıya söylenir.
- Yazmadan önce bekleyen taslak diske geçer; hedef açık notsa taslak da aynı içerikle
  tazelenir — yoksa autosave sonradan ateşleyip eklemeyi silerdi (`NOTE_SAFETY_RULES.md`).

Özellik ayarlardan tamamen kapatılabilir; kapalıyken modele yazma yönergesi hiç gitmez.

---

## 6. Sohbet kalıcı değildir

Konuşma yalnızca oturum boyunca durur, diske yazılmaz. Kalması istenen bir cevap varsa öneri
akışıyla nota işlenir. Sebep basit: sohbet geçmişi de bir veridir ve Loomen'da veri, kullanıcının
okuyabildiği düz dosyalarda durur — gizli bir veritabanında değil.

---

## 7. Sonraki adımlar

- **Notlar arası çıkarım:** şu an her soru bağımsız aranıyor; "şu üç notu karşılaştır" gibi
  çok adımlı sorular için daha iyi bir getirme gerekir.
- **Yerel gömme (embedding) ile anlamsal arama:** sözcük tabanlı arama eş anlamlıyı yakalamaz.
- **Tekrar kartı üretimi:** `09-tekrar.md` §7'de not edildi — nottan otomatik soru çıkarma.

---

## 8. Test

```bash
npm test          # aiTest: bölümleme, arama, bağlam, öneri güvenliği, ses köprüsü
```

Öneri tarafındaki testler bir **güvenlik testidir**: kasa dışına çıkan yol, gizli klasör,
`Tekrar/` verisi, bozuk blok ve üzerine yazma denemesi ayrı ayrı denenir.

---
module: yapay-zeka-asistani
repos: [Loomen]
status: aktif
last_updated: 2026-09-21
related_docs:
  - docs/planning/10-asistan.md
  - NOTE_SAFETY_RULES.md
---

# Loomen — Yapay Zekâ Asistanı

Kendi notlarına soru sorma. Cevap notlardan gelir ve **nereden alındığı gösterilir**.
Kod: `src/core/ai/`, ekran: `src/screens/Assistant/`, ağ tarafı: `src-tauri/src/ai/`.

## Modül opsiyonel, varsayılan kapalı
Kapalıyken asistan kodu hiç çalışmaz, ribbon'da düğmesi görünmez, ağa istek çıkmaz. Açmak da
yetmez: kullanıcı bir sağlayıcı seçip kendi API anahtarını girer. "Kendi sunucum" (Ollama,
LM Studio) seçilirse hiçbir veri cihazdan çıkmaz — Loomen'in "tamamen lokal" sözü korunur.

## Anahtar webview'e hiç girmez
Anahtar işletim sisteminin anahtar zincirinde durur (`src-tauri/src/ai/keys.rs`); mobilde
uygulama konteynerinde. Arayüz yazar ama **okuyamaz** — kutu hep boş açılır, yalnız "kayıtlı"
rozeti görünür. Ağa çıkan her istek Rust'ta kurulur; webview'de `fetch` yok.

## Cevap notlardan gelir
| Aşama | Dosya | Ne yapar |
|---|---|---|
| Bölümleme | `chunk.ts` | Başlık hiyerarşisini koruyarak böler; kod bloğu/tablo ortadan bölünmez |
| Arama | `bm25.ts` | Sözcük tabanlı; Türkçe eki yakalamak için sözcük hem tam hem ilk 5 harfiyle indekslenir |
| Getirme | `retrieve.ts` | Not başına parça önbelleği; kasa değişince sıfırlanır |
| Bağlam | `context.ts` | Modele giden metin + alıntı numaraları |

Modelden her bölümü `[1]` biçiminde anması istenir; arayüz bunu tıklanabilir nota çevirir.
Kaydedilmemiş taslak da aramaya girer. Ayarlardan klasör dışlanabilir; oradaki not hiç okunmaz.

## Sesle sorma
Mikrofona bas → konuş → tekrar bas. Ham PCM yakalanır (MediaRecorder değil — konteyner çıktısı
platforma göre değişiyor), 16 kHz mono WAV'a kodlanır, sağlayıcıya gider.
Gemini'de ses sohbet modeline `inline_data` olarak gider; OpenAI ve uyumlu uçlarda
`/audio/transcriptions` kullanılır ve **oradaki model sohbet modeli değildir** — ayrı "Ses
modeli" alanı var (varsayılan `whisper-1`). Anthropic'te ses yok, anlaşılır hata döner.
Anlaşılan metin doğrudan gönderilmez, kutuya düşer; isteyen "doğrudan gönder"i açar.

## Not yazma: öneri + onay
Asistan dosyaya kendi yazmaz. Cevabın altında önizlemeli bir kart çıkar, **Uygula** denirse
yazılır (`core/ai/proposal.ts`). Yalnız **ekleme** ve **yeni not** var; üzerine yazma ve silme
bilerek yok. Kasa dışına çıkan / gizli klasöre giren / `Tekrar/` verisine dokunan yol reddedilir,
yeni notta ad çakışırsa sıradaki boş ad kullanılır. Yazmadan önce bekleyen taslak diske geçer
(bkz. `NOTE_SAFETY_RULES.md`). Ayarlardan kapatılabilir.

## Sohbet kalıcı değil
Konuşma oturumlukdur, diske yazılmaz. Kalması istenen cevap öneri akışıyla nota işlenir.

## Tuzaklar
- OpenAI tarafında sohbet modelini ses alanına yazmak sessiz bir hataya dönüşür; ses için ayrı
  model gerekir.
- Testler `npm test` ile koşar. Daha önce `node_modules/.bin/esbuild` üzerinden koşuluyordu ve
  **Windows'ta hiç çalışmıyordu**; artık esbuild'in JS API'si kullanılıyor.

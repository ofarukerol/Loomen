---
name: LOO-1 — Not Kısmı
description: Not editöründe tablo/blok eklemede imlecin bloğun altına inememesi dahil, kod okumasıyla doğrulanan 12 kararlılık hatasını düzelt; bugün hiç olmayan resim ekleme (yapıştır/sürükle → Ekler klasörü → notta gösterim) için asgari destek ekle; çekirdek yardımcılar için node testi yaz. Varsayım: "resim eklediğimde" ifadesi mevcut olmayan bir özelliğe işaret ediyor, bu yüzden asgari resim ekleme kapsam içine alındı.
type: project
proje: loomen
kaynak: kart LOO-1 · dal fix/LOO-1 · Loomen@e2e4097537faa116c0a936d8c6afd39015fd3e2c · test koşusu 5d466881-619f-4f14-ada0-766d6be094a8 (Air)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-09-17
---

# LOO-1 — Not Kısmı

## Ne yapıldı

Not editöründe tablo/blok eklemede imlecin bloğun altına inememesi dahil, kod okumasıyla doğrulanan 12 kararlılık hatasını düzelt; bugün hiç olmayan resim ekleme (yapıştır/sürükle → Ekler klasörü → notta gösterim) için asgari destek ekle; çekirdek yardımcılar için node testi yaz. Varsayım: "resim eklediğimde" ifadesi mevcut olmayan bir özelliğe işaret ediyor, bu yüzden asgari resim ekleme kapsam içine alındı.

## Adımlar

- TESPİT 1 (tableWidget.ts): Tablo dekorasyonu atomik değil → ok tuşlarıyla imleç gizli tablo kaynağının içine giriyor, görünmez oluyor, yazılan harf tabloyu bozuyor. tableField'ı StateField + EditorView.atomicRanges + inputHandler içeren tek Extension dizisi olarak dışa aktar (adı aynı kalsın, CodeMirrorEditor değişmesin).
- TESPİT 2 (tableWidget.ts): Tablo dokümanın sonundaysa veya altında boş satır yoksa imleç tablonun altına inemiyor; blok bitişine yazılan metin son satıra yapışıyor. inputHandler: imleç bir tablo bloğunun bitişindeyse önce "\n" ekle, sonra metni yaz; Enter doğal olarak yeni satır açsın.
- TESPİT 3 (editorCommands.ts insertBlock): Eklenen blok mevcut satıra yapışıyor, imleç bloğun altındaki yeni boş satıra değil, sonraki mevcut satırın başına gidiyor. Bloğu önce/sonra boş satırla (çift boşluk üretmeden) ekle; tablo/hr/callout için imleci bloğun altındaki boş satıra, kod bloğu için çitin içine koy. Değişiklik hesabını EditorState alan saf bir fonksiyona (insertBlockSpec) taşı ki test edilebilsin.
- TESPİT 4 (tableWidget.ts cellContentRange): Başlıktan kısa satırlardaki doldurulmuş hücre düzenlenince kayıt sessizce düşüyor. Eksik hücreler için satıra önce '|' ekleyip sonra yaz.
- TESPİT 5 (tableWidget.ts TableWidget.eq/from): eq 'from' içeriyor → tablonun üstüne her tuş vuruşunda widget DOM'u yeniden kuruluyor; colWidths 'from' ile anahtarlı olduğundan üstteki metin değişince sütun genişlikleri kayboluyor. eq'dan from'u çıkar, konumu tıklama anında view.posAtDOM ile çöz, genişlikleri dokümandaki tablo sırasına göre anahtarla.
- TESPİT 6 (tableWidget.ts buildTables): Kod bloğu (```) içindeki tablo benzeri metin de tablo widget'ına dönüşüyor. syntaxTree FencedCode aralıklarını atla.
- TESPİT 7 (tableWidget.ts editCell): position:fixed hücre kutusu editör kaydırılınca havada kalıyor. Kaydırma/yeniden boyutlanmada kaydedip kapat; Tab/Shift+Tab ile komşu hücreye geç (kaydederek).
- TESPİT 8 (livePreview.ts): atomicRanges TÜM dekorasyonları kapsıyor, cm-wikilink mark'ı da dahil → [[bağlantı]] metninin ortasına tıklanamıyor/ok tuşuyla girilemiyor, imleç kenara zıplıyor. Yalnız gizleme (HIDE) ve ses widget aralıklarından ayrı bir RangeSet üretip atomicRanges'a onu ver.
- TESPİT 9 (CodeMirrorEditor.tsx): markdown() varsayılan commonmark tabanla kuruluyor → GFM yok; ~~üstü çizili~~ işaretleri hiç gizlenmiyor (StrikethroughMark ölü kod), görev kutuları ayrıştırılmıyor. markdown({ base: markdownLanguage }) kullan.
- TESPİT 10 (livePreview.ts): Dekorasyonlar yalnız doc/selection/viewport değişiminde yenileniyor; büyük notta artımlı ayrıştırma bitince başlık/işaret gizleme gecikiyor. syntaxTree değiştiğinde de yeniden hesapla.
- TESPİT 11 (useAppStore.ts + EditorScreen.tsx): 700 ms otomatik kayıt bekleyicisi sekme/not değişiminde ve uygulama kapanışında temizleniyor, openNote/setActiveTab/closeTab taslağı kaydetmeden değiştiriyor → son tuş vuruşları kayboluyor. Store'a flushDraft() ekle: draftPath varsa ve draft != noteContents[draftPath] ise draftPath'e yaz (NOTE_SAFETY kural 1-2 ile uyumlu: hedef her zaman draftPath). openNote/setActiveTab/closeTab başında çağır; EditorScreen'de unmount ve beforeunload/visibilitychange(hidden) anında çağır. toggleTask'ın aktif nottaki draft'ı güncellediğini doğrula, güncellemiyorsa düzelt (yoksa otomatik kayıt işareti geri alır).
- TESPİT 12 (CodeMirrorEditor.tsx): CM dış value değişikliğini almıyor; store draft'ı dışarıdan değişince (ses kaydı yeniden adlandırma, görev işaretleme, asistan) editör eski metni tutuyor ve sonraki tuş vuruşu değişikliği eziyor. value prop'u CM dokümanından farklıysa seçimi koruyarak tek bir replace dispatch et (onChange→setDraft döngüsü eşitlik kontrolüyle kırılır).
- YENİ (resim): Bugün resim ekleme hiç yok: yapıştır/sürükle işleyicisi, ![[x.png]] gösterimi ve Ekler klasörü yok. Store'a saveAttachment(bytes, ext, notPath) → 'Ekler/<not-adı>-<zaman>.<ext>' (backend.writeBinary mevcut). imageEmbed.ts: CM paste (clipboardData.files) ve drop işleyicisi + Tauri getCurrentWebview().onDragDropEvent (HTML5 drop Tauri'de yutulur) → dosyayı kaydet, imlecin satırından sonra kendi satırında ![[Ekler/...]] ekle, altına boş satır aç ve imleci oraya koy; aktif satır dışında satırı <img> widget'ıyla (readBinary → blob URL, AudioEmbedPlayer deseni) göster. Markdown.tsx okuma modunda aynı satırı <img> olarak bassın. app.css'e cm-image/lo-image stili, 3 dile hata metni.
- TEST (src/screens/Editor/__test__/editorTest.ts, mevcut esbuild+node deseni): splitTableRow/isSeparator/tableBlockRange/cellContentRange (kısa satır dahil), buildTables'ın kod bloğu içini atlaması, insertBlockSpec'in boş satır/imleç konumu (doküman sonu, satır ortası, dolu satır), livePreview atomik kümesinin wikilink mark'ını içermemesi, firstSectionCaret. Çalıştır: npx esbuild <test> --bundle --platform=node --format=esm --outfile=/tmp/editorTest.mjs && node /tmp/editorTest.mjs. Ardından npm run build (tsc) yeşil olmalı.
- ELLE DOĞRULAMA (npm run dev, örnek kasa modu tarayıcıda; Tauri'de sürükle-bırak): tablo ekle → imleç altında; ok tuşlarıyla tablo üzerinden atla; doküman sonundaki tabloda Enter ve harf yaz; kısa satır hücresini düzenle; [[link]] ortasına tıkla; ~~metin~~ işaretleri gizlensin; yaz ve 700 ms içinde sekme değiştir → kayıp yok; NOTE_SAFETY_RULES §3'teki 4 senaryo (çapraz sızıntı, aktif notu silme, tablo round-trip, çöp→geri yükleme); resim yapıştır/sürükle → Ekler'e düşer, notta görünür, imleç altında.

## Dokunulan dosyalar

- `Loomen/src/screens/Editor/tableWidget.ts`
- `Loomen/src/screens/Editor/editorCommands.ts`
- `Loomen/src/screens/Editor/livePreview.ts`
- `Loomen/src/screens/Editor/CodeMirrorEditor.tsx`
- `Loomen/src/screens/Editor/imageEmbed.ts`
- `Loomen/src/screens/Editor/Markdown.tsx`
- `Loomen/src/screens/Editor/EditorScreen.tsx`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/styles/app.css`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/screens/Editor/__test__/editorTest.ts`
- `Loomen/src-tauri/capabilities/default.json`

## Test

Testler geçti.

> Sabit test kopyasında derleme, 79 editör kontrolü ve kasa testleri geçti. Editörün ilk koşusu import.meta.env eksikliğinde durdu; komuta boş ortam tanımı eklenince geçti. srsTest bulunmuyor; elle/Tauri testleri yapılmadı. Kaynaklar değişmedi. Kopyanın dalı master; dal değiştirilmedi, push yapılmadı.

## Kanıt

- Dal: `fix/LOO-1`
- Commit: `Loomen@e2e4097537faa116c0a936d8c6afd39015fd3e2c`
- Test koşusu: `5d466881-619f-4f14-ada0-766d6be094a8` (Air)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

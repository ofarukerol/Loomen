---
name: LOM-43 — Graf: yalnız kullanıcının verdiği bağlantılar görünsün
description: Testler kaldı: Graf varsayılanda yalnız notlardaki açık [[bağlantı]] ve not hedefli markdown bağlantılarını çizer; etiket ve var olmayan not düğümleri ayardan açılır, kod bloğu içindeki bağlantılar sayılmaz, kenar üretimi saf modüle taşınıp birim testlenir ve Ömer'in kasasındaki kenar kaynakları betikle raporlanır.
type: project
proje: loomen
kaynak: kart LOM-43 · dal fix/LOM-43 · commit yok · test koşusu 31fb2937-9bc1-47bf-943a-01025875de24 (Excalibur)
guven: iddia
durum: gelistirildi
---

# LOM-43 — Graf: yalnız kullanıcının verdiği bağlantılar görünsün

## Ne yapıldı

Graf varsayılanda yalnız notlardaki açık [[bağlantı]] ve not hedefli markdown bağlantılarını çizer; etiket ve var olmayan not düğümleri ayardan açılır, kod bloğu içindeki bağlantılar sayılmaz, kenar üretimi saf modüle taşınıp birim testlenir ve Ömer'in kasasındaki kenar kaynakları betikle raporlanır.

## Adımlar

- links.ts: stripCode(content) ekle — ``` ve ~~~ çitli blokları ve satır içi `kod` parçalarını boşlukla değiştirir (satır sayısı korunur). extractWikiLinks ve extractTags bunu uygulasın; parseWikiLinks ve rewriteWikiLinks dokunulmadan kalsın.
- links.ts: normalizeLinkTarget içinde tablo kaçışı `\|` takma ad ayracı sayılsın (sondaki ters eğik çizgi atılır); parseWikiLinks'teki takma ad bölmesi de aynı kuralı kullansın.
- links.ts: extractMarkdownLinks(content) ekle — `[metin](hedef)` yakalar, başında `!` olan gömüleri, `şema:` ile başlayan dış adresleri (http, https, mailto, obsidian vb.), yalnız `#çapa` hedeflerini atlar; `<>` sarmalını, URL kodlamasını (%20) ve `#başlık` kısmını temizler, .md uzantısını atar; kod blokları stripCode ile ayıklanmış metinden okunur.
- Yeni saf modül src/screens/Graph/graphModel.ts: buildGraphModel(notes, contents, { tags, orphans, ghosts }) — React/d3 import etmez. Önce çözüm indeksi kurar: NFC tam ad → yol, katlanmış ad → yol, uzantısız yol → yol, katlanmış uzantısız yol → yol (aynı ad birden çok notta varsa liste sırasındaki ilk kazanır, deterministik). Yalnız kind 'note' olan dosyaların içeriği ayrıştırılır; çizim dosyaları yalnız hedef olabilir.
- graphModel.ts: kenarlar wiki (extractWikiLinks) ve markdown (extractMarkdownLinks; önce kök yol, sonra notun klasörüne göreli yol, sonra ad) kaynaklarından üretilir; her kenar kaynak türünü taşır (wiki | md | tag). Çözülemeyen hedef ghosts açıkken kind 'ghost' düğüm olur (id '?' + katlanmış hedef, ad ham hedef), kapalıyken atlanır. tags açıkken etiket düğümleri eski gibi eklenir. Kendine bağlantı ve tekrar kenar elenir; orphans kapalıyken derecesi sıfır notlar gizlenir; hub seçimi etiket ve hayalet düğümleri dışlar. Dönüş: nodes, links, hubId, neighbors, noteCount, tagCount, ghostCount.
- GraphScreen.tsx: buildGraph'ı kaldırıp graphModel'i kullan; Display'e ghosts ekle; DISPLAY_DEFAULTS { tags: false, orphans: true, ghosts: false, arrows: false, textFade: 1.1 }; useMemo bağımlılıklarına display.ghosts ekle; ayar paneline 'Var olmayan notlar' onay kutusu ekle; çizimde kind 'ghost' düğümleri kesikli kenarlıkla, soluk dolguyla ve fg3 renkli etiketle çiz (setLineDash sonrası sıfırla), tıklanınca not açılmasın (mevcut kind === 'note' koşulu zaten korur).
- Çeviri: tr/en/ar translation.json'da graph.ghosts anahtarı ekle (tr 'Var olmayan notları göster', en 'Show unresolved notes', ar karşılığı); tr'de graph.tags → 'Etiketleri göster', graph.orphans → 'Bağlantısız notları göster' (en/ar eşdeğerleri); help.graphBody metnindeki 'yeşil düğümler etiketleri gösterir' cümlesini 'etiketler ayardan açılınca yeşil düğüm olarak gelir' anlamına çevir. Üç dosyanın anahtar kümesi aynı kalsın.
- Testler: src/core/__test__/graphTest.ts yaz ve scripts/run-tests.mjs suites listesine ekle. Senaryolar: iki not arası wiki kenarı; çitli kod bloğu ve satır içi koddaki [[X]] kenar üretmez; `[[Not\|ad]]` tablo hücresinde doğru nota çözülür; `[x](Notlar/Proje%20X.md)` kenar üretir, `[x](https://a.b/c[1])`, `[x](mailto:a@b.c)`, `![r](Ekler/a.png)`, `[x](#başlık)` üretmez; nota göreli markdown yolu çözülür; çözülemeyen hedef ghosts kapalıyken düğüm/kenar yok, açıkken ghost düğüm + kenar; tags kapalıyken etiket düğümü yok, açıkken var; NFD dosya adı ile NFC bağlantı eşleşir; katlanmış ad (istanbul → İstanbul) eşleşir; aynı adlı iki notta yol verilen bağlantı doğru nota gider; çizim dosyasının JSON içeriği kenar üretmez; orphans kapalıyken derecesi sıfır not gizlenir; kendine bağlantı ve tekrar kenar elenir. coreTest.ts 'Wiki bağlantıları' bölümüne stripCode ve extractMarkdownLinks için birkaç eq ekle.
- Kasa analiz betiği scripts/graf-kenar-analizi.mjs: run-tests.mjs'teki gibi esbuild ile graphModel.ts ve links.ts'yi geçici dosyaya derleyip içe alır; argümandaki kasa klasörünü tauriBackend gibi nokta ile başlayan klasörleri atlayarak dolaşır, .md dosyalarını NFC adla yükler; eski kural (etiket açık, kod ayıklamasız, tam ad eşleşmesi) ile yeni kuralı yan yana çalıştırıp şunları yazar: not sayısı, kaynak türüne göre kenar sayısı (wiki, md, etiket), yalnız kod bloğundan gelen kenarlar ve ilk 10 örneği (dosya + hedef), çözülemeyen hedef sayısı ve ilk 10 örnek, aynı adlı not çiftleri, dış adresli markdown bağlantı sayısı, eski kuralda olup yenide olmayan / yenide olup eskide olmayan kenar sayıları.
- Ömer'in kasa yolunu bul: önce Loomen'in kayıtlı ayarlarına (loomen.settings, vaults listesi; macOS WebKit yerel depolama, uygulama kimliği org.loomen.notes) ya da Obsidian'ın ~/Library/Application Support/obsidian/obsidian.json dosyasındaki kasa yollarına bak. Betiği o yolla ve demo-vault ile koştur; çıktının özetini sonuç raporuna aynen yaz. Kasa yolu bulunamaz ya da kesici depo dışı okumayı engellerse bunu açıkça yaz, demo-vault sonucunu ver ve gerçek kasa kontrolünü kalan iş olarak bırak.
- Doğrulama: npx tsc --noEmit çıktısız, npm test tüm takımlar yeşil (graphTest dahil), çeviri anahtar kümesi karşılaştırması aynı. Bağımsız inceleme: diff, plan ve test çıktısı verilerek yalnız okuyan ayrı bir göz baksın; bulgu varsa düzeltilip test yeniden koşulsun.
- Commit mesajı repo dilinde, AI imzası yok; dal fix/LOM-43.

## Dokunulan dosyalar

- `Loomen/src/core/markdown/links.ts`
- `Loomen/src/screens/Graph/graphModel.ts`
- `Loomen/src/screens/Graph/GraphScreen.tsx`
- `Loomen/src/core/__test__/graphTest.ts`
- `Loomen/src/core/__test__/coreTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/scripts/graf-kenar-analizi.mjs`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`

## Test

Testler KALDI; iş doğrulanmadı.

> Tip denetimi hatasız geçti. npm test'te 16 test dosyasının tümü geçti, graf testi 61/61. scripts/tsc-taban.mjs bu kopyada yok, o yüzden tip denetimi çıplak tsc ile koştu. Canlı doğrulama insana kaldı. Kokpit: `gecti=true` ama özet bir kontrolün koşmadığını söylüyor: "scripts/tsc-taban.mjs bu kopyada yok, o yüzden tip denetimi çıplak tsc ile koştu". O kontrolü koştur ve komut çıktısını alıntıla; ya

## Kanıt

- Dal: `fix/LOM-43`
- Test koşusu: `31fb2937-9bc1-47bf-943a-01025875de24` (Excalibur)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.

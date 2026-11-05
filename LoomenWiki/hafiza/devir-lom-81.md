---
name: LOM-81 — Arama yazım farklarına takılmasın
description: Gezgin aramasını (searchNotes) yazım farklarına dayanıklı hale getir: tire/boşluk/noktalama ve aksan farkı eşleşmeyi engellemesin, kelimeler ayrı yerde olsa da bulunsun, küçük yazım hatasında yakın sonuç gelsin ve en iyi eşleşme üstte sıralansın.
type: project
proje: loomen
kaynak: kart LOM-81 · dal fix/LOM-81 · Loomen@ca5c217fb998584ba8bbe4bac923fffcb6d24898 · test koşusu f46f301c-ec61-48a7-aeeb-f2ffa9edab17 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-05
---

# LOM-81 — Arama yazım farklarına takılmasın

## Ne yapıldı

Gezgin aramasını (searchNotes) yazım farklarına dayanıklı hale getir: tire/boşluk/noktalama ve aksan farkı eşleşmeyi engellemesin, kelimeler ayrı yerde olsa da bulunsun, küçük yazım hatasında yakın sonuç gelsin ve en iyi eşleşme üstte sıralansın.

## Adımlar

- search.ts: foldTr'ye DOKUNMA (links.ts ve graphModel.ts birebir eşitlik için kullanıyor). Yeni, dışa açık `foldSearch(s)` yaz: foldTr sonucunu NFD'ye ayırıp birleşen işaretleri (\p{M}) at, böylece ç→c, ğ→g, ö→o, ş→s, ü→u, â→a olsun; sonuç yalnız arama için kullanılır.
- search.ts: `tokenizeSearch(s)` yaz: foldSearch sonrası `[\p{L}\p{N}]+` dizilerini kelime say (tire, boşluk, noktalama ayraç). 'E-Dönüştür' → ['e','donustur']; 'edönüştür' → ['edonustur']. Ayrıca `compact(s)` = kelimelerin aralıksız birleşimi ('edonustur').
- search.ts: `buildSearchIndex(notes, contents)` yaz. Her not için: başlığın ve her satırın compact hali + satırın ham metni (snippet için), notun tekil kelime kümesi. Kasa geneli sözlük: kelime → o kelimeyi içeren not yolları kümesi (yaklaşık eşleşme bu küçük sözlükte yapılır, her notun her satırında değil). `searchNotes(notes, contents, query, limit)` imzası korunur; içeride contents nesnesine WeakMap ile bağlı dizin önbelleği kullanılır (contents değişince yeniden kurulur).
- search.ts: eşleşme katmanları ve puan. (1) Birleşik: sorgunun compact hali, başlığın ya da bir satırın compact halinde geçiyor → en yüksek puan ('E dönüştür' / 'edönüştür' / 'e-donustur' hepsi 'edonustur' olur ve 'E-Dönüştür' satırında bulunur). (2) Dağınık: sorgunun her kelimesi notun kelime kümesinde ya da bir kelimenin başında geçiyor (yan yana olması gerekmez; 'ŞARKI' → 'sarki', 'sarkilar' kelimesinin öneki) → orta puan. (3) Yaklaşık: 4 harf ve üstü sorgu kelimesi için Levenshtein uzaklığı ≤1 (8 harf ve üstünde ≤2) olan sözlük kelimeleri bulunur; uzunluk farkı eşiği aşan kelimeler hesaplanmadan elenir; bu kelimeleri içeren notlar alt puanla girer. Kısa (1-3 harf) kelimelerde yaklaşık eşleşme yok. Başlıkta eşleşme ek puan alır; inTitle alanı korunur, SearchHit'e `score` eklenir.
- search.ts: sıralama puan azalan, eşitlikte başlık eşleşmesi önce, sonra ad alfabetik; limit korunur. Snippet: en iyi eşleşen satır (birleşik varsa o, yoksa dağınık/yaklaşık kelimeyi içeren ilk satır); mevcut Markdown işaret temizleme ve 80 karakter kesme aynı kalır. Boş ya da yalnız noktalama içeren sorgu (kelime yok) → boş liste.
- Explorer.tsx: searchNotes çağrısı aynı kalabilir (önbellek search.ts içinde); gerekirse `useMemo` ile sorgu/notlar/contents değişmedikçe yeniden aramama. Başka arayüz değişikliği yok.
- coreTest.ts arama bölümüne testler ekle: 'E-Dönüştür' içeren not için 'E dönüştür', 'edönüştür', 'e-donustur' üçü de bulur; kelimeler ayrı yerde ('fatura dönüştür' → farklı satırlarda 'fatura' ve 'E-Dönüştür' olan not) bulunur; yazım hatası ('donustir') bulur; birebir eşleşen not yaklaşık eşleşenden üstte; başlık eşleşmesi gövde eşleşmesinden üstte; yalnız '-' sorgusu boş döner; foldSearch('Çağrı') === 'cagri'; mevcut 4 arama ve foldTr testleri değişmeden geçer.
- LoomenWiki/modules/mimari.md'deki arama cümlesine (JavaScript tarafında arama satırı) tek cümle ekle: arama tire/boşluk/aksan farkına ve küçük yazım hatasına dayanıklı, en iyi eşleşme üstte.
- npm test ve npm run typecheck koş; çıktıyı kanıt olarak sonuca yaz.

## Dokunulan dosyalar

- `Loomen/src/core/search/search.ts`
- `Loomen/src/core/__test__/coreTest.ts`
- `Loomen/src/components/Explorer.tsx`
- `Loomen/LoomenWiki/modules/mimari.md`

## Test

Testler geçti.

> Tip denetimi hatasız bitti. npm test'te 34 test dosyasının tümü geçti. Yeni arama testleri de geçti: 'E dönüştür', 'edönüştür', 'e-donustur', 'E-DÖNÜŞTÜR', yazım hatası, sıralama ve yalnız noktalama sorgusu. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-81`
- Commit: `Loomen@ca5c217fb998584ba8bbe4bac923fffcb6d24898`
- Test koşusu: `f46f301c-ec61-48a7-aeeb-f2ffa9edab17` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

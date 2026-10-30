---
name: LOM-66 — Tekrar listeleri: Listelerim ekranı, yapıştırma, çalışma ve ilerleme
description: Tekrar sayfasına Listelerim/Notlardan bölümleri, liste kartları (sayılar + ilerleme + Çalış), yeni liste/düzenle penceresi, toplu yapıştırma ve dosyadan alma önizlemesi, liste ayrıntısında arama/satır düzenle/sil ve onaylı liste silme eklenir; LOM-65 çekirdeği ve store eylemleri olduğu gibi kullanılır; yardım ve üç dil tamamlanır.
type: project
proje: loomen
kaynak: kart LOM-66 · dal fix/LOM-66 · Loomen@9ad719241215e2eeef05fab357e9a2c8860b8cef · test koşusu 99c3841f-954e-475f-bc0e-87a341c64d64 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-30
---

# LOM-66 — Tekrar listeleri: Listelerim ekranı, yapıştırma, çalışma ve ilerleme

## Ne yapıldı

Tekrar sayfasına Listelerim/Notlardan bölümleri, liste kartları (sayılar + ilerleme + Çalış), yeni liste/düzenle penceresi, toplu yapıştırma ve dosyadan alma önizlemesi, liste ayrıntısında arama/satır düzenle/sil ve onaylı liste silme eklenir; LOM-65 çekirdeği ve store eylemleri olduğu gibi kullanılır; yardım ve üç dil tamamlanır.

## Adımlar

- ÇEKİRDEK — Loomen/src/core/srs/listView.ts (yeni, saf, dosyaya yazmaz) ve index.ts'ten dışa aktar: listProgress(list, states, now) → { total, learned (phase 'review'), learning ('learning'|'relearning'), fresh (durum yok ya da 'new'), due (new değil, frozen değil, postponed≠bugün, due ≤ günün sonu), leech, percent=round(learned/total*100) } — kartlar listCards(list) ile; searchRows(rows, query) → eşleşen satır indeksleri (normalizeKey ile ön/arka/not içinde; boş sorgu → hepsi); addRows(list, rows, skipExisting=true) → { list, added, duplicates } (normalizeRow uygulanır, ön yüzü listede ya da aynı yapıştırmada olan satır atlanır ve sayılır); updateRow(list, i, row) ve removeRow(list, i) yeni liste nesnesi döner (immutable, geçersiz indeks aynı listeyi döner); LIST_EMOJIS sabiti (bayrak yok: 📚 🔤 🗣️ 🧠 🧪 📐 🌍 🎓 💊 ⚖️ 🎵 ✈️).
- ÇEKİRDEK — Loomen/src/core/srs/lists.ts: parsePasted(text, opts?: { csv?: boolean }) — csv modunda en düşük öncelikle /\s*,\s*/ ayıracı eklenir ve parçaların başı/sonundaki çift tırnak sıyrılır; csv kapalıyken davranış birebir aynı kalır (mevcut srsListTest değişmeden geçmeli).
- ÇEKİRDEK TEST — Loomen/src/core/__test__/srsListViewTest.ts: listProgress (boş liste 0, yeni/öğrenme/tekrar/vadesi geçmiş/dondurulmuş/bugün ertelenmiş karışımı, iki yönlü listede kart sayısı), searchRows (büyük/küçük harf, not içinde arama, boş sorgu), addRows (listede olan ve metin içi tekrar atlanır, 1000 satır eklenir ve encodeList→decodeList gidiş dönüşü satır sayısını korur), updateRow/removeRow, csv ayrıştırma (virgül, tırnaklı alan, düz modda virgül ayıraç değil). Loomen/scripts/run-tests.mjs'e srsListViewTest.ts ve reviewI18nTest.ts satırlarını ekle (dosya yoksa betik zaten atlar).
- METİN — Loomen/src/i18n/locales/{tr,en,ar}/translation.json: review.lists altına şu anahtarlar (üç dilde aynı yapı): tabLists, tabNotes, newList, notesCount({{n}}), emptyTitle, emptyBody, emptyExample, emptyCta; form.{title, editTitle, name, namePlaceholder, nameRequired, icon, color, direction, dirFront, dirBack, dirBoth, newPerDay, newPerDayGeneral, newPerDayHint, create, save}; card.{learned, learning, fresh, dueToday, rows({{n}}), study, nothingToday, percent({{pct}})}; detail.{backToLists, search, addRow, frontPh, backPh, notePh, add, paste, importFile, edit, deleteList, deleteRow, rowExists, noRows, noMatch, showMore({{n}}), hard, hardOnly, count({{n}}), deleteTitle({{name}}), deleteBody, deleteConfirm, deleteRowTitle, deleteRowBody, saveError, cancel}; paste.{title, importTitle, hint, placeholder, recognized({{n}}), skipped({{n}}), dupInText({{n}}), dupInList({{n}}), skipDup, more({{n}}), add({{n}}), none, fileError}; session.listLabel({{name}}). Metinler kart açıklaması dilinde: sade, kısa; Arapça gerçek Arapça harflerle.
- METİN TEST — Loomen/src/core/__test__/reviewI18nTest.ts (helpTest kalıbıyla): review alt ağacı tr/en/ar'da aynı anahtar kümesi, boş metin yok, {{değişken}} yer tutucuları eşit, ar metinleri Arapça harf içeriyor, en metinleri Türkçe harf içermiyor.
- YARDIM — üç dilde help.s.review.cards.p 'Beş biçim var' → 'Altı biçim var' (en: six formats, ar: ست صيغ); formats dizisine 6. öğe: name 'Tekrar listesi', desc (Tekrar > Listelerim'de liste açılır, satırlar yapıştırılır; liste kasada Tekrar/Listeler klasöründe ayrı dosyada durur, notlara yazılmaz; yön seçimine göre ileri/geri kart), writeLabel 'Listeye yapıştır', write 'apple :: elma :: I ate an apple.', cards [{label İleri, front apple, back 'elma\nI ate an apple.'}, {label Geri, front elma, back apple}], file 'Tekrar/Listeler'. Loomen/src/screens/Help/CardFormats.tsx: CardFormat'a isteğe bağlı writeLabel alanı; etiket f.writeLabel ?? labels.write.
- STORE — Loomen/src/store/useAppStore.ts: srsOpenListId: string | null alanı (başlangıç null) ve srsOpenList(id | null) eylemi; srsStartList(id) oturumu kurarken srsOpenListId'yi id yapar (oturum bitince liste ayrıntısına dönülür); srsListDelete silinen liste açıksa srsOpenListId'yi null yapar; kasa değişiminde (srsLoad fresh yolu) null'a çek. Başka store mantığı değişmez.
- EKRAN — Loomen/src/screens/Review/ReviewScreen.tsx: üst özet kartları ve Başla aynen kalır; altına segment sekmeleri (role=tablist, lo-rev__tabs) Listelerim | Notlardan; Listelerim: liste yoksa boş hâl (giriş cümlesi + 'apple :: elma' örneği + Yeni liste düğmesi), varsa auto-fill ızgara ListCard'lar + Yeni liste; Notlardan: mevcut Desteler bloğu aynen + notesCount satırı (not kartı sayısı; 0 ise review.noCards). Yük grafiği her iki sekmede altta kalır. srsOpenListId doluysa sekmeler yerine ListDetail gösterilir; inSession iken ReviewSession (mevcut davranış). Sekme seçimi yerel state (varsayılan: liste varsa Listelerim, yoksa Notlardan).
- EKRAN — Loomen/src/screens/Review/ListCard.tsx (yeni): colorVars(list.color) ile renk; simge, ad, satır sayısı; dört sayı (öğrenilen/öğreniliyor/yeni/bugün — ilk üçü listProgress, bugün = buildQueue(listenin kartları, cfg newPerDay=min(liste,genel), listNewCaps([list])) ile srsStartList'teki aynı hesap); ilerleme çubuğu (percent); Çalış düğmesi (bugün 0 ise devre dışı ve 'Bugünlük bitti'); karta tıklama srsOpenList(id).
- EKRAN — Loomen/src/screens/Review/ListForm.tsx (yeni, HabitForm kalıbı: createPortal + lo-modal + useModalLayer + Escape): yeni/düzenle; ad (zorunlu, 80), simge (LIST_EMOJIS radiogroup), renk (LIST_COLORS swatch), yön (3 çip), günlük yeni kart ('Genel ayar' çipi ya da sayı 1–999, ipucu: genel sınırı aşamaz); yeni listede id=newListId(), createdAt=Date.now(), rows=[]; srsListSave ile kaydet, hata pencere içinde gösterilir; yeni liste kaydedilince srsOpenList(id) ile ayrıntı açılır ve yapıştırma penceresi otomatik açılır.
- EKRAN — Loomen/src/screens/Review/PasteDialog.tsx (yeni): büyük textarea; useMemo ile parsePasted(text,{csv}) ve findDuplicates(rows, list.rows); sayaç satırı (tanınan / ayıraçsız atlanacak / metinde tekrar / listede zaten var) ve 'Listede olanları atla' onay kutusu (varsayılan açık); önizleme ilk 30 satır + '… ve N satır daha'; Ekle: addRows ile yeni liste → srsListSave; başlık yapıştırma mı dosyadan mı moda göre. Dosyadan alma: ListDetail'de gizli <input type=file accept=.txt,.csv,text/plain,text/csv>, FileReader.readAsText ile metin okunur ve dosya adı .csv ise csv modunda bu pencere açılır (Tauri fs kapsamına girmez, mobilde de çalışır); okuma hatası paste.fileError.
- EKRAN — Loomen/src/screens/Review/ListDetail.tsx (yeni): geri düğmesi (srsOpenList(null)); başlık: simge, ad, satır sayısı, ilerleme çubuğu ve dört sayı, Çalış, Düzenle (ListForm edit), Listeyi sil (HabitConfirm ile onay, danger; onayda srsListDelete); araç satırı: arama kutusu (searchRows), 'Yalnız zorlar' çipi (leech durumlu satırlar), Yapıştır, Dosyadan; tek satır ekleme formu (ön, arka, not; ön yüz listede varsa rowExists uyarısı ve ekleme engeli; Enter ile ekle); satır listesi sayfalı (ilk 200, 'N satır daha göster'), her satırda ön/arka/not, zor rozeti, Düzenle (satır içi üç alan + Kaydet/Vazgeç → updateRow) ve Sil (kısa onay → removeRow); her değişiklik srsListSave ile yazılır, hata saveError satırında görünür. Habits/HabitConfirm doğrudan içe aktarılır (değiştirilmez).
- OTURUM — Loomen/src/screens/Review/ReviewSession.tsx: kart liste kartıysa (listIdOf(card.file) ≠ null) 'Notu aç' düğmesi yerine tıklanmaz etiket (liste simgesi + adı, session.listLabel) gösterilir ve 'e' kısayolu bu kartta hiçbir şey yapmaz; not kartlarında davranış aynı.
- STİL — Loomen/src/styles/app.css: lo-rev__tabs (lo-hab-tab görünümünde), lo-rlist (ızgara auto-fill minmax(min(300px,100%),1fr)), lo-rlist-card (renk --hab-c değişkenleriyle), lo-rlist-card__stats (4 sütun), lo-rlist-bar/lo-rlist-bar__fill, lo-rlist-empty, lo-rdet (başlık, araç satırı, satır tablosu, satır düzenleme alanları), lo-rpaste (textarea, sayaçlar, önizleme). Yalnız mantıksal özellikler (margin-inline, padding-inline, inset-inline, text-align: start) — Arapçada ayna düzen; .lo-app.is-mobile altında: sayılar 2 sütun, araç satırı alt alta, satır eylemleri görünür, pencereler mevcut lo-modal mobil paylarını kullanır; koyu temada var(--…) tokenları.
- DOĞRULAMA — npm run typecheck ve npm test (srsListTest değişmeden geçer, srsListViewTest, reviewI18nTest, helpTest geçer); ReviewScreen/ListDetail/PasteDialog/ListForm kodunu okuyarak: hiçbir yerde backend.writeNote/openNote .md yoluna çağrılmıyor, yazım yalnız srsListSave üzerinden; srsStart(null) çağrısı değişmedi (genel Başla not + liste). Commit mesajı 'LOM-66: …', AI imzası yok; dal fix/LOM-66'da kalır.

## Dokunulan dosyalar

- `Loomen/src/core/srs/listView.ts`
- `Loomen/src/core/srs/lists.ts`
- `Loomen/src/core/srs/index.ts`
- `Loomen/src/core/__test__/srsListViewTest.ts`
- `Loomen/src/core/__test__/reviewI18nTest.ts`
- `Loomen/scripts/run-tests.mjs`
- `Loomen/src/i18n/locales/tr/translation.json`
- `Loomen/src/i18n/locales/en/translation.json`
- `Loomen/src/i18n/locales/ar/translation.json`
- `Loomen/src/screens/Help/CardFormats.tsx`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Review/ReviewScreen.tsx`
- `Loomen/src/screens/Review/ReviewSession.tsx`
- `Loomen/src/screens/Review/ListCard.tsx`
- `Loomen/src/screens/Review/ListDetail.tsx`
- `Loomen/src/screens/Review/ListForm.tsx`
- `Loomen/src/screens/Review/PasteDialog.tsx`
- `Loomen/src/styles/app.css`

## Test

Testler geçti.

> Tip denetimi hatasız geçti. npm test ile 31 test dosyasının tamamı geçti; liste, liste görünümü, yardım ve üç dil testleri de bunların içinde. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-66`
- Commit: `Loomen@9ad719241215e2eeef05fab357e9a2c8860b8cef`
- Test koşusu: `99c3841f-954e-475f-bc0e-87a341c64d64` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

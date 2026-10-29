---
name: LOM-65 — Tekrar listeleri: altyapı (liste dosyası, kartlar, günlük sınır)
description: Tekrar listeleri için arka plan: kasada Tekrar/Listeler/<id>.txt düz metin liste dosyası (başlık bloğu + "ön :: arka" satırları), bu satırlardan mevcut kimlik/eşleştirme mantığıyla kart üretimi, yapıştırma ayrıştırıcısı, liste başına günlük yeni kart sınırı ve depo bağlantısı; ekranda değişiklik yok.
type: project
proje: loomen
kaynak: kart LOM-65 · dal fix/LOM-65 · Loomen@a49b22b4f13bdc74564fd7c25d7cee1afa084279 · test koşusu 985e39a6-a1f4-41c8-880a-4bb338276da6 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-29
---

# LOM-65 — Tekrar listeleri: altyapı (liste dosyası, kartlar, günlük sınır)

## Ne yapıldı

Tekrar listeleri için arka plan: kasada Tekrar/Listeler/<id>.txt düz metin liste dosyası (başlık bloğu + "ön :: arka" satırları), bu satırlardan mevcut kimlik/eşleştirme mantığıyla kart üretimi, yapıştırma ayrıştırıcısı, liste başına günlük yeni kart sınırı ve depo bağlantısı; ekranda değişiklik yok.

## Adımlar

- Önce src/core/srs/{types,parser,queue,store}.ts, src/core/habit/{store,codec,types}.ts ve useAppStore.ts'teki srsLoad/refreshSrs/srsStart/srsAnswer bölümlerini oku; alışkanlık kimlik üretimini (dosya adı güvenli kısa kimlik) bul ve aynısını kullan.
- Yeni dosya src/core/srs/lists.ts: sabitler LISTS_DIR='Tekrar/Listeler', LIST_ID_RE (küçük harf/rakam/-/_), listPath(id)=`${LISTS_DIR}/${id}.txt`, isListFile(file), listIdOf(file). Tipler: ReviewList { id, name, emoji, color, direction: 'front'|'back'|'both', newPerDay: number|null (null = genel sınır), createdAt, rows: ListRow[] }, ListRow { front, back, note? }.
- lists.ts: encodeList(list) deterministik düz metin üretir: iki '---' satırı arasında başlık (surum: 1, ad, simge, renk, yon, gunluk, olusturma), sonra her satır 'ön :: arka' ve varsa ' :: not'; sonda tek satır sonu. normalizeRow satır parçalarındaki satır sonlarını boşluğa, '::' dizisini ': :' biçimine çevirir. decodeList(id, raw) şüpheci okur: eksik başlık alanı varsayılanla dolar, bilinmeyen alan yoksayılır, '::' içermeyen ya da boş satır atlanır, en fazla 3 parçaya bölünür; okunamazsa null.
- lists.ts: parsePasted(text) → { rows, duplicates, skipped }. Satır başına ayıraç öncelik sırası: '::', sekme, ' - ' (kısa ve uzun tire dahil), ' = ', ';'. Üçüncü parça varsa not. Aynı öne sahip satırlar (normalizeKey ile) tekilleştirilir ve duplicates sayılır; ayıraçsız satır skipped sayılır. findDuplicates(rows, existingRows) mevcut listeyle çakışanları döner.
- lists.ts: listCards(list) → SrsCard[]: her satır için ileri kart (kind 'basic', key normalizeKey(front), question=front, answer=back + varsa boş satır + note) ve ters kart (kind 'reverse', key normalizeKey(back)+'|ters', parser.ts ile aynı kural); yön 'front' yalnız ileri, 'back' yalnız ters, 'both' ikisi. id = cardId(listPath, key), file = listPath, line = satır sırası. Aynı id ikinci kez gelirse atlanır. collectListCards(lists) hepsini toplar. twinId(card, list) ters yönlü eşin kimliğini döner.
- lists.ts: loadLists(backend) → { lists, raw, broken }: backend.listDir yoksa boş; LISTS_DIR içindeki yalnız küçük harf '.txt' dosyaları okunur, decodeList başarısız ya da dosya adı ile kimlik uyuşmazsa broken'a yazılır. saveList(backend, list, vault) alışkanlık deposundaki korumalarla: metin değişmemişse yazmaz, bozuk ya da yüklenmemiş ama diskte duran dosyanın üstüne yazmaz, ensureDir(LISTS_DIR) sonra writeNote. removeList(backend, id, vault) trashNote ile çöp kutusuna taşır. dropListStates(states, file) o listenin kart durumlarını atar.
- lists.ts: listNewCaps(lists, todayCount, cfg) → Record<listPath, kalanYeni>: her liste için min(list.newPerDay ?? cfg.newPerDay, cfg.newPerDay) - (todayCount.lists?.[id] ?? 0), en az 0.
- src/core/srs/store.ts: DayCount'a isteğe bağlı lists?: Record<string, number> alanı (liste kimliği → o gün gösterilen yeni kart) ekle; loadStates eski dosyayı alan yokken aynen okur, StateFile sürümü 1 kalır.
- src/core/srs/queue.ts: buildQueue'ya secPerCard'dan sonra isteğe bağlı newCapByFile?: Record<string, number> parametresi ekle. Yeni kart seçiminde newQ sırası korunur (dosya adı, satır); her kart alınırken genel kalan (min(maxNew, leftover)) ve varsa dosyanın kalan hakkı düşülür, hakkı biten dosyanın kartları atlanır. Parametre verilmezse davranış birebir eski hâliyle kalır.
- src/core/srs/index.ts'e lists.ts dışa aktarımını ekle; types.ts'deki SrsCard/SRS_DIR yorumlarına liste dosyalarının Tekrar/Listeler altında durduğunu yaz.
- src/core/vault/tmpFiles.ts: TMP_TARGET_EXTS'e 'txt' ekle (liste dosyaları writeNote ile atomik yazılır; artık yan dosyalar temizlensin). atomicWriteTest/tmp testleri etkileniyorsa güncelle.
- src/store/useAppStore.ts: durum alanı srsLists: ReviewList[] ve modül düzeyinde liste kasası (raw/broken) ekle. Ortak yardımcı: kart toplama = collectCards(noteContents) + collectListCards(srsLists); srsLoad, refreshSrs ve srsSetSettings bu yardımcıyı kullansın. srsLoad ve refreshSrs önce loadLists(backend) çağırır (senkronla gelen değişiklik görünsün).
- useAppStore.ts srsAnswer: cevaplanan kart liste kartıysa ve bucket 'new' ise daily[gün].lists[listeId] bir artar. Kardeş erteleme: liste kartında yalnız twinId ile bulunan ters eş ertelenir, listedeki diğer kartlar ertelenmez; not kartlarında eski davranış aynen.
- useAppStore.ts srsStart: deste seçiliyse liste kartları süzülür (desteler notlardan); genel oturumda buildQueue'ya listNewCaps(...) verilir. Yeni eylemler: srsListSave(list) (saveList, kartları yeniden topla, matchStates, modül açıksa saveStates), srsListDelete(id) (removeList, dropListStates, saveStates, kartları yeniden topla), srsStartList(id) (yalnız o listenin kartları, cfg.newPerDay = min(liste, genel), caps ile buildQueue, srsDeck null, ekran 'review'). Eylem imzalarını arayüz tipine ekle.
- src/screens/Review/ReviewScreen.tsx: yalnız üstteki özet buildQueue çağrısına listNewCaps(...) argümanını ekle (srsLists depodan seçilir) ki özet sayıları oturumla aynı olsun; başka görsel değişiklik yapma.
- Yeni test src/core/__test__/srsListTest.ts (mevcut srsTest kalıbıyla, check/fails) ve scripts/run-tests.mjs suites listesine ekle. Testler: encode→decode gidiş dönüşü (Türkçe/Arapça satır, not alanı, yön, günlük sayı); parsePasted beş ayıraç + tekrar sayımı + ayıraçsız satır; satır kayması kimliği değiştirmiyor; küçük düzenlemede matchStates recovered ≥ 1; yön değişince var olan kimlikler aynı; buildQueue caps ile liste ≤ sınır ve not kartı geliyor, caps verilmezse eski sonuçla aynı; genel sınır aşılmıyor; twinId doğru; sahte backend ile loadLists bozuk/uyumsuz dosyayı broken'a atıyor, saveList yüklenmemiş dosyanın üstüne yazmıyor ve değişmeyen dosyayı yeniden yazmıyor; NOTE_SAFETY: yazılan her yol 'Tekrar/Listeler/' ile başlar ve hiçbiri .md değil.
- npm run typecheck ve npm test koş; srsTest dahil eski paketlerin geçtiğini kanıtla. Sonuçta neyin denenmediğini açık yaz.

## Dokunulan dosyalar

- `Loomen/src/core/srs/lists.ts`
- `Loomen/src/core/srs/queue.ts`
- `Loomen/src/core/srs/store.ts`
- `Loomen/src/core/srs/index.ts`
- `Loomen/src/core/srs/types.ts`
- `Loomen/src/core/vault/tmpFiles.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/screens/Review/ReviewScreen.tsx`
- `Loomen/src/core/__test__/srsListTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Tip denetimi temiz geçti. Tüm test paketi bu turda yeniden koşuldu ve 27 test dosyasının tümü geçti. Yeni liste testleri (srsListTest) ve eski tekrar testleri yeşil. Kodda değişiklik yapılmadı. Plan canlı test istemediği için canlı doğrulama koşturulmadı; kartta ekranda görünen bir değişiklik yok.

## Kanıt

- Dal: `fix/LOM-65`
- Commit: `Loomen@a49b22b4f13bdc74564fd7c25d7cee1afa084279`
- Test koşusu: `985e39a6-a1f4-41c8-880a-4bb338276da6` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

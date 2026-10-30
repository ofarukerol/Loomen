---
name: LOM-73 — Tekrar ayarı okunamayınca kart geçmişi kaybolmasın
description: Tekrar ayarı okunana kadar kart geçmişine dokunulmaz (ayıklama ve kayıt yok); ayar okununca kartlar doğru ayarla yeniden toplanır; ayar kaydındaki 'dışarıdan değişti mi' denetimi satır sonu/boşluk farkını saymaz. Davranış saf bir yardımcıya çıkarılıp birim testle kanıtlanır.
type: project
proje: loomen
kaynak: kart LOM-73 · dal fix/LOM-73 · Loomen@eea42d28c44334c92302cb098e83f967a2aab4ef · test koşusu a2ec9185-833f-4e33-88be-32e54f468d61 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-30
---

# LOM-73 — Tekrar ayarı okunamayınca kart geçmişi kaybolmasın

## Ne yapıldı

Tekrar ayarı okunana kadar kart geçmişine dokunulmaz (ayıklama ve kayıt yok); ayar okununca kartlar doğru ayarla yeniden toplanır; ayar kaydındaki 'dışarıdan değişti mi' denetimi satır sonu/boşluk farkını saymaz. Davranış saf bir yardımcıya çıkarılıp birim testle kanıtlanır.

## Adımlar

- Kök sebep (doğrulandı): useAppStore.ts claimSrsSettings (satır 1083) belleğe varsayılan ayarı koyar; okuma düşerse srsLoad (3391) ve refreshSrs (1133) yine get().srsSettings = varsayılan ile gatherSrsCards + matchStates koşar. parser.ts parseCards'ta `::` satırı önce basit kart denenir (satır 96), gizli-kelime ancak sonra (109); 'basic' kapalı bir kullanıcıda `Soru :: ==Cevap==` satırı gizli-kelime kartıdır, varsayılanla ise basit kart olur, kimlik farklı çıkar. matchStates eşleşmeyen kayıtlı durumu yetim sayar, srsLoad bellekteki srsStates'i bu budanmış hâle çeker (enabled false olduğu için diske yazmaz). 10 sn sonra srsReadSettings adopt → regatherSrsCards (1054) budanmış bellekten toplar ve cfg.enabled ile saveStates çağırır: geçmiş kalıcı silinir. Ayrıca saveSettings (store.ts 144) diski knownRaw ile birebir karşılaştırır; CRLF/boşluk/BOM farkı 'dışarıdan değişmiş' sayılır.
- src/core/srs/rebuild.ts (yeni, saf): `rebuildSrs({ settingsKnown, cfg, contents, lists, saved })` → `{ cards, states, changed, skipped }`. settingsKnown false ise `{ cards: [], states: saved, changed: false, skipped: true }` döner, hiçbir eşleştirme yapmaz. true ise cards = [...collectCards(contents, cfg.syntax, cfg.excluded), ...collectListCards(lists)]; m = matchStates(cards, saved); states = keepNoteStatesWithoutNotes(keepListStates(m.states, saved, lists), saved, cards); changed = m.changed; skipped = false. Dosya başı yorumu: ayar okunmadan toplama yapılmaz, çünkü varsayılan sözdizimiyle kimlikler değişir ve geçmiş yetim düşer (LOM-73). index.ts'e `export * from "./rebuild"` ekle (parser/queue/lists'ten import; döngü yok).
- src/core/srs/store.ts: `sameSettingsText(a: string | null, b: string | null): boolean` ekle ve dışa aktar. a === b ise true; ikisi de string ise BOM'u atıp JSON.parse dene, ikisi de ayrıştırılırsa anahtarları özyinelemeli sıralayan kararlı stringify ile karşılaştır; ayrıştırılamıyorsa `\r\n?`→`\n` ve trim sonrası birebir karşılaştır. saveSettings: `text === knownRaw` yerine `sameSettingsText(text, knownRaw)` (aynıysa null döner, yazmaz); disk denetiminde `!sameSettingsText(diskText, knownRaw)` ise fırlat. resolveSettingsRead: `read.raw === knownRaw` yerine `sameSettingsText(read.raw, knownRaw)` → keep. Yorumları güncelle: içerik farkı sayılır, biçim farkı sayılmaz.
- src/store/useAppStore.ts: modül düzeyinde `let srsSettingsKnown = false;` ekle (bu kasanın ayarı diskten en az bir kez benimsendi mi). claimSrsSettings'te backend değişince false yap. srsReadSettings'te keep dalında ve adopt dalında true yap; adopt dalında `const first = !srsSettingsKnown` tutup `if (first || srsCardsAffected(prev, d.settings)) await regatherSrsCards(d.settings, src)` yap (ilk benimsemede her zaman yeniden topla). srsSetSettings'in yazım hatası dalı bayrağa dokunmaz (bellekteki ayar diskten gelen önceki ayardır).
- src/store/useAppStore.ts: gatherSrsCards'ı kaldırıp `rebuildSrs` kullanan ortak yardımcı `rebuildSrsCards(cfg, saved, lists)` yaz: `rebuildSrs({ settingsKnown: srsSettingsKnown && srsSettingsOf === backend, cfg, contents: get().noteContents, lists, saved })`. srsLoad: loadStates/loadLog/reloadSrsLists aynen; sonra r = rebuildSrsCards(cfg, saved, lists); r.skipped ise merged = {...saved} (budama yok), srsCards: []; değilse merged = r.states; bellek-disk 'yeni olan kazanır' döngüsü merged üstünde aynen; set({ srsLoaded: true, srsStatesOf... }); saveStates yalnız `!r.skipped && cfg.enabled && r.changed && r.cards.length > 0` iken. refreshSrs ikinci dal: r = rebuildSrcCards(...); r.skipped ise srsCards/srsStates'e dokunma ve yazma (return); değilse set + aynı yazma koşulu. regatherSrsCards: mevcut guard'dan sonra r = rebuild; r.skipped ise return; değilse set ve `cfg.enabled && r.cards.length > 0` ile saveStates. srsListSave: aynı yardımcı; r.skipped ise yalnız srsLists set edilir, kart/durum ve durum.json'a dokunulmaz; değilse eski davranış (`cfg.enabled && r.changed` ile yaz).
- src/core/__test__/srsRebuildTest.ts (yeni; srsSettingsTest.ts check/fails kalıbı): contents = { 'Notlar/a.md': 'Soru :: ==Cevap==\nBaşkent :: Ankara' }, userCfg = { ...DEFAULT_SETTINGS, enabled: true, syntax: { ...DEFAULT_SETTINGS.syntax, basic: false } }; userCards = collectCards(contents, userCfg.syntax, []); saved = her kart için freshState + phase 'review', reps 5. Kontroller: (1) rebuildSrs settingsKnown false, cfg DEFAULT_SETTINGS → cards boş, states === saved (aynı referans), changed false, skipped true. (2) ardından settingsKnown true, cfg userCfg, saved = (1).states → her userCards kimliğinin durumu var ve reps 5, changed false. (3) eski davranışı gösteren karşı örnek: settingsKnown true ve cfg DEFAULT_SETTINGS ile toplayınca gizli-kelime kartının durumu kaybolur ya da başka kimliğe taşınır; sonra userCfg ile toplayınca reps 5 olan durum sayısı eksilir (bu, kapının neden şart olduğunu kanıtlar). (4) liste kartlarıyla karışık: lists=[tek liste], settingsKnown false → yine dokunulmaz. scripts/run-tests.mjs listesine `src/core/__test__/srsRebuildTest.ts` ekle (srsSettingsTest'ten sonra).
- src/core/__test__/srsSettingsTest.ts'e ekle: sameSettingsText: aynı metin true; CRLF'li kopya true; sona '\n' eklenmiş true; BOM'lu true; anahtar sırası farklı ama aynı değerler true; newPerDay farklı false; biri null öbürü string false; bozuk JSON vs aynı bozuk metin+CRLF true. saveSettings: disk = MINE_RAW CRLF, known = MINE_RAW → NEXT yazılır, fırlatmaz; disk = MINE_RAW + '\n' → yazılır; known = NEXT_RAW'ın CRLF hâli ve NEXT kaydı → null döner, yazmaz; disk gerçekten farklı içerik → yine fırlatır (mevcut kontrol kalır). resolveSettingsRead: ok + CRLF raw vs LF known → keep.
- npm run typecheck ve npm test koş; kırmızı varsa düzelt. Commit mesajı LOM-73 ile, AI imzası yok; dal fix/LOM-73.

## Dokunulan dosyalar

- `Loomen/src/core/srs/rebuild.ts`
- `Loomen/src/core/srs/index.ts`
- `Loomen/src/core/srs/store.ts`
- `Loomen/src/store/useAppStore.ts`
- `Loomen/src/core/__test__/srsRebuildTest.ts`
- `Loomen/src/core/__test__/srsSettingsTest.ts`
- `Loomen/scripts/run-tests.mjs`

## Test

Testler geçti.

> Tip denetimi temiz geçti. Tüm test takımı geçti: 34 test dosyasının hepsi yeşil. Yeni srsRebuildTest 11/11 geçti, ayar testi 67/67 geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-73`
- Commit: `Loomen@eea42d28c44334c92302cb098e83f967a2aab4ef`
- Test koşusu: `a2ec9185-833f-4e33-88be-32e54f468d61` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.

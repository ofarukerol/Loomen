// Ayar okunmadan kart toplanmaması (LOM-73): Tekrar ayar dosyası açılışta bir an okunamazsa
// varsayılan işaretleme biçimiyle toplama yapılmamalı; aksi hâlde kimlikler değişir, geçmiş
// yetim düşer ve ayar gelince budanmış hâl diske yazılırdı.
// `npm test` bu dosyayı scripts/run-tests.mjs listesinden alır.

import {
  DEFAULT_SETTINGS,
  collectCards,
  collectListCards,
  freshState,
  rebuildSrs,
  type ReviewList,
  type SrsSettings,
  type SrsState,
} from "../srs";

let fails = 0;
let ran = 0;

function check(name: string, cond: boolean, detail = ""): void {
  ran++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

// Kişinin ayarında basit kart kapalı: `Soru :: ==Cevap==` gizli-kelime kartıdır. Varsayılan
// ayarda önce basit kart denendiği için aynı satır başka kimlikle basit kart olur.
const contents = { "Notlar/a.md": "Soru :: ==Cevap==\nBaşkent :: Ankara" };
const userCfg: SrsSettings = {
  ...DEFAULT_SETTINGS,
  enabled: true,
  syntax: { ...DEFAULT_SETTINGS.syntax, basic: false },
};
const userCards = collectCards(contents, userCfg.syntax, []);

const studied = (id: string, file: string, key: string): SrsState => ({
  ...freshState(id, file, key, new Date("2026-10-01T00:00:00Z")),
  phase: "review",
  reps: 5,
  last: "2026-10-20T00:00:00.000Z",
});
const savedOf = (cards: { id: string; file: string; key: string }[]) =>
  Object.fromEntries(cards.map((c) => [c.id, studied(c.id, c.file, c.key)]));
const keptReps = (states: Record<string, SrsState>, ids: string[]) =>
  ids.filter((id) => states[id]?.reps === 5).length;

check("kişinin ayarında not kartı var (gizli-kelime)", userCards.length > 0 && userCards.every((c) => c.kind === "cloze"));
const saved = savedOf(userCards);
const ids = userCards.map((c) => c.id);

// 1) Ayar okunamadı: belleğe varsayılan ayar konur, ama toplama yapılmaz.
const r1 = rebuildSrs({ settingsKnown: false, cfg: { ...DEFAULT_SETTINGS }, contents, lists: [], saved });
check("ayar bilinmiyorken toplama atlanır", r1.skipped && r1.cards.length === 0);
check("ayar bilinmiyorken durumlar aynı nesne (budama yok)", r1.states === saved);
check("ayar bilinmiyorken yazım gerekmiyor", r1.changed === false);

// 2) Ayar okundu: kişinin ayarıyla toplanır, bütün geçmiş yerinde.
const r2 = rebuildSrs({ settingsKnown: true, cfg: userCfg, contents, lists: [], saved: r1.states });
check("ayar okununca kartlar kişinin ayarıyla toplanır", !r2.skipped && r2.cards.length === userCards.length);
check("ayar okununca bütün kartların geçmişi duruyor (tekrar sayısı 5)", keptReps(r2.states, ids) === ids.length, `${keptReps(r2.states, ids)}/${ids.length}`);
check("ayar okununca eşleştirme değişiklik bulmaz", r2.changed === false);

// 3) Eski davranış: varsayılan ayarla toplanıp ardından kişinin ayarına geçilince geçmiş kaybolurdu.
const old1 = rebuildSrs({ settingsKnown: true, cfg: { ...DEFAULT_SETTINGS }, contents, lists: [], saved });
check("eski davranış: varsayılanla toplayınca gizli-kelime kartının durumu düşer", ids.some((id) => !old1.states[id]));
const old2 = rebuildSrs({ settingsKnown: true, cfg: userCfg, contents, lists: [], saved: old1.states });
check(
  "eski davranış: ayar gelince geçmiş eksik kalır (kapı bu yüzden şart)",
  keptReps(old2.states, ids) < ids.length,
  `${keptReps(old2.states, ids)}/${ids.length}`,
);

// 4) Liste kartlarıyla karışık: ayar bilinmiyorken yine hiçbir şeye dokunulmaz.
const list: ReviewList = {
  id: "kelimeler",
  name: "Kelimeler",
  emoji: "📘",
  color: "teal",
  direction: "forward",
  newPerDay: null,
  createdAt: 0,
  rows: [{ front: "apple", back: "elma" }],
};
const listCards = collectListCards([list]);
const savedMixed = { ...saved, ...savedOf(listCards) };
const r4 = rebuildSrs({ settingsKnown: false, cfg: { ...DEFAULT_SETTINGS }, contents, lists: [list], saved: savedMixed });
check("listeli kasada ayar bilinmiyorken toplama atlanır", r4.skipped && r4.cards.length === 0 && r4.states === savedMixed);
const r5 = rebuildSrs({ settingsKnown: true, cfg: userCfg, contents, lists: [list], saved: r4.states });
const mixedIds = [...ids, ...listCards.map((c) => c.id)];
check(
  "listeli kasada ayar okununca not ve liste geçmişi duruyor",
  listCards.length > 0 && keptReps(r5.states, mixedIds) === mixedIds.length,
  `${keptReps(r5.states, mixedIds)}/${mixedIds.length}`,
);

console.log(fails === 0 ? `\n✅ ${ran} kontrolün tümü geçti` : `\n❌ ${fails}/${ran} kontrol başarısız`);
process.exit(fails === 0 ? 0 : 1);

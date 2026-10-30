// Kartları yeniden toplayıp kayıtlı durumlarla eşleştirme (LOM-73).
//
// Ayar dosyası bu kasa için henüz okunmadıysa toplama YAPILMAZ: varsayılan işaretleme biçimiyle
// kartların kimlikleri değişir (ör. `Soru :: ==Cevap==` basit kart sayılır, gizli-kelime değil),
// eşleşmeyen geçmiş yetim düşer ve ayar gelince bu budanmış hâl diske yazılırdı.

import { collectListCards, keepListStates, keepNoteStatesWithoutNotes, type ReviewList } from "./lists";
import { collectCards } from "./parser";
import { matchStates } from "./queue";
import type { SrsCard, SrsSettings, SrsState } from "./types";

export interface RebuildInput {
  /** Bu kasanın ayarı diskten en az bir kez benimsendi mi. */
  settingsKnown: boolean;
  cfg: SrsSettings;
  contents: Record<string, string>;
  lists: ReviewList[];
  saved: Record<string, SrsState>;
}

export interface RebuildResult {
  cards: SrsCard[];
  states: Record<string, SrsState>;
  /** Eşleştirme durumları değiştirdi mi (yazım gerekebilir). */
  changed: boolean;
  /** Ayar bilinmediği için hiçbir şey yapılmadı; `states` kayıtlı nesnenin kendisidir. */
  skipped: boolean;
}

export function rebuildSrs({ settingsKnown, cfg, contents, lists, saved }: RebuildInput): RebuildResult {
  if (!settingsKnown) return { cards: [], states: saved, changed: false, skipped: true };
  const cards = [...collectCards(contents, cfg.syntax, cfg.excluded), ...collectListCards(lists)];
  const m = matchStates(cards, saved);
  const states = keepNoteStatesWithoutNotes(keepListStates(m.states, saved, lists), saved, cards);
  return { cards, states, changed: m.changed, skipped: false };
}

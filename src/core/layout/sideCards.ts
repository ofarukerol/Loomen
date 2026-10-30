// Sağ blok kart sırası (LOM-72) — saf hesap; sağ blok (RightPanel), Ayarlar listesi ve kayıt (store) bunu kullanır.

export const SIDE_CARD_IDS = ["pomodoro", "calendar", "focus", "review", "habits"] as const;
export type SideCardId = (typeof SIDE_CARD_IDS)[number];

/** Hiç ayar yapılmamışsa: Pomodoro, Takvim, Bugüne Odaklan, Tekrar, Alışkanlıklar. */
export const DEFAULT_SIDE_CARD_ORDER: readonly SideCardId[] = SIDE_CARD_IDS;

export function isSideCardId(v: unknown): v is SideCardId {
  return typeof v === "string" && (SIDE_CARD_IDS as readonly string[]).includes(v);
}

/**
 * Kayıtlı sırayı temizle: dizi değilse varsayılan; bilinmeyen ve tekrar eden kimlikler atılır,
 * eksik kartlar (ör. eski sürüm kaydında olmayan yeni kart) varsayılan sırayla sona eklenir.
 */
export function normalizeSideCardOrder(v: unknown): SideCardId[] {
  if (!Array.isArray(v)) return [...DEFAULT_SIDE_CARD_ORDER];
  const out: SideCardId[] = [];
  for (const x of v) if (isSideCardId(x) && !out.includes(x)) out.push(x);
  for (const id of DEFAULT_SIDE_CARD_ORDER) if (!out.includes(id)) out.push(id);
  return out;
}

/** Kartı bir yukarı (-1) ya da aşağı (1) taşı; sınırdaysa sıra aynen döner. */
export function moveSideCard(order: readonly SideCardId[], id: SideCardId, dir: -1 | 1): SideCardId[] {
  const list = normalizeSideCardOrder(order);
  const i = list.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

/** Sürükle-bırak: `from` sırasındaki kart `to` sırasına taşınır; geçersiz sıra numarasında değişmez. */
export function reorderSideCards(order: readonly SideCardId[], from: number, to: number): SideCardId[] {
  const list = normalizeSideCardOrder(order);
  const ok = (n: number) => Number.isInteger(n) && n >= 0 && n < list.length;
  if (!ok(from) || !ok(to) || from === to) return list;
  const [card] = list.splice(from, 1);
  list.splice(to, 0, card);
  return list;
}

export function isDefaultSideCardOrder(order: readonly SideCardId[]): boolean {
  return (
    order.length === DEFAULT_SIDE_CARD_ORDER.length && order.every((id, i) => id === DEFAULT_SIDE_CARD_ORDER[i])
  );
}

// Aralık hesabı — FSRS-6 ("yeni" yöntem) ve SM-2 ("eski" yöntem).
//
// Neden dışarıdan paket değil: Loomen yerel çalışır ve bağımlılığı az tutar.
// Hesap yaklaşık 80 satır saf matematik; buraya doğrudan yazmak sürüm sürüklenmesini
// ve çevrimdışı kurulum sorunlarını ortadan kaldırıyor.
//
// Model üç sayıdan oluşur:
//   S (stability)     — kart ne kadar oturmuş: bugün çalışırsan kaç gün sonra %90 hatırlarsın
//   D (difficulty)    — kart senin için ne kadar zor (1–10)
//   R (retrievability) — şu anda hatırlama ihtimalin (0–1)
//
// Kilit özdeşlik: R(S, S) = 0.90 — yani hedef hatırlama %90 iken aralık = S.

import type { Grade, Phase, SrsSettings, SrsState } from "./types";

/** FSRS-6 varsayılan ağırlıkları (Anki'nin gönderdiği değerler). */
export const W: number[] = [
  0.2172, 1.1771, 3.2602, 16.1507, 7.0114, 0.57, 2.0966, 0.0069, 1.5261, 0.112, 1.0178, 1.849,
  0.1133, 0.3127, 2.2934, 0.2191, 3.0004, 0.7536, 0.3332, 0.1437, 0.2,
];

const DECAY = -W[20];
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
const MIN_S = 0.001;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** t gün sonra hatırlama ihtimali. */
export function retrievability(elapsedDays: number, S: number): number {
  if (S <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / S, DECAY);
}

/** Hedef hatırlama oranına düşene kadar kaç gün var. */
export function intervalFor(S: number, retention: number): number {
  return (S / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

/** İlk cevaptan sonraki oturmuşluk. */
function initialStability(g: Grade): number {
  return Math.max(W[g - 1], MIN_S);
}

/** İlk cevaptan sonraki zorluk. */
function initialDifficulty(g: Grade): number {
  return clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
}

/** Zorluğun güncellenmesi — "ortalamaya dönüş" terimi (W[7]) sayesinde bir kez
 *  zorlaşan kart ömür boyu zor kalmaz; eski yöntemin en büyük derdi buydu. */
function nextDifficulty(D: number, g: Grade): number {
  const delta = -W[6] * (g - 3);
  const d1 = D + ((10 - D) * delta) / 9;
  return clamp(W[7] * (initialDifficulty(4) - d1) + d1, 1, 10);
}

/** Doğru hatırlandığında oturmuşluk ne kadar büyür.
 *  Not: R düşükken (yani tam unutmak üzereyken) artış daha büyüktür — bu yüzden
 *  kartı erken sormak öğrenmeyi hızlandırmaz, yavaşlatır. */
function stabilityOnPass(S: number, D: number, R: number, g: Grade): number {
  const hardPenalty = g === 2 ? W[15] : 1;
  const easyBonus = g === 4 ? W[16] : 1;
  const inc =
    Math.exp(W[8]) *
      (11 - D) *
      Math.pow(S, -W[9]) *
      (Math.exp(W[10] * (1 - R)) - 1) *
      hardPenalty *
      easyBonus +
    1;
  return S * inc;
}

/** Unutulduğunda oturmuşluk ne olur — SIFIRLANMAZ, kısmen korunur. */
function stabilityOnFail(S: number, D: number, R: number): number {
  const sf =
    W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R));
  return Math.max(MIN_S, Math.min(sf, S / Math.exp(W[17] * W[18])));
}

/** Aynı gün içinde (öğrenme adımlarında) verilen cevabın oturmuşluğa etkisi. */
function stabilityShortTerm(S: number, g: Grade): number {
  const inc = Math.exp(W[17] * (g - 3 + W[18])) * Math.pow(S, -W[19]);
  return Math.max(MIN_S, S * (g >= 3 ? Math.max(inc, 1) : inc));
}

// ——— Eski yöntem (SM-2) ———
// Zorluk yerine "kolaylık çarpanı" tutar. Basit ama unutunca aralığı sıfırlar ve
// kolaylık bir kez düştü mü kolay kolay geri çıkmaz.
const SM2_START_EASE = 2.5;
const SM2_MIN_EASE = 1.3;

function sm2Next(prevIvl: number, ease: number, g: Grade, lateDays: number) {
  if (g === 1) return { ivl: 1, ease: Math.max(SM2_MIN_EASE, ease - 0.2) };
  if (g === 2) return { ivl: prevIvl * 1.2, ease: Math.max(SM2_MIN_EASE, ease - 0.15) };
  if (g === 4)
    return { ivl: (prevIvl + lateDays) * ease * 1.3, ease: Math.min(3.5, ease + 0.15) };
  return { ivl: (prevIvl + lateDays / 2) * ease, ease };
}

/** Bir kartın hesaplanmış sonraki durumu. */
export interface NextStep {
  phase: Phase;
  /** Kaç dakika/gün sonra — dakika cinsinden (aynı gün içi adımlar için şart). */
  minutes: number;
  stability: number;
  difficulty: number;
  step: number;
  /** Gün cinsinden aralık (raporlar ve kayıt için). */
  days: number;
}

/** Yeni bir kartın başlangıç durumu. */
export function freshState(id: string, file: string, key: string, now = new Date()): SrsState {
  return {
    id,
    file,
    key,
    phase: "new",
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    step: 0,
    last: null,
  };
}

/** Geçen gün sayısı (kesirli değil — FSRS gün tabanlı çalışır). */
export function elapsedDays(st: SrsState, now: Date): number {
  if (!st.last) return 0;
  const ms = now.getTime() - new Date(st.last).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/**
 * Bir cevabın sonucunu hesapla. Durumu DEĞİŞTİRMEZ — yeni değerleri döner.
 * Böylece düğmelerin altında "bu düğmeye basarsan ne olur" göstermek mümkün olur.
 */
export function schedule(st: SrsState, g: Grade, cfg: SrsSettings, now = new Date()): NextStep {
  const learn = cfg.learnSteps.length ? cfg.learnSteps : [1, 10];
  const relearn = cfg.relearnSteps.length ? cfg.relearnSteps : [10];

  if (cfg.algo === "old") return scheduleSm2(st, g, cfg, learn, relearn, now);

  const elapsed = elapsedDays(st, now);
  const first = st.phase === "new" || st.stability <= 0;

  let S = first ? initialStability(g) : st.stability;
  let D = first ? initialDifficulty(g) : nextDifficulty(st.difficulty, g);

  if (!first) {
    const R = retrievability(elapsed, st.stability);
    if (elapsed < 1) {
      // aynı gün içinde tekrar bakıldı — kısa vadeli güncelleme
      S = stabilityShortTerm(st.stability, g);
    } else if (g === 1) {
      S = stabilityOnFail(st.stability, D, R);
    } else {
      S = stabilityOnPass(st.stability, D, R, g);
    }
  }

  // — Aynı gün içi adımlar (öğrenme / yeniden öğrenme) —
  if (st.phase === "new" || st.phase === "learning") {
    if (g === 1) return { phase: "learning", minutes: learn[0], stability: S, difficulty: D, step: 0, days: 0 };
    if (g === 4) return graduate(S, D, cfg, true);
    const next = st.phase === "new" ? (g === 2 ? 0 : 1) : st.step + 1;
    if (next < learn.length)
      return { phase: "learning", minutes: learn[next], stability: S, difficulty: D, step: next, days: 0 };
    return graduate(S, D, cfg, false);
  }

  if (st.phase === "relearning") {
    if (g === 1)
      return { phase: "relearning", minutes: relearn[0], stability: S, difficulty: D, step: 0, days: 0 };
    if (g === 4) return graduate(S, D, cfg, true);
    const next = st.step + 1;
    if (next < relearn.length)
      return { phase: "relearning", minutes: relearn[next], stability: S, difficulty: D, step: next, days: 0 };
    return graduate(S, D, cfg, false);
  }

  // — Yerleşmiş kart —
  if (g === 1)
    return { phase: "relearning", minutes: relearn[0], stability: S, difficulty: D, step: 0, days: 0 };

  const days = clampDays(intervalFor(S, cfg.retention), cfg);
  return { phase: "review", minutes: days * 1440, stability: S, difficulty: D, step: 0, days };
}

function graduate(S: number, D: number, cfg: SrsSettings, easy: boolean): NextStep {
  let days = clampDays(intervalFor(S, cfg.retention), cfg);
  if (easy) days = clampDays(Math.max(days, 4), cfg);
  return { phase: "review", minutes: days * 1440, stability: S, difficulty: D, step: 0, days };
}

function clampDays(d: number, cfg: SrsSettings): number {
  return Math.max(1, Math.min(cfg.maxInterval, Math.round(d)));
}

/** Eski yöntem — kolaylık çarpanı `difficulty` alanında saklanır (0 ise 2.5 kabul edilir). */
function scheduleSm2(
  st: SrsState,
  g: Grade,
  cfg: SrsSettings,
  learn: number[],
  relearn: number[],
  now: Date,
): NextStep {
  const ease = st.difficulty > 0 ? st.difficulty : SM2_START_EASE;
  const prevIvl = Math.max(1, st.stability);

  if (st.phase === "new" || st.phase === "learning") {
    if (g === 1) return { phase: "learning", minutes: learn[0], stability: 0, difficulty: ease, step: 0, days: 0 };
    if (g === 4) return { phase: "review", minutes: 4 * 1440, stability: 4, difficulty: ease, step: 0, days: 4 };
    const next = st.phase === "new" ? (g === 2 ? 0 : 1) : st.step + 1;
    if (next < learn.length)
      return { phase: "learning", minutes: learn[next], stability: 0, difficulty: ease, step: next, days: 0 };
    return { phase: "review", minutes: 1440, stability: 1, difficulty: ease, step: 0, days: 1 };
  }

  if (st.phase === "relearning") {
    if (g === 1)
      return { phase: "relearning", minutes: relearn[0], stability: prevIvl, difficulty: ease, step: 0, days: 0 };
    const next = g === 4 ? relearn.length : st.step + 1;
    if (next < relearn.length)
      return { phase: "relearning", minutes: relearn[next], stability: prevIvl, difficulty: ease, step: next, days: 0 };
    const d = clampDays(prevIvl, cfg);
    return { phase: "review", minutes: d * 1440, stability: d, difficulty: ease, step: 0, days: d };
  }

  if (g === 1) {
    const nextEase = Math.max(SM2_MIN_EASE, ease - 0.2);
    return { phase: "relearning", minutes: relearn[0], stability: 1, difficulty: nextEase, step: 0, days: 0 };
  }
  const late = st.last
    ? Math.max(0, Math.floor((now.getTime() - new Date(st.last).getTime()) / 86400000) - prevIvl)
    : 0;
  const r = sm2Next(prevIvl, ease, g, late);
  const days = clampDays(r.ivl, cfg);
  return { phase: "review", minutes: days * 1440, stability: days, difficulty: r.ease, step: 0, days };
}

/** Hesaplanan adımı kalıcı duruma uygula. */
export function apply(st: SrsState, g: Grade, next: NextStep, now = new Date()): SrsState {
  const due = new Date(now.getTime() + next.minutes * 60000);
  const lapsed = g === 1 && st.phase === "review";
  return {
    ...st,
    phase: next.phase,
    due: due.toISOString(),
    stability: next.stability,
    difficulty: next.difficulty,
    step: next.step,
    reps: st.reps + 1,
    lapses: st.lapses + (lapsed ? 1 : 0),
    last: now.toISOString(),
  };
}

/** Aralığı insan diline çevir: "10 dk", "3 gün", "1,4 ay", "2,1 yıl". */
export function humanInterval(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} dk`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} sa`;
  const days = minutes / 1440;
  if (days < 30) return `${Math.round(days)} gün`;
  if (days < 365) return `${(days / 30).toFixed(1).replace(".", ",")} ay`;
  return `${(days / 365).toFixed(1).replace(".", ",")} yıl`;
}

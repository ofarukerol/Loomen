// Günün kuyruğunu kurma — günlük yükün gerçekten kontrol edildiği yer.
//
// Yedi fren üst üste biner:
//   0. Açık kayıt      — işaretlenmemiş not zaten kart üretmez (parser)
//   1. Günlük tavanlar — yeni/gün ve en fazla tekrar/gün
//   2. Yeni en son     — yeni kartlar tekrardan ARTAN yeri kullanır; birikme varsa durur
//   3. Süre bütçesi    — ölçülen ortalama cevap süresinden kuyruğu kırpar
//   4. Hatırlama hedefi— aralıkları uzatır (fsrs.ts), yükü kaynağında azaltır
//   5. Aynı güne yığmama — kartı fuzz penceresi içinde en boş güne kaydırır
//   6. Kolay günler + tatil

import { elapsedDays, retrievability, schedule } from "./fsrs";
import { normalizeKey } from "./parser";
import type { DayCount } from "./store";
import type { Grade, Phase, SrsCard, SrsSettings, SrsState } from "./types";
import { freshState } from "./fsrs";

/** Cevap süresi ölçülene kadar kullanılan tahmin (saniye). */
const GUESS_SEC = 15;
const GUESS_SEC_NOTE = 45;

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** İki metin ne kadar benziyor (0–1) — soru düzenlenince kartı geri bulmak için. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  if (!long.length) return 1;
  if (long.includes(short)) return short.length / long.length;
  // ortak 3'lü parçalar oranı — hızlı ve yeterince ayırt edici
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const ga = grams(short);
  const gb = grams(long);
  if (!ga.size || !gb.size) return 0;
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return hit / Math.max(ga.size, gb.size);
}

export interface MatchResult {
  /** Kart kimliği → durum (var olan + yeni oluşturulan). */
  states: Record<string, SrsState>;
  /** Kaydı olan ama artık notta bulunmayan kartlar (silinmiş/düzenlenmiş). */
  orphans: SrsState[];
  /** Kaç kartın geçmişi düzenlenmiş soruya taşındı. */
  recovered: number;
  changed: boolean;
}

/**
 * Kartları kayıtlı durumlarla eşleştir.
 * Soru metni düzenlenince kimlik değişir; bu durumda AYNI NOTTAKİ eşleşmemiş
 * kayıtlar arasında en yakın metin aranır ve geçmiş oraya taşınır.
 */
export function matchStates(cards: SrsCard[], saved: Record<string, SrsState>): MatchResult {
  const states: Record<string, SrsState> = {};
  const used = new Set<string>();
  const missing: SrsCard[] = [];
  let changed = false;

  for (const c of cards) {
    const st = saved[c.id];
    if (st) {
      states[c.id] = st.file === c.file && st.key === c.key ? st : { ...st, file: c.file, key: c.key };
      used.add(c.id);
    } else {
      missing.push(c);
    }
  }

  const leftovers = Object.values(saved).filter((s) => !used.has(s.id));
  let recovered = 0;

  for (const c of missing) {
    const pool = leftovers.filter((s) => s.file === c.file && !used.has(s.id));
    let best: SrsState | null = null;
    let bestScore = 0;
    for (const s of pool) {
      const score = similarity(normalizeKey(c.question), s.key);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (best && bestScore >= 0.6) {
      used.add(best.id);
      states[c.id] = { ...best, id: c.id, file: c.file, key: c.key };
      recovered++;
      changed = true;
    } else {
      states[c.id] = freshState(c.id, c.file, c.key);
      changed = true;
    }
  }

  const orphans = Object.values(saved).filter((s) => !used.has(s.id));
  if (orphans.length) changed = true;
  return { states, orphans, recovered, changed };
}

export interface QueueItem {
  card: SrsCard;
  state: SrsState;
  /** Bu kart neden kuyrukta: aynı gün öğrenme / yerleşmiş tekrar / yeni. */
  bucket: "learn" | "review" | "new";
}

export interface QueueInfo {
  items: QueueItem[];
  /** Kuyrukta kaç tane var, tür türe. */
  learn: number;
  review: number;
  new: number;
  /** Sınırlar yüzünden bugün dışarıda kalan tekrar sayısı. */
  deferred: number;
  /** Tahmini süre (dakika). */
  minutes: number;
  /** Tatil modu yüzünden boş mu. */
  vacation: boolean;
  /** Bugün kolay gün olduğu için kısıldı mı. */
  eased: boolean;
}

/** Son kayıtlardan ortalama cevap süresi (saniye). Kayıt yoksa tahmin kullanılır. */
export function avgSeconds(msList: number[]): number {
  const good = msList.filter((m) => m > 500 && m < 120000);
  if (good.length < 10) return GUESS_SEC;
  good.sort((a, b) => a - b);
  return good[Math.floor(good.length / 2)] / 1000;
}

/** Bugünün kuyruğunu kur. */
export function buildQueue(
  cards: SrsCard[],
  states: Record<string, SrsState>,
  daily: Record<string, DayCount>,
  cfg: SrsSettings,
  now = new Date(),
  secPerCard = GUESS_SEC,
): QueueInfo {
  const today = isoDay(now);
  const empty: QueueInfo = {
    items: [],
    learn: 0,
    review: 0,
    new: 0,
    deferred: 0,
    minutes: 0,
    vacation: false,
    eased: false,
  };

  if (cfg.vacationUntil && cfg.vacationUntil >= today) return { ...empty, vacation: true };

  const load = cfg.weekLoad[now.getDay()] ?? 1;
  if (load <= 0) return { ...empty, eased: true };

  const done = daily[today] ?? { n: 0, r: 0, ms: 0 };
  const maxRev = Math.max(0, Math.round(cfg.maxPerDay * load) - done.r);
  const maxNew = Math.max(0, Math.round(cfg.newPerDay * load) - done.n);

  const byId = new Map(cards.map((c) => [c.id, c]));
  const nowMs = now.getTime();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  const learnQ: QueueItem[] = [];
  const reviewQ: QueueItem[] = [];
  const newQ: QueueItem[] = [];

  for (const [id, st] of Object.entries(states)) {
    const card = byId.get(id);
    if (!card) continue;
    if (st.frozen) continue;
    if (st.postponed && st.postponed >= today) continue;

    const dueMs = new Date(st.due).getTime();
    if (st.phase === "new") {
      newQ.push({ card, state: st, bucket: "new" });
    } else if (st.phase === "learning" || st.phase === "relearning") {
      if (dueMs <= nowMs) learnQ.push({ card, state: st, bucket: "learn" });
    } else if (dueMs <= endOfDay) {
      reviewQ.push({ card, state: st, bucket: "review" });
    }
  }

  // — Sıralama —
  if (cfg.order === "risk") {
    // en çok unutma riski olan önce: şu anki hatırlama ihtimali en düşük
    const risk = (it: QueueItem) =>
      it.state.stability > 0 ? retrievability(elapsedDays(it.state, now), it.state.stability) : 0;
    reviewQ.sort((a, b) => risk(a) - risk(b));
  } else if (cfg.order === "random") {
    reviewQ.sort(() => Math.random() - 0.5);
  } else {
    reviewQ.sort((a, b) => a.state.due.localeCompare(b.state.due));
  }
  learnQ.sort((a, b) => a.state.due.localeCompare(b.state.due));
  newQ.sort((a, b) => a.card.file.localeCompare(b.card.file) || a.card.line - b.card.line);

  // — Sınırlar: önce tekrar, ARTAN yeri yeni kartlar alır —
  const takenReview = reviewQ.slice(0, maxRev);
  const leftover = cfg.newIgnoresLimit ? maxNew : Math.max(0, maxRev - takenReview.length);
  const takenNew = newQ.slice(0, Math.min(maxNew, leftover));

  let items = [...learnQ, ...takenReview, ...takenNew];

  // — Süre bütçesi —
  if (cfg.minutesPerDay > 0) {
    const budgetSec = cfg.minutesPerDay * 60 * load - done.ms / 1000;
    let spent = 0;
    const fit: QueueItem[] = [];
    for (const it of items) {
      const cost = it.card.kind === "note" ? Math.max(secPerCard, GUESS_SEC_NOTE) : secPerCard;
      // aynı gün öğrenme adımları bütçeden muaf: yarım kalan kart ertesi güne bırakılmaz
      if (it.bucket !== "learn" && spent + cost > budgetSec) continue;
      spent += cost;
      fit.push(it);
    }
    items = fit;
  }

  // Bugün dışarıda kalan tekrar = tavan + süre bütçesi yüzünden düşenlerin toplamı.
  const shown = new Set(items.map((i) => i.card.id));
  const deferred = reviewQ.filter((i) => !shown.has(i.card.id)).length;

  const learn = items.filter((i) => i.bucket === "learn").length;
  const review = items.filter((i) => i.bucket === "review").length;
  const fresh = items.filter((i) => i.bucket === "new").length;
  const minutes = Math.round(
    items.reduce((a, i) => a + (i.card.kind === "note" ? Math.max(secPerCard, GUESS_SEC_NOTE) : secPerCard), 0) / 60,
  );

  return {
    items,
    learn,
    review,
    new: fresh,
    deferred,
    minutes,
    vacation: false,
    eased: load < 1,
  };
}

// ——— Aynı güne yığmama (yük dengeleyici) ———

/** Anki'nin fuzz bantları: aralık büyüdükçe oynama payı yüzdesi düşer. */
function fuzzRange(days: number): [number, number] {
  if (days < 2.5) return [days, days];
  if (days < 7) return [Math.max(2, Math.round(days * 0.85)), Math.round(days * 1.15)];
  if (days < 20) return [Math.round(days * 0.9), Math.round(days * 1.1)];
  return [Math.round(days * 0.95), Math.round(days * 1.05)];
}

/** Gelecek günlerin doluluğu: ISO gün → o gün beklenen kart sayısı. */
export function futureLoad(states: Record<string, SrsState>, now = new Date()): Map<string, number> {
  const m = new Map<string, number>();
  for (const st of Object.values(states)) {
    if (st.frozen || st.phase === "new") continue;
    const d = new Date(st.due);
    if (d.getTime() < now.getTime()) continue;
    const k = isoDay(d);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/**
 * Aralığı fuzz penceresi içinde en boş güne kaydır.
 * Algoritmanın hesabını BOZMAZ — yalnızca zaten kabul edilebilir aralık aralığında
 * hangi günün seçileceğini belirler. Kolay günler burada da devreye girer.
 */
export function balanceDays(days: number, cfg: SrsSettings, load: Map<string, number>, now = new Date()): number {
  if (!cfg.balance || days < 2.5) return Math.max(1, Math.round(days));
  const [lo, hi] = fuzzRange(days);
  let best = Math.round(days);
  let bestScore = Infinity;
  for (let d = lo; d <= hi; d++) {
    const day = new Date(now.getTime() + d * 86400000);
    const w = cfg.weekLoad[day.getDay()] ?? 1;
    if (w <= 0) continue; // kapalı gün
    const count = load.get(isoDay(day)) ?? 0;
    // Anki'nin ağırlığı: dolu gün ve kısa aralık cezalandırılır, kolay gün çarpanı uygulanır
    const score = (count + 1) / w;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return Math.max(1, best);
}

/** Önümüzdeki N günün beklenen yükü (grafik için). */
export function forecast(states: Record<string, SrsState>, days = 30, now = new Date()): { day: string; count: number }[] {
  const load = futureLoad(states, now);
  const out: { day: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const k = isoDay(d);
    out.push({ day: k, count: load.get(k) ?? 0 });
  }
  // bugünün kutusuna gecikmiş olanları da ekle
  let overdue = 0;
  for (const st of Object.values(states)) {
    if (st.frozen || st.phase === "new") continue;
    if (new Date(st.due).getTime() < now.getTime()) overdue++;
  }
  if (out.length) out[0].count += overdue;
  return out;
}

/** Birikeni N güne yay — gecikmiş kartların tarihini rastgele dağıtır. */
export function spreadBacklog(
  states: Record<string, SrsState>,
  days: number,
  now = new Date(),
): Record<string, SrsState> {
  const next = { ...states };
  const late = Object.values(states).filter(
    (s) => !s.frozen && s.phase === "review" && new Date(s.due).getTime() < now.getTime(),
  );
  late.sort((a, b) => a.due.localeCompare(b.due));
  late.forEach((s, i) => {
    const offset = Math.floor((i / Math.max(1, late.length)) * days);
    const d = new Date(now.getTime() + offset * 86400000);
    next[s.id] = { ...s, due: d.toISOString() };
  });
  return next;
}

/**
 * Günün en yoğun döneminde günde kaç kart çıkar — ayarlar ekranındaki canlı tahmin.
 *
 * Kapalı bir formülle hesaplanamaz, çünkü asıl yükü unutmalar üretir: unutulan kart
 * kısa aralığa düşer ve bir süre sık sık geri gelir. O yüzden bir yıl ileri sarılır:
 * her gün ayardaki kadar yeni kart tanıtılır, o gün vakti gelen her kart cevaplanır.
 *
 * Sonuç olarak yılın EN YOĞUN 30 gününün ortalaması verilir. Sebep: iş yükü sabit
 * değil — kart eklerken yükselir, eklemeyi bırakınca aralıklar uzadıkça düşer.
 * Sınırların karşılaması gereken sayı, düşük dönem değil yüksek dönemdir.
 *
 * Tavanlar bilerek uygulanmaz: burada ölçülen "kaç kart ÇIKIYOR", tavanların kaçına
 * izin verdiği değil. İkisini karşılaştırmak ayarlar ekranının işi.
 *
 * Aynı ayarlarla hep aynı sayı çıkar (rastgelelik sabit tohumludur), böylece ekran
 * her çizimde zıplamaz.
 */
const SIM_DAYS = 365;
const SIM_WINDOW = 30;

/** Sabit tohumlu basit rastgele üreteç — tahmin her seferinde aynı çıksın diye. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyDemand(
  _states: Record<string, SrsState>,
  cfg: SrsSettings,
  cardCount: number,
  secPerCard = GUESS_SEC,
): { cards: number; minutes: number } {
  if (cardCount <= 0 || cfg.newPerDay <= 0) return { cards: 0, minutes: 0 };

  // Bir yılda en fazla bu kadar kart tanıtılabilir; kütüphane daha büyükse fazlası
  // bu yıl zaten sıraya girmez, o yüzden benzetime de girmez.
  const pool = Math.min(cardCount, cfg.newPerDay * SIM_DAYS);
  const rnd = seeded(Math.round(cfg.retention * 1000) * 7919 + cfg.newPerDay * 31 + cfg.learnSteps.length);
  const t0 = new Date(2026, 0, 1, 9, 0, 0).getTime();

  // Kart başına yalnız iki sayı taşınır (nesne kurmadan) — tahmin her tuşta yeniden koşuyor.
  const phase: Phase[] = [];
  const stab: number[] = [];
  const diff: number[] = [];
  const step: number[] = [];
  const due: number[] = [];
  const last: number[] = [];

  const perDay = new Array<number>(SIM_DAYS).fill(0);
  let introduced = 0;

  const tmp: SrsState = {
    id: "",
    file: "",
    key: "",
    phase: "new",
    due: "",
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    step: 0,
    last: null,
  };

  for (let day = 0; day < SIM_DAYS; day++) {
    const now = t0 + day * 86400000;
    const dayEnd = now + 14 * 3600000;

    const add = Math.min(cfg.newPerDay, pool - introduced);
    for (let i = 0; i < add; i++) {
      phase.push("new");
      stab.push(0);
      diff.push(0);
      step.push(0);
      due.push(now);
      last.push(0);
    }
    introduced += add;

    let touches = 0;
    const nowDate = new Date(now);
    for (let c = 0; c < phase.length; c++) {
      // Aynı gün içinde birden fazla adım olabilir (öğrenme adımları).
      let guard = 0;
      while (due[c] <= dayEnd && guard++ < 8) {
        tmp.phase = phase[c];
        tmp.stability = stab[c];
        tmp.difficulty = diff[c];
        tmp.step = step[c];
        tmp.last = last[c] ? new Date(last[c]).toISOString() : null;
        const g: Grade = rnd() < cfg.retention ? 3 : 1;
        const next = schedule(tmp, g, cfg, nowDate);
        phase[c] = next.phase;
        stab[c] = next.stability;
        diff[c] = next.difficulty;
        step[c] = next.step;
        last[c] = now;
        due[c] = now + Math.max(next.minutes, 1) * 60000;
        touches++;
      }
    }
    perDay[day] = touches;
  }

  // En yoğun 30 günün ortalaması.
  let sum = 0;
  for (let i = 0; i < SIM_WINDOW; i++) sum += perDay[i];
  let best = sum;
  for (let i = SIM_WINDOW; i < SIM_DAYS; i++) {
    sum += perDay[i] - perDay[i - SIM_WINDOW];
    if (sum > best) best = sum;
  }

  const cards = best / SIM_WINDOW;
  return { cards, minutes: (cards * secPerCard) / 60 };
}

// Aralıklı tekrar — çekirdek tipler.
// Tasarım ilkesi: hiçbir not kendiliğinden tekrara girmez; kullanıcı işaretler.
// NOTE_SAFETY: bu modül not dosyalarını YALNIZCA OKUR, asla yazmaz. Tüm durum
// kasadaki `Tekrar/` klasöründe ayrı dosyalarda tutulur.

/** Cevap düğmeleri — 1: bilemedim, 2: zor bildim, 3: bildim, 4: çok kolaydı. */
export type Grade = 1 | 2 | 3 | 4;

/** Kartın hayat evresi. */
export type Phase = "new" | "learning" | "review" | "relearning";

/** Kart türü — nasıl işaretlendiğine göre. */
export type CardKind =
  | "basic" // Soru :: Cevap
  | "reverse" // Soru ::: Cevap (ters yönü)
  | "block" // çok satırlı, `?` ile ayrılmış
  | "cloze" // ==gizlenmiş== kelime
  | "note"; // #tekrar etiketli notun tamamı

/** Nottan çıkarılmış bir kart (her taramada yeniden üretilir — kalıcı değil). */
export interface SrsCard {
  /** Kalıcı kimlik: hash(dosya yolu + soru metni). Satır numarası KULLANILMAZ. */
  id: string;
  /** Kasaya göre not yolu. */
  file: string;
  /** Soru metninin normalize hali — kimliğin ikinci parçası, kurtarmada kullanılır. */
  key: string;
  kind: CardKind;
  /** Ön yüz (ham markdown). */
  question: string;
  /** Arka yüz (ham markdown). */
  answer: string;
  /** Notun içindeki 0-tabanlı satır — "notta aç" için, kalıcı değil. */
  line: number;
}

/** Bir kartın kalıcı durumu (Tekrar/durum.json). */
export interface SrsState {
  id: string;
  /** Kart hangi notta — not yeniden adlandırılınca göç için. */
  file: string;
  /** Soru metninin normalize hali — soru düzenlenirse kurtarma için. */
  key: string;
  phase: Phase;
  /** Ne zaman sorulacak (ISO, dakika hassasiyetinde). */
  due: string;
  /** Ne kadar oturmuş (gün). */
  stability: number;
  /** Ne kadar zor (1–10). */
  difficulty: number;
  reps: number;
  lapses: number;
  /** Öğrenme adımlarında kaçıncı basamaktayız. */
  step: number;
  /** Son cevap zamanı (ISO) — gecikme hesabı için. */
  last: string | null;
  /** Dondurulmuş kart hiç çıkmaz (durumunu korur). */
  frozen?: boolean;
  /** Bu tarihe kadar bugünlük ertelendi (ISO gün). */
  postponed?: string;
  /** Çok unutulan kart işareti. */
  leech?: boolean;
}

/** Tek bir cevabın kaydı (Tekrar/gecmis.jsonl) — satır satır eklenir, hiç silinmez.
 *  Bu kayıt olmadan ileride kişiye özel ayar öğrenmek mümkün olmaz. */
export interface SrsLog {
  id: string;
  /** Cevap anı (epoch ms). */
  t: number;
  g: Grade;
  /** Cevap öncesi evre. */
  p: Phase;
  /** Cevap sonrası oturmuşluk / zorluk. */
  s: number;
  d: number;
  /** Yeni aralık (gün) ve önceki aralık (gün). */
  i: number;
  pi: number;
  /** Düşünme süresi (ms) — günlük süre bütçesi bundan hesaplanır. */
  ms: number;
}

/** Bir deste: kasadaki bir alt kümeyi adlandırır. */
export interface SrsDeck {
  id: string;
  name: string;
  /** Klasör yolu öneki ("" = tüm kasa). */
  folder: string;
  /** Etiket süzgeci (başında # yok). Boşsa süzme yok. */
  tag: string;
  /** Desteye özel günlük sınırlar (yoksa genel ayar geçerli). */
  newPerDay?: number;
  maxPerDay?: number;
}

/** Hangi işaretleme biçimleri taranacak. */
export interface SrsSyntax {
  basic: boolean; // Soru :: Cevap
  reverse: boolean; // Soru ::: Cevap
  block: boolean; // çok satırlı, `?` ayraçlı
  cloze: boolean; // ==gizlenmiş==
  note: boolean; // #tekrar etiketli notun tamamı
}

/** Tüm tekrar ayarları (Tekrar/ayarlar.json). */
export interface SrsSettings {
  /** Modül açık mı — varsayılan kapalı. */
  enabled: boolean;
  /** Hesap yöntemi: yeni (FSRS-6) veya eski (SM-2). */
  algo: "new" | "old";
  /** Hatırlama hedefi (0.80–0.95). Düşürmek aralıkları uzatır, günlük yükü azaltır. */
  retention: number;

  // — Günlük sınırlar —
  newPerDay: number;
  maxPerDay: number;
  /** Günde en fazla kaç dakika (0 = sınır yok). */
  minutesPerDay: number;
  /** Yeni kartlar tekrar sınırını yok saysın mı (varsayılan hayır: birikme olunca yeni durur). */
  newIgnoresLimit: boolean;

  // — Öğrenme —
  /** Yeni kartı aynı gün kaç kez sorsun (dakika). */
  learnSteps: number[];
  /** Unutulan kartı aynı gün kaç kez sorsun (dakika). */
  relearnSteps: number[];
  /** En uzun aralık (gün). */
  maxInterval: number;

  // — Yayma —
  /** Kartları aynı güne yığmadan en boş güne kaydır. */
  balance: boolean;
  /** Haftanın günleri için yük çarpanı — index 0 = Pazar (Date.getDay ile aynı).
   *  1 = normal, 0.5 = azaltılmış, 0 = kapalı. */
  weekLoad: number[];
  /** Bu tarihe kadar tatil (ISO gün) — hiçbir kart çıkmaz, birikme sayılmaz. */
  vacationUntil: string | null;

  // — Sıralama ve işaretler —
  order: "risk" | "due" | "random";
  /** Kaç kez unutunca işaretlensin. */
  leechAt: number;
  /** İşaretlenince ne olsun. */
  leechAction: "freeze" | "mark";
  /** Aynı notun diğer kartlarını bugünlük ertele. */
  burySiblings: boolean;

  /** Hangi işaretleme biçimleri taranacak. */
  syntax: SrsSyntax;
  /** Bu klasörler hiç taranmaz. */
  excluded: string[];
  desteler: SrsDeck[];
}

export const DEFAULT_SETTINGS: SrsSettings = {
  enabled: false,
  algo: "new",
  retention: 0.9,
  newPerDay: 10,
  maxPerDay: 60,
  minutesPerDay: 15,
  newIgnoresLimit: false,
  learnSteps: [1, 10],
  relearnSteps: [10],
  maxInterval: 36500,
  balance: true,
  weekLoad: [1, 1, 1, 1, 1, 1, 1],
  vacationUntil: null,
  order: "risk",
  leechAt: 8,
  leechAction: "freeze",
  burySiblings: true,
  syntax: { basic: true, reverse: true, block: true, cloze: true, note: true },
  excluded: [],
  desteler: [],
};

/** Hazır profiller — Ayarlar > Basit sekmesindeki tek tıklık seçenekler. */
export const PRESETS: Record<"light" | "balanced" | "heavy", Partial<SrsSettings>> = {
  light: { retention: 0.85, newPerDay: 3, maxPerDay: 40, minutesPerDay: 10 },
  balanced: { retention: 0.9, newPerDay: 10, maxPerDay: 60, minutesPerDay: 15 },
  heavy: { retention: 0.92, newPerDay: 20, maxPerDay: 120, minutesPerDay: 30 },
};

/** Kasa içindeki tekrar klasörü — görünür (senkronlanır) ama dosya ağacında listelenmez
 *  (ağaç yalnız .md ve .excalidraw gösterir). */
export const SRS_DIR = "Tekrar";
export const STATE_FILE = `${SRS_DIR}/durum.json`;
export const LOG_FILE = `${SRS_DIR}/gecmis.jsonl`;
export const SETTINGS_FILE = `${SRS_DIR}/ayarlar.json`;

// Alışkanlık takibinin türleri ve sabitleri (LOM-54).
//
// Veri kasada görünür `Alışkanlık/` klasöründe, her tur ayrı `<id>.json` dosyasında tutulur
// (iki cihaz senkronunda çakışma azalır). Dosya sürümlüdür: {"v":1,"habit":{...}}.
// Gün anahtarları YEREL takvim günüdür (YYYY-MM-DD), UTC değil.

/** Kasadaki klasör adı. Diskte macOS NFD biçiminde de durabilir; karşılaştırma NFC ile yapılır. */
export const HABIT_DIR = "Alışkanlık";

/** Dosya biçiminin sürümü — ileride alan eklenirse artar; bilinmeyen sürüm okunmaz, ezilmez. */
export const HABIT_FILE_VERSION = 1;

/** Ekleme ekranındaki süre çipleri (gün). "Özel" MIN_DAYS-MAX_DAYS arası serbest. */
export const DURATION_CHIPS = [7, 21, 30, 40, 41, 66, 90] as const;
export const DEFAULT_DAYS = 21;
export const MIN_DAYS = 1;
export const MAX_DAYS = 365;

/** Renk anahtarları — arayüz bunları tema tokenlarına eşler (koyu temada da okunur). */
export const HABIT_COLORS = ["terra", "teal", "amber", "green", "purple", "red", "charcoal"] as const;
export type HabitColor = (typeof HABIT_COLORS)[number];
export const DEFAULT_COLOR: HabitColor = "terra";

/** Küçük simge seti; ilki varsayılan. */
export const HABIT_EMOJIS = ["🌱", "📖", "🏃", "💧", "🧘", "✍️", "🕌", "🌙", "🍎", "💪", "🎵", "🧠"] as const;

export type HabitStatus = "active" | "quit";

/** Bir alışkanlığın tek turu. Yeni tur yeni kayıttır; turlar `lineageId` ile bağlanır. */
export interface Habit {
  /** Dosya adı da budur: `Alışkanlık/<id>.json`. Yalnız [a-z0-9]. */
  id: string;
  name: string;
  emoji: string;
  color: HabitColor;
  /** "Neden başlıyorum?" cümlesi (isteğe bağlı). */
  intent?: string;
  /** Süre (gün), MIN_DAYS-MAX_DAYS. */
  days: number;
  /** Başlangıç günü, yerel YYYY-MM-DD. */
  start: string;
  /** Tur numarası, 1'den başlar. */
  round: number;
  /** Önceki turun kimliği. */
  prevId?: string;
  /** Aynı alışkanlığın bütün turlarının ortak kimliği (ilk turun id'si). */
  lineageId: string;
  status: HabitStatus;
  /** Yapılan günler (sıralı, tekil). */
  done: string[];
  /** Mazeretli günler (sıralı, tekil) — seriyi bozmaz, yüzdenin paydasına girmez. */
  excused: string[];
  /**
   * Yarım yapılan günler (sıralı, tekil; LOM-70) — tamamlanan sayılmaz, seriyi bozmaz (uzatmaz da),
   * yüzdenin paydasına girer. Bir gün aynı anda yapıldı ya da mazeretli olamaz. Dosyada yalnız
   * doluyken yazılır; alanı olmayan eski dosya boş listeyle okunur.
   */
  half: string[];
  /** Oluşturulma anı (ms). */
  createdAt: number;
  /** Bırakılma anı (ms). */
  quitAt?: number;
}

/** Dosyadaki biçim. */
export interface HabitFile {
  v: 1;
  habit: Habit;
}

/** Gün dizisindeki bir hücrenin durumu. */
export type CellState = "done" | "half" | "today" | "missed" | "excused" | "future";

/** Bitmiş turun sonucu: Tamamlandı / Bitti x/y / Bırakıldı. */
export type Outcome =
  | { kind: "completed" }
  | { kind: "ended"; done: number; total: number }
  | { kind: "quit" };

export interface HabitStats {
  /** Yapılan gün sayısı. */
  completed: number;
  /** Mazeretli gün sayısı. */
  excused: number;
  /** Yarım yapılan gün sayısı (tamamlanana girmez). */
  half: number;
  /** Yüzdenin paydası: geçmiş mazeretsiz günler, yarımlar dahil (bugün yalnız yapıldı ya da yarımsa sayılır). */
  elapsed: number;
  /** Başarı yüzdesi (0-100, tam sayı). */
  percent: number;
  /** Güncel seri — bugün henüz yapılmadıysa dünden geriye sayılır. */
  currentStreak: number;
  longestStreak: number;
  /** Kalan gün: bugün (işaretsizse) ve sonrası. */
  remaining: number;
}

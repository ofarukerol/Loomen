// Kütüphane türleri ve sabitleri (LOM-83).
//
// Kitap DOSYASI kasaya girmez: uygulamanın kendi klasöründe `<appData>/loomen#library/<id>.<pdf|epub>`
// durur (GitHub şişmesin). Kasada yalnız kitabın kaydı (`Kütüphane/<id>.json`) ve düz bir notu
// (`Kütüphane/<başlık>.md`) tutulur. Kayıt sürümlüdür: {"v":1,"book":{...}}.
//
// Çizim yeri (anchor) yazı boyutundan ve yakınlaştırmadan BAĞIMSIZDIR (K5):
//  - PDF: sayfa numarası + sayfaya göre 0..1 aralığında dikdörtgenler.
//  - EPUB: bölüm sırası/yolu + bölümün düz metnindeki karakter aralığı.
//  - Kindle (LOM-84): Kindle'ın "My Clippings.txt" dosyasındaki konum aralığı ve/veya sayfa.
//
// Kindle kitabının DOSYASI yoktur: kayıt yalnız çizimleri taşır (okuyucu açılmaz, kart notu
// açar). Özeti (hash) dosyadan değil normalleştirilmiş "başlık|yazar" metninden türer; boyut 0,
// dosya adı boştur. Dosya işlemlerinden önce `hasBookFile` sorulur.

/** Kasadaki klasör adı. Diskte macOS NFD biçiminde de durabilir; karşılaştırma NFC ile yapılır. */
export const LIBRARY_DIR = "Kütüphane";

/**
 * Uygulama klasöründe kitap dosyalarının durduğu alt klasör (kasa DIŞI).
 * - Nokta ile BAŞLAMAZ: Tauri dosya izni `$APPDATA/**` macOS/Linux/Android'de noktalı klasörü
 *   eşlemez (`.trash` için izinlerde ayrı satır var); noktalı ad bütün okuma/yazmayı reddettirirdi.
 * - `#` içerir: mobilde kasalar da appData altında durur ve kasa adından `#` silinir
 *   (`-` olur); bu yüzden hiçbir kasa klasörü bu adı alamaz.
 */
export const LIBRARY_FILES_DIR = "loomen#library";
/** Kapak resimleri (cihaza özel, yeniden üretilebilir). */
export const LIBRARY_COVERS_DIR = "loomen#library/covers";

/** Dosya biçiminin sürümü — bilinmeyen sürüm okunmaz, ezilmez. */
export const BOOK_FILE_VERSION = 1;

/** Bu boyutun üstünde içe aktarmadan önce uyarı (mobilde bellek). */
export const LARGE_BOOK_BYTES = 200 * 1024 * 1024;

export const BOOK_FORMATS = ["pdf", "epub", "kindle"] as const;
export type BookFormat = (typeof BOOK_FORMATS)[number];
/** Uygulama klasöründe dosyası olan (okuyucuda açılan) biçimler. */
export const FILE_BOOK_FORMATS = ["pdf", "epub"] as const;
export type FileBookFormat = (typeof FILE_BOOK_FORMATS)[number];

export const BOOK_STATUSES = ["toread", "reading", "done"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

/** Çizim renkleri — arayüz bunları tema tokenlarına eşler. İlki varsayılan. */
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "yellow";

/** Okuyucu temaları — uygulama temasından bağımsız. */
export const READER_THEMES = ["light", "dark", "sepia"] as const;
export type ReaderTheme = (typeof READER_THEMES)[number];

/** Yazı ölçeği sınırları (1 = %100). */
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 2;
export const FONT_SCALE_STEP = 0.1;

/** PDF sayfasına göre normalleştirilmiş dikdörtgen (0..1; sol üst köşe başlangıç). */
export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** PDF çizim yeri: 1'den başlayan sayfa + o sayfadaki dikdörtgenler. */
export interface PdfAnchor {
  kind: "pdf";
  page: number;
  rects: PdfRect[];
}

/** EPUB çizim yeri: bölüm (spine) sırası ve yolu + bölümün düz metnindeki [start, end) aralığı. */
export interface EpubAnchor {
  kind: "epub";
  spine: number;
  href: string;
  start: number;
  end: number;
}

/**
 * Kindle çizim yeri (LOM-84): Kindle konum aralığı (start <= end, 1'den) ve/veya sayfa.
 * En az biri doludur. Kindle konumları cihazdan bağımsızdır; sayfa yalnız bazı kitaplarda vardır.
 */
export interface KindleAnchor {
  kind: "kindle";
  location?: { start: number; end: number };
  page?: number;
}

export type Anchor = PdfAnchor | EpubAnchor | KindleAnchor;

/** Kalınan yer. PDF: sayfa + sayfa içi dikey oran (0..1). EPUB: bölüm + bölüm metnindeki karakter ofseti. */
export type BookPosition =
  | { kind: "pdf"; page: number; offset: number }
  | { kind: "epub"; spine: number; href: string; offset: number }
  /** Kindle: konum (yoksa sayfa) numarası. Okuyucu bunu kullanmaz; yalnız sıra/gösterim. */
  | { kind: "kindle"; location: number };

export interface Highlight {
  /** Kitap içinde tekil; bağlantıda `?hl=<id>`. Yalnız [A-Za-z0-9_-]. */
  id: string;
  color: HighlightColor;
  /** Seçilen metin (alıntı). */
  text: string;
  /** Kullanıcının notu (isteğe bağlı). */
  note?: string;
  anchor: Anchor;
  /** EPUB'da bölüm adı (alıntının altında gösterilir). */
  chapter?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Book {
  /** Dosya adı da budur: `Kütüphane/<id>.json`. İçerik özetinin ilk 16 hanesi. */
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  /** Dosyanın SHA-256 özeti (64 hane, küçük harf) — her cihazda dosyayı eşlemek için. */
  hash: string;
  /** Bayt. */
  size: number;
  /** İçe aktarılan dosyanın asıl adı (gösterim ve yeniden ekleme için). */
  fileName: string;
  status: BookStatus;
  /** Kitabın kasadaki notu. Not taşınırsa bulunduğu yerle güncellenir. */
  notePath: string;
  addedAt: number;
  updatedAt: number;
  /** "Bitti"ye alınma anı. */
  finishedAt?: number;
  /** Toplam sayfa (PDF) ya da bölüm (EPUB) sayısı — okuyucu ilk açılışta yazar. */
  pages?: number;
  /** Okuma ilerlemesi 0..1. */
  progress?: number;
  position?: BookPosition;
  /**
   * Kalınan yerin kaydedildiği an (ms, LOM-92). Cihazlar arası "yeni olan kazanır" kuralı bu
   * alana dayanır: eşitlemeden gelen kayıt bellektekinden yeniyse konumu o alır, bekleyen eski
   * konum daha yeni kaydın üstüne yazılmaz. Eski kayıtlarda yoktur (0 sayılır); dosya sürümü v:1 kalır.
   */
  positionSavedAt?: number;
  /** Kitap sırasına göre çizimler. */
  highlights: Highlight[];
}

export interface BookFile {
  v: 1;
  book: Book;
}

/** Okuyucu tercihleri (cihaza özel; localStorage). */
export interface ReaderPrefs {
  fontScale: number;
  theme: ReaderTheme;
  color: HighlightColor;
}

export const DEFAULT_READER_PREFS: Readonly<ReaderPrefs> = Object.freeze({
  fontScale: 1,
  theme: "light",
  color: DEFAULT_HIGHLIGHT_COLOR,
});

/** Nottaki bağlantının çözümlenmiş hâli: `loomen://book/<id>?hl=<hlId>` ya da `?page=12`. */
export interface BookLink {
  bookId: string;
  highlightId?: string;
  page?: number;
}

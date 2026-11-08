// Okuyucu kabuğu ile biçime özel görüntüleyiciler arasındaki sözleşme (LOM-83).
//
// Görüntüleyiciler `views/<Biçim>View.tsx` dosyalarıdır (PdfView.tsx, EpubView.tsx) ve
// `default` olarak bir React bileşeni dışa verir. ReaderScreen onları `import.meta.glob`
// ile tembel yükler; dosya yoksa yer tutucu gösterir. Görüntüleyici yalnız bu türleri bilir:
// kayıt, not eşitleme, renk menüsü, not penceresi ve çizim listesi kabuktadır.

import type { ReactNode } from "react";
import type { Anchor, Book, BookPosition, Highlight, HighlightColor, InkPage, InkPoint, ReaderTheme } from "../../core/library/types";

/** Ekran (viewport) koordinatlarında dikdörtgen — renk menüsünü konumlamak için. */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Kullanıcının seçtiği metin: görüntüleyici çıpayı (anchor) hesaplar, kabuk menüyü açar. */
export interface ReaderSelection {
  text: string;
  anchor: Anchor;
  /** EPUB: bölüm adı. */
  chapter?: string;
  rect: ViewRect;
}

/** Görüntüleyicinin ilk açılışta bildirdiği bilgiler. Hepsi isteğe bağlı. */
export interface BookMeta {
  title?: string;
  author?: string;
  /** Toplam sayfa (PDF) ya da bölüm (EPUB) sayısı. */
  pages?: number;
  /** Kapak resmi (PNG/JPEG). Kabuk uygulama klasörüne yazar, rafta gösterir. */
  cover?: Blob;
  /** EPUB: bölümlerin açılmış toplam bayt boyu — okuma alışkanlığında sanal sayfa sayısı için (LOM-93). */
  textBytes?: number;
}

/** İçindekiler maddesi (EPUB; PDF'te ana hatlar varsa). */
export interface TocItem {
  label: string;
  depth: number;
  position: BookPosition;
}

/**
 * Gidilecek yer. `seq` her istekte artar: aynı yere ikinci kez gitmek de çalışsın.
 * `highlightId` verilirse görüntüleyici o çizimi kısa süre vurgular.
 */
export interface ReaderTarget {
  seq: number;
  anchor?: Anchor;
  position?: BookPosition;
  highlightId?: string;
}

export interface ReaderViewProps {
  book: Book;
  /** Kitap dosyasının baytları (kabuk uygulama klasöründen okur). */
  data: Uint8Array;
  fontScale: number;
  theme: ReaderTheme;
  /** Çizilecek çizimler (kitap sırasıyla). */
  highlights: Highlight[];
  /** Açılışta gidilecek kalınan yer (yoksa baş). */
  initialPosition?: BookPosition;
  /** Açılıştan sonraki atlama istekleri (bağlantı, içindekiler, çizim listesi). */
  target: ReaderTarget | null;
  /** Okurken konum değişti. Kabuk kaydı geciktirir (sık yazmaz). `progress` 0..1. */
  onPosition: (pos: BookPosition, progress: number) => void;
  /** Seçim değişti (null = seçim kalktı). */
  onSelection: (sel: ReaderSelection | null) => void;
  /** Var olan bir çizime dokunuldu. */
  onHighlightClick: (id: string, rect: ViewRect) => void;
  onMeta: (meta: BookMeta) => void;
  onToc?: (items: TocItem[]) => void;
  /** Dosya açılamadı (bozuk, şifreli…). */
  onError: (err: unknown) => void;

  // ── Kalem (LOM-97; yalnız PDF görüntüleyici kullanır, EPUB yok sayar) ──

  /** Çizilecek kalem çizgileri, sayfa sayfa (noktalar sayfaya göre 0..1 oranı). */
  ink?: readonly InkPage[];
  /**
   * Kalem açık: kalem (Apple Pencil) ve fare sayfaya çizer, metin seçilmez, çizime dokunma
   * menüsü açılmaz. Parmak sayfayı kaydırmaya devam eder (avuç içi çizgi bırakmaz).
   */
  penMode?: boolean;
  /**
   * Bir çizgi bitti (kalem kalktı). Noktalar sadeleştirilmiş, 0..1 oranıdır, en az 1 nokta.
   * Kabuk çizgiyi kayda ekler ve `ink`'i günceller; görüntüleyici çizgiyi o zamana dek canlı
   * çizimden gösterir.
   */
  onInkStroke?: (page: number, points: InkPoint[]) => void;
  /**
   * Kalemli sayfanın not resmi hazır: açık (ters çevrilmemiş) sayfa + çizgiler, ~800 px genişlik,
   * PNG. Bu oturumda çizilen ya da o an okunan sayfanın `ink`'i değişince (çizgi, geri al)
   * kısa gecikmeyle çağrılır; sayfa temizlenince (çizgi kalmayınca) çağrılmaz. Görüntüleyici
   * kapanırken ya da uygulama arka plana geçerken bekleyen resimler hemen üretilir: çağrı
   * görüntüleyici kapandıktan SONRA da gelebilir.
   */
  onInkSnapshot?: (page: number, png: Blob) => void;
}

/** Görüntüleyici modülünün biçimi. */
export interface ReaderViewModule {
  default: (props: ReaderViewProps) => ReactNode;
}

/** Renk anahtarının ekrandaki karşılığı (görüntüleyiciler çizim katmanında da kullanır). */
export const HIGHLIGHT_CSS: Record<HighlightColor, string> = {
  yellow: "rgba(250, 204, 21, 0.38)",
  green: "rgba(74, 222, 128, 0.34)",
  blue: "rgba(96, 165, 250, 0.34)",
  pink: "rgba(244, 114, 182, 0.34)",
};

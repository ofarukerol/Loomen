import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

/** Resim embed'i olarak gösterilecek uzantılar. */
const IMG_EXT = "png|jpe?g|gif|webp|bmp|svg|avif|ico";

/** Tek başına bir satırı kaplayan kasa içi resim: `![[Ekler/x.png]]` (isteğe bağlı `|genişlik`). */
const WIKI_IMAGE = new RegExp(`^!\\[\\[\\s*([^\\][|\\n]+?\\.(?:${IMG_EXT}))\\s*(?:\\|\\s*([^\\]\\n]*?)\\s*)?\\]\\]$`, "i");
/**
 * Tek başına bir satırı kaplayan markdown resmi: `![alt](yol)` — başlık metni yok sayılır,
 * `<...>` biçimi (boşluklu dosya adı) desteklenir.
 */
const MD_IMAGE = /^!\[([^\]\n]*)\]\(\s*(?:<([^>\n]+)>|([^)\s]+))\s*(?:"[^"\n]*"|'[^'\n]*')?\s*\)$/;

/** Bir satırdan çözülen resim referansı. */
export interface ImageRef {
  /** Kasa içi göreli yol ya da http(s)/data/blob adresi. */
  src: string;
  alt: string;
  /** `![[x.png|320]]` yazımından gelen piksel genişliği. */
  width?: number;
}

/** Ağdan/gömülü gelen, dosya sisteminde aranmayacak adres mi? */
export function isRemoteSrc(src: string): boolean {
  return /^(https?:|data:|blob:|file:)/i.test(src);
}

/** Uzantıdan MIME (blob URL'i doğru türde kurmak için). */
export function imageMime(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "ico") return "image/x-icon";
  return `image/${ext}`;
}

/**
 * Satır bir resim embed'i mi? Değilse null. Hem düzenleme (livePreview widget'ı) hem okuma
 * (Markdown) modu aynı yorumu kullansın diye tek yerde tanımlı.
 */
export function parseImageLine(text: string): ImageRef | null {
  const s = text.trim();
  if (!s.startsWith("!")) return null;

  const wiki = s.match(WIKI_IMAGE);
  if (wiki) {
    const src = wiki[1];
    const w = wiki[2] ? parseInt(wiki[2], 10) : NaN;
    return {
      src,
      alt: src.split("/").pop() ?? src,
      ...(Number.isFinite(w) && w > 0 ? { width: w } : {}),
    };
  }

  const md = s.match(MD_IMAGE);
  if (md) {
    const raw = md[2] ?? md[3];
    let src = raw;
    try {
      src = decodeURI(raw); // %20 vb. çöz; bozuk kaçış varsa ham hali kullanılır
    } catch {
      /* geçersiz URI kaçışı — ham yol denenir */
    }
    return { src, alt: md[1] || (src.split("/").pop() ?? src) };
  }

  return null;
}

interface Props extends ImageRef {
  /** Çözülemezse gösterilecek ham satır (veri kaybolmasın). */
  raw?: string;
  /** Resim yüklenince/başarısız olunca — CM widget'ı yüksekliği yeniden ölçsün. */
  onLoad?: () => void;
}

/**
 * Not içine gömülü resim — `![[Ekler/x.png]]` ve `![alt](yol)` satırları için
 * (bkz Markdown.tsx + livePreview widget'ı). Kasa içi dosyalar ikili okunup blob URL'e
 * çevrilir (Tauri'de `src` ile dosya yolu doğrudan yüklenemez). Dosya yoksa/okunamazsa
 * ham metin gösterilir — satır silinmez, veri kaybolmaz.
 */
export function ImageEmbed({ src, alt, width, raw, onLoad }: Props) {
  // backend.readBinary'nin store'daki tek geçidi; ses/resim ayrımı yapmaz.
  const readBinary = useAppStore((s) => s.readAudioFile);
  const remote = isRemoteSrc(src);
  const [url, setUrl] = useState<string | null>(remote ? src : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isRemoteSrc(src)) {
      setUrl(src);
      setFailed(false);
      return;
    }
    let alive = true;
    let revoke: string | null = null;
    setUrl(null);
    setFailed(false);
    readBinary(src)
      .then((bytes) => {
        if (!alive) return;
        if (!bytes.length) {
          setFailed(true);
          return;
        }
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: imageMime(src) }));
        revoke = blobUrl;
        setUrl(blobUrl);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [src, readBinary]);

  // Yükleme/hata geçişleri satır yüksekliğini değiştirir → CM yeniden ölçsün.
  useEffect(() => {
    if (failed) onLoad?.();
    // onLoad kimliği her render değişebilir; yalnız durum değişiminde tetikle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  if (failed) {
    return (
      <span className="lo-imgembed lo-imgembed--missing">
        <ImageOff size={15} strokeWidth={1.8} />
        <span className="lo-imgembed__raw">{raw ?? src}</span>
      </span>
    );
  }

  if (!url) return <span className="lo-imgembed lo-imgembed--loading" />;

  return (
    <span className="lo-imgembed">
      <img
        src={url}
        alt={alt}
        draggable={false}
        style={width ? { width: `${width}px` } : undefined}
        onLoad={() => onLoad?.()}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

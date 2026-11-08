// Fotoğraftan alıntı için görsel alma ve küçültme (LOM-87).
//
// Telefonda gizli `<input type=file accept=image/* capture=environment>` kamerayı açar (WebView
// desteklemezse galeri açılır); "Galeriden seç" aynı girdiyi `capture` olmadan açar. Masaüstünde
// dosya penceresi (plugin-dialog) ve plugin-fs ile okunur. Görsel sağlayıcıya gitmeden önce en
// uzun kenarı PHOTO_MAX_SIDE pikseli geçmeyecek biçimde JPEG'e küçültülür: yükleme küçük, yazı
// okunur kalır. Görsel hiçbir yere kaydedilmez.

import { OCR_IMAGE_MIMES, OCR_MAX_IMAGE_BYTES } from "../../core/ai/ocr";

/** Küçültmede en uzun kenar (piksel). */
export const PHOTO_MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

export interface PhotoImage {
  bytes: Uint8Array;
  mime: string;
}

/** Görselin türünü uzantıdan tahmin et (masaüstünde seçilen dosyanın türü bilinmez). */
export function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "application/octet-stream";
}

/** Küçültülecek boyut: en uzun kenar `max`ı geçmesin, oran korunsun. */
export function fitSize(w: number, h: number, max = PHOTO_MAX_SIDE): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * Görseli JPEG'e küçült. Tarayıcı çözemezse (ör. HEIC'i tanımayan masaüstü WebView) görsel
 * sağlayıcının kabul ettiği türdeyse ve sınırın altındaysa olduğu gibi gönderilir; değilse
 * anlaşılır hata atar.
 */
export async function shrinkImage(blob: Blob): Promise<PhotoImage> {
  try {
    const bmp = await createImageBitmap(blob);
    try {
      const { w, h } = fitSize(bmp.width, bmp.height);
      if (!w || !h) throw new Error("boş görsel");
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("çizim yüzeyi yok");
      // Saydam PNG'de yazı siyahsa arka plan beyaz olsun (JPEG saydamlığı siyaha çevirir).
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", JPEG_QUALITY));
      if (!out) throw new Error("JPEG üretilemedi");
      return { bytes: new Uint8Array(await out.arrayBuffer()), mime: "image/jpeg" };
    } finally {
      bmp.close();
    }
  } catch (e) {
    const mime = blob.type || "application/octet-stream";
    if ((OCR_IMAGE_MIMES as readonly string[]).includes(mime) && blob.size <= OCR_MAX_IMAGE_BYTES) {
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime };
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * Gizli dosya girdisiyle görsel seçtir. `camera` true ise arka kamera istenir. Vazgeçilirse null
 * (`cancel` olayı). Bu olayı tanımayan eski WebView'da vazgeçişte söz hiç çözülmez; çağıran bu
 * arada ekranı kilitlememeli (pencere seçim düğmelerini açık tutar).
 */
/** Henüz çözülmemiş önceki seçim (cancel olayı gelmeyen WebView'da kalır); yenisi açılınca kapatılır. */
let pendingPick: { input: HTMLInputElement; resolve: (f: File | null) => void } | null = null;

export function pickImageFile(camera: boolean): Promise<File | null> {
  if (pendingPick) {
    const old = pendingPick;
    pendingPick = null;
    old.input.remove();
    old.resolve(null);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (camera) input.setAttribute("capture", "environment");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    const finish = (f: File | null) => {
      if (pendingPick?.input === input) pendingPick = null;
      input.remove();
      resolve(f);
    };
    pendingPick = { input, resolve };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => finish(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** Masaüstü: dosya penceresinden görsel seçtir ve oku. Vazgeçilirse null. */
export async function pickImageDesktop(title: string, filterName: string): Promise<{ blob: Blob; name: string } | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const sel = await open({
    multiple: false,
    directory: false,
    title,
    filters: [{ name: filterName, extensions: ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"] }],
  });
  const path = Array.isArray(sel) ? sel[0] : sel;
  if (!path) return null;
  const fs = await import("@tauri-apps/plugin-fs");
  const bytes = await fs.readFile(path);
  const name = path.split(/[\\/]/).pop() ?? path;
  return { blob: new Blob([bytes], { type: mimeFromName(name) }), name };
}

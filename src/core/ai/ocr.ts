// Fotoğraftaki yazıyı okuma köprüsü — görsel baytlarını Rust'a verir, metni alır (LOM-87;
// bkz. src-tauri/src/ai/ocr.rs).
//
// Ağ isteği buradan çıkmaz; anahtar da buradan geçmez. Baytlar base64 olarak taşınır (stt.ts ile
// aynı yol). Dönen ham metin düzeltilmez; çağıran `cleanOcrText` (core/library/photo.ts) uygular.
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../vault";
import { bytesToBase64 } from "./stt";
import type { AiProvider } from "./types";

/** Sağlayıcıya gönderilebilecek görsel türleri (Rust tarafı da yalnız bunları kabul eder). */
export const OCR_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/**
 * Görselin en büyük bayt boyutu. Rust'taki sınır base64 hâline (5 MB) uygulanır; base64 4/3 büyür,
 * bu yüzden ham sınır onun 3/4'ü (~3,75 MB). Önce küçültülmeli.
 */
export const OCR_MAX_IMAGE_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4);

/** Sağlayıcı fotoğrafta okunabilir yazı bulamadı (çağıran bunu ayrı mesajla gösterir). */
export class OcrEmptyError extends Error {
  constructor() {
    super("Fotoğrafta okunabilir yazı bulunamadı");
    this.name = "OcrEmptyError";
  }
}

/**
 * Fotoğraftaki yazıyı metne çevir. `language` = arayüz dili (okuma ipucu, çeviri yapılmaz).
 * Boş sonuç `OcrEmptyError` atar; sağlayıcı hatası Rust'ın sade mesajıyla gelir. Sessiz geçmez.
 */
export async function ocrImage(
  provider: AiProvider,
  image: Uint8Array,
  mime: string,
  language?: string,
): Promise<string> {
  if (!isTauri()) throw new Error("Fotoğraftan okuma yalnızca masaüstü/mobil uygulamada çalışır");
  if (!image.length) throw new Error("Fotoğraf boş");
  if (image.length > OCR_MAX_IMAGE_BYTES) throw new Error("Fotoğraf çok büyük; daha küçük bir fotoğraf seçin");
  const text = await invoke<string>("ai_ocr_image", {
    provider: {
      id: provider.id,
      kind: provider.kind,
      baseUrl: provider.baseUrl ?? null,
      model: provider.model,
      sttModel: provider.sttModel ?? null,
    },
    imageBase64: bytesToBase64(image),
    mime,
    language: language ?? null,
  });
  if (!text || !text.trim()) throw new OcrEmptyError();
  return text;
}

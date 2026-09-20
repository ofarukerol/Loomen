// Konuşma tanıma köprüsü — WAV baytlarını Rust'a verir, metni alır (bkz. src-tauri/src/ai/stt.rs).
//
// Ağ isteği buradan çıkmaz; anahtar da buradan geçmez. Baytlar base64 olarak taşınır:
// Tauri'nin IPC'si JSON konuşur, ikili veriyi doğrudan taşıyamaz.
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../vault";
import type { AiProvider } from "./types";

/**
 * Uint8Array → base64. `String.fromCharCode(...bytes)` TEK SEFERDE kullanılamaz: birkaç yüz
 * kilobaytlık bir kayıtta argüman sayısı yığını taşırır ("Maximum call stack size exceeded").
 * Parça parça çevrilir.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Sağlayıcı yapılandırmasının Rust'ın beklediği alt kümesi (llm.ts ile aynı biçim). */
function wireProvider(p: AiProvider) {
  return {
    id: p.id,
    kind: p.kind,
    baseUrl: p.baseUrl ?? null,
    model: p.model,
    sttModel: p.sttModel ?? null,
  };
}

/** Ses kaydını metne çevir. `language` = arayüz dili (tanıma ipucu). */
export async function transcribe(
  provider: AiProvider,
  wav: Uint8Array,
  language?: string,
): Promise<string> {
  if (!isTauri()) throw new Error("Sesle sorma yalnızca masaüstü/mobil uygulamada çalışır");
  return invoke<string>("ai_transcribe", {
    provider: wireProvider(provider),
    audioBase64: bytesToBase64(wav),
    language: language ?? null,
  });
}

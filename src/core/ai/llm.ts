// LLM köprüsü — Rust komutlarına ince sarmalayıcı (bkz. src-tauri/src/ai/llm.rs).
//
// Ağa hiçbir istek buradan çıkmaz; JS yalnızca `invoke` eder. API anahtarı bu dosyadan
// geçmez — Rust tarafı anahtarı sağlayıcı kimliğiyle kendi deposundan okur.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../vault";
import type { AiProvider, ChatResult } from "./types";

/** Rust'a gönderilen sadeleştirilmiş mesaj (id/streaming gibi UI alanları taşınmaz). */
export interface WireMsg {
  role: "user" | "assistant";
  content: string;
}

interface TokenEvent {
  requestId: string;
  delta: string;
}

/** Sağlayıcı yapılandırmasının Rust'ın beklediği alt kümesi. */
function wireProvider(p: AiProvider) {
  return { id: p.id, kind: p.kind, baseUrl: p.baseUrl ?? null, model: p.model };
}

let seq = 0;
function newRequestId(): string {
  seq += 1;
  return `req-${Date.now()}-${seq}`;
}

export interface ChatOptions {
  system?: string;
  maxTokens?: number;
  /** Her metin parçası geldiğinde çağrılır (akış). */
  onDelta?: (delta: string) => void;
  /** İptal edebilmek için istek kimliğini dışarı verir. */
  onStart?: (requestId: string) => void;
}

/**
 * Akışlı sohbet. Parçalar `onDelta` ile gelir; söz tüm metinle çözülür.
 * Hata durumunda `reject` eder (mesaj kullanıcıya gösterilebilir metindir).
 */
export async function chatStream(
  provider: AiProvider,
  messages: WireMsg[],
  opts: ChatOptions = {}
): Promise<ChatResult> {
  if (!isTauri()) throw new Error("AI asistanı yalnızca masaüstü/mobil uygulamada çalışır");

  const requestId = newRequestId();
  opts.onStart?.(requestId);

  const unlisten = opts.onDelta
    ? await listen<TokenEvent>("ai:token", (e) => {
        if (e.payload.requestId === requestId) opts.onDelta!(e.payload.delta);
      })
    : null;

  try {
    return await invoke<ChatResult>("ai_chat_stream", {
      requestId,
      provider: wireProvider(provider),
      messages,
      system: opts.system ?? null,
      maxTokens: opts.maxTokens ?? null,
    });
  } finally {
    unlisten?.();
  }
}

/** Süren akışı kes. Bilinmeyen kimlik zararsızdır. */
export function cancelChat(requestId: string): void {
  if (!isTauri()) return;
  void invoke("ai_chat_cancel", { requestId }).catch(() => {});
}

/** Sağlayıcıyı doğrula (anahtar + adres + model). Cevap metnini döner. */
export function testProvider(provider: AiProvider): Promise<string> {
  return invoke<string>("ai_provider_test", { provider: wireProvider(provider) });
}

// ---------------------------------------------------------------- anahtar deposu

export const aiKeys = {
  /** Anahtarı işletim sistemi deposuna yaz (mobilde uygulama konteynerine). */
  set: (providerId: string, key: string) => invoke<void>("ai_key_set", { providerId, key }),
  remove: (providerId: string) => invoke<void>("ai_key_delete", { providerId }),
  /** Anahtar kayıtlı mı? Anahtarın kendisi hiçbir zaman JS'e dönmez. */
  has: (providerId: string) => invoke<boolean>("ai_key_has", { providerId }).catch(() => false),
};

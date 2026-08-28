// AI asistanı — platformdan bağımsız tipler.
//
// Sağlayıcı yapılandırması kullanıcı ayarıdır ve kalıcıdır; API anahtarı ise BURADA YOKTUR —
// anahtar yalnızca Rust tarafındaki anahtar zincirinde/kumbarada durur (bkz. src-tauri/src/ai/keys.rs).
// Bu ayrım bilinçlidir: anahtar hiçbir zaman localStorage'a veya JS bundle'ına girmemelidir.

import type { Citation } from "./context";
export type { Citation };

/** Sağlayıcı protokolü. `compat` = OpenAI-uyumlu herhangi bir endpoint (Ollama, LM Studio, OpenRouter…). */
export type ProviderKind = "openai" | "anthropic" | "gemini" | "compat";

export interface AiProvider {
  /** Benzersiz kimlik — anahtar zincirinde de bu ad kullanılır, değişmez. */
  id: string;
  kind: ProviderKind;
  /** Kullanıcıya görünen ad, ör. "OpenAI (iş)". */
  label: string;
  /** `compat` için zorunlu; diğerlerinde boş bırakılırsa sağlayıcının varsayılanı kullanılır. */
  baseUrl?: string;
  model: string;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Cevap hâlâ akıyor mu? */
  streaming?: boolean;
  /** Hata varsa kullanıcıya gösterilecek metin (içerik boş kalabilir). */
  error?: string;
  /** Kullanıcı akışı yarıda kestiyse. */
  cancelled?: boolean;
  /** Cevabın dayandığı not bölümleri — [1], [2] numaraları bunlara karşılık gelir. */
  citations?: Citation[];
  /** "Gönderilen bağlamı göster" açıksa modele giden ham bağlam. */
  contextText?: string;
}

export interface ChatResult {
  text: string;
  model: string;
  cancelled: boolean;
}

/** Sağlayıcı türüne göre varsayılan adres — arayüzde ipucu olarak gösterilir. */
export const DEFAULT_BASE_URL: Record<ProviderKind, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
  compat: "http://127.0.0.1:11434/v1",
};

/** Yeni sağlayıcı eklerken önerilen model — kullanıcı serbestçe değiştirebilir. */
export const DEFAULT_MODEL: Record<ProviderKind, string> = {
  openai: "gpt-5",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-2.5-pro",
  compat: "llama3.1",
};

/** Sağlayıcı türünün kullanıcıya görünen adı (i18n'e taşınmayacak kadar teknik). */
export const KIND_LABEL: Record<ProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  compat: "OpenAI uyumlu",
};

/** Çakışmayan kısa kimlik üret (anahtar zinciri girdisi bu adla açılır). */
export function newProviderId(kind: ProviderKind, existing: AiProvider[]): string {
  let n = 1;
  let id = `${kind}-${n}`;
  const taken = new Set(existing.map((p) => p.id));
  while (taken.has(id)) {
    n += 1;
    id = `${kind}-${n}`;
  }
  return id;
}

// Bağlam kurma — getirilen parçaları modele verilecek metne dönüştürür ve alıntı
// (citation) haritasını üretir.
//
// Modelden cevabında [1], [2] biçiminde kaynak göstermesi istenir; arayüz bu numaraları
// tıklanabilir not bağlantısına çevirir. Böylece kullanıcı asistanın nereden konuştuğunu
// görebilir — "uydurdu mu?" sorusunun tek dürüst cevabı budur.

import type { Retrieved } from "./retrieve";
import { noteTitle } from "./chunk";
import { PROPOSAL_INSTRUCTION } from "./proposal";

export interface Citation {
  /** Cevapta geçen numara ([1] → n = 1). */
  n: number;
  path: string;
  title: string;
  heading: string;
}

export interface BuiltContext {
  /** Sistem istemine gömülecek metin; parça yoksa boş. */
  text: string;
  citations: Citation[];
}

/** Bir parçanın kaynağını insana okunur biçimde yaz: "Not adı#Başlık". */
export function sourceLabel(c: Citation): string {
  return c.heading ? `${c.title} › ${c.heading}` : c.title;
}

/** Modelin göreceği bağlam bloğunu ve alıntı listesini kur. */
export function buildContext(hits: Retrieved[], maxChars = 6000): BuiltContext {
  const citations: Citation[] = [];
  const parts: string[] = [];
  let used = 0;

  for (const h of hits) {
    const n = citations.length + 1;
    const label = h.chunk.heading ? `${h.chunk.title} › ${h.chunk.heading}` : h.chunk.title;
    const block = `[${n}] ${label}\n${h.chunk.text}`;
    // Bütçe dolduysa dur — yarım parça göndermek anlamsız.
    if (used + block.length > maxChars && parts.length > 0) break;
    parts.push(block);
    used += block.length;
    citations.push({ n, path: h.chunk.path, title: h.chunk.title, heading: h.chunk.heading });
  }

  return { text: parts.join("\n\n---\n\n"), citations };
}

export interface PromptOptions {
  /** Açık olan notun yolu (varsa) — modele "kullanıcı şu an buna bakıyor" der. */
  activeNote?: string | null;
  /** Getirilen bağlam. */
  context: BuiltContext;
  /** Asistan not önerebilsin mi? (Öneri yazmaz; kullanıcı onayı şarttır.) */
  canWrite?: boolean;
}

const BASE =
  "Kullanıcının kişisel not defterinde çalışan bir asistansın. Kısa, net ve sade konuş.";

const WITH_CONTEXT =
  "Aşağıda kullanıcının notlarından ilgili bölümler var. Cevabını ÖNCELİKLE bunlara dayandır. " +
  "Kullandığın her bölümün numarasını cümlenin sonunda [1] biçiminde belirt. " +
  "Notlarda cevap yoksa bunu açıkça söyle ve tahmin yürüttüğünü belirt. " +
  "Notlarda yazmayan bir şeyi orada yazıyormuş gibi anlatma.";

const NO_CONTEXT =
  "Notlarda bu soruyla ilgili bir bölüm bulunamadı. Bunu kullanıcıya söyle; " +
  "genel bilgiyle cevap verirsen bunun notlardan gelmediğini belirt.";

/** Sistem istemini kur. */
export function buildSystemPrompt(opts: PromptOptions): string {
  const lines = [BASE];
  if (opts.activeNote) {
    lines.push(`Kullanıcı şu an "${noteTitle(opts.activeNote)}" notuna bakıyor.`);
  }
  if (opts.context.text) {
    lines.push(WITH_CONTEXT);
    lines.push(`--- NOTLARDAN İLGİLİ BÖLÜMLER ---\n${opts.context.text}\n--- BÖLÜMLER SONU ---`);
  } else {
    lines.push(NO_CONTEXT);
  }
  if (opts.canWrite) lines.push(PROPOSAL_INSTRUCTION);
  return lines.join("\n\n");
}

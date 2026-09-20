// Asistan ekranı — yazarak ya da konuşarak soru; cevap notlardan, kaynak gösterilerek.
//
// Asistan hiçbir dosyaya kendi yazmaz. Bir şey not edilmesi istendiğinde cevabın altında
// ÖNERİ kartı çıkar; yalnız kullanıcı "Uygula" derse yazılır (bkz. core/ai/proposal.ts ve
// NOTE_SAFETY_RULES.md).
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Send,
  Square,
  Eraser,
  Settings2,
  Library,
  ChevronDown,
  Mic,
  X,
  FilePlus2,
  FileDown,
  Check,
  Loader2,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { AiMessage } from "../../core/ai/types";
import { sourceLabel } from "../../core/ai/context";
import { splitProposals } from "../../core/ai/proposal";
import { useMicRecorder } from "../../hooks/useMicRecorder";

/** Öneri kartı — ne yapılacağını gösterir, onay ister. Onaysız hiçbir şey yazılmaz. */
function ProposalCard({ messageId, index, m }: { messageId: string; index: number; m: AiMessage }) {
  const { t } = useTranslation();
  const apply = useAppStore((s) => s.aiApplyProposal);
  const openNote = useAppStore((s) => s.openNote);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const p = m.proposals?.[index];
  if (!p || hidden) return null;

  const done = !!p.appliedPath;
  return (
    <div className={"lo-ai__prop" + (done ? " is-done" : "")}>
      <div className="lo-ai__prophead">
        {p.action === "create" ? <FilePlus2 size={14} strokeWidth={2} /> : <FileDown size={14} strokeWidth={2} />}
        <span className="lo-ai__proptitle">
          {t(p.action === "create" ? "ai.propCreate" : "ai.propAppend", { path: p.appliedPath ?? p.path })}
        </span>
      </div>
      <pre className="lo-ai__propbody">{p.text}</pre>
      {p.error && <div className="lo-ai__err">{p.error}</div>}
      {done ? (
        <div className="lo-ai__propdone">
          <Check size={13} strokeWidth={2.4} />
          {t("ai.propApplied")}
          <button className="lo-ai__proplink" onClick={() => openNote(p.appliedPath!)}>
            {t("ai.propOpen")}
          </button>
        </div>
      ) : (
        <div className="lo-ai__propactions">
          <button
            className="lo-gh__connect"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await apply(messageId, index);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 size={14} strokeWidth={2} className="lo-spin" /> : <Check size={14} strokeWidth={2} />}
            {t("ai.propApply")}
          </button>
          <button className="lo-gh__ghost" disabled={busy} onClick={() => setHidden(true)}>
            {t("ai.propDismiss")}
          </button>
        </div>
      )}
    </div>
  );
}

function Bubble({ m }: { m: AiMessage }) {
  const { t } = useTranslation();
  const openNote = useAppStore((s) => s.openNote);
  const [showCtx, setShowCtx] = useState(false);
  const mine = m.role === "user";
  // Alıntılar yalnızca cevapta gerçekten [n] ile anılanlarla sınırlanır — modelin
  // kullanmadığı bir kaynağı "kaynak" diye göstermek yanıltıcı olur.
  const cited = (m.citations ?? []).filter((c) => m.content.includes(`[${c.n}]`));
  // Öneri blokları metinden ayrılır: kullanıcı ham JSON değil, aşağıdaki kartı görür.
  // Akış sürerken de çalışır (yarım blok gizlenir).
  const shown = mine ? m.content : splitProposals(m.content).text;

  return (
    <div className={"lo-ai__msg" + (mine ? " is-user" : "")}>
      <div className="lo-ai__bubble">
        {shown && <div className="lo-ai__text">{shown}</div>}
        {m.streaming && !shown && <span className="lo-ai__dots" aria-hidden />}
        {m.cancelled && <div className="lo-ai__note">{t("ai.cancelled")}</div>}
        {m.error && <div className="lo-ai__err">{m.error}</div>}

        {!m.streaming &&
          (m.proposals ?? []).map((_, i) => (
            <ProposalCard key={i} messageId={m.id} index={i} m={m} />
          ))}

        {!m.streaming && cited.length > 0 && (
          <div className="lo-ai__cites">
            <span className="lo-ai__citelabel">{t("ai.sources")}</span>
            {cited.map((c) => (
              <button
                key={c.n}
                className="lo-ai__cite"
                onClick={() => openNote(c.path)}
                title={c.path}
              >
                <span className="lo-ai__citen">{c.n}</span>
                {sourceLabel(c)}
              </button>
            ))}
          </div>
        )}

        {!m.streaming && m.contextText && (
          <div className="lo-ai__ctxbox">
            <button className="lo-ai__ctxtoggle" onClick={() => setShowCtx((v) => !v)}>
              <ChevronDown
                size={13}
                strokeWidth={2}
                className={showCtx ? "lo-ai__chev is-open" : "lo-ai__chev"}
              />
              {t("ai.showContext")}
            </button>
            {showCtx && <pre className="lo-ai__ctxpre">{m.contextText}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Süreyi "0:07" biçiminde yaz. */
function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function AssistantScreen() {
  const { t } = useTranslation();
  const enabled = useAppStore((s) => s.aiEnabled);
  const providers = useAppStore((s) => s.aiProviders);
  const activeId = useAppStore((s) => s.aiActiveProviderId);
  const setActive = useAppStore((s) => s.aiSetActiveProvider);
  const messages = useAppStore((s) => s.aiMessages);
  const busy = useAppStore((s) => s.aiBusy);
  const send = useAppStore((s) => s.aiSend);
  const cancel = useAppStore((s) => s.aiCancel);
  const clear = useAppStore((s) => s.aiClearChat);
  const transcribe = useAppStore((s) => s.aiTranscribe);
  const transcribing = useAppStore((s) => s.aiTranscribing);
  const autoSend = useAppStore((s) => s.aiVoiceAutoSend);
  // Çizimler aranmaz — yalnızca markdown notlar.
  const noteCount = useAppStore((s) => s.notes.filter((n) => n.kind === "note").length);
  const setScreen = useAppStore((s) => s.setScreen);

  const [text, setText] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Kaydı bitir → metne çevir. Hem mikrofon düğmesi hem de 2 dakikalık üst sınır bunu çağırır;
  // ref üzerinden, çünkü hook'a verilen callback kurulduğu andaki closure'ı taşır.
  const finishRef = useRef<() => void>(() => {});
  const mic = useMicRecorder(() => finishRef.current());

  // Yeni parça geldikçe en alta kaydır (kullanıcı yukarı kaydırmadıysa).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = (body?: string) => {
    const q = (body ?? text).trim();
    if (!q || busy) return;
    setText("");
    void send(q);
  };

  /** Kaydı bitir, metne çevir, sonucu kutuya (ya da doğrudan gönderime) ver. */
  const finishRecording = async () => {
    setVoiceError(null);
    try {
      const wav = await mic.stop();
      if (!wav) return;
      const said = (await transcribe(wav)).trim();
      if (!said) {
        setVoiceError(t("ai.voiceEmpty"));
        return;
      }
      // Metin KUTUYA yazılır: kullanıcı ne anlaşıldığını görür, düzeltebilir.
      // "Doğrudan gönder" ayarı açıksa soru kendiliğinden gider.
      if (autoSend) submit(said);
      else {
        setText((prev) => (prev.trim() ? `${prev.trim()} ${said}` : said));
        taRef.current?.focus();
      }
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : String(e));
    }
  };
  finishRef.current = () => void finishRecording();

  /** Mikrofon: ilk tıklama kaydı başlatır, ikincisi bitirip metne çevirir. */
  const toggleMic = async () => {
    setVoiceError(null);
    if (mic.recording) {
      await finishRecording();
      return;
    }
    try {
      await mic.start();
    } catch {
      setVoiceError(t("ai.micDenied"));
    }
  };

  if (!enabled || providers.length === 0) {
    return (
      <div className="lo-ai lo-ai--empty">
        <Sparkles size={30} strokeWidth={1.6} />
        <div className="lo-ai__emptytitle">{t("ai.title")}</div>
        <p className="lo-ai__emptytext">{!enabled ? t("ai.offHint") : t("ai.noProviderHint")}</p>
        <button className="lo-gh__connect" onClick={() => setScreen("settings")}>
          <Settings2 size={15} strokeWidth={2} />
          {t("ai.openSettings")}
        </button>
      </div>
    );
  }

  return (
    <div className="lo-ai">
      <div className="lo-ai__head">
        <div className="lo-ai__ctx" title={t("ai.scopeHint")}>
          <Library size={13} strokeWidth={2} />
          {t("ai.scope", { n: noteCount })}
        </div>
        <div className="lo-ai__headright">
          {providers.length > 1 && (
            <select
              className="lo-set__select lo-ai__pick"
              value={activeId ?? ""}
              onChange={(e) => setActive(e.target.value)}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label || t(`ai.kind.${p.kind}`)}
                </option>
              ))}
            </select>
          )}
          <button
            className="lo-gh__ghost"
            onClick={clear}
            disabled={busy || messages.length === 0}
            title={t("ai.clear")}
          >
            <Eraser size={14} strokeWidth={2} />
            {t("ai.clear")}
          </button>
        </div>
      </div>

      <div className="lo-ai__list lo-scroll" ref={listRef}>
        {messages.length === 0 ? (
          <div className="lo-ai__hint">{t("ai.startHint")}</div>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
      </div>

      {voiceError && <div className="lo-ai__voiceerr">{voiceError}</div>}

      <div className="lo-ai__composer">
        {mic.recording ? (
          <div className="lo-ai__reclive">
            <span className="lo-ai__recdot" aria-hidden />
            <span className="lo-ai__rectime">{clock(mic.seconds)}</span>
            <span className="lo-ai__recbar" aria-hidden>
              <i style={{ transform: `scaleX(${Math.min(1, mic.level * 2.2)})` }} />
            </span>
            <span className="lo-ai__rechint">{t("ai.recHint")}</span>
          </div>
        ) : (
          <textarea
            ref={taRef}
            className="lo-ai__ta"
            rows={2}
            value={text}
            placeholder={t("ai.placeholder")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        )}

        {mic.recording && (
          <button className="lo-gh__ghost lo-ai__miccancel" onClick={mic.cancel} title={t("ai.recCancel")}>
            <X size={15} strokeWidth={2} />
          </button>
        )}

        <button
          className={"lo-gh__ghost lo-ai__mic" + (mic.recording ? " is-rec" : "")}
          onClick={() => void toggleMic()}
          disabled={busy || transcribing}
          title={mic.recording ? t("ai.recStop") : t("ai.voiceAsk")}
        >
          {transcribing ? (
            <Loader2 size={15} strokeWidth={2} className="lo-spin" />
          ) : (
            <Mic size={15} strokeWidth={2} />
          )}
        </button>

        {busy ? (
          <button className="lo-gh__connect lo-ai__stop" onClick={cancel} title={t("ai.stop")}>
            <Square size={15} strokeWidth={2} />
          </button>
        ) : (
          <button
            className="lo-gh__connect"
            onClick={() => submit()}
            disabled={!text.trim() || mic.recording}
            title={t("ai.send")}
          >
            <Send size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

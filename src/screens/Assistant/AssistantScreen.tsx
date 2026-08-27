// Asistan ekranı — Faz 0: düz metin sohbeti.
//
// Bağlam olarak yalnızca AKTİF NOT gönderilir (RAG faz 1'de gelir). Asistan hiçbir dosyaya
// yazmaz; notlara dokunan tek yol faz 3'teki "öneri + onay" akışıdır.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Send, Square, Eraser, Settings2, FileText } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { AiMessage } from "../../core/ai/types";

/** "klasor/Not.md" → "Not" */
function baseName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

function Bubble({ m }: { m: AiMessage }) {
  const { t } = useTranslation();
  const mine = m.role === "user";
  return (
    <div className={"lo-ai__msg" + (mine ? " is-user" : "")}>
      <div className="lo-ai__bubble">
        {m.content && <div className="lo-ai__text">{m.content}</div>}
        {m.streaming && !m.content && <span className="lo-ai__dots" aria-hidden />}
        {m.cancelled && <div className="lo-ai__note">{t("ai.cancelled")}</div>}
        {m.error && <div className="lo-ai__err">{m.error}</div>}
      </div>
    </div>
  );
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
  const activeNote = useAppStore((s) => s.activeNote);
  const setScreen = useAppStore((s) => s.setScreen);

  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Yeni parça geldikçe en alta kaydır (kullanıcı yukarı kaydırmadıysa).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = () => {
    const body = text.trim();
    if (!body || busy) return;
    setText("");
    void send(body);
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
        <div className="lo-ai__ctx">
          <FileText size={13} strokeWidth={2} />
          {activeNote ? baseName(activeNote) : t("ai.noContext")}
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
                  {p.label || p.id}
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

      <div className="lo-ai__composer">
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
        {busy ? (
          <button className="lo-gh__connect lo-ai__stop" onClick={cancel} title={t("ai.stop")}>
            <Square size={15} strokeWidth={2} />
          </button>
        ) : (
          <button
            className="lo-gh__connect"
            onClick={submit}
            disabled={!text.trim()}
            title={t("ai.send")}
          >
            <Send size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

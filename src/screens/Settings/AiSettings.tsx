// Yapay zekâ asistanı ayarları — sağlayıcı listesi, model, adres ve API anahtarı.
//
// Anahtar hiçbir zaman burada saklanmaz: kutuya yazılan değer `aiSaveKey` ile Rust'a gider,
// oradan işletim sisteminin anahtar zincirine yazılır ve bir daha geri okunmaz. Kutu her
// zaman boş açılır; kayıtlı olup olmadığı yalnızca "kayıtlı" rozetiyle gösterilir.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Plus, Trash2, Check, KeyRound, Loader2, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../../store/useAppStore";
import { isTauri } from "../../core/vault";
import { aiKeys } from "../../core/ai/llm";
import {
  DEFAULT_BASE_URL,
  GEMINI_FREE_MODELS,
  GEMINI_KEY_URL,
  type AiProvider,
  type ProviderKind,
} from "../../core/ai/types";

const KINDS: ProviderKind[] = ["openai", "anthropic", "gemini", "compat"];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={"lo-switch" + (on ? " is-on" : "")} onClick={onClick} aria-pressed={on}>
      <span className="lo-switch__knob" />
    </button>
  );
}

/** Tek sağlayıcı kartı — ad, model, adres, anahtar ve test. */
function ProviderRow({ p }: { p: AiProvider }) {
  const { t } = useTranslation();
  const update = useAppStore((s) => s.aiUpdateProvider);
  const remove = useAppStore((s) => s.aiRemoveProvider);
  const saveKey = useAppStore((s) => s.aiSaveKey);
  const clearKey = useAppStore((s) => s.aiClearKey);
  const testProvider = useAppStore((s) => s.aiTestProvider);

  const [hasKey, setHasKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void aiKeys.has(p.id).then((v) => alive && setHasKey(v));
    return () => {
      alive = false;
    };
  }, [p.id]);

  const onSaveKey = async () => {
    const k = keyDraft.trim();
    if (!k) return;
    setBusy(true);
    setResult(null);
    try {
      await saveKey(p.id, k);
      setKeyDraft("");
      setHasKey(true);
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const onClearKey = async () => {
    setBusy(true);
    setResult(null);
    try {
      await clearKey(p.id);
      setHasKey(false);
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setBusy(false);
    }
  };

  // Test, kutuda duran ama henüz kaydedilmemiş anahtarı önce kaydeder: kullanıcının
  // "Kaydet"e basmayı unutup anlamsız bir "anahtar bulunamadı" hatası alması bu yüzdendi.
  const onTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      const k = keyDraft.trim();
      if (k) {
        await saveKey(p.id, k);
        setKeyDraft("");
        setHasKey(true);
      }
      const txt = await testProvider(p.id);
      setResult({ ok: true, msg: txt.slice(0, 120) || t("ai.testOk") });
    } catch (e) {
      const raw = String(e);
      setResult({ ok: false, msg: raw.includes("API anahtarı kayıtlı değil") ? t("ai.keyMissing") : raw });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lo-set__row lo-set__row--border lo-ai__prow">
      <div className="lo-ai__pgrid">
        <div className="lo-ai__kind">{t(`ai.kind.${p.kind}`)}</div>

        <label className="lo-ai__field">
          <span className="lo-ai__flabel">{t("ai.fLabel")}</span>
          <input
            className="lo-gh__input lo-ai__inp"
            value={p.label}
            placeholder={t(`ai.kind.${p.kind}`)}
            onChange={(e) => update(p.id, { label: e.target.value })}
          />
        </label>

        <label className="lo-ai__field">
          <span className="lo-ai__flabel">{t("ai.fModel")}</span>
          {p.kind === "gemini" ? (
            // Gemini'de model listesi belli — serbest metin yerine seçim kutusu, çünkü
            // buraya yanlışlıkla başka bir şey yazmak sessiz bir hataya dönüşüyordu.
            <select
              className="lo-set__select lo-ai__inp"
              value={p.model}
              onChange={(e) => update(p.id, { model: e.target.value })}
            >
              {(GEMINI_FREE_MODELS as readonly string[]).includes(p.model) ? null : (
                <option value={p.model}>{p.model}</option>
              )}
              {GEMINI_FREE_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="lo-gh__input lo-ai__inp"
              value={p.model}
              placeholder={t("ai.modelPh")}
              onChange={(e) => update(p.id, { model: e.target.value })}
            />
          )}
        </label>

        {/* Ses modeli: "sesle sor" düğmesinin kullandığı model. OpenAI uyumlu uçlarda
            sohbet modeli bu işi YAPMAZ (gpt-5 transkripsiyon ucunda çalışmaz), ayrı model
            gerekir. Anthropic'te ses hiç yok, o yüzden orada alan da gösterilmez. */}
        {p.kind !== "anthropic" && (
          <label className="lo-ai__field">
            <span className="lo-ai__flabel">{t("ai.fSttModel")}</span>
            <input
              className="lo-gh__input lo-ai__inp"
              value={p.sttModel ?? ""}
              placeholder={p.kind === "gemini" ? p.model : "whisper-1"}
              onChange={(e) => update(p.id, { sttModel: e.target.value.trim() || undefined })}
            />
          </label>
        )}

        {p.kind !== "anthropic" && (
          <div className="lo-ai__keyhint">
            {t(p.kind === "gemini" ? "ai.sttHintGemini" : "ai.sttHintOpenai")}
          </div>
        )}

        {/* Adres yalnızca kendi sunucusunu kullananlar için anlamlı; diğerlerinde
            varsayılanı elle değiştirmek yalnızca bağlantıyı bozar. */}
        {p.kind === "compat" && (
          <label className="lo-ai__field lo-ai__field--wide">
            <span className="lo-ai__flabel">{t("ai.fBaseUrl")}</span>
            <input
              className="lo-gh__input lo-ai__inp lo-ai__inp--wide"
              value={p.baseUrl ?? ""}
              placeholder={DEFAULT_BASE_URL[p.kind]}
              onChange={(e) => update(p.id, { baseUrl: e.target.value.trim() || undefined })}
            />
          </label>
        )}

        <div className="lo-ai__field lo-ai__field--wide">
          <span className="lo-ai__flabel">
            {t("ai.fKey")}
            {hasKey && <span className="lo-ai__badge">{t("ai.keyBadge")}</span>}
          </span>
          <div className="lo-ai__keyrow">
            <KeyRound size={14} strokeWidth={2} className="lo-ai__keyicon" />
            <input
              className="lo-gh__input lo-ai__inp lo-ai__inp--wide"
              type="password"
              autoComplete="off"
              value={keyDraft}
              placeholder={hasKey ? t("ai.keySaved") : t("ai.keyPh")}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void onSaveKey()}
            />
            {keyDraft.trim() ? (
              <button className="lo-gh__connect" disabled={busy} onClick={() => void onSaveKey()}>
                {t("ai.keySave")}
              </button>
            ) : hasKey ? (
              <button className="lo-gh__ghost" disabled={busy} onClick={() => void onClearKey()}>
                {t("ai.keyClear")}
              </button>
            ) : null}
          </div>
          {keyDraft.trim() !== "" && <div className="lo-ai__keyhint">{t("ai.keyHint")}</div>}
        </div>

        {p.kind === "gemini" && !hasKey && (
          <div className="lo-ai__keyhint">
            {t("ai.geminiFree")}{" "}
            <button className="lo-ai__link" onClick={() => void openUrl(GEMINI_KEY_URL)}>
              {t("ai.geminiKeyLink")}
            </button>
          </div>
        )}

        {result && (
          <div className={"lo-ai__result" + (result.ok ? " is-ok" : " is-err")}>{result.msg}</div>
        )}
      </div>

      <div className="lo-ai__pactions">
        <button className="lo-gh__ghost" disabled={busy} onClick={() => void onTest()}>
          {busy ? (
            <Loader2 size={14} strokeWidth={2} className="lo-spin" />
          ) : (
            <Check size={14} strokeWidth={2} />
          )}
          {t("ai.test")}
        </button>
        <button
          className="lo-gh__ghost lo-ai__del"
          onClick={() => void remove(p.id)}
          aria-label={t("ai.remove")}
          title={t("ai.remove")}
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/** AI'ın hiç okumayacağı klasörler — özel/arşiv notları bağlamdan tamamen çıkarmak için. */
function ExcludedFolders() {
  const { t } = useTranslation();
  const excluded = useAppStore((s) => s.aiExcluded);
  const setExcluded = useAppStore((s) => s.aiSetExcluded);
  const notes = useAppStore((s) => s.notes);
  const [pick, setPick] = useState("");

  // Klasör listesi notlardan türetilir (store ayrı bir klasör listesi tutmuyor).
  const folders = [...new Set(notes.map((n) => n.folder).filter(Boolean))].sort();

  const add = (dir: string) => {
    const clean = dir.replace(/^\/+|\/+$/g, "");
    if (!clean || excluded.includes(clean)) return;
    setExcluded([...excluded, clean]);
  };

  const remaining = folders.filter((f) => !excluded.includes(f));

  return (
    <div className="lo-set__row lo-set__row--border lo-ai__prow">
      <div className="lo-ai__pgrid">
        <div style={{ width: "100%" }}>
          <div className="lo-set__rowtitle">{t("ai.excluded")}</div>
          <div className="lo-set__rowsub">{t("ai.excludedSub")}</div>
        </div>

        {excluded.length > 0 && (
          <div className="lo-ai__chips">
            {excluded.map((d) => (
              <span key={d} className="lo-ai__chip">
                {d}
                <button
                  className="lo-ai__chipx"
                  onClick={() => setExcluded(excluded.filter((x) => x !== d))}
                  aria-label={t("ai.excludedRemove")}
                >
                  <X size={12} strokeWidth={2.4} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="lo-ai__keyrow">
          <select
            className="lo-set__select lo-ai__inp--wide"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            disabled={remaining.length === 0}
          >
            <option value="">
              {remaining.length === 0 ? t("ai.excludedNone") : t("ai.excludedPick")}
            </option>
            {remaining.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button
            className="lo-gh__ghost"
            disabled={!pick}
            onClick={() => {
              add(pick);
              setPick("");
            }}
          >
            <Plus size={14} strokeWidth={2} />
            {t("ai.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AiSettings() {
  const { t } = useTranslation();
  const enabled = useAppStore((s) => s.aiEnabled);
  const setEnabled = useAppStore((s) => s.aiSetEnabled);
  const providers = useAppStore((s) => s.aiProviders);
  const activeId = useAppStore((s) => s.aiActiveProviderId);
  const setActive = useAppStore((s) => s.aiSetActiveProvider);
  const addProvider = useAppStore((s) => s.aiAddProvider);
  const showContext = useAppStore((s) => s.aiShowContext);
  const setShowContext = useAppStore((s) => s.aiSetShowContext);
  const canWrite = useAppStore((s) => s.aiCanWrite);
  const setCanWrite = useAppStore((s) => s.aiSetCanWrite);
  const voiceAutoSend = useAppStore((s) => s.aiVoiceAutoSend);
  const setVoiceAutoSend = useAppStore((s) => s.aiSetVoiceAutoSend);
  const [newKind, setNewKind] = useState<ProviderKind>("gemini");

  return (
    <>
      <div className="lo-set__section">{t("ai.title")}</div>
      <div className="lo-card lo-set__card">
        <div className={"lo-set__row" + (enabled ? " lo-set__row--border" : "")}>
          <div>
            <div className="lo-set__rowtitle">
              <Sparkles size={14} strokeWidth={2} className="lo-ai__titleicon" />
              {t("ai.enable")}
            </div>
            <div className="lo-set__rowsub">{t("ai.consent")}</div>
          </div>
          <Toggle on={enabled} onClick={() => setEnabled(!enabled)} />
        </div>

        {enabled && !isTauri() && (
          <div className="lo-set__row">
            <div className="lo-set__rowsub">{t("ai.appOnly")}</div>
          </div>
        )}

        {enabled && isTauri() && (
          <>
            {providers.length > 1 && (
              <div className="lo-set__row lo-set__row--border">
                <div>
                  <div className="lo-set__rowtitle">{t("ai.activeProvider")}</div>
                  <div className="lo-set__rowsub">{t("ai.activeProviderSub")}</div>
                </div>
                <select
                  className="lo-set__select"
                  value={activeId ?? ""}
                  onChange={(e) => setActive(e.target.value)}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label || t(`ai.kind.${p.kind}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {providers.map((p) => (
              <ProviderRow key={p.id} p={p} />
            ))}

            <ExcludedFolders />

            <div className="lo-set__row lo-set__row--border">
              <div>
                <div className="lo-set__rowtitle">{t("ai.canWrite")}</div>
                <div className="lo-set__rowsub">{t("ai.canWriteSub")}</div>
              </div>
              <Toggle on={canWrite} onClick={() => setCanWrite(!canWrite)} />
            </div>

            <div className="lo-set__row lo-set__row--border">
              <div>
                <div className="lo-set__rowtitle">{t("ai.voiceAutoSend")}</div>
                <div className="lo-set__rowsub">{t("ai.voiceAutoSendSub")}</div>
              </div>
              <Toggle on={voiceAutoSend} onClick={() => setVoiceAutoSend(!voiceAutoSend)} />
            </div>

            <div className="lo-set__row lo-set__row--border">
              <div>
                <div className="lo-set__rowtitle">{t("ai.showContextSetting")}</div>
                <div className="lo-set__rowsub">{t("ai.showContextSettingSub")}</div>
              </div>
              <Toggle on={showContext} onClick={() => setShowContext(!showContext)} />
            </div>

            <div className="lo-set__row lo-gh__createrow">
              <div>
                <div className="lo-set__rowtitle">{t("ai.addProvider")}</div>
                <div className="lo-set__rowsub">{t("ai.addProviderSub")}</div>
              </div>
              <div className="lo-gh__repoctl">
                <select
                  className="lo-set__select"
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as ProviderKind)}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`ai.kind.${k}`)}
                    </option>
                  ))}
                </select>
                <button className="lo-gh__connect" onClick={() => addProvider(newKind)}>
                  <Plus size={15} strokeWidth={2} />
                  {t("ai.add")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

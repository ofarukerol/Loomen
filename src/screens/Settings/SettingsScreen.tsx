import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { isChecking, progressPercent, runUpdateCheck, runUpdateInstall, updateStore, updateSupported } from "../../core/updater";
import { useAppStore, ACCENTS, type Lang, type EditorSettings } from "../../store/useAppStore";
import { AiSettings } from "./AiSettings";
import { ReviewSettings } from "./ReviewSettings";
import { GitHubSync } from "./GitHubSync";
import { GoogleCalendarSync } from "./GoogleCalendarSync";
import { TemplatesSettings } from "./TemplatesSettings";
import { VaultManager } from "./VaultManager";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="lo-set__section">{label}</div>
      <div className="lo-card lo-set__card">{children}</div>
    </>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={"lo-switch" + (on ? " is-on" : "")} onClick={onClick} aria-pressed={on}>
      <span className="lo-switch__knob" />
    </button>
  );
}

/**
 * Güncelleme bölümü (LOM-31): yalnız güncelleme destekli masaüstü derlemesinde görünür.
 * App Store ve mobil derlemede `updateSupported` false döner, bölüm hiç çizilmez.
 */
function UpdateSettings() {
  const { t } = useTranslation();
  const mobile = useAppStore((s) => s.platformMobile);
  const status = useSyncExternalStore(updateStore.subscribe, updateStore.get);
  const [supported, setSupported] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (mobile) return;
    let alive = true;
    void updateSupported().then((ok) => {
      if (!alive || !ok) return;
      setSupported(true);
      getVersion().then((v) => alive && setVersion(v), () => {});
    });
    return () => {
      alive = false;
    };
  }, [mobile]);

  if (mobile || !supported) return null;

  const busy = status.kind === "checking" || status.kind === "installing" || isChecking();
  const pct = status.kind === "installing" ? progressPercent(status.progress) : null;
  const sub =
    status.kind === "checking"
      ? t("update.checking", { defaultValue: "Yeni sürüm aranıyor…" })
      : status.kind === "none"
        ? t("update.upToDate", { defaultValue: "En güncel sürümü kullanıyorsun." })
        : status.kind === "available"
          ? t("update.availableShort", { version: status.info.version, defaultValue: "Loomen {{version}} hazır." })
          : status.kind === "installing"
            ? pct === null
              ? t("update.downloading", { defaultValue: "Güncelleme indiriliyor…" })
              : t("update.downloadingPct", { pct, defaultValue: "Güncelleme indiriliyor… %{{pct}}" })
            : status.kind === "error"
              ? status.info
                ? t("update.failed", { defaultValue: "Güncelleme kurulamadı. Tekrar deneyebilirsin." })
                : t("update.checkFailed", { defaultValue: "Sürüm bilgisi alınamadı. İnternet bağlantını kontrol et." })
              : t("update.sub", { defaultValue: "Yeni sürüm çıkınca uygulama sana haber verir." });
  const canInstall = status.kind === "available" || (status.kind === "error" && !!status.info);

  return (
    <Section label={t("update.title", { defaultValue: "Güncelleme" })}>
      <div className="lo-set__row">
        <div>
          <div className="lo-set__rowtitle">
            {version
              ? t("update.current", { version, defaultValue: "Kurulu sürüm: {{version}}" })
              : t("update.title", { defaultValue: "Güncelleme" })}
          </div>
          <div className="lo-set__rowsub">{sub}</div>
        </div>
        {canInstall ? (
          <button type="button" className="lo-btn lo-btn--primary" onClick={() => void runUpdateInstall()}>
            {t("update.install", { defaultValue: "Güncelle" })}
          </button>
        ) : (
          <button type="button" className="lo-btn" disabled={busy} onClick={() => void runUpdateCheck()}>
            {t("update.check", { defaultValue: "Güncellemeleri denetle" })}
          </button>
        )}
      </div>
    </Section>
  );
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const accent = useAppStore((s) => s.accent);
  const setAccent = useAppStore((s) => s.setAccent);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const editorSettings = useAppStore((s) => s.editorSettings);
  const toggleEditorSetting = useAppStore((s) => s.toggleEditorSetting);
  const pomo = useAppStore((s) => s.pomo);
  const setPomo = useAppStore((s) => s.setPomo);
  const pomoSound = useAppStore((s) => s.pomoSound);
  const setPomoSound = useAppStore((s) => s.setPomoSound);

  const editorRows: { key: keyof EditorSettings; label: string }[] = [
    { key: "livePreview", label: t("settings.livePreview") },
    { key: "lineNumbers", label: t("settings.lineNumbers") },
    { key: "spellCheck", label: t("settings.spellCheck") },
  ];

  const pomoFields: { key: keyof typeof pomo; label: string; min: number; max: number; accent?: boolean }[] = [
    { key: "focusMin", label: t("settings.focusMin"), min: 1, max: 90, accent: true },
    { key: "shortBreak", label: t("settings.shortBreak"), min: 1, max: 30 },
    { key: "longBreak", label: t("settings.longBreak"), min: 1, max: 60 },
    { key: "rounds", label: t("settings.rounds"), min: 1, max: 12 },
  ];

  return (
    <div className="lo-set lo-scroll">
      <div className="lo-set__inner">
        <h1 className="lo-set__title">{t("settings.title")}</h1>

        {/* Görünüm */}
        <Section label={t("settings.appearance")}>
          <div className="lo-set__row lo-set__row--border">
            <div>
              <div className="lo-set__rowtitle">{t("settings.theme")}</div>
              <div className="lo-set__rowsub">{t("settings.themeSub")}</div>
            </div>
            <div className="lo-set__seg">
              <button
                className={"lo-set__segbtn" + (theme === "light" ? " is-active" : "")}
                onClick={() => setTheme("light")}
              >
                {t("settings.light")}
              </button>
              <button
                className={"lo-set__segbtn" + (theme === "dark" ? " is-active" : "")}
                onClick={() => setTheme("dark")}
              >
                {t("settings.dark")}
              </button>
            </div>
          </div>
          <div className="lo-set__row">
            <div>
              <div className="lo-set__rowtitle">{t("settings.accent")}</div>
              <div className="lo-set__rowsub">{t("settings.accentSub")}</div>
            </div>
            <div className="lo-set__swatches">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  className={"lo-swatch" + (accent === c ? " is-active" : "")}
                  style={{ background: c }}
                  onClick={() => setAccent(c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </Section>

        {/* Dil ve Bölge */}
        <Section label={t("settings.langRegion")}>
          <div className="lo-set__row">
            <div>
              <div className="lo-set__rowtitle">{t("settings.appLang")}</div>
              <div className="lo-set__rowsub">{t("settings.appLangSub")}</div>
            </div>
            <select
              className="lo-set__select"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
            >
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
              <option value="ar">العربية (RTL)</option>
            </select>
          </div>
        </Section>

        {/* Editör */}
        <Section label={t("settings.editor")}>
          {editorRows.map((row, i) => (
            <div
              className={"lo-set__row" + (i < editorRows.length - 1 ? " lo-set__row--border" : "")}
              key={row.key}
            >
              <div className="lo-set__rowtitle">{row.label}</div>
              <Toggle on={editorSettings[row.key]} onClick={() => toggleEditorSetting(row.key)} />
            </div>
          ))}
        </Section>

        {/* Şablonlar */}
        <TemplatesSettings />

        {/* Pomodoro */}
        <div className="lo-set__section">{t("settings.pomodoro")}</div>
        <div className="lo-card lo-set__pomo">
          {pomoFields.map((p) => (
            <div className="lo-set__pomocell" key={p.key}>
              <input
                type="number"
                className={"lo-set__pomoinput" + (p.accent ? " is-accent" : "")}
                value={pomo[p.key]}
                min={p.min}
                max={p.max}
                onChange={(e) => {
                  const v = Math.min(p.max, Math.max(p.min, Math.round(Number(e.target.value) || p.min)));
                  setPomo({ [p.key]: v });
                }}
              />
              <div className="lo-set__pomolabel">{p.label}</div>
            </div>
          ))}
        </div>
        <div className="lo-card lo-set__row">
          <div>
            <div className="lo-set__rowtitle">{t("settings.pomoSound")}</div>
            <div className="lo-set__rowsub">{t("settings.pomoSoundSub")}</div>
          </div>
          <Toggle on={pomoSound} onClick={() => setPomoSound(!pomoSound)} />
        </div>

        {/* Tekrar (aralıklı tekrar) — kendi bölümü, üç kademeli (Basit/Gelişmiş/Uzman). */}
        <ReviewSettings />

        {/* Kasa yönetimi — mobilde de var: kasa app-data altında adla oluşturulur (klasör
            seçici yerine); konum değiştirme yalnız masaüstü. */}
        <VaultManager />
        {/* GitHub: mobilde REST API senkronuyla çalışır (git2 yerine). */}
        <AiSettings />

        <GitHubSync />
        {/* Google Takvim: mobilde deep-link OAuth (iOS client id gerekir). */}
        <GoogleCalendarSync />
        <UpdateSettings />
      </div>
    </div>
  );
}

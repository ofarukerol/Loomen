import { useTranslation } from "react-i18next";
import { useAppStore, ACCENTS, type Lang, type EditorSettings } from "../../store/useAppStore";
import { GitHubSync } from "./GitHubSync";
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

        {/* Kasalar (çoklu) */}
        <VaultManager />

        {/* GitHub Senkronizasyonu */}
        <GitHubSync />
      </div>
    </div>
  );
}

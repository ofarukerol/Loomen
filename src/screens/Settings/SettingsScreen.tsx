import { useTranslation } from "react-i18next";
import { useAppStore, ACCENTS, type Lang, type EditorSettings } from "../../store/useAppStore";

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

  const editorRows: { key: keyof EditorSettings; label: string }[] = [
    { key: "livePreview", label: t("settings.livePreview") },
    { key: "lineNumbers", label: t("settings.lineNumbers") },
    { key: "spellCheck", label: t("settings.spellCheck") },
  ];

  const pomoStats = [
    { val: pomo.focusMin, label: t("settings.focusMin"), accent: true },
    { val: pomo.shortBreak, label: t("settings.shortBreak") },
    { val: pomo.longBreak, label: t("settings.longBreak") },
    { val: pomo.rounds, label: t("settings.rounds") },
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

        {/* Pomodoro */}
        <div className="lo-set__section">{t("settings.pomodoro")}</div>
        <div className="lo-card lo-set__pomo">
          {pomoStats.map((p) => (
            <div className="lo-set__pomocell" key={p.label}>
              <div className={"lo-set__pomonum" + (p.accent ? " is-accent" : "")}>{p.val}</div>
              <div className="lo-set__pomolabel">{p.label}</div>
            </div>
          ))}
        </div>

        {/* Kasa */}
        <div className="lo-set__section">{t("settings.vault")}</div>
        <div className="lo-card lo-set__row">
          <div>
            <div className="lo-set__rowtitle">{t("settings.vaultLocation")}</div>
            <div className="lo-set__rowpath">~/Loomen/Kasa</div>
          </div>
          <button className="lo-set__change">{t("settings.change")}</button>
        </div>
      </div>
    </div>
  );
}

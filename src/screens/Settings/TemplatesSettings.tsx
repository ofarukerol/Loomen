import { useTranslation } from "react-i18next";
import { FileText, Plus, Pencil } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { TEMPLATES_DIR } from "../../core/vault";

/** Ayarlar → Şablonlar: hangi şablonun günlük not için kullanılacağını seç + şablonları yönet. */
export function TemplatesSettings() {
  const { t } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const dailyTemplate = useAppStore((s) => s.dailyTemplate);
  const setDailyTemplate = useAppStore((s) => s.setDailyTemplate);
  const newTemplate = useAppStore((s) => s.newTemplate);
  const openNote = useAppStore((s) => s.openNote);

  // Şablonlar klasöründeki tüm şablon dosyaları.
  const templates = notes
    .filter((n) => n.folder === TEMPLATES_DIR && n.kind === "note")
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  return (
    <>
      <div className="lo-set__section">{t("settings.templates")}</div>

      <div className="lo-card lo-set__card">
        <div className="lo-set__row">
          <div>
            <div className="lo-set__rowtitle">{t("settings.dailyTemplate")}</div>
            <div className="lo-set__rowsub">{t("settings.dailyTemplateSub")}</div>
          </div>
          {templates.length === 0 ? (
            <span className="lo-set__rowsub">{t("settings.noTemplates")}</span>
          ) : (
            <select
              className="lo-set__select"
              value={dailyTemplate}
              onChange={(e) => setDailyTemplate(e.target.value)}
            >
              {templates.map((tpl) => (
                <option key={tpl.path} value={tpl.name}>
                  {tpl.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="lo-card lo-set__card">
        <div className="lo-set__row lo-set__row--border">
          <div>
            <div className="lo-set__rowtitle">{t("settings.otherTemplates")}</div>
            <div className="lo-set__rowsub">{t("settings.manageTemplatesSub")}</div>
          </div>
          <button className="lo-set__change" onClick={() => void newTemplate()}>
            <Plus size={14} strokeWidth={2.2} />
            {t("settings.newTemplate")}
          </button>
        </div>
        {templates.length === 0 ? (
          <div className="lo-set__tplempty">{t("settings.noTemplates")}</div>
        ) : (
          templates.map((n, i) => (
            <button
              key={n.path}
              className={"lo-set__tplitem" + (i < templates.length - 1 ? " lo-set__row--border" : "")}
              onClick={() => void openNote(n.path, true)}
            >
              <FileText size={15} strokeWidth={1.7} color="var(--fg3)" />
              <span className="lo-set__tplname">{n.name}</span>
              {n.name === dailyTemplate && (
                <span className="lo-set__tplbadge">{t("settings.activeTemplate")}</span>
              )}
              <Pencil className="lo-set__tplpencil" size={14} strokeWidth={1.9} />
            </button>
          ))
        )}
      </div>
    </>
  );
}

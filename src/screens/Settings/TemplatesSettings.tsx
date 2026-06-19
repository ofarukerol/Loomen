import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Plus, Check } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { TEMPLATES_DIR, DAILY_TEMPLATE_PATH } from "../../core/vault";

/** Ayarlar → Şablonlar: günlük formatı düzenle + diğer şablonları yönet. */
export function TemplatesSettings() {
  const { t } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const contents = useAppStore((s) => s.noteContents);
  const writeTemplate = useAppStore((s) => s.writeTemplate);
  const newTemplate = useAppStore((s) => s.newTemplate);
  const openNote = useAppStore((s) => s.openNote);

  const saved = contents[DAILY_TEMPLATE_PATH] ?? "";
  const [draft, setDraft] = useState(saved);
  const [justSaved, setJustSaved] = useState(false);

  // Kaynak içerik dışarıdan değişirse (ör. editörde düzenlenip kaydedilince) senkronla.
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const dirty = draft !== saved;
  const save = async () => {
    await writeTemplate(DAILY_TEMPLATE_PATH, draft);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1600);
  };

  // Günlük dışındaki şablon dosyaları.
  const others = notes
    .filter((n) => n.folder === TEMPLATES_DIR && n.path !== DAILY_TEMPLATE_PATH && n.kind === "note")
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  return (
    <>
      <div className="lo-set__section">{t("settings.templates")}</div>
      <div className="lo-card lo-set__card">
        <div className="lo-set__tplhead">
          <div>
            <div className="lo-set__rowtitle">{t("settings.dailyTemplate")}</div>
            <div className="lo-set__rowsub">{t("settings.dailyTemplateSub")}</div>
          </div>
          <button className="lo-set__tplsave" onClick={() => void save()} disabled={!dirty && !justSaved}>
            {justSaved ? <Check size={14} strokeWidth={2.4} /> : null}
            {justSaved ? t("settings.templateSaved") : t("settings.templateSave")}
          </button>
        </div>
        <textarea
          className="lo-set__tplarea lo-scroll"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          rows={12}
        />
        <div className="lo-set__tplhint">{t("settings.templatePlaceholders")}</div>
      </div>

      <div className="lo-card lo-set__card">
        <div className="lo-set__row lo-set__row--border">
          <div>
            <div className="lo-set__rowtitle">{t("settings.otherTemplates")}</div>
            <div className="lo-set__rowsub">{t("settings.otherTemplatesSub")}</div>
          </div>
          <button className="lo-set__change" onClick={() => void newTemplate()}>
            <Plus size={14} strokeWidth={2.2} />
            {t("settings.newTemplate")}
          </button>
        </div>
        {others.length === 0 ? (
          <div className="lo-set__tplempty">{t("settings.noTemplates")}</div>
        ) : (
          others.map((n, i) => (
            <button
              key={n.path}
              className={"lo-set__tplitem" + (i < others.length - 1 ? " lo-set__row--border" : "")}
              onClick={() => void openNote(n.path, true)}
            >
              <FileText size={14} strokeWidth={1.7} color="var(--fg3)" />
              {n.name}
            </button>
          ))
        )}
      </div>
    </>
  );
}

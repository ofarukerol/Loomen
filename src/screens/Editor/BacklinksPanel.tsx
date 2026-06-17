import { useTranslation } from "react-i18next";
import { Link2, FileText } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

interface Backlink {
  title: string;
  source: string;
  excerptBefore: string;
  excerptLink: string;
  excerptAfter: string;
}

// Şimdilik statik (prototiple aynı). Gerçekte aktif nota göre link index'ten gelir (bkz docs 03 §4).
const BACKLINKS: Backlink[] = [
  { title: "Proje X", source: "Proje X", excerptBefore: "…timeline planlayıcı — ", excerptLink: "[[2026-06-13…]]", excerptAfter: "" },
  { title: "Fikirler", source: "Fikirler", excerptBefore: "…Pomodoro bitince günlük nota özet…", excerptLink: "", excerptAfter: "" },
  { title: "Toplantı Notları", source: "Toplantı Notları", excerptBefore: "…karar: tasarımı ", excerptLink: "[[bugün]]", excerptAfter: " bitir…" },
];

export function BacklinksPanel() {
  const { t } = useTranslation();
  const openNote = useAppStore((s) => s.openNote);

  return (
    <div className="lo-backlinks lo-scroll">
      <div className="lo-backlinks__title">
        <Link2 size={16} strokeWidth={1.9} color="var(--accent)" />
        {t("editor.backlinks")}
      </div>
      <div className="lo-backlinks__sub">{t("editor.backlinksSub")}</div>
      <div className="lo-backlinks__list">
        {BACKLINKS.map((b) => (
          <button className="lo-blcard" key={b.title} onClick={() => openNote(b.source)}>
            <div className="lo-blcard__title">
              <FileText size={12} strokeWidth={1.8} color="var(--accent)" />
              {b.title}
            </div>
            <div className="lo-blcard__excerpt">
              {b.excerptBefore}
              {b.excerptLink && <em>{b.excerptLink}</em>}
              {b.excerptAfter}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

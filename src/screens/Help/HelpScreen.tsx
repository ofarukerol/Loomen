import { useTranslation } from "react-i18next";
import {
  FileText,
  NotebookPen,
  Link2,
  Hash,
  Share2,
  CalendarClock,
  PencilRuler,
  RefreshCw,
  ShieldCheck,
  Keyboard,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

/** Bir rehber kartı: ikon + başlık + basit açıklama + (isteğe bağlı) mini görsel. */
function Card({
  icon,
  title,
  body,
  visual,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  visual?: React.ReactNode;
}) {
  return (
    <div className="lo-card lo-help__card">
      <div className="lo-help__cardhead">
        <span className="lo-help__icon">{icon}</span>
        <h2 className="lo-help__cardtitle">{title}</h2>
      </div>
      <p className="lo-help__body">{body}</p>
      {visual && <div className="lo-help__visual">{visual}</div>}
    </div>
  );
}

/** Metin içi kod/etiket rozeti (ör. [[Not]], #etiket, ⌘N). */
function Chip({ children }: { children: React.ReactNode }) {
  return <code className="lo-help__chip">{children}</code>;
}

/** İki notu bir çizgiyle bağlayan mini görsel — [[bağlantı]] metaforu. */
function LinkVisual({ a, b }: { a: string; b: string }) {
  return (
    <svg className="lo-help__svg" viewBox="0 0 260 60" role="img" aria-hidden>
      <line x1="70" y1="30" x2="190" y2="30" stroke="var(--line)" strokeWidth="2" />
      <circle cx="55" cy="30" r="9" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="205" cy="30" r="9" fill="var(--bg-elev)" stroke="var(--line)" strokeWidth="2" />
      <text x="55" y="52" className="lo-help__svgtx" textAnchor="middle">{a}</text>
      <text x="205" y="52" className="lo-help__svgtx" textAnchor="middle">{b}</text>
    </svg>
  );
}

/** Bir yeşil etiket düğümünün üç notu birbirine bağladığı mini görsel — #etiket metaforu. */
function TagVisual({ tag }: { tag: string }) {
  const notes = [
    { x: 40, y: 20 },
    { x: 40, y: 55 },
    { x: 220, y: 37 },
  ];
  return (
    <svg className="lo-help__svg" viewBox="0 0 260 75" role="img" aria-hidden>
      {notes.map((n, i) => (
        <line key={i} x1="130" y1="37" x2={n.x} y2={n.y} stroke="var(--line)" strokeWidth="2" />
      ))}
      {notes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r="7" fill="var(--bg-elev)" stroke="var(--line)" strokeWidth="2" />
      ))}
      <circle cx="130" cy="37" r="13" fill="var(--graph-tag-soft)" stroke="var(--graph-tag)" strokeWidth="2.5" />
      <text x="130" y="42" className="lo-help__svgtx" textAnchor="middle" fill="var(--graph-tag)">{tag}</text>
    </svg>
  );
}

export function HelpScreen() {
  const { t } = useTranslation();
  const setScreen = useAppStore((s) => s.setScreen);

  const shortcuts: { keys: string; label: string }[] = [
    { keys: "⌘ N", label: t("help.scNew") },
    { keys: "⌘ O", label: t("help.scOpen") },
    { keys: "Esc", label: t("help.scClose") },
  ];

  return (
    <div className="lo-help lo-scroll">
      <div className="lo-help__inner">
        <header className="lo-help__hero">
          <h1 className="lo-help__title">{t("help.title")}</h1>
          <p className="lo-help__subtitle">{t("help.subtitle")}</p>
        </header>

        <Card
          icon={<FileText size={20} strokeWidth={2} />}
          title={t("help.filesTitle")}
          body={t("help.filesBody")}
        />

        <Card
          icon={<NotebookPen size={20} strokeWidth={2} />}
          title={t("help.createTitle")}
          body={t("help.createBody")}
          visual={
            <div className="lo-help__chips">
              <Chip>⌘ N</Chip>
              <span className="lo-help__chiplabel">{t("help.scNew")}</span>
              <Chip>⌘ O</Chip>
              <span className="lo-help__chiplabel">{t("help.scOpen")}</span>
            </div>
          }
        />

        <Card
          icon={<Link2 size={20} strokeWidth={2} />}
          title={t("help.linksTitle")}
          body={t("help.linksBody")}
          visual={
            <>
              <div className="lo-help__example">
                {t("help.linksExamplePre")} <Chip>[[{t("help.exampleNoteA")}]]</Chip>
              </div>
              <LinkVisual a={t("help.exampleNoteThis")} b={t("help.exampleNoteA")} />
            </>
          }
        />

        <Card
          icon={<Hash size={20} strokeWidth={2} />}
          title={t("help.tagsTitle")}
          body={t("help.tagsBody")}
          visual={
            <>
              <div className="lo-help__example">
                <Chip>#{t("help.exampleTag")}</Chip>
              </div>
              <TagVisual tag={"#" + t("help.exampleTag")} />
            </>
          }
        />

        <Card
          icon={<Share2 size={20} strokeWidth={2} />}
          title={t("help.graphTitle")}
          body={t("help.graphBody")}
          visual={
            <button className="lo-help__go" onClick={() => setScreen("graph")}>
              <Share2 size={15} strokeWidth={2} />
              {t("help.openGraph")}
            </button>
          }
        />

        <Card
          icon={<CalendarClock size={20} strokeWidth={2} />}
          title={t("help.plannerTitle")}
          body={t("help.plannerBody")}
        />

        <Card
          icon={<PencilRuler size={20} strokeWidth={2} />}
          title={t("help.drawTitle")}
          body={t("help.drawBody")}
        />

        <Card
          icon={<RefreshCw size={20} strokeWidth={2} />}
          title={t("help.syncTitle")}
          body={t("help.syncBody")}
        />

        {/* Klavye kısayolları */}
        <div className="lo-card lo-help__card">
          <div className="lo-help__cardhead">
            <span className="lo-help__icon">
              <Keyboard size={20} strokeWidth={2} />
            </span>
            <h2 className="lo-help__cardtitle">{t("help.shortcutsTitle")}</h2>
          </div>
          <div className="lo-help__keys">
            {shortcuts.map((s) => (
              <div className="lo-help__keyrow" key={s.keys}>
                <kbd className="lo-help__kbd">{s.keys}</kbd>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Veri güvenliği notu */}
        <div className="lo-card lo-help__card lo-help__card--safe">
          <div className="lo-help__cardhead">
            <span className="lo-help__icon lo-help__icon--safe">
              <ShieldCheck size={20} strokeWidth={2} />
            </span>
            <h2 className="lo-help__cardtitle">{t("help.safetyTitle")}</h2>
          </div>
          <p className="lo-help__body">{t("help.safetyBody")}</p>
        </div>
      </div>
    </div>
  );
}

import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  Link2,
  Share2,
  CalendarClock,
  Repeat2,
  Smartphone,
  PencilRuler,
  Calendar,
  RefreshCw,
  Settings,
  ShieldCheck,
  Search,
  X,
  ChevronDown,
  Check,
  Pencil,
  Star,
  Trash2,
  Mic,
  Pause,
  CalendarDays,
  Repeat,
  Flag,
  ListChecks,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

/* ------------------------------------------------------------------ */
/* Yapı: bölümler ve grupları. Metinler `help.s.<bölüm>.<grup>` altında */
/* üç dilde durur; burada yalnız sıra, ikon ve görsel eşlemesi var.      */
/* ------------------------------------------------------------------ */

type VisualId =
  | "keys"
  | "link"
  | "tag"
  | "graphGo"
  | "taskRow"
  | "planDay"
  | "reviewSample"
  | "reviewAsk"
  | "reviewGrade"
  | "reviewSettingsGo"
  | "forecast"
  | "pressMenu"
  | "recorder"
  | "plannerGo"
  | "settingsGo";

interface GroupDef {
  id: string;
  visual?: VisualId;
}
interface SectionDef {
  id: string;
  icon: React.ReactNode;
  groups: GroupDef[];
}

const SIZE = 18;
const SECTIONS: SectionDef[] = [
  {
    id: "start",
    icon: <FileText size={SIZE} strokeWidth={2} />,
    groups: [{ id: "files" }, { id: "create" }, { id: "keys", visual: "keys" }],
  },
  {
    id: "notes",
    icon: <Link2 size={SIZE} strokeWidth={2} />,
    groups: [
      { id: "links", visual: "link" },
      { id: "tags", visual: "tag" },
      { id: "graph", visual: "graphGo" },
    ],
  },
  {
    id: "planner",
    icon: <CalendarClock size={SIZE} strokeWidth={2} />,
    groups: [
      { id: "write", visual: "plannerGo" },
      { id: "detail", visual: "taskRow" },
      { id: "repeat" },
      { id: "priority" },
      { id: "subtasks" },
      { id: "plan", visual: "planDay" },
      { id: "views" },
      { id: "pomodoro" },
    ],
  },
  {
    id: "review",
    icon: <Repeat2 size={SIZE} strokeWidth={2} />,
    groups: [
      { id: "what" },
      { id: "enable", visual: "settingsGo" },
      { id: "cards", visual: "reviewSample" },
      { id: "session", visual: "reviewAsk" },
      { id: "grades", visual: "reviewGrade" },
      { id: "decks" },
      { id: "limits" },
      { id: "vacation" },
      { id: "forecast", visual: "forecast" },
      { id: "settings", visual: "reviewSettingsGo" },
    ],
  },
  {
    id: "mobile",
    icon: <Smartphone size={SIZE} strokeWidth={2} />,
    groups: [
      { id: "nav" },
      { id: "press", visual: "pressMenu" },
      { id: "editorPress" },
      { id: "voice", visual: "recorder" },
    ],
  },
  {
    id: "draw",
    icon: <PencilRuler size={SIZE} strokeWidth={2} />,
    groups: [{ id: "draw" }, { id: "reports" }],
  },
  {
    id: "gcal",
    icon: <Calendar size={SIZE} strokeWidth={2} />,
    groups: [{ id: "connect", visual: "settingsGo" }, { id: "use" }],
  },
  {
    id: "github",
    icon: <RefreshCw size={SIZE} strokeWidth={2} />,
    groups: [{ id: "connect", visual: "settingsGo" }, { id: "sync" }],
  },
  {
    id: "safety",
    icon: <ShieldCheck size={SIZE} strokeWidth={2} />,
    groups: [{ id: "safe" }],
  },
];

interface GroupText {
  h?: string;
  p?: string;
  steps?: string[];
  list?: string[];
  keys?: string;
  items?: string[];
}

/** İç içe çeviri nesnesindeki bütün metinleri tek satıra topla (arama için). */
function flattenText(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(flattenText).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(flattenText).join(" ");
  return "";
}

/** `kod` parçalarını rozet olarak çiz. */
function Rich({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code className="lo-help__chip" key={i} dir="ltr">
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Metin içi kod/etiket rozeti (ör. [[Not]], #etiket, ⌘N). */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <code className="lo-help__chip" dir="ltr">
      {children}
    </code>
  );
}

/* ------------------------------------------------------------------ */
/* Canlı mini görseller — uygulamanın kendi tema değişkenleriyle çizilir */
/* ------------------------------------------------------------------ */

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

/** Altyazılı mini örnek çerçevesi. */
function Demo({ caption, children }: { caption?: string; children: React.ReactNode }) {
  return (
    <figure className="lo-help__demo">
      <div className="lo-help__demobox">{children}</div>
      {caption && <figcaption className="lo-help__democap">{caption}</figcaption>}
    </figure>
  );
}

/** Notta görünen ham metin (kod yazı tipi, her zaman soldan sağa). */
function Source({ text }: { text: string }) {
  return (
    <pre className="lo-help__src" dir="ltr">
      {text}
    </pre>
  );
}

/** Planlayıcıdaki bir görev satırının küçük kopyası. */
function MiniTask() {
  const { t } = useTranslation();
  return (
    <div className="lo-help__task">
      <span className="lo-help__check" aria-hidden />
      <span className="lo-help__tasktitle">{t("help.ex.taskTitle")}</span>
      <span className="lo-help__tmeta">
        <span className="lo-help__pill">
          <CalendarDays size={11} strokeWidth={2} />
          {t("help.ex.taskDate")}
        </span>
        <span className="lo-help__pill">
          <Repeat size={11} strokeWidth={2} />
          {t("help.ex.taskRepeat")}
        </span>
        <span className="lo-help__pill lo-help__pill--prio">
          <Flag size={11} strokeWidth={2} />
          {t("help.ex.taskPrio")}
        </span>
        <span className="lo-help__pill">
          <ListChecks size={11} strokeWidth={2} />
          {t("help.ex.taskSub")}
        </span>
      </span>
    </div>
  );
}

/** "Günü planla" penceresinin küçük kopyası. */
function MiniPlanDay() {
  const { t } = useTranslation();
  const rows = [
    { name: t("help.ex.late1"), meta: t("help.ex.late1d"), on: true },
    { name: t("help.ex.late2"), meta: t("help.ex.late2d"), on: false },
  ];
  return (
    <div className="lo-help__plan">
      <div className="lo-help__planhead">{t("planner.planDay")}</div>
      {rows.map((r) => (
        <div className="lo-help__planrow" key={r.name}>
          <span className={"lo-help__check" + (r.on ? " is-on" : "")} aria-hidden>
            {r.on && <Check size={11} strokeWidth={3} />}
          </span>
          <span className="lo-help__tasktitle">{r.name}</span>
          <span className="lo-help__late">{r.meta}</span>
        </div>
      ))}
      <div className="lo-help__planfoot">
        <span className="lo-help__btn lo-help__btn--primary">{t("planner.planDayMoveCount", { count: 1 })}</span>
      </div>
    </div>
  );
}

/** Tekrar oturumundaki bir kartın küçük kopyası; `answered` ise cevap ve dört düğme görünür. */
function MiniReviewCard({ answered }: { answered: boolean }) {
  const { t } = useTranslation();
  const ivl = t("help.ex.ivl", { returnObjects: true }) as unknown as string[];
  return (
    <div className="lo-help__rev">
      <div className="lo-help__revtop">
        <div className="lo-help__revbar">
          <div className="lo-help__revfill" />
        </div>
        <span className="lo-help__revcount" dir="ltr">3 / 20</span>
      </div>
      <div className="lo-help__revcard">
        <div className="lo-help__revq">{t("help.ex.cardQ")}</div>
        {answered && (
          <>
            <div className="lo-help__revsep" />
            <div className="lo-help__reva">{t("help.ex.cardA")}</div>
          </>
        )}
      </div>
      {answered ? (
        <div className="lo-help__grades">
          {[1, 2, 3, 4].map((g, i) => (
            <span className={`lo-help__grade is-g${g}`} key={g}>
              <span className="lo-help__gradelabel">{t(`review.grade${g}`)}</span>
              <span className="lo-help__gradeivl">{ivl[i]}</span>
            </span>
          ))}
        </div>
      ) : (
        <span className="lo-help__reveal">
          {t("review.reveal")}
          <span className="lo-help__revkey">{t("review.spaceKey")}</span>
        </span>
      )}
    </div>
  );
}

/** 30 günlük tahmin çubuklarının küçük kopyası. */
function MiniForecast() {
  const { t } = useTranslation();
  const heights = [78, 52, 40, 46, 38, 30, 62, 44, 36, 34, 28, 54, 40, 32, 30, 26, 48, 36, 30, 28, 24, 44, 34, 28, 26, 22, 38, 30, 24, 22];
  return (
    <div className="lo-help__fc">
      <div className="lo-help__fcbars" dir="ltr">
        {heights.map((h, i) => (
          <div className={"lo-help__fcbar" + (i === 0 ? " is-today" : "")} style={{ height: `${h}%` }} key={i} />
        ))}
      </div>
      <div className="lo-help__fcfoot" dir="ltr">
        <span>{t("review.today")}</span>
        <span>{t("review.inDays", { days: 30 })}</span>
      </div>
    </div>
  );
}

/** Gezgin'deki uzun basma menüsünün küçük kopyası. */
function MiniPressMenu() {
  const { t } = useTranslation();
  const items = [
    { icon: <Pencil size={13} strokeWidth={1.9} />, label: t("explorer.rename"), danger: false },
    { icon: <Star size={13} strokeWidth={1.9} />, label: t("explorer.addFavorite"), danger: false },
    { icon: <Trash2 size={13} strokeWidth={1.9} />, label: t("explorer.delete"), danger: true },
  ];
  return (
    <div className="lo-help__press">
      <div className="lo-help__prow">
        <FileText size={14} strokeWidth={2} />
        {t("help.ex.noteA")}
      </div>
      <div className="lo-help__menu">
        {items.map((it) => (
          <div className={"lo-help__menuitem" + (it.danger ? " is-danger" : "")} key={it.label}>
            {it.icon}
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ses kaydı çubuğunun küçük kopyası. */
function MiniRecorder() {
  const { t } = useTranslation();
  const bars = [6, 12, 18, 10, 22, 16, 8, 20, 14, 24, 12, 18, 9, 15, 7, 11];
  return (
    <div className="lo-help__recwrap">
      <div className="lo-help__rec" dir="ltr">
        <span className="lo-help__recbtn" aria-hidden>
          <Trash2 size={14} strokeWidth={1.9} />
        </span>
        <span className="lo-help__recbtn" aria-hidden>
          <Pause size={14} strokeWidth={2} />
        </span>
        <span className="lo-help__wave" aria-hidden>
          {bars.map((h, i) => (
            <span key={i} style={{ height: h }} />
          ))}
        </span>
        <span className="lo-help__rectime">0:12</span>
        <span className="lo-help__recbtn lo-help__recbtn--ok" aria-hidden>
          <Check size={14} strokeWidth={2.4} />
        </span>
      </div>
      <div className="lo-help__recname">
        <Mic size={13} strokeWidth={2} />
        {t("help.ex.recName")}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function HelpScreen() {
  const { t, i18n } = useTranslation();
  const setScreen = useAppStore((s) => s.setScreen);
  const reviewOn = useAppStore((s) => s.srsSettings.enabled);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(["start"]));
  const [jump, setJump] = useState<string | null>(null);

  // Her bölümün aranabilir düz metni (dil değişince yenilenir).
  const haystack = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of SECTIONS) {
      out[s.id] = flattenText(t(`help.s.${s.id}`, { returnObjects: true })).toLocaleLowerCase(i18n.language);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  const q = query.trim().toLocaleLowerCase(i18n.language);
  const visible = SECTIONS.filter((s) => !q || haystack[s.id].includes(q));

  // İçindekilerden atlayınca ilgili bölümü aç ve görünür yap.
  useEffect(() => {
    if (!jump) return;
    const el = document.getElementById(`help-${jump}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setJump(null);
  }, [jump, visible.length]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const goTo = (id: string) => {
    setQuery("");
    setOpen((prev) => new Set(prev).add(id));
    setJump(id);
  };

  const goBtn = (label: string, onClick: () => void, icon: React.ReactNode) => (
    <button className="lo-help__go" onClick={onClick}>
      {icon}
      {label}
    </button>
  );

  const renderVisual = (v: VisualId): React.ReactNode => {
    switch (v) {
      case "keys": {
        const items = t("help.s.start.keys.items", { returnObjects: true }) as unknown as string[];
        const keys = ["⌘ N", "⌘ O", "Esc"];
        return (
          <div className="lo-help__keys">
            {keys.map((k, i) => (
              <div className="lo-help__keyrow" key={k}>
                <kbd className="lo-help__kbd" dir="ltr">{k}</kbd>
                <span>{items[i]}</span>
              </div>
            ))}
          </div>
        );
      }
      case "link":
        return (
          <>
            <div className="lo-help__example">
              {t("help.ex.linkPre")} <Chip>[[{t("help.ex.noteA")}]]</Chip>
            </div>
            <LinkVisual a={t("help.ex.noteThis")} b={t("help.ex.noteA")} />
          </>
        );
      case "tag":
        return (
          <>
            <div className="lo-help__example">
              <Chip>#{t("help.ex.tag")}</Chip>
            </div>
            <TagVisual tag={"#" + t("help.ex.tag")} />
          </>
        );
      case "graphGo":
        return goBtn(t("help.openGraph"), () => setScreen("graph"), <Share2 size={15} strokeWidth={2} />);
      case "plannerGo":
        return (
          <>
            <Demo caption={t("help.ex.taskSrcLabel")}>
              <Source text={t("help.ex.taskSource")} />
            </Demo>
            <Demo caption={t("help.ex.taskRowLabel")}>
              <MiniTask />
            </Demo>
            {goBtn(t("help.openPlanner"), () => setScreen("planner"), <CalendarClock size={15} strokeWidth={2} />)}
          </>
        );
      case "taskRow":
        return (
          <Demo caption={t("help.ex.taskRowLabel")}>
            <MiniTask />
          </Demo>
        );
      case "planDay":
        return (
          <Demo>
            <MiniPlanDay />
          </Demo>
        );
      case "reviewSample":
        return (
          <Demo>
            <Source text={t("help.ex.noteSample")} />
          </Demo>
        );
      case "reviewAsk":
        return (
          <Demo caption={t("help.ex.cardCaption")}>
            <MiniReviewCard answered={false} />
          </Demo>
        );
      case "reviewGrade":
        return (
          <Demo caption={t("help.ex.cardCaption")}>
            <MiniReviewCard answered />
          </Demo>
        );
      case "forecast":
        return (
          <Demo caption={t("help.ex.forecastCaption")}>
            <MiniForecast />
          </Demo>
        );
      case "pressMenu":
        return (
          <Demo caption={t("help.ex.menuCaption")}>
            <MiniPressMenu />
          </Demo>
        );
      case "recorder":
        return (
          <Demo caption={t("help.ex.recCaption")}>
            <MiniRecorder />
          </Demo>
        );
      case "settingsGo":
        return goBtn(t("help.openSettings"), () => setScreen("settings"), <Settings size={15} strokeWidth={2} />);
      case "reviewSettingsGo":
        return (
          <div className="lo-help__gorow">
            {goBtn(t("help.openSettings"), () => setScreen("settings"), <Settings size={15} strokeWidth={2} />)}
            {reviewOn && goBtn(t("help.openReview"), () => setScreen("review"), <Repeat2 size={15} strokeWidth={2} />)}
          </div>
        );
    }
  };

  return (
    <div className="lo-help lo-scroll">
      <div className="lo-help__inner">
        <header className="lo-help__hero">
          <h1 className="lo-help__title">{t("help.title")}</h1>
          <p className="lo-help__subtitle">{t("help.subtitle")}</p>
        </header>

        {/* Arama */}
        <div className="lo-help__search">
          <Search size={16} strokeWidth={2} className="lo-help__searchicon" />
          <input
            className="lo-help__searchinput"
            type="search"
            value={query}
            placeholder={t("help.search")}
            aria-label={t("help.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="lo-help__searchclear" onClick={() => setQuery("")} aria-label={t("help.clearSearch")} title={t("help.clearSearch")}>
              <X size={14} strokeWidth={2.2} />
            </button>
          )}
        </div>

        {/* İçindekiler */}
        <nav className="lo-help__toc" aria-label={t("help.tocTitle")}>
          <div className="lo-help__tochead">
            <span className="lo-help__toctitle">{t("help.tocTitle")}</span>
            <span className="lo-help__tocacts">
              <button className="lo-help__link" onClick={() => setOpen(new Set(SECTIONS.map((s) => s.id)))}>
                {t("help.expandAll")}
              </button>
              <button className="lo-help__link" onClick={() => setOpen(new Set())}>
                {t("help.collapseAll")}
              </button>
            </span>
          </div>
          <ol className="lo-help__toclist">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <button
                  className={"lo-help__tocitem" + (q && !visible.includes(s) ? " is-dim" : "")}
                  onClick={() => goTo(s.id)}
                >
                  <span className="lo-help__tocnum">{i + 1}</span>
                  <span className="lo-help__tocname">{t(`help.s.${s.id}.title`)}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {visible.length === 0 && <div className="lo-card lo-help__empty">{t("help.searchEmpty")}</div>}

        {/* Bölümler */}
        {visible.map((s) => {
          const isOpen = !!q || open.has(s.id);
          return (
            <section
              id={`help-${s.id}`}
              key={s.id}
              className={"lo-card lo-help__sec" + (s.id === "safety" ? " lo-help__sec--safe" : "") + (isOpen ? " is-open" : "")}
            >
              <button
                className="lo-help__sechead"
                aria-expanded={isOpen}
                aria-controls={`help-body-${s.id}`}
                onClick={() => !q && toggle(s.id)}
              >
                <span className={"lo-help__icon" + (s.id === "safety" ? " lo-help__icon--safe" : "")}>{s.icon}</span>
                <span className="lo-help__sectext">
                  <span className="lo-help__cardtitle">{t(`help.s.${s.id}.title`)}</span>
                  <span className="lo-help__secsum">{t(`help.s.${s.id}.summary`)}</span>
                </span>
                <ChevronDown size={18} strokeWidth={2} className="lo-help__chev" />
              </button>

              {isOpen && (
                <div className="lo-help__secbody" id={`help-body-${s.id}`}>
                  {s.groups.map((g) => {
                    const gt = t(`help.s.${s.id}.${g.id}`, { returnObjects: true }) as unknown as GroupText;
                    return (
                      <div className="lo-help__group" key={g.id}>
                        {gt.h && <h3 className="lo-help__grouptitle">{gt.h}</h3>}
                        {gt.p && (
                          <p className="lo-help__body">
                            <Rich text={gt.p} />
                          </p>
                        )}
                        {gt.steps && (
                          <ol className="lo-help__steps">
                            {gt.steps.map((x, i) => (
                              <li key={i}>
                                <Rich text={x} />
                              </li>
                            ))}
                          </ol>
                        )}
                        {gt.list && (
                          <ul className="lo-help__list">
                            {gt.list.map((x, i) => (
                              <li key={i}>
                                <Rich text={x} />
                              </li>
                            ))}
                          </ul>
                        )}
                        {gt.keys && (
                          <p className="lo-help__body lo-help__body--note">
                            <Rich text={gt.keys} />
                          </p>
                        )}
                        {g.visual && <div className="lo-help__visual">{renderVisual(g.visual)}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

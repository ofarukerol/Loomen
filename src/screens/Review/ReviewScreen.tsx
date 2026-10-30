import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Layers, Clock, AlertTriangle, Sparkles, CalendarRange, Settings2, Plus, ListPlus } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { buildQueue, forecast, isListFile, isoDay, listNewCaps, type ReviewList } from "../../core/srs";
import { ReviewSession } from "./ReviewSession";
import { ListCard } from "./ListCard";
import { ListDetail } from "./ListDetail";
import { ListForm } from "./ListForm";

const FORECAST_DAYS = 30;

export function ReviewScreen() {
  const { t } = useTranslation();
  const cfg = useAppStore((s) => s.srsSettings);
  const cards = useAppStore((s) => s.srsCards);
  const lists = useAppStore((s) => s.srsLists);
  const states = useAppStore((s) => s.srsStates);
  const daily = useAppStore((s) => s.srsDaily);
  const sec = useAppStore((s) => s.srsSecPerCard);
  const queue = useAppStore((s) => s.srsQueue);
  const index = useAppStore((s) => s.srsIndex);
  const start = useAppStore((s) => s.srsStart);
  const spread = useAppStore((s) => s.srsSpread);
  const setScreen = useAppStore((s) => s.setScreen);
  const setSettings = useAppStore((s) => s.srsSetSettings);
  const openListId = useAppStore((s) => s.srsOpenListId);
  const openList = useAppStore((s) => s.srsOpenList);
  // Sekme seçimi yerel: liste varsa Listelerim, yoksa Notlardan (bugünkü görünüm).
  const [tab, setTab] = useState<"lists" | "notes" | null>(null);
  const [creating, setCreating] = useState(false);
  // Yeni liste kaydedilince ayrıntıda yapıştırma penceresi kendiliğinden açılır.
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const activeTab = tab ?? (lists.length > 0 ? "lists" : "notes");
  const noteCards = useMemo(() => cards.filter((c) => !isListFile(c.file)).length, [cards]);
  const openedList = openListId ? lists.find((l) => l.id === openListId) : undefined;

  const inSession = queue.length > 0 && index < queue.length;

  const info = useMemo(() => {
    const now = new Date();
    // Oturumla aynı sayılar: tekrar listelerinin günlük sınırı burada da uygulanır.
    return buildQueue(cards, states, daily, cfg, now, sec, listNewCaps(lists, daily[isoDay(now)], cfg));
  }, [cards, lists, states, daily, cfg, sec]);

  const fc = useMemo(() => forecast(states, FORECAST_DAYS), [states]);
  const today = daily[isoDay(new Date())] ?? { n: 0, r: 0, ms: 0 };

  // Modül kapalıysa: ne olduğunu anlat, açma düğmesi ver.
  if (!cfg.enabled) {
    return (
      <div className="lo-rev lo-scroll">
        <div className="lo-rev__inner">
          <h1 className="lo-set__title">{t("review.title")}</h1>
          <div className="lo-card lo-rev__intro">
            <Sparkles size={22} strokeWidth={1.8} />
            <div className="lo-rev__introtitle">{t("review.offTitle")}</div>
            <p className="lo-rev__introtext">{t("review.offBody")}</p>
            <pre className="lo-rev__sample">{t("review.offSample")}</pre>
            <p className="lo-rev__introtext">{t("review.offBody2")}</p>
            <button className="lo-btn lo-btn--primary" onClick={() => void setSettings({ enabled: true })}>
              {t("review.turnOn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (inSession) {
    return (
      <div className="lo-rev">
        <ReviewSession />
      </div>
    );
  }

  const onCreated = (l: ReviewList) => {
    setPasteFor(l.id);
    openList(l.id);
  };
  const newListForm = creating && <ListForm onClose={() => setCreating(false)} onDone={onCreated} />;

  if (openedList) {
    return (
      <div className="lo-rev lo-scroll">
        <div className="lo-rev__inner">
          <ListDetail
            key={openedList.id}
            list={openedList}
            autoPaste={pasteFor === openedList.id}
            onAutoPasteDone={() => setPasteFor(null)}
          />
        </div>
      </div>
    );
  }

  const peak = Math.max(1, ...fc.map((d) => d.count));
  const nothing = info.items.length === 0;
  const stats = [
    { icon: <Layers size={16} strokeWidth={2} />, val: info.items.length, label: t("review.dueToday"), accent: true },
    { icon: <Sparkles size={16} strokeWidth={2} />, val: info.new, label: t("review.newToday") },
    { icon: <Clock size={16} strokeWidth={2} />, val: `${info.minutes} dk`, label: t("review.estTime") },
    { icon: <AlertTriangle size={16} strokeWidth={2} />, val: info.deferred, label: t("review.deferred") },
  ];

  return (
    <div className="lo-rev lo-scroll">
      <div className="lo-rev__inner">
        <div className="lo-rev__head">
          <h1 className="lo-set__title">{t("review.title")}</h1>
          <button className="lo-rev__iconbtn" title={t("review.settings")} onClick={() => setScreen("settings")}>
            <Settings2 size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="lo-rev__stats">
          {stats.map((s) => (
            <div className="lo-card lo-rstat" key={s.label}>
              <div className={"lo-rstat__icon" + (s.accent ? " is-accent" : "")}>{s.icon}</div>
              <div className="lo-rstat__val">{s.val}</div>
              <div className="lo-rstat__label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Bugünün durumu — neden bu kadar kart çıktığını düz cümleyle anlatır. */}
        <div className="lo-card lo-rev__status">
          {info.vacation ? (
            <p>{t("review.onVacation")}</p>
          ) : nothing && cards.length === 0 ? (
            <p>{t("review.noCards")}</p>
          ) : nothing ? (
            <p>{t("review.allDone", { n: today.r })}</p>
          ) : (
            <p>
              {t("review.summary", { n: info.items.length, min: info.minutes })}
              {info.deferred > 0 && " " + t("review.deferredNote", { n: info.deferred })}
              {info.eased && " " + t("review.easedNote")}
              {info.new === 0 && info.deferred > 0 && " " + t("review.newPausedNote")}
            </p>
          )}
          <button className="lo-btn lo-btn--primary lo-rev__start" disabled={nothing} onClick={() => start(null)}>
            <Play size={15} strokeWidth={2.2} />
            {t("review.start")}
          </button>
        </div>

        {/* Birikme varsa yayma teklifi */}
        {info.deferred > 20 && (
          <div className="lo-card lo-rev__spread">
            <div>
              <div className="lo-set__rowtitle">{t("review.backlogTitle", { n: info.deferred })}</div>
              <div className="lo-set__rowsub">{t("review.backlogSub")}</div>
            </div>
            <div className="lo-rev__spreadbtns">
              {[7, 14, 30].map((d) => (
                <button key={d} className="lo-btn" onClick={() => void spread(d)}>
                  {t("review.spreadDays", { days: d })}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Listelerim | Notlardan */}
        <div className="lo-rev__tabs" role="tablist" aria-label={t("review.title")}>
          {(["lists", "notes"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`lo-rev-tab-${k}`}
              aria-selected={activeTab === k}
              aria-controls={activeTab === k ? `lo-rev-panel-${k}` : undefined}
              className={"lo-hab-tab" + (activeTab === k ? " is-on" : "")}
              onClick={() => setTab(k)}
            >
              {k === "lists" ? t("review.lists.tabLists") : t("review.lists.tabNotes")}
              <span className="lo-hab-tab__count">{k === "lists" ? lists.length : noteCards}</span>
            </button>
          ))}
        </div>

        {activeTab === "lists" ? (
          <div role="tabpanel" id="lo-rev-panel-lists" aria-labelledby="lo-rev-tab-lists">
            {lists.length === 0 ? (
              <div className="lo-card lo-rlist-empty">
                <ListPlus size={22} strokeWidth={1.8} />
                <div className="lo-rev__introtitle">{t("review.lists.emptyTitle")}</div>
                <p className="lo-rev__introtext">{t("review.lists.emptyBody")}</p>
                <pre className="lo-rev__sample" dir="ltr">
                  {t("review.lists.emptyExample")}
                </pre>
                <button className="lo-btn lo-btn--primary" onClick={() => setCreating(true)}>
                  <Plus size={15} strokeWidth={2.2} />
                  {t("review.lists.emptyCta")}
                </button>
              </div>
            ) : (
              <div className="lo-rlist">
                {lists.map((l) => (
                  <ListCard key={l.id} list={l} />
                ))}
                <button className="lo-rlist-new" onClick={() => setCreating(true)}>
                  <Plus size={18} strokeWidth={2} />
                  {t("review.lists.newList")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div role="tabpanel" id="lo-rev-panel-notes" aria-labelledby="lo-rev-tab-notes">
            <div className="lo-card lo-rev__notes">
              <p>{noteCards > 0 ? t("review.lists.notesCount", { n: noteCards }) : t("review.noCards")}</p>
            </div>
            {/* Desteler */}
            {cfg.desteler.length > 0 && (
              <>
                <div className="lo-set__section">{t("review.decks")}</div>
                <div className="lo-card lo-set__card">
                  {cfg.desteler.map((d, i) => {
                    const sub = cards.filter(
                      (c) => !d.folder || c.file === d.folder || c.file.startsWith(d.folder + "/"),
                    );
                    const q = buildQueue(
                      sub,
                      states,
                      daily,
                      { ...cfg, newPerDay: d.newPerDay ?? cfg.newPerDay, maxPerDay: d.maxPerDay ?? cfg.maxPerDay },
                      new Date(),
                      sec,
                    );
                    return (
                      <div
                        className={"lo-set__row" + (i < cfg.desteler.length - 1 ? " lo-set__row--border" : "")}
                        key={d.id}
                      >
                        <div>
                          <div className="lo-set__rowtitle">{d.name}</div>
                          <div className="lo-set__rowsub">
                            {t("review.deckSub", { total: sub.length, due: q.items.length })}
                          </div>
                        </div>
                        <button className="lo-btn" disabled={q.items.length === 0} onClick={() => start(d.id)}>
                          {t("review.start")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* 30 günlük yük tahmini */}
        <div className="lo-set__section">
          <CalendarRange size={13} strokeWidth={2} style={{ verticalAlign: "-2px", marginInlineEnd: 6 }} />
          {t("review.forecast")}
        </div>
        <div className="lo-card lo-rev__chart">
          <div className="lo-rev__bars">
            {fc.map((d, i) => (
              <div className="lo-rev__barcol" key={d.day} title={`${d.day}: ${d.count}`}>
                <div
                  className={"lo-rev__barbit" + (i === 0 ? " is-today" : "")}
                  style={{ height: `${Math.max(2, (d.count / peak) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="lo-rev__chartfoot">
            <span>{t("review.today")}</span>
            <span>{t("review.inDays", { days: FORECAST_DAYS })}</span>
          </div>
          <div className="lo-rev__charthint">{t("review.forecastHint", { peak })}</div>
        </div>
      </div>
      {newListForm}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Sprout, CheckCheck, AlertTriangle } from "lucide-react";
import { activeHabits, allDoneToday, historyGroups, type Habit } from "../../core/habit";
import { useAppStore } from "../../store/useAppStore";
import { HabitCard } from "./HabitCard";
import { HabitDetail } from "./HabitDetail";
import { HabitHistory } from "./HabitHistory";
import { HabitForm, type HabitFormMode } from "./HabitForm";
import { useToday } from "./habitUi";

type Tab = "active" | "history";

/**
 * Alışkanlıklar ekranı (LOM-55): Aktif / Geçmiş sekmeleri, ekleme penceresi ve tur ayrıntısı.
 * Veri store'dan gelir; store yalnız kasadaki Alışkanlık/<id>.json dosyalarını okur/yazar.
 */
export function HabitsScreen() {
  const { t } = useTranslation();
  const habits = useAppStore((s) => s.habits);
  const loaded = useAppStore((s) => s.habitsLoaded);
  const broken = useAppStore((s) => s.habitBroken);
  const detailId = useAppStore((s) => s.habitDetailId);
  const habitLoad = useAppStore((s) => s.habitLoad);
  const today = useToday();
  const [tab, setTab] = useState<Tab>("active");
  const [form, setForm] = useState<HabitFormMode | null>(null);

  // Kasa açılışında store zaten okur; ekran ondan önce açıldıysa (ya da okuma düştüyse) bir kez dene.
  useEffect(() => {
    if (!loaded) void habitLoad().catch((e) => console.error("[habit] okunamadı:", e));
  }, [loaded, habitLoad]);

  const active = useMemo(() => activeHabits(habits, today), [habits, today]);
  const allDone = useMemo(() => allDoneToday(habits, today), [habits, today]);
  const historyCount = useMemo(
    () => historyGroups(habits, today, "all").reduce((n, g) => n + g.items.length, 0),
    [habits, today],
  );
  const detail = detailId ? habits.find((h) => h.id === detailId) ?? null : null;

  const openNew = () => setForm({ kind: "new" });
  const openRound = (from: Habit) => setForm({ kind: "round", from });
  const onCreated = () => {
    setTab("active");
    useAppStore.getState().habitOpenDetail(null);
  };

  const brokenLine = broken.length > 0 && (
    <div className="lo-hab-warn" role="status">
      <AlertTriangle size={15} strokeWidth={2} aria-hidden />
      <span>
        {t("habit.broken", { count: broken.length })}
        <span className="lo-hab-warn__files" dir="ltr">
          {broken.slice(0, 3).join(", ")}
          {broken.length > 3 ? "…" : ""}
        </span>
      </span>
    </div>
  );

  let body;
  if (detail) {
    body = <HabitDetail key={detail.id} habit={detail} today={today} onNewRound={openRound} />;
  } else {
    body = (
      <>
        <header className="lo-hab-head">
          <h1 className="lo-hab-head__title">{t("habit.title")}</h1>
          {habits.length > 0 && (
            <button type="button" className="lo-btn lo-btn--primary lo-hab-add" onClick={openNew}>
              <Plus size={16} strokeWidth={2.2} aria-hidden />
              <span className="lo-hab-add__label">{t("habit.add")}</span>
            </button>
          )}
        </header>

        {brokenLine}

        {habits.length > 0 && (
          <div className="lo-hab-tabs" role="tablist" aria-label={t("habit.title")}>
            <button
              type="button"
              role="tab"
              id="lo-hab-tab-active"
              aria-selected={tab === "active"}
              aria-controls="lo-hab-panel"
              className={"lo-hab-tab" + (tab === "active" ? " is-on" : "")}
              onClick={() => setTab("active")}
            >
              {t("habit.tabActive")}
              <span className="lo-hab-tab__count">{active.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              id="lo-hab-tab-history"
              aria-selected={tab === "history"}
              aria-controls="lo-hab-panel"
              className={"lo-hab-tab" + (tab === "history" ? " is-on" : "")}
              onClick={() => setTab("history")}
            >
              {t("habit.tabHistory")}
              <span className="lo-hab-tab__count">{historyCount}</span>
            </button>
          </div>
        )}

        <div id="lo-hab-panel" role={habits.length > 0 ? "tabpanel" : undefined} aria-labelledby={habits.length > 0 ? `lo-hab-tab-${tab}` : undefined}>
          {!loaded ? null : habits.length === 0 ? (
            <Empty onAdd={openNew} />
          ) : tab === "history" ? (
            <HabitHistory today={today} onNewRound={openRound} />
          ) : active.length === 0 ? (
            <div className="lo-hab-quiet">
              <Sprout size={18} strokeWidth={1.8} aria-hidden />
              <span>{t("habit.noActive")}</span>
              <button type="button" className="lo-btn" onClick={openNew}>
                <Plus size={15} strokeWidth={2} aria-hidden />
                {t("habit.add")}
              </button>
            </div>
          ) : (
            <>
              {allDone && (
                <div className="lo-hab-alldone" role="status">
                  <CheckCheck size={16} strokeWidth={2.2} aria-hidden />
                  {t("habit.allDone")}
                </div>
              )}
              <div className="lo-hab-list">
                {active.map((h) => (
                  <HabitCard key={h.id} habit={h} today={today} />
                ))}
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="lo-hab lo-scroll">
      <div className="lo-hab__inner">
        {detail && brokenLine}
        {body}
      </div>
      {form && <HabitForm mode={form} today={today} onClose={() => setForm(null)} onDone={onCreated} />}
    </div>
  );
}

/** Boş durum: tek çağrı, kısa açıklama, 21/41 örneği. */
function Empty({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="lo-hab-empty">
      <div className="lo-hab-empty__art" aria-hidden>
        {Array.from({ length: 21 }, (_, i) => (
          <span key={i} className={"lo-hab-empty__dot" + (i < 9 ? " is-on" : "")} />
        ))}
      </div>
      <h2 className="lo-hab-empty__title">{t("habit.emptyTitle")}</h2>
      <p className="lo-hab-empty__body">{t("habit.emptyBody")}</p>
      <p className="lo-hab-empty__example">{t("habit.emptyExample")}</p>
      <button type="button" className="lo-btn lo-btn--primary lo-hab-empty__cta" onClick={onAdd}>
        <Plus size={16} strokeWidth={2.2} aria-hidden />
        {t("habit.emptyCta")}
      </button>
    </div>
  );
}

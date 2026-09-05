import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { PRESETS, buildQueue, dailyDemand, type SrsDeck } from "../../core/srs";

type Tab = "basic" | "advanced" | "expert";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={"lo-switch" + (on ? " is-on" : "")} onClick={onClick} aria-pressed={on}>
      <span className="lo-switch__knob" />
    </button>
  );
}

function Row({
  title,
  sub,
  border = true,
  children,
}: {
  title: string;
  sub?: string;
  border?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={"lo-set__row" + (border ? " lo-set__row--border" : "")}>
      <div>
        <div className="lo-set__rowtitle">{title}</div>
        {sub && <div className="lo-set__rowsub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Num({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      className="lo-set__num"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Math.min(max, Math.max(min, Math.round(Number(e.target.value) || min))))}
    />
  );
}

/** Dakika listesini "1 10" gibi düz metinle düzenle. */
function Steps({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(" "));
  return (
    <input
      className="lo-set__text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = text
          .split(/[\s,]+/)
          .map((x) => Math.round(Number(x)))
          .filter((x) => Number.isFinite(x) && x > 0);
        if (v.length) onChange(v);
        else setText(value.join(" "));
      }}
    />
  );
}

export function ReviewSettings() {
  const { t } = useTranslation();
  const cfg = useAppStore((s) => s.srsSettings);
  const set = useAppStore((s) => s.srsSetSettings);
  const preset = useAppStore((s) => s.srsApplyPreset);
  const cards = useAppStore((s) => s.srsCards);
  const states = useAppStore((s) => s.srsStates);
  const daily = useAppStore((s) => s.srsDaily);
  const sec = useAppStore((s) => s.srsSecPerCard);
  const notes = useAppStore((s) => s.notes);
  const [tab, setTab] = useState<Tab>("basic");

  // Canlı tahmin: ayarlar bu haldeyken günde ne kadar iş çıkar.
  const est = useMemo(() => {
    const demand = dailyDemand(states, cfg, cards.length, sec);
    const q = buildQueue(cards, states, daily, cfg, new Date(), sec);
    return { demand, today: q };
  }, [states, cfg, cards, daily, sec]);

  const cap = Math.round(cfg.maxPerDay);
  const need = Math.round(est.demand.cards);
  const fits = need <= cap;

  // Ayarlar bir hazır profille birebir aynıysa o düğme seçili görünsün.
  const activePreset = (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).find((k) => {
    const p = PRESETS[k];
    return (
      p.retention === cfg.retention &&
      p.newPerDay === cfg.newPerDay &&
      p.maxPerDay === cfg.maxPerDay &&
      p.minutesPerDay === cfg.minutesPerDay
    );
  });

  const dayNames = t("review.set.dayNames", { returnObjects: true }) as unknown as string[];
  const folders = Array.from(new Set(notes.map((n) => n.folder).filter(Boolean))).sort();

  const updateDeck = (id: string, patch: Partial<SrsDeck>) =>
    void set({ desteler: cfg.desteler.map((d) => (d.id === id ? { ...d, ...patch } : d)) });

  return (
    <>
      <div className="lo-set__section">{t("review.set.section")}</div>

      <div className="lo-card lo-set__card">
        <Row title={t("review.set.enable")} sub={t("review.set.enableSub")} border={cfg.enabled}>
          <Toggle on={cfg.enabled} onClick={() => void set({ enabled: !cfg.enabled })} />
        </Row>
        {cfg.enabled && (
          <div className="lo-set__row">
            <div className="lo-set__rowsub">{t("review.set.cardCount", { n: cards.length })}</div>
          </div>
        )}
      </div>

      {!cfg.enabled ? null : (
        <>
          <div className="lo-set__tabs">
            {(["basic", "advanced", "expert"] as Tab[]).map((x) => (
              <button
                key={x}
                className={"lo-set__tab" + (tab === x ? " is-active" : "")}
                onClick={() => setTab(x)}
              >
                {t(`review.set.tab_${x}`)}
              </button>
            ))}
          </div>

          {/* — Canlı tahmin kutusu: her sekmede görünür — */}
          <div className={"lo-card lo-set__est" + (fits ? "" : " is-over")}>
            <div className="lo-set__estnum">
              {need} <span>{t("review.set.cardsPerDay")}</span>
            </div>
            <div className="lo-set__esttext">
              {fits
                ? t("review.set.estFits", { cap, min: Math.max(1, Math.round(est.demand.minutes)) })
                : t("review.set.estOver", { cap, need, over: need - cap })}
            </div>
            <div className="lo-set__estsub">{t("review.set.estHint")}</div>
            <div className="lo-set__esttoday">{t("review.set.estToday", { n: est.today.items.length, min: est.today.minutes })}</div>
          </div>

          {tab === "basic" && (
            <div className="lo-card lo-set__card">
              <Row title={t("review.set.preset")} sub={t("review.set.presetSub")}>
                <div className="lo-set__seg">
                  {(["light", "balanced", "heavy"] as const).map((k) => (
                    <button
                      key={k}
                      className={"lo-set__segbtn" + (activePreset === k ? " is-active" : "")}
                      onClick={() => void preset(k)}
                    >
                      {t(`review.set.preset${k[0].toUpperCase()}${k.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </Row>

              <div className="lo-set__row lo-set__row--border lo-set__row--stack">
                <div>
                  <div className="lo-set__rowtitle">{t("review.set.retention")}</div>
                  <div className="lo-set__rowsub">{t("review.set.retentionSub")}</div>
                </div>
                <div className="lo-set__slider">
                  <input
                    type="range"
                    min={80}
                    max={95}
                    step={1}
                    value={Math.round(cfg.retention * 100)}
                    onChange={(e) => void set({ retention: Number(e.target.value) / 100 })}
                  />
                  <div className="lo-set__sliderval">%{Math.round(cfg.retention * 100)}</div>
                </div>
                <div className="lo-set__rowsub">
                  {cfg.retention <= 0.86
                    ? t("review.set.retLow")
                    : cfg.retention >= 0.93
                      ? t("review.set.retHigh")
                      : t("review.set.retMid")}
                </div>
              </div>

              <Row title={t("review.set.minutes")} sub={t("review.set.minutesSub")}>
                <Num value={cfg.minutesPerDay} min={0} max={240} onChange={(v) => void set({ minutesPerDay: v })} />
              </Row>

              <div className="lo-set__row lo-set__row--border lo-set__row--stack">
                <div>
                  <div className="lo-set__rowtitle">{t("review.set.easyDays")}</div>
                  <div className="lo-set__rowsub">{t("review.set.easyDaysSub")}</div>
                </div>
                <div className="lo-set__days">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const v = cfg.weekLoad[d] ?? 1;
                    const nextV = v === 1 ? 0.5 : v === 0.5 ? 0 : 1;
                    const cls = v === 1 ? "is-full" : v === 0.5 ? "is-half" : "is-off";
                    return (
                      <button
                        key={d}
                        className={"lo-set__day " + cls}
                        onClick={() => {
                          const w = [...cfg.weekLoad];
                          w[d] = nextV;
                          void set({ weekLoad: w });
                        }}
                      >
                        {dayNames?.[d] ?? d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Row title={t("review.set.vacation")} sub={t("review.set.vacationSub")} border={false}>
                <input
                  type="date"
                  className="lo-set__text"
                  value={cfg.vacationUntil ?? ""}
                  onChange={(e) => void set({ vacationUntil: e.target.value || null })}
                />
              </Row>
            </div>
          )}

          {tab === "advanced" && (
            <>
              <div className="lo-card lo-set__card">
                <Row title={t("review.set.newPerDay")} sub={t("review.set.newPerDaySub")}>
                  <Num value={cfg.newPerDay} min={0} max={200} onChange={(v) => void set({ newPerDay: v })} />
                </Row>
                <Row title={t("review.set.maxPerDay")} sub={t("review.set.maxPerDaySub")}>
                  <Num value={cfg.maxPerDay} min={0} max={1000} onChange={(v) => void set({ maxPerDay: v })} />
                </Row>
                <Row title={t("review.set.newIgnores")} sub={t("review.set.newIgnoresSub")}>
                  <Toggle on={cfg.newIgnoresLimit} onClick={() => void set({ newIgnoresLimit: !cfg.newIgnoresLimit })} />
                </Row>
                <Row title={t("review.set.balance")} sub={t("review.set.balanceSub")}>
                  <Toggle on={cfg.balance} onClick={() => void set({ balance: !cfg.balance })} />
                </Row>
                <Row title={t("review.set.bury")} sub={t("review.set.burySub")}>
                  <Toggle on={cfg.burySiblings} onClick={() => void set({ burySiblings: !cfg.burySiblings })} />
                </Row>
                <Row title={t("review.set.order")} sub={t("review.set.orderSub")}>
                  <select
                    className="lo-set__select"
                    value={cfg.order}
                    onChange={(e) => void set({ order: e.target.value as typeof cfg.order })}
                  >
                    <option value="risk">{t("review.set.orderRisk")}</option>
                    <option value="due">{t("review.set.orderDue")}</option>
                    <option value="random">{t("review.set.orderRandom")}</option>
                  </select>
                </Row>
                <Row title={t("review.set.leechAt")} sub={t("review.set.leechAtSub")}>
                  <Num value={cfg.leechAt} min={2} max={30} onChange={(v) => void set({ leechAt: v })} />
                </Row>
                <Row title={t("review.set.leechAction")} border={false}>
                  <select
                    className="lo-set__select"
                    value={cfg.leechAction}
                    onChange={(e) => void set({ leechAction: e.target.value as typeof cfg.leechAction })}
                  >
                    <option value="freeze">{t("review.set.leechFreeze")}</option>
                    <option value="mark">{t("review.set.leechMark")}</option>
                  </select>
                </Row>
              </div>

              <div className="lo-set__section">{t("review.set.syntax")}</div>
              <div className="lo-card lo-set__card">
                {(
                  [
                    ["basic", "Soru :: Cevap"],
                    ["reverse", "Soru ::: Cevap"],
                    ["block", "? "],
                    ["cloze", "==gizli=="],
                    ["note", "#tekrar"],
                  ] as const
                ).map(([k, sample], i, arr) => (
                  <Row
                    key={k}
                    title={t(`review.set.syn_${k}`)}
                    sub={`${t(`review.set.syn_${k}_sub`)}  —  ${sample}`}
                    border={i < arr.length - 1}
                  >
                    <Toggle
                      on={cfg.syntax[k]}
                      onClick={() => void set({ syntax: { ...cfg.syntax, [k]: !cfg.syntax[k] } })}
                    />
                  </Row>
                ))}
              </div>

              <div className="lo-set__section">{t("review.set.excluded")}</div>
              <div className="lo-card lo-set__card">
                <div className="lo-set__row" style={{ flexWrap: "wrap", gap: 6 }}>
                  {folders.length === 0 && <div className="lo-set__rowsub">{t("review.set.noFolders")}</div>}
                  {folders.map((f) => {
                    const on = cfg.excluded.includes(f);
                    return (
                      <button
                        key={f}
                        className={"lo-set__folder" + (on ? " is-off" : "")}
                        onClick={() =>
                          void set({ excluded: on ? cfg.excluded.filter((x) => x !== f) : [...cfg.excluded, f] })
                        }
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === "expert" && (
            <>
              <div className="lo-card lo-set__card">
                <Row title={t("review.set.algo")} sub={t("review.set.algoSub")}>
                  <div className="lo-set__seg">
                    <button
                      className={"lo-set__segbtn" + (cfg.algo === "new" ? " is-active" : "")}
                      onClick={() => void set({ algo: "new" })}
                    >
                      {t("review.set.algoNew")}
                    </button>
                    <button
                      className={"lo-set__segbtn" + (cfg.algo === "old" ? " is-active" : "")}
                      onClick={() => void set({ algo: "old" })}
                    >
                      {t("review.set.algoOld")}
                    </button>
                  </div>
                </Row>
                <Row title={t("review.set.learnSteps")} sub={t("review.set.learnStepsSub")}>
                  <Steps value={cfg.learnSteps} onChange={(v) => void set({ learnSteps: v })} />
                </Row>
                <Row title={t("review.set.relearnSteps")} sub={t("review.set.relearnStepsSub")}>
                  <Steps value={cfg.relearnSteps} onChange={(v) => void set({ relearnSteps: v })} />
                </Row>
                <Row title={t("review.set.maxInterval")} sub={t("review.set.maxIntervalSub")} border={false}>
                  <Num value={cfg.maxInterval} min={1} max={36500} onChange={(v) => void set({ maxInterval: v })} />
                </Row>
              </div>

              <div className="lo-set__section">{t("review.set.decks")}</div>
              <div className="lo-card lo-set__card">
                {cfg.desteler.map((d) => (
                  <div className="lo-set__row lo-set__row--border" key={d.id}>
                    <input
                      className="lo-set__text"
                      value={d.name}
                      placeholder={t("review.set.deckName")}
                      onChange={(e) => updateDeck(d.id, { name: e.target.value })}
                    />
                    <select
                      className="lo-set__select"
                      value={d.folder}
                      onChange={(e) => updateDeck(d.id, { folder: e.target.value })}
                    >
                      <option value="">{t("review.set.wholeVault")}</option>
                      {folders.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <button
                      className="lo-rev__iconbtn"
                      title={t("review.set.deckRemove")}
                      onClick={() => void set({ desteler: cfg.desteler.filter((x) => x.id !== d.id) })}
                    >
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  </div>
                ))}
                <div className="lo-set__row">
                  <button
                    className="lo-btn"
                    onClick={() =>
                      void set({
                        desteler: [
                          ...cfg.desteler,
                          { id: `d${Date.now().toString(36)}`, name: t("review.set.newDeck"), folder: "", tag: "" },
                        ],
                      })
                    }
                  >
                    <Plus size={14} strokeWidth={2.2} />
                    {t("review.set.addDeck")}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

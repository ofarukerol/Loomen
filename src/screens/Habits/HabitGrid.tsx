import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Moon, FileText, Undo2 } from "lucide-react";
import { cellState, dayList, isMilestone, type CellState, type Habit } from "../../core/habit";
import { useAppStore, useModalLayer } from "../../store/useAppStore";
import { dailyNoteFor, fmtDay, isRtl, useLongPress } from "./habitUi";

interface Cell {
  key: string;
  no: number;
  state: CellState;
}

/**
 * Gün dizisi: süre kadar hücre, 7'li satırlarda. Tıklama (ya da boşluk/Enter) çentik açar/kapar;
 * sağ tık, uzun basış ya da menü tuşu hücre menüsünü açar (mazeret, günün notu). Gelecek günler
 * tıklanmaz. Ok tuşları hücreler arasında gezer (RTL'de sağ/sol yer değiştirir). `readOnly`
 * (bırakılmış tur) yalnız gösterir.
 */
export function HabitGrid({
  habit,
  today,
  readOnly,
  cutoff = null,
}: {
  habit: Habit;
  today: string;
  readOnly: boolean;
  /** Bırakılan turda bırakma günü: sonrası "kaçırıldı" değil, işaretsiz görünür. */
  cutoff?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const toggleDay = useAppStore((s) => s.habitToggleDay);

  const cells = useMemo<Cell[]>(
    () =>
      dayList(habit).map((key, i) => ({
        key,
        no: i + 1,
        state: cutoff && key > cutoff ? "future" : (cellState(habit, key, today) ?? "future"),
      })),
    [habit, today, cutoff],
  );
  const todayIdx = cells.findIndex((c) => c.key === today);
  const [focusIdx, setFocusIdx] = useState(() => (todayIdx >= 0 ? todayIdx : 0));
  const [menu, setMenu] = useState<{ idx: number; rect: DOMRect } | null>(null);
  /** Az önce çentiklenen gün: çizim animasyonu yalnız onda oynar (açılışta bütün dizi çizilmesin). */
  const [fresh, setFresh] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Dizi kısaldı/değişti: odak dizinin içinde kalsın.
  const focus = Math.min(focusIdx, cells.length - 1);

  const canEdit = (c: Cell) => !readOnly && c.state !== "future";

  const toggle = (c: Cell) => {
    if (!canEdit(c)) return;
    if (c.state !== "done") setFresh(c.key);
    void toggleDay(habit.id, c.key);
  };

  const openMenu = (idx: number, el: HTMLElement) => {
    if (readOnly || !canEdit(cells[idx])) return;
    setFocusIdx(idx);
    setMenu({ idx, rect: el.getBoundingClientRect() });
  };

  const press = useLongPress((el) => {
    const idx = Number(el.dataset.idx);
    if (Number.isInteger(idx)) openMenu(idx, el);
  });

  const move = (to: number) => {
    const n = Math.max(0, Math.min(cells.length - 1, to));
    setFocusIdx(n);
    refs.current[n]?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const fwd = isRtl() ? -1 : 1;
    switch (e.key) {
      case "ArrowRight":
        move(idx + fwd);
        break;
      case "ArrowLeft":
        move(idx - fwd);
        break;
      case "ArrowDown":
        move(idx + 7);
        break;
      case "ArrowUp":
        move(idx - 7);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(cells.length - 1);
        break;
      case "ContextMenu":
        openMenu(idx, e.currentTarget);
        break;
      case "F10":
        if (!e.shiftKey) return;
        openMenu(idx, e.currentTarget);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const onClick = (c: Cell, idx: number) => {
    if (press.consumeClick()) return; // uzun basış menüyü açtı; bu tıklama çentik değil
    setFocusIdx(idx);
    toggle(c); // boşluk/Enter de buraya düşer (düğmenin kendi davranışı)
  };

  const onContext = (e: MouseEvent<HTMLButtonElement>, idx: number) => {
    e.preventDefault();
    if (press.firedRecently()) return;
    openMenu(idx, e.currentTarget);
  };

  const label = (c: Cell) =>
    `${t("habit.dayN", { n: c.no })} · ${fmtDay(c.key, "d MMMM yyyy, EEEE", i18n.language)} · ${t(`habit.state.${c.state}`)}`;

  return (
    <>
      <div
        className={"lo-hab-grid" + (readOnly ? " is-readonly" : "")}
        role="group"
        aria-label={t("habit.gridLabel", { name: habit.name })}
      >
        {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
          <div className="lo-hab-grid__row" key={row}>
            {cells.slice(row * 7, row * 7 + 7).map((c, j) => {
              const idx = row * 7 + j;
              const milestone = isMilestone(c.no, habit.days);
              return (
                <button
                  key={c.key}
                  ref={(el) => {
                    refs.current[idx] = el;
                  }}
                  type="button"
                  data-idx={idx}
                  className={
                    `lo-hab-cell is-${c.state}` +
                    (c.key === today ? " is-today" : "") +
                    (milestone ? " is-milestone" : "") +
                    (c.no === habit.days ? " is-last" : "") +
                    (fresh === c.key ? " is-fresh" : "")
                  }
                  tabIndex={idx === focus ? 0 : -1}
                  aria-label={label(c)}
                  aria-pressed={c.state === "done"}
                  aria-disabled={!canEdit(c)}
                  title={fmtDay(c.key, "d MMMM yyyy, EEEE", i18n.language)}
                  onClick={() => onClick(c, idx)}
                  onKeyDown={(e) => onKey(e, idx)}
                  onContextMenu={(e) => onContext(e, idx)}
                  onFocus={() => setFocusIdx(idx)}
                  onPointerDown={press.onPointerDown}
                  onPointerMove={press.onPointerMove}
                  onPointerUp={press.onPointerUp}
                  onPointerCancel={press.onPointerCancel}
                  onPointerLeave={press.onPointerLeave}
                >
                  <span className={"lo-hab-cell__no" + (milestone ? " is-ms" : "")}>{c.no}</span>
                  <CellMark state={c.state} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {menu && cells[menu.idx] && (
        <CellMenu
          habit={habit}
          cell={cells[menu.idx]}
          anchor={menu.rect}
          onToggle={() => toggle(cells[menu.idx])}
          onClose={() => {
            setMenu(null);
            refs.current[menu.idx]?.focus();
          }}
        />
      )}
    </>
  );
}

/** Hücredeki işaret: yapıldı → çizilen çentik, kaçırıldı → soluk eğik çizgi, mazeretli → hilal. */
function CellMark({ state }: { state: CellState }) {
  if (state === "excused") return <Moon className="lo-hab-cell__mark lo-hab-cell__moon" size={13} strokeWidth={2.2} aria-hidden />;
  if (state === "done")
    return (
      <svg className="lo-hab-cell__mark" viewBox="0 0 20 20" aria-hidden>
        <path className="lo-hab-tick" d="M5 10.5l3.2 3.2L15 6.8" pathLength={1} />
      </svg>
    );
  if (state === "missed")
    return (
      <svg className="lo-hab-cell__mark lo-hab-cell__slash" viewBox="0 0 20 20" aria-hidden>
        <path d="M6 14L14 6" />
      </svg>
    );
  return null;
}

/**
 * Hücre menüsü: çentik, mazeret ve "Günün notunu aç". Not yolu dailyPathFor ile üretilir; not
 * kasada yoksa seçenek pasif görünür. Günlük nota hiçbir şey yazılmaz.
 */
function CellMenu({
  habit,
  cell,
  anchor,
  onToggle,
  onClose,
}: {
  habit: Habit;
  cell: Cell;
  anchor: DOMRect;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const toggleExcused = useAppStore((s) => s.habitToggleExcused);
  const openNote = useAppStore((s) => s.openNote);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useModalLayer();

  const notePath = useMemo(() => dailyNoteFor(cell.key, notes.map((n) => n.path)), [cell.key, notes]);

  // Hücrenin altına; sığmazsa üstüne. Ekran kenarından taşmaz (RTL'de hücrenin sağ kenarına hizalı).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = isRtl() ? anchor.right - w : anchor.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    let top = anchor.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, anchor.top - h - 6);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const onResize = () => closeRef.current();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const n = items.length;
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + n) % n]?.focus();
  };

  const done = cell.state === "done";
  const excused = cell.state === "excused";

  return createPortal(
    <div
      ref={ref}
      className="lo-hab-menu"
      role="menu"
      aria-label={t("habit.dayN", { n: cell.no })}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}
      onKeyDown={onMenuKey}
    >
      <div className="lo-hab-menu__head">
        <span className="lo-hab-menu__day">{t("habit.dayN", { n: cell.no })}</span>
        <span className="lo-hab-menu__date">{fmtDay(cell.key, "d MMMM, EEEE", i18n.language)}</span>
      </div>
      <button
        type="button"
        role="menuitem"
        className="lo-hab-menu__item"
        onClick={() => {
          onToggle();
          onClose();
        }}
      >
        {done ? <Undo2 size={15} strokeWidth={2} aria-hidden /> : <Check size={15} strokeWidth={2.2} aria-hidden />}
        {done ? t("habit.menu.undo") : t("habit.menu.done")}
      </button>
      <button
        type="button"
        role="menuitem"
        className="lo-hab-menu__item"
        onClick={() => {
          void toggleExcused(habit.id, cell.key);
          onClose();
        }}
      >
        <Moon size={15} strokeWidth={2} aria-hidden />
        <span className="lo-hab-menu__text">
          {excused ? t("habit.menu.unexcuse") : t("habit.menu.excuse")}
          {!excused && <span className="lo-hab-menu__hint">{t("habit.menu.excuseHint")}</span>}
        </span>
      </button>
      <div className="lo-hab-menu__sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="lo-hab-menu__item"
        disabled={!notePath}
        onClick={() => {
          if (!notePath) return;
          onClose();
          void openNote(notePath);
        }}
      >
        <FileText size={15} strokeWidth={2} aria-hidden />
        <span className="lo-hab-menu__text">
          {t("habit.menu.openNote")}
          {!notePath && <span className="lo-hab-menu__hint">{t("habit.menu.noNote")}</span>}
        </span>
      </button>
    </div>,
    document.body,
  );
}

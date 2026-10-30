import { useDeferredValue, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Play, Pencil, Trash2, Search, ClipboardPaste, FileUp, Plus, Check, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { listCards, removeRow, rowExists, searchRows, updateRow, type ListRow, type ReviewList } from "../../core/srs";
import { HabitConfirm } from "../Habits/HabitConfirm";
import { colorVars } from "../Habits/habitUi";
import { ListForm } from "./ListForm";
import { PasteDialog } from "./PasteDialog";
import { ListStats, useListToday } from "./ListCard";

const PAGE = 200;

type PasteState = { text: string; csv: boolean; fromFile: boolean };

/**
 * Bir tekrar listesinin ayrıntısı: sayılar, Çalış, düzenle/sil, arama, "yalnız zorlar", tek satır
 * ekleme, toplu yapıştırma, dosyadan alma ve satır düzenle/sil. Her değişiklik srsListSave ile
 * yalnız liste dosyasına yazılır; notlara dokunulmaz. Satırlar sayfalı gösterilir (1000+ satır).
 */
export function ListDetail({ list, autoPaste, onAutoPasteDone }: { list: ReviewList; autoPaste?: boolean; onAutoPasteDone?: () => void }) {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.srsOpenList);
  const study = useAppStore((s) => s.srsStartList);
  const save = useAppStore((s) => s.srsListSave);
  const del = useAppStore((s) => s.srsListDelete);
  const states = useAppStore((s) => s.srsStates);
  const today = useListToday(list);

  const [query, setQuery] = useState("");
  const q = useDeferredValue(query);
  const [hardOnly, setHardOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [note, setNote] = useState("");
  // orig: düzenleme açıldığındaki satır — senkronla satırlar kayarsa doğru satır bulunur.
  const [edit, setEdit] = useState<{ i: number; orig: ListRow; row: ListRow } | null>(null);
  const [confirmRow, setConfirmRow] = useState<number | null>(null);
  const [confirmList, setConfirmList] = useState(false);
  const [editing, setEditing] = useState(false);
  const [paste, setPaste] = useState<PasteState | null>(autoPaste ? { text: "", csv: false, fromFile: false } : null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const frontRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Çok unutulan kartı olan satırlar (iki yöndeki kartlara bakılır).
  const hard = useMemo(() => {
    const out = new Set<number>();
    for (const c of listCards({ ...list, direction: "both" })) if (states[c.id]?.leech) out.add(c.line);
    return out;
  }, [list, states]);

  const shown = useMemo(() => {
    const hits = searchRows(list.rows, q);
    return hardOnly ? hits.filter((i) => hard.has(i)) : hits;
  }, [list.rows, q, hardOnly, hard]);

  /** Pencere açıkken senkronla gelen değişiklik kaybolmasın: işlem en güncel listeye uygulanır. */
  const latest = () => useAppStore.getState().srsLists.find((l) => l.id === list.id) ?? list;

  const persist = async (next: ReviewList) => {
    if (next === latest()) return true;
    setBusy(true);
    setErr(null);
    try {
      await save(next);
      return true;
    } catch (e) {
      console.error("[srs] liste kaydedilemedi:", e);
      setErr(t("review.lists.detail.saveError"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const exists = front.trim() !== "" && rowExists(list.rows, front);
  const canAdd = front.trim() !== "" && back.trim() !== "" && !exists && !busy;

  const addOne = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    const cur = latest();
    if (rowExists(cur.rows, front)) return;
    const row: ListRow = note.trim() ? { front, back, note } : { front, back };
    if (await persist({ ...cur, rows: [...cur.rows, row] })) {
      setFront("");
      setBack("");
      setNote("");
      frontRef.current?.focus();
    }
  };

  const editExists = edit ? rowExists(list.rows, edit.row.front, edit.i) : false;
  const editOk = !!edit && edit.row.front.trim() !== "" && edit.row.back.trim() !== "" && !editExists;

  const saveEdit = async () => {
    if (!edit || !editOk || busy) return;
    const cur = latest();
    const at = cur.rows[edit.i] === edit.orig ? edit.i : cur.rows.findIndex((x) => x.front === edit.orig.front);
    if (at < 0) return setEdit(null);
    const next = updateRow(cur, at, edit.row);
    if (next === cur || (await persist(next))) setEdit(null);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setPaste({ text, csv: /\.csv$/i.test(file.name), fromFile: true });
    };
    reader.onerror = () => setErr(t("review.lists.paste.fileError"));
    reader.readAsText(file);
  };

  const closePaste = () => {
    setPaste(null);
    onAutoPasteDone?.();
  };

  const visible = shown.slice(0, limit);

  return (
    <div className="lo-rdet" style={colorVars(list.color)}>
      <button className="lo-hab-back lo-rdet__back" onClick={() => open(null)}>
        <ArrowLeft size={15} strokeWidth={2} className="lo-rdet__backicon" />
        {t("review.lists.detail.backToLists")}
      </button>

      <div className="lo-card lo-rdet__head">
        <div className="lo-rlist-card__head">
          <span className="lo-rlist-card__emoji" aria-hidden>
            {list.emoji}
          </span>
          <div className="lo-rlist-card__titles">
            <h1 className="lo-rdet__name">{list.name}</h1>
            <div className="lo-rlist-card__rows">{t("review.lists.card.rows", { n: list.rows.length })}</div>
          </div>
        </div>
        <ListStats list={list} today={today} />
        <div className="lo-rdet__actions">
          <button className="lo-btn lo-btn--primary lo-rlist-card__study" disabled={today === 0} onClick={() => study(list.id)}>
            {today === 0 ? (
              t("review.lists.card.nothingToday")
            ) : (
              <>
                <Play size={14} strokeWidth={2.2} />
                {t("review.lists.card.study")}
              </>
            )}
          </button>
          <button className="lo-btn" onClick={() => setEditing(true)}>
            <Pencil size={14} strokeWidth={2} />
            {t("review.lists.detail.edit")}
          </button>
          <button className="lo-btn lo-hab-btn--ghostdanger" onClick={() => setConfirmList(true)}>
            <Trash2 size={14} strokeWidth={2} />
            {t("review.lists.detail.deleteList")}
          </button>
        </div>
      </div>

      <div className="lo-rdet__tools">
        <label className="lo-rdet__search">
          <Search size={14} strokeWidth={2} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder={t("review.lists.detail.search")}
            aria-label={t("review.lists.detail.search")}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
        </label>
        <div className="lo-rdet__toolbtns">
          {hard.size > 0 && (
            <button
              className={"lo-hab-chip" + (hardOnly ? " is-on" : "")}
              aria-pressed={hardOnly}
              onClick={() => {
                setHardOnly((v) => !v);
                setLimit(PAGE);
              }}
            >
              {t("review.lists.detail.hardOnly")} · {hard.size}
            </button>
          )}
          <button className="lo-btn" onClick={() => setPaste({ text: "", csv: false, fromFile: false })}>
            <ClipboardPaste size={14} strokeWidth={2} />
            {t("review.lists.detail.paste")}
          </button>
          <button className="lo-btn" onClick={() => fileRef.current?.click()}>
            <FileUp size={14} strokeWidth={2} />
            {t("review.lists.detail.importFile")}
          </button>
          <input ref={fileRef} type="file" accept=".txt,.csv,text/plain,text/csv" hidden onChange={onFile} />
        </div>
      </div>

      <form className="lo-card lo-rdet__add" onSubmit={(e) => void addOne(e)}>
        <div className="lo-rdet__addtitle">{t("review.lists.detail.addRow")}</div>
        <div className="lo-rdet__fields">
          <input
            ref={frontRef}
            className={"lo-hab-input" + (exists ? " is-invalid" : "")}
            value={front}
            dir="auto"
            maxLength={500}
            placeholder={t("review.lists.detail.frontPh")}
            aria-label={t("review.lists.detail.frontPh")}
            aria-invalid={exists}
            onChange={(e) => setFront(e.target.value)}
          />
          <input
            className="lo-hab-input"
            value={back}
            dir="auto"
            maxLength={500}
            placeholder={t("review.lists.detail.backPh")}
            aria-label={t("review.lists.detail.backPh")}
            onChange={(e) => setBack(e.target.value)}
          />
          <input
            className="lo-hab-input lo-rdet__note"
            value={note}
            dir="auto"
            maxLength={500}
            placeholder={t("review.lists.detail.notePh")}
            aria-label={t("review.lists.detail.notePh")}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="submit" className="lo-btn lo-btn--primary lo-rdet__addbtn" disabled={!canAdd}>
            <Plus size={14} strokeWidth={2.2} />
            {t("review.lists.detail.add")}
          </button>
        </div>
        {exists && <div className="lo-hab-field__err">{t("review.lists.detail.rowExists")}</div>}
      </form>

      {err && (
        <div className="lo-hab-form__error lo-rdet__err" role="alert">
          {err}
        </div>
      )}

      {list.rows.length === 0 ? (
        <div className="lo-rdet__empty">{t("review.lists.detail.noRows")}</div>
      ) : shown.length === 0 ? (
        <div className="lo-rdet__empty">{t("review.lists.detail.noMatch")}</div>
      ) : (
        <>
          {(q.trim() || hardOnly) && <div className="lo-rdet__count">{t("review.lists.detail.count", { n: shown.length })}</div>}
          <div className="lo-card lo-rdet__rows">
            {visible.map((i) => {
              const r = list.rows[i];
              if (!r) return null;
              if (edit?.i === i) {
                return (
                  <form
                    className="lo-rdet__row is-editing"
                    key={i}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveEdit();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setEdit(null);
                      }
                    }}
                  >
                    <div className="lo-rdet__fields">
                      {(["front", "back", "note"] as const).map((k) => (
                        <input
                          key={k}
                          className={
                            "lo-hab-input" + (k === "note" ? " lo-rdet__note" : "") + (k === "front" && editExists ? " is-invalid" : "")
                          }
                          value={edit.row[k] ?? ""}
                          dir="auto"
                          maxLength={500}
                          autoFocus={k === "front"}
                          placeholder={t(`review.lists.detail.${k}Ph`)}
                          aria-label={t(`review.lists.detail.${k}Ph`)}
                          onChange={(e) => setEdit({ ...edit, row: { ...edit.row, [k]: e.target.value } })}
                        />
                      ))}
                    </div>
                    {editExists && <div className="lo-hab-field__err">{t("review.lists.detail.rowExists")}</div>}
                    <div className="lo-rdet__rowbtns">
                      <button type="button" className="lo-btn" onClick={() => setEdit(null)}>
                        <X size={14} strokeWidth={2} />
                        {t("review.lists.detail.cancel")}
                      </button>
                      <button type="submit" className="lo-btn lo-btn--primary" disabled={!editOk || busy}>
                        <Check size={14} strokeWidth={2.2} />
                        {t("review.lists.form.save")}
                      </button>
                    </div>
                  </form>
                );
              }
              return (
                <div className="lo-rdet__row" key={i}>
                  <div className="lo-rdet__text">
                    <span className="lo-rdet__front" dir="auto">
                      {r.front}
                    </span>
                    <span className="lo-rdet__backtext" dir="auto">
                      {r.back}
                    </span>
                    {r.note && (
                      <span className="lo-rdet__notetext" dir="auto">
                        {r.note}
                      </span>
                    )}
                  </div>
                  {hard.has(i) && <span className="lo-rev__leech lo-rdet__hard">{t("review.lists.detail.hard")}</span>}
                  <div className="lo-rdet__rowbtns">
                    <button
                      className="lo-rev__iconbtn"
                      title={t("review.lists.detail.edit")}
                      aria-label={t("review.lists.detail.edit")}
                      onClick={() => setEdit({ i, orig: r, row: { ...r } })}
                    >
                      <Pencil size={14} strokeWidth={2} />
                    </button>
                    <button
                      className="lo-rev__iconbtn lo-rdet__del"
                      title={t("review.lists.detail.deleteRow")}
                      aria-label={t("review.lists.detail.deleteRow")}
                      onClick={() => setConfirmRow(i)}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {shown.length > limit && (
            <button className="lo-btn lo-rdet__more" onClick={() => setLimit((n) => n + PAGE)}>
              {t("review.lists.detail.showMore", { n: Math.min(PAGE, shown.length - limit) })}
            </button>
          )}
        </>
      )}

      {editing && <ListForm list={list} onClose={() => setEditing(false)} />}
      {paste && (
        <PasteDialog list={list} initialText={paste.text} csv={paste.csv} fromFile={paste.fromFile} onClose={closePaste} />
      )}
      {confirmRow != null && (
        <HabitConfirm
          title={t("review.lists.detail.deleteRowTitle")}
          body={t("review.lists.detail.deleteRowBody")}
          confirmLabel={t("review.lists.detail.deleteConfirm")}
          danger
          onConfirm={async () => {
            const cur = latest();
            const row = list.rows[confirmRow];
            // Satır kaydıysa (senkron) güncel listede aynı satır aranır.
            const at = cur.rows[confirmRow] === row ? confirmRow : cur.rows.findIndex((x) => x.front === row?.front);
            if (at >= 0) await persist(removeRow(cur, at));
            if (edit?.i === confirmRow) setEdit(null);
          }}
          onClose={() => setConfirmRow(null)}
        />
      )}
      {confirmList && (
        <HabitConfirm
          title={t("review.lists.detail.deleteTitle", { name: list.name })}
          body={t("review.lists.detail.deleteBody")}
          confirmLabel={t("review.lists.detail.deleteConfirm")}
          danger
          onConfirm={async () => {
            try {
              await del(list.id);
            } catch (e) {
              console.error("[srs] liste silinemedi:", e);
              setErr(t("review.lists.detail.saveError"));
            }
          }}
          onClose={() => setConfirmList(false)}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, BookMarked, Import, Loader2, Plus, Tablet } from "lucide-react";
import { SHELF_FILTERS, shelfBooks, shelfCounts, type Book } from "../../core/library";
import { isTauri } from "../../core/vault";
import { useAppStore } from "../../store/useAppStore";
import { HabitConfirm } from "../Habits/HabitConfirm";
import { BookCard } from "./BookCard";

/**
 * Kütüphane rafı (LOM-83): Okunuyor / Okunacak / Bitti süzgeci, içe aktarma ve kitap kartları.
 * Kayıtlar kasadaki Kütüphane/<id>.json dosyalarından gelir; kitap dosyası uygulama klasöründedir.
 * Kindle (LOM-84): "Kindle'dan al" bağlı Kindle'ın çizim dosyasını, yoksa seçilen dosyayı alır;
 * ekran açılınca ve pencere odak alınca Kindle aranır, bulunursa rafın üstünde şerit çıkar.
 * KOReader (LOM-94): "KOReader'dan al" kitabın yanındaki metadata.*.lua ya da JSON dışa aktarımını seçtirir.
 */
export function LibraryScreen() {
  const { t } = useTranslation();
  const books = useAppStore((s) => s.books);
  const loaded = useAppStore((s) => s.booksLoaded);
  const broken = useAppStore((s) => s.libraryBroken);
  const filter = useAppStore((s) => s.libraryFilter);
  const busy = useAppStore((s) => s.libraryBusy);
  const setFilter = useAppStore((s) => s.librarySetFilter);
  const doImport = useAppStore((s) => s.libraryImport);
  const load = useAppStore((s) => s.libraryLoad);
  const loadCovers = useAppStore((s) => s.libraryLoadCovers);
  const remove = useAppStore((s) => s.libraryRemove);
  const kindlePath = useAppStore((s) => s.kindleDevicePath);
  const probeKindle = useAppStore((s) => s.libraryProbeKindle);
  const importKindle = useAppStore((s) => s.libraryImportKindle);
  const importKoreader = useAppStore((s) => s.libraryImportKoreader);
  const [confirm, setConfirm] = useState<Book | null>(null);

  useEffect(() => {
    if (!loaded) void load().catch((e) => console.error("[library] okunamadı:", e));
  }, [loaded, load]);
  const ids = books.map((b) => b.id).join("|");
  useEffect(() => {
    if (loaded) void loadCovers();
  }, [loaded, ids, loadCovers]);

  useEffect(() => {
    if (!isTauri()) return;
    void probeKindle();
    const onFocus = () => void probeKindle();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [probeKindle]);

  const counts = useMemo(() => shelfCounts(books), [books]);
  const shown = useMemo(() => shelfBooks(books, filter), [books, filter]);
  const app = isTauri();

  const addBtn = (
    <button type="button" className="lo-btn lo-btn--primary lo-lib-add" onClick={() => void doImport()} disabled={busy || !app}>
      {busy ? <Loader2 size={16} strokeWidth={2.2} className="lo-spin" aria-hidden /> : <Plus size={16} strokeWidth={2.2} aria-hidden />}
      <span>{busy ? t("library.importing") : t("library.add")}</span>
    </button>
  );

  const kindleBtn = (
    <button type="button" className="lo-btn lo-lib-kindle-btn" onClick={() => void importKindle("auto")} disabled={busy || !app}>
      <Tablet size={16} strokeWidth={2.2} aria-hidden />
      <span>{t("library.kindle.import")}</span>
    </button>
  );

  const koreaderBtn = (
    <button type="button" className="lo-btn lo-lib-kindle-btn" onClick={() => void importKoreader()} disabled={busy || !app}>
      <Import size={16} strokeWidth={2.2} aria-hidden />
      <span>{t("library.koreader.import")}</span>
    </button>
  );

  return (
    <div className="lo-lib">
      <div className="lo-lib__inner">
        <header className="lo-lib-head">
          <h1 className="lo-lib-head__title">{t("library.title")}</h1>
          {books.length > 0 && (
            <div className="lo-lib-head__actions">
              {kindleBtn}
              {koreaderBtn}
              {addBtn}
            </div>
          )}
        </header>

        {kindlePath && app && (
          <div className="lo-lib-kindle" role="status">
            <Tablet size={15} strokeWidth={2} aria-hidden />
            <span>{t("library.kindle.detected")}</span>
            <button type="button" className="lo-btn lo-btn--primary lo-lib-kindle__take" onClick={() => void importKindle("auto")} disabled={busy}>
              {busy ? <Loader2 size={14} strokeWidth={2.2} className="lo-spin" aria-hidden /> : null}
              <span>{t("library.kindle.take")}</span>
            </button>
          </div>
        )}

        {broken.length > 0 && (
          <div className="lo-hab-warn" role="status">
            <AlertTriangle size={15} strokeWidth={2} aria-hidden />
            <span>
              {t("library.broken", { count: broken.length })}
              <span className="lo-hab-warn__files" dir="ltr">
                {broken.slice(0, 3).join(", ")}
                {broken.length > 3 ? "…" : ""}
              </span>
            </span>
          </div>
        )}

        {!loaded ? (
          <div className="lo-lib-empty">{t("library.loading")}</div>
        ) : books.length === 0 ? (
          <div className="lo-lib-empty">
            <BookMarked size={34} strokeWidth={1.5} aria-hidden />
            <h2>{t("library.emptyTitle")}</h2>
            <p>{app ? t("library.emptyBody") : t("library.appOnly")}</p>
            <div className="lo-lib-head__actions">
              {addBtn}
              {kindleBtn}
              {koreaderBtn}
            </div>
          </div>
        ) : (
          <>
            <div className="lo-hab-tabs" role="tablist" aria-label={t("library.title")}>
              {SHELF_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  className={"lo-hab-tab" + (filter === f ? " is-on" : "")}
                  onClick={() => setFilter(f)}
                >
                  {t(`library.filter.${f}`)}
                  <span className="lo-hab-tab__count">{counts[f]}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <div className="lo-lib-empty is-small">{t("library.filterEmpty")}</div>
            ) : (
              <div className="lo-lib-grid">
                {shown.map((b) => (
                  <BookCard key={b.id} book={b} onRemove={setConfirm} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {confirm && (
        <HabitConfirm
          title={t("library.removeTitle", { name: confirm.title })}
          body={t("library.removeBody")}
          confirmLabel={t("library.remove")}
          danger
          onConfirm={() => remove(confirm.id)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, FileText, MoreHorizontal, NotebookText, Trash2 } from "lucide-react";
import { BOOK_STATUSES, hasBookFile, type Book, type BookStatus } from "../../core/library";
import { useAppStore, useModalLayer } from "../../store/useAppStore";

/** Kapak yoksa başlıktan renkli bir yüzey (aynı kitap her zaman aynı ton). */
function hue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/**
 * Raftaki kitap (LOM-83, K1): kapak, başlık, yazar, ilerleme ve durum. Karta dokununca kitap
 * açılır; durum seçicisi kasadaki kayda yazar. ⋯ menüsünde not ve raftan kaldırma.
 * Kindle kitabının (LOM-84) dosyası yok: karta dokununca kitabın notu açılır, "Oku" ve ilerleme yok.
 */
export function BookCard({ book, onRemove }: { book: Book; onRemove: (b: Book) => void }) {
  const { t } = useTranslation();
  const cover = useAppStore((s) => s.libraryCovers[book.id]);
  const open = useAppStore((s) => s.libraryOpenReader);
  const setStatus = useAppStore((s) => s.librarySetStatus);
  const openNote = useAppStore((s) => s.libraryOpenNote);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Android geri tuşu açık menüyü kapatsın (ekrandan çıkmasın); kapatma yolu Escape.
  useModalLayer(menu);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const readable = hasBookFile(book);
  const pct = readable && book.progress !== undefined ? Math.round(book.progress * 100) : null;
  const onOpen = () => (readable ? open(book.id) : void openNote(book.id));
  const count = book.highlights.length;

  return (
    <article className={"lo-book is-" + book.status} data-book={book.id}>
      <button
        type="button"
        className="lo-book__cover"
        onClick={onOpen}
        aria-label={readable ? t("library.open", { name: book.title }) : t("library.kindle.openNote", { name: book.title })}
      >
        {cover ? (
          <img src={cover} alt="" draggable={false} />
        ) : (
          <span className="lo-book__blank" style={{ ["--book-h" as string]: String(hue(book.id)) }}>
            <span className="lo-book__blank-title">{book.title}</span>
            <span className="lo-book__fmt">{readable ? book.format.toUpperCase() : t("library.kindle.badge")}</span>
          </span>
        )}
        {pct !== null && book.status === "reading" && (
          <span className="lo-book__bar" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </button>
      <div className="lo-book__meta">
        <div className="lo-book__title" title={book.title}>
          {book.title}
        </div>
        {book.author && <div className="lo-book__author">{book.author}</div>}
        <div className="lo-book__row">
          <select
            className="lo-book__status"
            value={book.status}
            aria-label={t("library.statusLabel")}
            onChange={(e) => void setStatus(book.id, e.target.value as BookStatus)}
          >
            {BOOK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`library.status.${s}`)}
              </option>
            ))}
          </select>
          {count > 0 && (
            <span className="lo-book__count" title={t("library.highlightsCount", { count })}>
              <FileText size={12} strokeWidth={2} aria-hidden />
              {count}
            </span>
          )}
          {pct !== null && <span className="lo-book__pct">%{pct}</span>}
          <div className="lo-book__menu" ref={menuRef}>
            <button
              type="button"
              className="lo-lib-iconbtn"
              aria-label={t("library.more")}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              <MoreHorizontal size={16} strokeWidth={2} />
            </button>
            {menu && (
              <div className="lo-book__dropdown" role="menu">
                {readable && (
                  <button type="button" role="menuitem" onClick={() => (setMenu(false), open(book.id))}>
                    <BookOpen size={14} strokeWidth={2} aria-hidden />
                    {t("library.read")}
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => (setMenu(false), void openNote(book.id))}>
                  <NotebookText size={14} strokeWidth={2} aria-hidden />
                  {t("library.openNote")}
                </button>
                <button type="button" role="menuitem" className="is-danger" onClick={() => (setMenu(false), onRemove(book))}>
                  <Trash2 size={14} strokeWidth={2} aria-hidden />
                  {t("library.remove")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

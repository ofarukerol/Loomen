import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { useAppStore, useModalLayer } from "../../store/useAppStore";
import type { VaultNote } from "../../core/vault/types";
import { filterNotes } from "./selectionActions";

const LIMIT = 50;

/**
 * Seçili metne bağlantı penceresi (LOM-110). Üstte seçili metin, altında arama kutusu ve
 * not listesi (açık not hariç). Ok tuşları gezinir, Enter ya da dokunma seçer; Escape /
 * zemin vazgeçer.
 */
export function LinkNoteDialog({
  text,
  currentPath,
  onPick,
  onClose,
}: {
  text: string;
  currentPath: string;
  onPick: (note: VaultNote) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useModalLayer();

  const results = useMemo(() => filterNotes(notes, query, LIMIT, currentPath), [notes, query, currentPath]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const n = results[active];
      if (n) onPick(n);
    }
  };

  return createPortal(
    <div className="lo-modal" onClick={onClose}>
      <div
        className="lo-sellink"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lo-sellink-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lo-sellink-title" className="lo-sellink__title">
          {t("selbar.linkTitle")}
        </h2>
        <blockquote className="lo-sellink__quote">{text.replace(/\s+/g, " ").trim()}</blockquote>
        <input
          ref={inputRef}
          className="lo-sellink__search"
          type="search"
          value={query}
          placeholder={t("selbar.searchPlaceholder")}
          aria-controls="lo-sellink-list"
          aria-activedescendant={results[active] ? `lo-sellink-${active}` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul id="lo-sellink-list" ref={listRef} className="lo-sellink__list lo-scroll" role="listbox">
          {results.length === 0 ? (
            <li className="lo-sellink__empty">{t("selbar.noResult")}</li>
          ) : (
            results.map((n, i) => (
              <li
                key={n.path}
                id={`lo-sellink-${i}`}
                role="option"
                aria-selected={i === active}
                className={"lo-sellink__item" + (i === active ? " is-active" : "")}
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(n)}
              >
                <FileText size={14} strokeWidth={1.8} aria-hidden />
                <span className="lo-sellink__name">{n.name}</span>
                {n.folder && <span className="lo-sellink__folder">{n.folder}</span>}
              </li>
            ))
          )}
        </ul>
        <div className="lo-sellink__actions">
          <button type="button" className="lo-btn" onClick={onClose}>
            {t("selbar.cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

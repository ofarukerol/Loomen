import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PanelLeft, BookOpen, CalendarDays, MoreVertical, SquarePen } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

/**
 * Mobil üst bar: solda menü (drawer), sağda günlük-not toggle + ⋮ menü.
 * - Kitap ikonu: planner/başka nottayken → günlük notu açar; günlük nottayken → planlayıcıya döner.
 * - ⋮ menüsü: not editöründeyken okuma/düzenleme modunu değiştirir (masaüstündeki .lo-modetoggle'ın
 *   mobil karşılığı; EditorScreen'deki buton mobilde gizli).
 */
export function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  const screen = useAppStore((s) => s.screen);
  const activeNote = useAppStore((s) => s.activeNote);
  const editing = useAppStore((s) => s.editing);
  const setScreen = useAppStore((s) => s.setScreen);
  const goToDayNote = useAppStore((s) => s.goToDayNote);
  const toggleEditing = useAppStore((s) => s.toggleEditing);
  const saveNote = useAppStore((s) => s.saveNote);

  // Ekran bazlı toggle: planner'dayken günlük notu aç; başka her yerdeyken planner'a (ana sayfa) dön.
  const isPlanner = screen === "planner";
  const inEditor = screen === "editor";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [menuOpen]);
  // Ekran değişince menüyü kapat
  useEffect(() => setMenuOpen(false), [screen, activeNote]);

  const onBook = () => {
    if (isPlanner) void goToDayNote();
    else setScreen("planner");
  };
  // Okuma moduna geçerken son hâli kaydet (EditorScreen'deki toggleMode ile aynı davranış).
  const onToggleMode = async () => {
    if (editing) await saveNote();
    toggleEditing();
    setMenuOpen(false);
  };

  return (
    <div className="lo-mtop">
      <button className="lo-mtop__btn" onClick={onMenu} title={t("mobile.menu")}>
        <PanelLeft size={20} strokeWidth={1.9} />
      </button>

      <div className="lo-mtop__spacer" />

      <div className="lo-mtop__right">
        <button
          className="lo-mtop__btn"
          onClick={onBook}
          title={isPlanner ? t("ribbon.dayNote") : t("mobile.planner")}
        >
          {isPlanner ? (
            <BookOpen size={20} strokeWidth={1.9} />
          ) : (
            <CalendarDays size={20} strokeWidth={1.9} />
          )}
        </button>

        <div className="lo-mtop__menu" ref={menuRef}>
          <button
            className={"lo-mtop__btn" + (menuOpen ? " is-active" : "")}
            onClick={() => setMenuOpen((o) => !o)}
            title={t("mobile.more")}
          >
            <MoreVertical size={20} strokeWidth={1.9} />
          </button>
          {menuOpen && (
            <div className="lo-mtop__dropdown" role="menu">
              {inEditor ? (
                <button className="lo-mtop__item" onClick={() => void onToggleMode()} role="menuitem">
                  {editing ? <BookOpen size={16} strokeWidth={1.9} /> : <SquarePen size={16} strokeWidth={1.9} />}
                  <span>{editing ? t("editor.reading") : t("editor.edit")}</span>
                </button>
              ) : (
                <div className="lo-mtop__item lo-mtop__item--empty">{t("mobile.noActions")}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

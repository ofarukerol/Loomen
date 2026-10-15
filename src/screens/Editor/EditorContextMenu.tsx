import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "../../hooks/useIsMobile";
import { notifyError, useAppStore } from "../../store/useAppStore";
import {
  Link2,
  ExternalLink,
  Paintbrush,
  Pilcrow,
  ListPlus,
  Bold,
  Italic,
  Strikethrough,
  Highlighter,
  Code,
  Code2,
  Eraser,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  AlignLeft,
  Table,
  Minus,
  MessageSquareQuote,
  Scissors,
  Copy,
  ClipboardPaste,
  TextSelect,
  ChevronRight,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
} from "lucide-react";
import type { EditorView } from "@codemirror/view";
import type { ClipboardIO } from "./editorCommands";
import {
  MENU,
  activate,
  clampMenuPosition,
  createActivationGate,
  runCommand,
  viewportChangeAction,
  type MenuNode,
  type Size,
} from "./contextMenuModel";

const HEAD_ICONS = [Heading1, Heading2, Heading3, Heading4, Heading5, Heading6];

// Öğe ağacı contextMenuModel'de (testlerden koşulabilsin diye); ikonlar yalnız burada.
const ICONS: Record<string, typeof Bold> = {
  wlink: Link2,
  elink: ExternalLink,
  fmt: Paintbrush,
  para: Pilcrow,
  ins: ListPlus,
  b: Bold,
  i: Italic,
  st: Strikethrough,
  hl: Highlighter,
  code: Code,
  clr: Eraser,
  ul: List,
  ol: ListOrdered,
  cl: ListChecks,
  h0: AlignLeft,
  q: Quote,
  tbl: Table,
  cal: MessageSquareQuote,
  hr: Minus,
  cb: Code2,
  cut: Scissors,
  copy: Copy,
  paste: ClipboardPaste,
  selall: TextSelect,
  ...Object.fromEntries(HEAD_ICONS.map((I, k) => ["h" + (k + 1), I])),
};

const viewport = (): Size => ({ w: window.innerWidth, h: window.innerHeight });

export function EditorContextMenu({
  x,
  y,
  openedBy = "mouse",
  getView,
  onClose,
}: {
  x: number;
  y: number;
  /** Dokunmayla (uzun basma) açıldıysa parmak kalkana kadar menüdeki tıklamalar yok sayılır. */
  openedBy?: "mouse" | "touch";
  getView: () => EditorView | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const platformMobile = useAppStore((s) => s.platformMobile);
  const isMobile = useIsMobile() || platformMobile;
  const [openSub, setOpenSub] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Yalnız yükseklik değişen boyutlanmada konumu yeniden hesaplatmak için sayaç.
  const [reclamp, setReclamp] = useState(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const gate = useRef(createActivationGate({ openedBy })).current;

  // Dışarı basmada kapat. "click" DEĞİL "pointerdown": menü dokunmatikte uzun basmayla açılıyor
  // ve parmak kalkınca gelen click menüyü aynı anda kapatıyordu.
  // Boyutlanma doğrudan kapatmaz: Android'de menüye dokununca klavye açılıp kapanabilir ve
  // WebView yalnız yüksekliğini değiştirir — eskiden bu "resize" menüyü kapatıyordu ve grup
  // başlığına (Ekle) basınca alt öğeler görünmeden menü kayboluyordu.
  useEffect(() => {
    let before = viewport();
    const close = (e: Event) => {
      // Menünün içine basmak kapatmaz (akordeon başlığına dokunmak menüyü kapatmasın).
      if (e.type === "pointerdown" && e.target instanceof Element && e.target.closest(".lo-ctxmenu")) return;
      onCloseRef.current();
    };
    const onResize = () => {
      const after = viewport();
      const action = viewportChangeAction(before, after);
      before = after;
      if (action === "close") onCloseRef.current();
      else if (action === "reclamp") setReclamp((n) => n + 1);
    };
    // Uzun basmanın parmağı kalkınca kapı açılır. Aynı kalkışın click'i pointerup'tan SONRA
    // geldiği için açılış bir tur ertelenir; yoksa parmağın altındaki öğe çalışırdı.
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    const onLift = () => {
      if (releaseTimer == null) releaseTimer = setTimeout(() => gate.release(), 50);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", close);
    window.addEventListener("pointerup", onLift);
    window.addEventListener("pointercancel", onLift);
    return () => {
      if (releaseTimer != null) clearTimeout(releaseTimer);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", close);
      window.removeEventListener("pointerup", onLift);
      window.removeEventListener("pointercancel", onLift);
    };
  }, [gate]);

  // Menüyü ÖLÇTÜKTEN sonra ekranın içine kenetle. Önceden sabit tahminler (250×360) kullanılıyordu;
  // dar ekranda ve sağdan sola (Arapça) düzende menü ekranın dışına taşıyordu. Akordeon açılıp
  // kapandıkça yükseklik değiştiği için openSub de bağımlılıkta; klavye yüzünden yükseklik
  // değişince reclamp.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(clampMenuPosition({ x, y, w: width, h: height, vw: window.innerWidth, vh: window.innerHeight }));
  }, [x, y, openSub, reclamp]);

  // Panoya erişilemeyince sessiz kalma: kullanıcıya bilgi ver.
  const io: ClipboardIO = {
    notify: (key) => void notifyError(t("ctx." + key), "info"),
  };

  const act = (node: MenuNode) => {
    if (!gate.ready()) return;
    activate((v) => runCommand(v, node, io), getView, onClose);
  };

  const toggleSub = (id: string) => {
    if (!gate.ready()) return;
    setOpenSub((s) => (s === id ? null : id));
  };

  const label = (n: MenuNode) => (n.labelKey ? t(n.labelKey, n.labelArgs) : "");
  const icon = (n: MenuNode) => {
    const Node = ICONS[n.id];
    return Node ? <Node size={14} strokeWidth={1.9} /> : null;
  };

  const leaf = (n: MenuNode) => (
    <button key={n.id} className="lo-ctxmenu__item" onClick={() => act(n)}>
      <span className="lo-ctxmenu__ic">{icon(n)}</span>
      {label(n)}
    </button>
  );

  return (
    <div
      ref={ref}
      className="lo-ctxmenu lo-ctxmenu--editor"
      style={{ left: pos?.left ?? x, top: pos?.top ?? y }}
      onClick={(e) => e.stopPropagation()}
      // Menü "dışarı basma" ile kapanıyor; menünün içindeki basma dışarı sayılmasın.
      onPointerDown={(e) => e.stopPropagation()}
      // Düğmeye basmak editörün odağını çalmasın: odak giderse seçim kaybolur ve Android'de
      // klavye kapanıp pencere yeniden boyutlanır.
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {MENU.map((it) =>
        it.sep ? (
          <div key={it.id} className="lo-ctxmenu__sep" />
        ) : it.children ? (
          <div
            key={it.id}
            className="lo-ctxmenu__group"
            // Masaüstünde alt menü fareyle üstüne gelince yana açılır. Mobilde fare YOKTUR ve
            // yandaki panel 375px ekranda dışarı taşıyordu → dokunmayla açılan, içe gömülü
            // akordeon kullanılır.
            onMouseEnter={isMobile ? undefined : () => setOpenSub(it.id)}
            onMouseLeave={isMobile ? undefined : () => setOpenSub(null)}
          >
            <button
              className="lo-ctxmenu__item"
              aria-expanded={openSub === it.id}
              onClick={isMobile ? () => toggleSub(it.id) : undefined}
            >
              <span className="lo-ctxmenu__ic">{icon(it)}</span>
              {label(it)}
              <ChevronRight
                size={13}
                strokeWidth={2}
                className="lo-ctxmenu__arrow"
                style={isMobile && openSub === it.id ? { transform: "rotate(90deg)" } : undefined}
              />
            </button>
            {openSub === it.id && (
              <div className={"lo-ctxmenu " + (isMobile ? "lo-ctxmenu--acc" : "lo-ctxmenu--sub")}>
                {it.children.map((s) => (s.sep ? <div key={s.id} className="lo-ctxmenu__sep" /> : leaf(s)))}
              </div>
            )}
          </div>
        ) : (
          leaf(it)
        )
      )}
    </div>
  );
}

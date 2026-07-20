import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PencilRuler, FilePlus } from "lucide-react";
import { Excalidraw, MainMenu, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useAppStore } from "../../store/useAppStore";

/** .excalidraw JSON içeriğini Excalidraw initialData'ya çevir. */
function parseScene(content?: string) {
  if (!content) return null;
  try {
    const d = JSON.parse(content);
    return {
      elements: d.elements ?? [],
      appState: d.appState ?? {},
      files: d.files ?? {},
      scrollToContent: true,
    };
  } catch {
    return null;
  }
}

/** Gömülü Excalidraw çizim tahtası — vault'taki .excalidraw dosyasına bağlı. */
/** Uygulama dili → Excalidraw arayüz dili kodu. */
const EXCALIDRAW_LANG: Record<string, string> = { tr: "tr-TR", en: "en", ar: "ar-SA" };

export function DrawScreen() {
  const { t, i18n } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const activeDraw = useAppStore((s) => s.activeDraw);
  const content = useAppStore((s) => (activeDraw ? s.noteContents[activeDraw] : undefined));
  const saveDraw = useAppStore((s) => s.saveDraw);
  const newDraw = useAppStore((s) => s.newDraw);

  // initialData yalnızca aktif çizim değişince hesaplanır (kayıt sonrası içerik
  // güncellemeleri canvas'ı sıfırlamasın diye content'e bağlı tutulmaz).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialData = useMemo(() => parseScene(content), [activeDraw]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!activeDraw) {
    return (
      <div className="lo-draw lo-draw--empty">
        <PencilRuler size={40} strokeWidth={1.4} />
        <p>{t("draw.empty")}</p>
        <button className="lo-draw__new" onClick={() => void newDraw()}>
          <FilePlus size={15} strokeWidth={2} />
          {t("draw.new")}
        </button>
      </div>
    );
  }

  return (
    <div className="lo-draw">
      <Excalidraw
        key={activeDraw}
        initialData={initialData ?? undefined}
        theme={theme === "dark" ? "dark" : "light"}
        langCode={EXCALIDRAW_LANG[i18n.language] ?? "en"}
        onChange={(elements, appState, files) => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            void saveDraw(serializeAsJSON(elements, appState, files, "local"));
          }, 700);
        }}
      >
        {/* Özel menü — varsayılan "Excalidraw links" (GitHub/X/Discord) sosyal grubu hariç. */}
        <MainMenu>
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}

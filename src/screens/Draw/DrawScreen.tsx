import { useEffect, useMemo, useRef } from "react";
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
  // Bekleyen kayıt: hangi dosyaya, hangi içerik. Çizim değişince/ekran kapanınca HEMEN yazılır.
  const pending = useRef<{ path: string; json: string } | null>(null);

  // Başka bir çizime geçerken (veya ekrandan çıkarken) bekleyen 700 ms'lik kaydı boşalt.
  // Boşaltılmazsa son fırça darbeleri hiç diske yazılmadan kaybolurdu.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const p = pending.current;
      pending.current = null;
      if (p) void useAppStore.getState().saveDraw(p.json, p.path);
    };
  }, [activeDraw]);

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
          // Hedef yol ŞİMDİ sabitlenir: gecikme dolduğunda aktif çizim değişmiş olabilir ve
          // saveDraw bu sahneyi BAŞKA bir çizimin üstüne yazardı.
          const path = activeDraw;
          const json = serializeAsJSON(elements, appState, files, "local");
          pending.current = { path, json };
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            pending.current = null;
            void saveDraw(json, path);
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

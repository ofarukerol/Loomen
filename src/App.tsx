import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, ACCENTS } from "./store/useAppStore";
import { applyDir } from "./i18n";
import { useIsMobile } from "./hooks/useIsMobile";
import { Ribbon } from "./components/Ribbon";
import { TopBar } from "./components/TopBar";
import { Explorer } from "./components/Explorer";
import { RightPanel } from "./components/RightPanel";
import { MobileBar } from "./components/MobileBar";
import { MobileTopBar } from "./components/MobileTopBar";
import { MobileDrawer, MobileTabsSheet } from "./components/MobileDrawer";
import { PlannerScreen } from "./screens/Planner/PlannerScreen";
import { EditorScreen } from "./screens/Editor/EditorScreen";
import { GraphScreen } from "./screens/Graph/GraphScreen";
import { ReportsScreen } from "./screens/Reports/ReportsScreen";
import { DrawScreen } from "./screens/Draw/DrawScreen";
import { NewTabScreen } from "./screens/NewTab/NewTabScreen";
import { SettingsScreen } from "./screens/Settings/SettingsScreen";
import { HelpScreen } from "./screens/Help/HelpScreen";
import { AssistantScreen } from "./screens/Assistant/AssistantScreen";
import { ReviewScreen } from "./screens/Review/ReviewScreen";
import { TaskDetail } from "./screens/Planner/TaskDetail";
import { GitHubDeviceModal } from "./screens/Settings/GitHubSync";

export default function App() {
  const { i18n } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const screen = useAppStore((s) => s.screen);
  const lang = useAppStore((s) => s.lang);
  const accent = useAppStore((s) => s.accent);
  const leftCollapsed = useAppStore((s) => s.leftCollapsed);
  const rightCollapsed = useAppStore((s) => s.rightCollapsed);
  const activeNote = useAppStore((s) => s.activeNote);
  const activeDraw = useAppStore((s) => s.activeDraw);
  const setScreen = useAppStore((s) => s.setScreen);
  const selectedTask = useAppStore((s) => s.selectedTask);
  const selectTask = useAppStore((s) => s.selectTask);
  const modalLayers = useAppStore((s) => s.modalLayers);
  const platformMobile = useAppStore((s) => s.platformMobile);

  // Mobil (dar ekran / iOS-Android): sol/sağ panel + üst sekme şeridi yerine alt bar + drawer.
  // Gerçek mobil platform her zaman mobil sayılır (tablet/yatay ekranda genişlik eşiği tutmaz).
  const isMobile = useIsMobile() || platformMobile;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tabsOpen, setTabsOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);

  const bootstrap = useAppStore((s) => s.bootstrap);
  const newNote = useAppStore((s) => s.newNote);
  const newTab = useAppStore((s) => s.newTab);
  const ghAutoSync = useAppStore((s) => s.ghAutoSync);
  const ghToken = useAppStore((s) => s.ghToken);
  const ghRepo = useAppStore((s) => s.ghRepo);
  const ghSync = useAppStore((s) => s.ghSync);
  const gcalAutoSync = useAppStore((s) => s.gcalAutoSync);
  const gcalTokens = useAppStore((s) => s.gcalTokens);
  const gcalSync = useAppStore((s) => s.gcalSync);
  const pomoRunning = useAppStore((s) => s.pomoRunning);
  const tickPomo = useAppStore((s) => s.tickPomo);
  const pomoBreakRunning = useAppStore((s) => s.pomoBreakRunning);
  const tickBreak = useAppStore((s) => s.tickBreak);
  const reloadVault = useAppStore((s) => s.reloadVault);

  // İlk açılışta kasayı yükle (sample veya kayıtlı Tauri kasası).
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Pomodoro sayacı — App seviyesinde sürer; hangi ekranda olursak olalım durmaz
  // (önceden PomodoroCard'daydı, planner'dan çıkınca kart unmount olup sayaç duruyordu).
  useEffect(() => {
    if (!pomoRunning) return;
    const id = setInterval(() => tickPomo(), 1000);
    return () => clearInterval(id);
  }, [pomoRunning, tickPomo]);

  // Mola sayacı — odaktan bağımsız sürer (başlatılınca).
  useEffect(() => {
    if (!pomoBreakRunning) return;
    const id = setInterval(() => tickBreak(), 1000);
    return () => clearInterval(id);
  }, [pomoBreakRunning, tickBreak]);

  // Pencereye dönünce sayacı hemen tazele: arka planda setInterval kısılır, uykuda hiç
  // ateşlemez. Kalan süre bitiş anından hesaplandığı için tek tick doğru değeri yakalar.
  useEffect(() => {
    const catchUp = () => {
      if (document.visibilityState !== "visible") return;
      if (useAppStore.getState().pomoRunning) tickPomo();
      if (useAppStore.getState().pomoBreakRunning) tickBreak();
    };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("focus", catchUp);
    return () => {
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("focus", catchUp);
    };
  }, [tickPomo, tickBreak]);

  // Gün değişimi: "bugün / geciken" kovaları ve sayaçlar yükleme anındaki tarihe göre
  // hesaplanır. Uygulama gece yarısını açık geçirirse (ya da uykudan ertesi gün dönerse)
  // dünün gününü göstermeye devam ederdi — tarih değişince yeniden hesapla.
  useEffect(() => {
    let day = new Date().toDateString();
    const check = () => {
      const now = new Date().toDateString();
      if (now === day) return;
      day = now;
      void reloadVault();
    };
    const id = setInterval(check, 60 * 1000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [reloadVault]);

  // Otomatik senkron: bağlıyken ve açıkken periyodik push/pull (3 dk).
  useEffect(() => {
    if (!ghAutoSync || !ghToken || !ghRepo) return;
    const id = setInterval(() => void ghSync(), 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [ghAutoSync, ghToken, ghRepo, ghSync]);

  // Google Takvim otomatik senkron: bağlıyken açılışta hemen bir kez, sonra her 5 dk push/pull.
  useEffect(() => {
    if (!gcalAutoSync || !gcalTokens) return;
    void gcalSync();
    const id = setInterval(() => void gcalSync(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [gcalAutoSync, gcalTokens, gcalSync]);

  // Dil değişince i18next + <html dir> güncelle (RTL).
  useEffect(() => {
    i18n.changeLanguage(lang);
    applyDir(lang);
  }, [lang, i18n]);

  // Tema ve vurgu rengini <html> üzerine de yaz.
  //
  // Çöp kutusu penceresi ve Explorer bağlam menüsü createPortal ile document.body'ye çiziliyor
  // (mobilde çekmecenin `transform`'una sıkışmasınlar diye). Gövde `.lo-app`'in ALTINDA olmadığı
  // için oradaki `data-theme` ve vurgu değişkenleri bu parçalara MİRAS KALMIYOR: koyu temada
  // beyaz zeminli pencere/menü çıkıyordu. Kökte tanımlanınca gövdeye çizilen her şey doğru
  // temayı ve seçili vurgu rengini alır. `.lo-app` üzerindeki tanım bilerek duruyor (aynı değer).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    if (accent === ACCENTS[0]) {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-soft");
    } else {
      root.style.setProperty("--accent", accent);
      root.style.setProperty("--accent-soft", accent + "22");
    }
  }, [theme, accent]);

  // Klavye kısayolları: ⌘N yeni not, ⌘O dosyaya git (arama).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        void newNote();
      } else if (k === "o") {
        e.preventDefault();
        newTab();
        setTimeout(() => document.querySelector<HTMLInputElement>(".lo-search input")?.focus(), 50);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newNote, newTab]);

  // Mobilde gezinince (ekran/aktif not değişince) drawer ve sekme sheet'i otomatik kapan.
  useEffect(() => {
    setDrawerOpen(false);
    setTabsOpen(false);
  }, [screen, activeNote, activeDraw]);

  // Sanal klavye yüksekliğini CSS'e taşı (--kb).
  // iOS'ta klavye açılınca GÖRÜNEN alan küçülür ama düzenin viewport'u aynı kalır: alt çubuk,
  // görev detayındaki kaydet satırı ve editörün alt kısmı klavyenin ALTINDA kalıyordu.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${Math.round(kb)}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      document.documentElement.style.setProperty("--kb", "0px");
    };
  }, []);

  /**
   * Android geri tuşu.
   *
   * WebView'da geri, geçmişte kayıt yoksa uygulamayı KAPATIR — kullanıcı çekmeceyi kapatmak
   * isterken uygulamadan çıkıyordu. Yöntem: kapatılabilir her katman (açık ekran, görev
   * penceresi, çekmece, sekme listesi, açık pencereler) için geçmişe bir kayıt itilir; geri
   * basılınca en üstteki katman kapatılır. Kayıt kalmayınca geri tuşu uygulamadan çıkar —
   * Android'in beklediği davranış budur.
   *
   * Pencereler (çöp kutusu, GitHub bağlan) durumlarını kendi içlerinde tuttuğu için
   * `useModalLayer` ile store'daki sayaca kaydoluyor; en üstte oldukları için listenin
   * SONUNA eklenirler. Kapatma yolu Escape: her pencere zaten Escape'i dinliyor.
   */
  const closers: (() => void)[] = [];
  if (screen !== "planner") closers.push(() => setScreen("planner"));
  if (selectedTask) closers.push(() => selectTask(null));
  if (drawerOpen) closers.push(() => setDrawerOpen(false));
  if (tabsOpen) closers.push(() => setTabsOpen(false));
  for (let i = 0; i < modalLayers; i++) {
    closers.push(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  }
  const closersRef = useRef(closers);
  closersRef.current = closers;
  const depthRef = useRef(0);
  const ignorePops = useRef(0); // programatik history.go ile beklenen popstate sayısı
  // Geçmiş yönetimi yalnız mobilde: masaüstünde donanım geri tuşu yok, davranış değişmesin.
  const mobileRef = useRef(isMobile);
  mobileRef.current = isMobile;

  useEffect(() => {
    const onPop = () => {
      if (!mobileRef.current) return;
      if (ignorePops.current > 0) {
        ignorePops.current--;
        return;
      }
      // Bu geri basışını bir geçmiş kaydı karşıladı.
      depthRef.current = Math.max(0, depthRef.current - 1);
      // Açık pencereler listenin sonunda; ayrı bir ele alma gerekmiyor — her katmanın kendi
      // geçmiş kaydı var, en üstteki kapanır.
      const list = closersRef.current;
      list[list.length - 1]?.();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Geçmiş kayıtlarının sayısını açık katman sayısıyla eşitle (masaüstünde daima 0).
  const layerCount = isMobile ? closers.length : 0;
  useEffect(() => {
    const have = depthRef.current;
    if (layerCount > have) {
      for (let i = have; i < layerCount; i++) window.history.pushState({ lo: i + 1 }, "");
    } else if (layerCount < have) {
      // Katman uygulama içinden kapandı (geri tuşuyla değil): fazla kayıtları sessizce geri al.
      // Tek bir history.go() kaç kayıt geriye giderse gitsin TEK popstate üretir — sayaç 1 artar.
      ignorePops.current += 1;
      window.history.go(layerCount - have);
    }
    depthRef.current = layerCount;
  }, [layerCount]);

  const explorerEligible = ["planner", "editor", "graph", "reports", "draw", "newtab", "assistant"].includes(screen);
  const showExplorer = explorerEligible && !leftCollapsed;
  const rightEligible = ["planner", "editor", "graph", "draw"].includes(screen);
  const showRight = rightEligible && !rightCollapsed;

  // Vurgu rengini kök seviyede override et (varsayılan dışı seçilirse).
  const accentVars =
    accent === ACCENTS[0]
      ? undefined
      : ({ "--accent": accent, "--accent-soft": accent + "22" } as React.CSSProperties);

  return (
    <div className={"lo-app" + (isMobile ? " is-mobile" : "")} data-theme={theme} style={accentVars}>
      {/* Masaüstü sol menü — mobilde gizli (yerine alt bar + drawer). */}
      {!isMobile && <Ribbon />}
      {!isMobile && showExplorer && <Explorer />}
      {/* Ana sütun: sekme çubuğu (masaüstü) + ekran */}
      <div className="lo-maincol">
        {!isMobile && <TopBar />}
        {isMobile && (
          <MobileTopBar
            onMenu={() => {
              setFocusSearch(false);
              setDrawerOpen(true);
            }}
          />
        )}
        <div className="lo-main">
          {screen === "planner" && <PlannerScreen />}
          {screen === "editor" && <EditorScreen />}
          {screen === "graph" && <GraphScreen />}
          {screen === "draw" && <DrawScreen />}
          {screen === "newtab" && <NewTabScreen />}
          {screen === "reports" && <ReportsScreen />}
          {screen === "settings" && <SettingsScreen />}
          {screen === "help" && <HelpScreen />}
          {screen === "assistant" && <AssistantScreen />}
          {screen === "review" && <ReviewScreen />}
        </div>
      </div>
      {!isMobile && showRight && <RightPanel />}

      {/* Mobil: alt toolbar + sol drawer + sekme sheet */}
      {isMobile && (
        <>
          <MobileBar
            onSearch={() => {
              setFocusSearch(true);
              setDrawerOpen(true);
            }}
            onTabs={() => setTabsOpen(true)}
            onMenu={() => {
              setFocusSearch(false);
              setDrawerOpen(true);
            }}
          />
          <MobileDrawer open={drawerOpen} focusSearch={focusSearch} onClose={() => setDrawerOpen(false)} />
          <MobileTabsSheet open={tabsOpen} onClose={() => setTabsOpen(false)} />
        </>
      )}

      {/* Görev detay modalı — global */}
      <TaskDetail />
      {/* GitHub bağlan (device flow) modalı — global */}
      <GitHubDeviceModal />
    </div>
  );
}

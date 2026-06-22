import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TaskGroup, Task } from "../data/sampleVault";
import type { ParsedTask, VaultBackend, VaultNote } from "../core/vault/types";
import {
  createSampleBackend,
  createTauriBackend,
  isTauri,
  pickVaultFolder,
  loadVaultData,
  todayISO,
  todayDailyPath,
  dailyPathFor,
  watchVaultRoot,
  ensureDailyNote,
  ensureTemplates,
  renderDailyTemplate,
  migrateDailyContent,
  templatePathFor,
  TEMPLATES_DIR,
  TODO_HEADING,
} from "../core/vault";
import { groupTasks, focusCounts, taskSortVal, taskOrderKey } from "../core/vault/grouping";
import { parseTasks } from "../core/markdown/taskParser";
import { playChime } from "../core/sound";
import { gh, type DeviceStart, type GhUser, type GhRepo } from "../core/github";
import { toggleTaskInContent, buildTaskLine, insertTaskUnderHeading, applyTaskPatch, setTaskNotes, type TaskPatch } from "../core/markdown/taskParser";

export type Theme = "light" | "dark";
export type Screen = "planner" | "editor" | "graph" | "reports" | "settings" | "draw" | "newtab";
export type PlannerLayout = "timeline" | "board";
export type Lang = "tr" | "en" | "ar";
export type EditorTab = "daily" | "proje" | "fikirler";

/** Ayarlardan seçilebilen vurgu renkleri (bkz docs 08 §2). */
export const ACCENTS = ["#C2603A", "#2E8B7F", "#6C5CE0", "#A4261F"] as const;

export interface EditorSettings {
  livePreview: boolean;
  lineNumbers: boolean;
  spellCheck: boolean;
}

/** Kaynak not adını editör sekmesine eşler (statik editör — vault entegrasyonu sonraki adım). */
export function noteToTab(source: string): EditorTab {
  if (source === "Proje X") return "proje";
  if (source === "Fikirler") return "fikirler";
  return "daily";
}

export interface PomodoroSettings {
  focusMin: number;
  shortBreak: number;
  longBreak: number;
  rounds: number;
}

/** Bir kasa: yerel klasör + özel ad + (opsiyonel) bağlı git reposu. Çoklu kasa için. */
export interface VaultEntry {
  path: string;
  /** Kullanıcının verdiği görünen ad (yoksa klasör adı kullanılır). */
  name?: string;
  repo: GhRepo | null;
}

/** Bir kasanın açık sekme durumu (kasa değişince geri yüklenir). */
export interface VaultTabs {
  openTabs: string[];
  pinnedTabs: string[];
  activeNote: string | null;
  activeDraw: string | null;
}

export type PomoPhase = "work" | "short" | "long";

export interface FocusCounts {
  yapilacak: number;
  geciken: number;
  planlanmamis: number;
}

interface AppState {
  theme: Theme;
  screen: Screen;
  layout: PlannerLayout;
  lang: Lang;
  editorTab: EditorTab;
  accent: string;
  editorSettings: EditorSettings;
  /** Günlük not için seçili şablonun adı (Şablonlar/<ad>.md). */
  dailyTemplate: string;
  quickText: string;
  selectedDay: number;

  // Panel görünürlüğü + odak genişletme
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  focusExpanded: boolean;

  // Vault
  vaultPath: string | null; // null = tarayıcı/sample modu
  notes: VaultNote[];
  groups: TaskGroup[];
  /** Planlanmamış (tarihsiz, açık) görevler — Bugüne Odaklan panelinde gösterilir. */
  unplannedTasks: Task[];
  counts: FocusCounts;
  parsedTasks: ParsedTask[];
  noteContents: Record<string, string>;
  /** Manuel görev sırası: "dosya::açıklama" → sıra değeri (sürükle-bırak, kalıcı). */
  taskOrder: Record<string, number>;

  // Editör
  openTabs: string[]; // açık not/çizim yolları (sekmeler)
  pinnedTabs: string[]; // sabitlenmiş sekme yolları
  activeNote: string | null; // aktif not yolu
  editing: boolean;
  draft: string;
  backlinksCollapsed: boolean;

  // Görev detay paneli (seçili görev id'si "file:line")
  selectedTask: string | null;

  // Aktif Excalidraw çizimi (yol)
  activeDraw: string | null;

  // Favoriler (sabitlenmiş not/çizim yolları)
  favorites: string[];

  // GitHub senkronizasyonu
  ghToken: string | null;
  ghUser: GhUser | null;
  ghRepo: GhRepo | null;
  ghDevice: DeviceStart | null; // aktif device-flow (bağlan modalı)
  ghSyncing: boolean;
  ghLastSync: string | null; // ISO
  ghStatus: string | null; // son durum/hata mesajı
  ghAutoSync: boolean;

  // Pomodoro
  pomo: PomodoroSettings;
  /** Pomodoro başlayınca/bitince ses çal. */
  pomoSound: boolean;
  pomoRemaining: number;
  pomoRunning: boolean;
  pomoPhase: PomoPhase;
  pomoCompleted: number; // mevcut turda tamamlanan odak seansı (0..rounds)
  pomoHistory: Record<string, number>; // ISO tarih → tamamlanan odak seansı (rapor için, kalıcı)
  // Mola — odak bitince teklif edilen ayrı (ufak) sayaç. Otomatik başlamaz; es geçilebilir.
  pomoBreakActive: boolean; // mola gösteriliyor mu (odak bitti, yeni odak başlamadı)
  pomoBreakRunning: boolean; // mola sayacı çalışıyor mu
  pomoBreakRemaining: number; // mola kalan saniye
  pomoBreakLong: boolean; // uzun mola mı (tur seti bitti)

  // UI aksiyonları
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setScreen: (s: Screen) => void;
  setLayout: (l: PlannerLayout) => void;
  setLang: (l: Lang) => void;
  setEditorTab: (t: EditorTab) => void;
  openNote: (nameOrPath: string, edit?: boolean) => void; // edit varsayılan true (canlı düzenleme)
  setActiveTab: (path: string) => void;
  togglePin: (path: string) => void;
  closeTab: (path: string) => void;
  newTab: () => void;
  setDraft: (text: string) => void;
  toggleEditing: () => void;
  toggleBacklinks: () => void;
  saveNote: () => Promise<void>;
  setAccent: (hex: string) => void;
  toggleEditorSetting: (key: keyof EditorSettings) => void;
  toggleArabic: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setFocusExpanded: (v: boolean) => void;
  goToDayNote: () => Promise<void>;
  goToDate: (date: Date) => Promise<void>;
  createTodayNote: () => Promise<void>;
  todayNotePath: () => string;
  setQuick: (v: string) => void;
  selectDay: (n: number) => void;
  togglePomo: () => void;
  resetPomo: () => void;
  tickPomo: () => void;
  tickBreak: () => void;
  toggleBreak: () => void;
  skipBreak: () => void;
  setPomo: (patch: Partial<PomodoroSettings>) => void;
  setPomoSound: (on: boolean) => void;

  // Çoklu kasa
  vaults: VaultEntry[];
  /** Kasa yolu → o kasanın açık sekmeleri. Kasa değişince sekmeler buradan değişir. */
  tabsByVault: Record<string, VaultTabs>;
  addVault: () => Promise<void>;
  switchVault: (path: string) => Promise<void>;
  removeVault: (path: string) => Promise<void>;
  setVaultRepo: (path: string, repo: GhRepo | null) => void;
  renameVault: (path: string, name: string) => void;
  changeVaultPath: (path: string) => Promise<void>;
  createRepoForVault: (path: string, name: string, priv_: boolean) => Promise<GhRepo | null>;

  // Vault aksiyonları (dosyaya yazar)
  bootstrap: () => Promise<void>;
  openVault: () => Promise<void>;
  reopenVault: (path: string) => Promise<void>;
  reloadVault: () => Promise<void>;
  newNote: (folder?: string) => Promise<void>;
  newFolder: () => Promise<void>;
  newDraw: () => Promise<void>;
  newTemplate: () => Promise<void>;
  setDailyTemplate: (name: string) => void;
  saveDraw: (json: string) => Promise<void>;
  toggleFavorite: (path: string) => void;
  renameNote: (path: string, newName: string) => Promise<void>;
  renameFolder: (folderPath: string, newName: string) => Promise<void>;
  addTask: () => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  selectTask: (id: string | null) => void;
  updateTask: (id: string, patch: TaskPatch) => Promise<void>;
  saveTask: (id: string, patch: TaskPatch, notes?: string) => Promise<void>;
  reorderTask: (fromId: string, toId: string) => Promise<void>;

  // GitHub aksiyonları
  ghBeginAuth: () => Promise<void>;
  ghCancelAuth: () => void;
  ghPoll: () => Promise<string>;
  ghDisconnect: () => void;
  ghLoadRepos: () => Promise<GhRepo[]>;
  ghCreateRepo: (name: string, priv_: boolean) => Promise<void>;
  ghSelectRepo: (repo: GhRepo) => void;
  ghSync: () => Promise<void>;
  ghSetAutoSync: (v: boolean) => void;
}

/** Boş Excalidraw sahnesi (yeni çizim oluştururken). */
const EMPTY_EXCALIDRAW = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "loomen",
  elements: [],
  appState: {},
  files: {},
});
const DRAW_DIR = "Çizimler";

const FOCUS_MIN = 25;
const VAULT_KEY = "loomen.vaultPath";
const TASKS_FILE = "Yapılacaklar.md"; // görevler günlük nottan ayrı, kendi sayfasında

// Modül seviyesi: serileştirilemeyen backend + watcher (store dışında tutulur).
let backend: VaultBackend = createSampleBackend();
let unwatch: (() => void) | null = null;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
  /** Backend'den yükle, gruplandır, state'e yaz. */
  async function loadFromBackend() {
    const { tasks, notes, contents } = await loadVaultData(backend);
    const today = todayISO();
    const { groups, unplannedTasks } = groupTasks(tasks, today, get().taskOrder);
    const c = focusCounts(tasks, today);
    set({
      parsedTasks: tasks,
      notes,
      noteContents: contents,
      groups,
      unplannedTasks,
      counts: { yapilacak: c.yapilacak, geciken: c.geciken, planlanmamis: c.planlanmamis },
    });
  }

  return {
    theme: "light",
    screen: "planner",
    layout: "timeline",
    lang: "tr",
    editorTab: "daily",
    accent: ACCENTS[0],
    editorSettings: { livePreview: true, lineNumbers: false, spellCheck: true },
    dailyTemplate: "Günlük",
    quickText: "",
    selectedDay: Number(todayISO().slice(8, 10)),

    leftCollapsed: false,
    rightCollapsed: false,
    focusExpanded: false,

    vaultPath: null,
    vaults: [],
    tabsByVault: {},
    notes: [],
    groups: [],
    unplannedTasks: [],
    counts: { yapilacak: 0, geciken: 0, planlanmamis: 0 },
    parsedTasks: [],
    noteContents: {},
    taskOrder: {},

    openTabs: [],
    pinnedTabs: [],
    activeNote: null,
    editing: false,
    draft: "",
    backlinksCollapsed: false,
    selectedTask: null,
    activeDraw: null,
    favorites: [],

    ghToken: null,
    ghUser: null,
    ghRepo: null,
    ghDevice: null,
    ghSyncing: false,
    ghLastSync: null,
    ghStatus: null,
    ghAutoSync: false,

    pomo: { focusMin: FOCUS_MIN, shortBreak: 5, longBreak: 15, rounds: 4 },
    pomoSound: true,
    pomoRemaining: FOCUS_MIN * 60,
    pomoRunning: false,
    pomoPhase: "work",
    pomoCompleted: 0,
    pomoHistory: {},
    pomoBreakActive: false,
    pomoBreakRunning: false,
    pomoBreakRemaining: 0,
    pomoBreakLong: false,

    toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
    setTheme: (theme) => set({ theme }),
    setScreen: (screen) => set({ screen }),
    setLayout: (layout) => set({ layout }),
    setLang: (lang) => set({ lang }),
    setEditorTab: (editorTab) => set({ editorTab }),
    openNote: async (nameOrPath, edit = true) => {
      const s = get();
      // Yol mu yoksa ad mı? Önce yol, sonra ada göre çöz.
      const byPath = s.notes.find((n) => n.path === nameOrPath);
      const byName = s.notes.find((n) => n.name === nameOrPath);
      const note = byPath ?? byName;
      if (!note) return; // eksik/kırık link
      // Çizim dosyaları editör yerine çizim ekranında açılır (ama yine sekme olur).
      if (note.kind === "draw") {
        const tabs = s.openTabs.includes(note.path) ? s.openTabs : [...s.openTabs, note.path];
        set({ screen: "draw", activeDraw: note.path, openTabs: tabs });
        return;
      }
      // Günlük not ise: eski H1/verbose metadata'yı bir kez temizle (banner üstte gösterir).
      if (/^\d{4}-\d{2}-\d{2}/.test(note.name)) {
        const cur = s.noteContents[note.path] ?? (await backend.readNote(note.path));
        const migrated = migrateDailyContent(cur);
        if (migrated != null) {
          await backend.writeNote(note.path, migrated);
          await loadFromBackend();
        }
      }
      const st = get();
      const openTabs = st.openTabs.includes(note.path) ? st.openTabs : [...st.openTabs, note.path];
      set({
        screen: "editor",
        activeNote: note.path,
        openTabs,
        editing: edit, // edit=true → doğrudan düzenleme modunda aç
        draft: st.noteContents[note.path] ?? "",
      });
    },
    setActiveTab: (path) => {
      const s = get();
      const note = s.notes.find((n) => n.path === path);
      if (note?.kind === "draw") {
        set({ screen: "draw", activeDraw: path });
        return;
      }
      set({ screen: "editor", activeNote: path, editing: true, draft: s.noteContents[path] ?? "" });
    },
    togglePin: (path) =>
      set((s) => ({
        pinnedTabs: s.pinnedTabs.includes(path)
          ? s.pinnedTabs.filter((p) => p !== path)
          : [...s.pinnedTabs, path],
      })),
    // Boş "Yeni sekme" — dosya oluştur / dosyaya git seçenekleri.
    newTab: () => set({ screen: "newtab" }),
    closeTab: (path) =>
      set((s) => {
        const openTabs = s.openTabs.filter((p) => p !== path);
        const pinnedTabs = s.pinnedTabs.filter((p) => p !== path);
        const wasActive = s.activeNote === path || s.activeDraw === path;
        if (!wasActive) return { openTabs, pinnedTabs };
        const next = openTabs[openTabs.length - 1] ?? null;
        const clearNote = s.activeNote === path ? null : s.activeNote;
        const clearDraw = s.activeDraw === path ? null : s.activeDraw;
        if (!next) return { openTabs, pinnedTabs, activeNote: clearNote, activeDraw: clearDraw, draft: "" };
        const nextNote = s.notes.find((n) => n.path === next);
        if (nextNote?.kind === "draw") {
          return { openTabs, pinnedTabs, screen: "draw", activeDraw: next, activeNote: clearNote };
        }
        return {
          openTabs,
          pinnedTabs,
          screen: "editor",
          activeNote: next,
          activeDraw: clearDraw,
          editing: true,
          draft: s.noteContents[next] ?? "",
        };
      }),
    setDraft: (draft) => set({ draft }),
    toggleEditing: () => set((s) => ({ editing: !s.editing })),
    toggleBacklinks: () => set((s) => ({ backlinksCollapsed: !s.backlinksCollapsed })),
    saveNote: async () => {
      const s = get();
      if (!s.activeNote) return;
      await backend.writeNote(s.activeNote, s.draft);
      // Hafif kayıt: tüm dosyaları yeniden okumadan bellekte güncelle + görevleri yeniden hesapla.
      const noteContents = { ...s.noteContents, [s.activeNote]: s.draft };
      const tasks = s.notes.flatMap((n) =>
        n.kind === "draw" ? [] : parseTasks(n.path, noteContents[n.path] ?? "")
      );
      const today = todayISO();
      const { groups, unplannedTasks } = groupTasks(tasks, today, s.taskOrder);
      const c = focusCounts(tasks, today);
      set({
        noteContents,
        parsedTasks: tasks,
        groups,
        unplannedTasks,
        counts: { yapilacak: c.yapilacak, geciken: c.geciken, planlanmamis: c.planlanmamis },
      });
    },
    setAccent: (accent) => set({ accent }),
    toggleEditorSetting: (key) =>
      set((s) => ({ editorSettings: { ...s.editorSettings, [key]: !s.editorSettings[key] } })),
    toggleArabic: () => set((s) => ({ lang: s.lang === "ar" ? "tr" : "ar" })),
    toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
    toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
    setFocusExpanded: (focusExpanded) => set({ focusExpanded }),
    todayNotePath: () => todayDailyPath(),
    // "Günün Notu" — bugünün notunu (yoksa şablonla oluşturup) sekmede aç.
    goToDayNote: async () => {
      await ensureDailyNote(backend, todayDailyPath(), templatePathFor(get().dailyTemplate));
      await loadFromBackend();
      get().openNote(todayDailyPath());
    },
    createTodayNote: async () => {
      await ensureDailyNote(backend, todayDailyPath(), templatePathFor(get().dailyTemplate));
      await loadFromBackend();
    },
    // Takvimden bir güne tıklama — o günün notunu (yoksa seçili şablonla oluşturup) aç.
    goToDate: async (date) => {
      const path = dailyPathFor(date);
      if (!(await backend.exists(path))) {
        const folder = path.split("/").slice(0, -1).join("/");
        if (folder) await backend.ensureDir(folder);
        await backend.writeNote(path, await renderDailyTemplate(backend, date, templatePathFor(get().dailyTemplate)));
      }
      await loadFromBackend();
      get().openNote(path);
    },
    setQuick: (quickText) => set({ quickText }),
    selectDay: (selectedDay) => set({ selectedDay }),

    togglePomo: () =>
      set((s) => {
        const running = !s.pomoRunning;
        if (running && s.pomoSound) playChime("start"); // başlatırken zil
        const patch: Partial<AppState> = { pomoRunning: running };
        if (running) {
          // Yeni 25 dk başladı → varsa mola kaybolur.
          if (s.pomoBreakActive) {
            patch.pomoBreakActive = false;
            patch.pomoBreakRunning = false;
            // Uzun mola turunu tamamlamıştık → seri sıfırlanır.
            if (s.pomoBreakLong) patch.pomoCompleted = 0;
          } else if (s.pomoCompleted >= s.pomo.rounds) {
            // Tur seti dolmuş ama mola yok (atlanmış) → yeni seriye başlarken sıfırla.
            patch.pomoCompleted = 0;
          }
        }
        return patch;
      }),
    setPomoSound: (pomoSound) => set({ pomoSound }),
    resetPomo: () =>
      set((s) => ({
        pomoRunning: false,
        pomoPhase: "work",
        pomoRemaining: s.pomo.focusMin * 60,
        pomoBreakActive: false,
        pomoBreakRunning: false,
        pomoBreakRemaining: 0,
      })),
    tickPomo: () => {
      const s = get();
      if (s.pomoRemaining > 1) {
        set({ pomoRemaining: s.pomoRemaining - 1 });
        return;
      }
      // Odak seansı bitti → seriyi işaretle ve molayı TEKLİF et (otomatik başlamaz).
      if (s.pomoSound) playChime("end");
      const completed = s.pomoCompleted + 1;
      const isLong = completed % s.pomo.rounds === 0;
      // Tamamlanan odak seansını rapor geçmişine işle (bugünün ISO tarihi).
      const day = todayISO();
      const pomoHistory = { ...s.pomoHistory, [day]: (s.pomoHistory[day] ?? 0) + 1 };
      set({
        pomoCompleted: completed,
        pomoRunning: false,
        pomoRemaining: s.pomo.focusMin * 60, // ana sayaç sıradaki odak için hazır
        pomoHistory,
        pomoBreakActive: true,
        pomoBreakRunning: false,
        pomoBreakLong: isLong,
        pomoBreakRemaining: (isLong ? s.pomo.longBreak : s.pomo.shortBreak) * 60,
      });
    },
    tickBreak: () => {
      const s = get();
      if (!s.pomoBreakActive) return;
      if (s.pomoBreakRemaining > 1) {
        set({ pomoBreakRemaining: s.pomoBreakRemaining - 1 });
        return;
      }
      // Mola bitti → kaybolur. Uzun moladan sonra tur sayacını sıfırla.
      if (s.pomoSound) playChime("break-end");
      set({
        pomoBreakActive: false,
        pomoBreakRunning: false,
        pomoCompleted: s.pomoBreakLong ? 0 : s.pomoCompleted,
      });
    },
    toggleBreak: () =>
      set((s) => {
        if (!s.pomoBreakActive) return {};
        const running = !s.pomoBreakRunning;
        if (running && s.pomoSound) playChime("break-start");
        return { pomoBreakRunning: running };
      }),
    skipBreak: () =>
      set((s) => ({
        pomoBreakActive: false,
        pomoBreakRunning: false,
        pomoCompleted: s.pomoBreakLong ? 0 : s.pomoCompleted,
      })),
    setPomo: (patch) =>
      set((s) => {
        const pomo = { ...s.pomo, ...patch };
        // Çalışmıyorken odak süresi değişirse kalan süreyi senkronla.
        const sync = !s.pomoRunning && s.pomoPhase === "work" && patch.focusMin != null;
        return { pomo, ...(sync ? { pomoRemaining: pomo.focusMin * 60 } : {}) };
      }),

    // İlk yükleme: önce sample, sonra (Tauri'de) kayıtlı kasa varsa onu yükle.
    bootstrap: async () => {
      // Sample seed (şablonlar) — hata olsa bile akışı durdurma.
      ensureTemplates(backend).catch(() => {});
      await loadFromBackend();
      if (isTauri()) {
        // Kalıcı vaultPath'i (rehydrate'ten) ya da eski localStorage anahtarını kullan.
        const saved = get().vaultPath ?? localStorage.getItem(VAULT_KEY);
        if (saved) await get().reopenVault(saved);
      }
    },

    // Yeni kasa ekle (klasör seç) ve ona geç. (Explorer/ayarlardaki "Kasa seç/ekle".)
    openVault: async () => get().addVault(),
    addVault: async () => {
      if (!isTauri()) return; // tarayıcıda klasör seçici yok
      const path = await pickVaultFolder();
      if (!path) return;
      await get().switchVault(path);
    },

    // Listedeki bir kasaya geç (backend'i yeniden aç; entry'deki repo aktif olur).
    switchVault: async (path) => {
      await get().reopenVault(path);
    },

    // Bir kasayı listeden kaldır. Aktifse kalan ilk kasaya, yoksa örnek kasaya döner.
    removeVault: async (path) => {
      const s = get();
      const vaults = s.vaults.filter((v) => v.path !== path);
      if (s.vaultPath !== path) {
        set({ vaults });
        return;
      }
      set({ vaults });
      if (vaults.length > 0) {
        await get().switchVault(vaults[0].path);
      } else {
        backend = createSampleBackend();
        unwatch?.();
        unwatch = null;
        localStorage.removeItem(VAULT_KEY);
        await loadFromBackend();
        set({
          vaultPath: null,
          ghRepo: null,
          openTabs: [],
          pinnedTabs: [],
          activeNote: null,
          activeDraw: null,
          draft: "",
          screen: "planner",
        });
      }
    },

    // Bir kasaya git reposu ata; aktif kasaysa ghRepo'yu da güncelle.
    setVaultRepo: (path, repo) =>
      set((s) => ({
        vaults: s.vaults.map((v) => (v.path === path ? { ...v, repo } : v)),
        ghRepo: s.vaultPath === path ? repo : s.ghRepo,
      })),

    // Kasaya özel ad ver (boş → klasör adına döner).
    renameVault: (path, name) =>
      set((s) => ({
        vaults: s.vaults.map((v) => (v.path === path ? { ...v, name: name.trim() || undefined } : v)),
      })),

    // Kasanın yerel klasörünü değiştir (yeni klasör seç). Aktifse yeniden açar.
    changeVaultPath: async (oldPath) => {
      if (!isTauri()) return;
      const newPath = await pickVaultFolder();
      if (!newPath || newPath === oldPath) return;
      const s = get();
      if (s.vaults.some((v) => v.path === newPath)) return; // bu klasör zaten bir kasa
      set({ vaults: s.vaults.map((v) => (v.path === oldPath ? { ...v, path: newPath } : v)) });
      if (s.vaultPath === oldPath) await get().reopenVault(newPath);
    },

    // Yeni repo oluştur ve döndür — OTOMATİK ATANMAZ; kullanıcı listeden manuel seçer.
    createRepoForVault: async (_path, name, priv_) => {
      const token = get().ghToken;
      if (!token) return null;
      return gh.createRepo(token, name, priv_);
    },

    // Kayıtlı/seçili kasayı backend olarak (yeniden) aç. HMR/yeniden yük sonrası da çağrılır.
    // Kasayı listeye ekler (yoksa), entry'sindeki repoyu ghRepo'ya yansıtır. Şablon seed
    // hatası kasayı düşürmez; açılamazsa mevcut durum korunur (sessizce).
    reopenVault: async (path) => {
      if (!isTauri()) return;
      try {
        const prev = get();
        const prevPath = prev.vaultPath;
        const isSwitch = prevPath !== path;
        // Mevcut kasanın açık sekmelerini sakla (geri dönülünce geri yüklenir).
        const tabsByVault: Record<string, VaultTabs> = prevPath
          ? {
              ...prev.tabsByVault,
              [prevPath]: {
                openTabs: prev.openTabs,
                pinnedTabs: prev.pinnedTabs,
                activeNote: prev.activeNote,
                activeDraw: prev.activeDraw,
              },
            }
          : prev.tabsByVault;

        const next = createTauriBackend(path);
        // Erişimi doğrula (kapsam/taşınma) — başarısızsa catch.
        await next.listNotes();
        backend = next;
        localStorage.setItem(VAULT_KEY, path);
        // Şablon klasörünü loadFromBackend'den ÖNCE oluştur ki Şablonlar hemen görünsün.
        try {
          await ensureTemplates(backend);
        } catch {
          /* şablon seed ölümcül değil */
        }
        await loadFromBackend();

        // Kasayı listeye ekle (yoksa); ilk (migrasyon) kasa eski ghRepo'yu devralır.
        const cur = get();
        const exists = cur.vaults.some((v) => v.path === path);
        const firstEver = cur.vaults.length === 0;
        const vaults = exists
          ? cur.vaults
          : [...cur.vaults, { path, repo: firstEver ? cur.ghRepo ?? null : null }];
        const entry = vaults.find((v) => v.path === path)!;

        const patch: Partial<AppState> = { vaultPath: path, vaults, ghRepo: entry.repo, tabsByVault };
        // Kasa değiştiyse (ya da global sekmeler boşsa) hedef kasanın sekmelerini geri yükle.
        if (isSwitch || prev.openTabs.length === 0) {
          const saved = tabsByVault[path] ?? { openTabs: [], pinnedTabs: [], activeNote: null, activeDraw: null };
          const has = (p: string) => cur.notes.some((n) => n.path === p);
          const openTabs = saved.openTabs.filter(has);
          const pinnedTabs = saved.pinnedTabs.filter(has);
          const activeNote = saved.activeNote && has(saved.activeNote) ? saved.activeNote : null;
          const activeDraw = saved.activeDraw && has(saved.activeDraw) ? saved.activeDraw : null;
          patch.openTabs = openTabs;
          patch.pinnedTabs = pinnedTabs;
          patch.activeNote = activeNote;
          patch.activeDraw = activeDraw;
          patch.draft = activeNote ? cur.noteContents[activeNote] ?? "" : "";
          patch.editing = true;
          // Geçerli ekranı koru ama içerik yoksa anlamlı bir yere düş.
          if (prev.screen === "editor" && !activeNote) patch.screen = "planner";
          if (prev.screen === "draw" && !activeDraw) patch.screen = "planner";
        }
        set(patch);

        unwatch?.();
        unwatch = await watchVaultRoot(path, () => get().reloadVault());
      } catch {
        // Açılamadı (taşınmış/silinmiş/izin yok): mevcut durumu koru.
      }
    },

    reloadVault: async () => {
      await loadFromBackend();
    },

    // Yeni boş not oluştur (çakışmayan ad bul), düzenleme modunda aç.
    newNote: async (folder) => {
      const s = get();
      const dir = folder ? `${folder}/` : "";
      const base = "Adsız";
      let name = base;
      let i = 2;
      const taken = (n: string) => s.notes.some((x) => x.path === `${dir}${n}.md`);
      while (taken(name)) name = `${base} ${i++}`;
      if (folder) await backend.ensureDir(folder);
      await backend.writeNote(`${dir}${name}.md`, `# ${name}\n\n`);
      await loadFromBackend();
      get().openNote(`${dir}${name}.md`, true);
    },

    // Yeni Excalidraw çizimi — her zaman "Çizimler" klasöründe, zaman damgalı isimle.
    newDraw: async () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
        now.getHours()
      )}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
      const path = `${DRAW_DIR}/Çizim ${stamp}.excalidraw`;
      await backend.ensureDir(DRAW_DIR);
      await backend.writeNote(path, EMPTY_EXCALIDRAW);
      await loadFromBackend();
      set({ screen: "draw", activeDraw: path });
    },

    // Yeni şablon dosyası — her zaman "Şablonlar" klasöründe; düzenleme modunda aç.
    newTemplate: async () => {
      const s = get();
      const base = "Şablon";
      let name = base;
      let i = 2;
      const taken = (n: string) => s.notes.some((x) => x.path === `${TEMPLATES_DIR}/${n}.md`);
      while (taken(name)) name = `${base} ${i++}`;
      await backend.ensureDir(TEMPLATES_DIR);
      await backend.writeNote(`${TEMPLATES_DIR}/${name}.md`, `# ${name}\n\n`);
      await loadFromBackend();
      get().openNote(`${TEMPLATES_DIR}/${name}.md`, true);
    },

    // Günlük not için hangi şablonun kullanılacağını seç (ad → Şablonlar/<ad>.md).
    setDailyTemplate: (name) => set({ dailyTemplate: name }),

    toggleFavorite: (path) =>
      set((s) => ({
        favorites: s.favorites.includes(path)
          ? s.favorites.filter((p) => p !== path)
          : [...s.favorites, path],
      })),

    // Aktif çizimi dosyaya yaz (vault'u yeniden yükleme — canvas resetlenmesin).
    saveDraw: async (json) => {
      const path = get().activeDraw;
      if (!path) return;
      await backend.writeNote(path, json);
      set((s) => ({ noteContents: { ...s.noteContents, [path]: json } }));
    },

    // Yeni klasör oluştur; ağaçta görünmesi için içine başlangıç notu koyar (boş klasör türetilen ağaçta görünmez).
    newFolder: async () => {
      const s = get();
      const base = "Yeni Klasör";
      let name = base;
      let i = 2;
      const folders = new Set(s.notes.map((n) => n.folder).filter(Boolean));
      while (folders.has(name)) name = `${base} ${i++}`;
      await backend.ensureDir(name);
      await backend.writeNote(`${name}/Adsız.md`, `# Adsız\n\n`);
      await loadFromBackend();
      get().openNote(`${name}/Adsız.md`, true);
    },

    // Bir notu yeniden adlandır (aynı klasörde). Açık sekme/aktif not referansları güncellenir.
    renameNote: async (path, newName) => {
      const s = get();
      const note = s.notes.find((n) => n.path === path);
      if (!note) return;
      const clean = newName.trim().replace(/[/\\]/g, "").replace(/\.md$/i, "");
      if (!clean) return;
      const to = note.folder ? `${note.folder}/${clean}.md` : `${clean}.md`;
      if (to === path || s.notes.some((n) => n.path === to)) return; // çakışma / değişmedi
      await backend.rename(path, to);
      set({
        openTabs: s.openTabs.map((p) => (p === path ? to : p)),
        activeNote: s.activeNote === path ? to : s.activeNote,
      });
      await loadFromBackend();
    },

    // Bir klasörü (ve altındaki tüm notları) yeniden adlandır.
    renameFolder: async (folderPath, newName) => {
      const s = get();
      const clean = newName.trim().replace(/[/\\]/g, "");
      if (!clean) return;
      const parent = folderPath.includes("/") ? folderPath.slice(0, folderPath.lastIndexOf("/")) : "";
      const to = parent ? `${parent}/${clean}` : clean;
      if (to === folderPath) return;
      const prefix = folderPath + "/";
      const affected = s.notes.filter((n) => n.path.startsWith(prefix));
      if (affected.length === 0) return;
      const map = new Map<string, string>();
      for (const n of affected) {
        const np = to + n.path.slice(folderPath.length);
        map.set(n.path, np);
        await backend.rename(n.path, np);
      }
      set({
        openTabs: s.openTabs.map((p) => map.get(p) ?? p),
        activeNote: s.activeNote ? map.get(s.activeNote) ?? s.activeNote : null,
      });
      await loadFromBackend();
    },

    addTask: async () => {
      const text = get().quickText.trim();
      if (!text) return;
      // Görevler günlük nottan ayrı: ayrı "Yapılacaklar.md" dosyasına eklenir.
      if (!(await backend.exists(TASKS_FILE))) await backend.writeNote(TASKS_FILE, "# Yapılacaklar\n");
      const content = await backend.readNote(TASKS_FILE);
      const next = insertTaskUnderHeading(content, TODO_HEADING, buildTaskLine(text, todayISO()));
      await backend.writeNote(TASKS_FILE, next);
      set({ quickText: "" });
      await loadFromBackend();
    },

    toggleTask: async (id) => {
      const sep = id.lastIndexOf(":");
      const file = id.slice(0, sep);
      const line = Number(id.slice(sep + 1));
      const content = await backend.readNote(file);
      await backend.writeNote(file, toggleTaskInContent(content, line, todayISO()));
      await loadFromBackend();
    },

    selectTask: (selectedTask) => set({ selectedTask }),

    // Görev detayını (açıklama/tarih/öncelik) dosyaya yaz.
    updateTask: async (id, patch) => {
      const s = get();
      const sep = id.lastIndexOf(":");
      const file = id.slice(0, sep);
      const line = Number(id.slice(sep + 1));
      const task = s.parsedTasks.find((p) => p.file === file && p.line === line);
      if (!task) return;
      const content = await backend.readNote(file);
      await backend.writeNote(file, applyTaskPatch(content, line, task, patch));
      await loadFromBackend();
    },

    // Görevi tek yazımda kaydet: satır yaması + (varsa) girintili not bloğu.
    saveTask: async (id, patch, notes) => {
      const s = get();
      const sep = id.lastIndexOf(":");
      const file = id.slice(0, sep);
      const line = Number(id.slice(sep + 1));
      const task = s.parsedTasks.find((p) => p.file === file && p.line === line);
      if (!task) return;
      const content = await backend.readNote(file);
      let next = applyTaskPatch(content, line, task, patch);
      if (notes !== undefined) next = setTaskNotes(next, line, notes);
      await backend.writeNote(file, next);
      await loadFromBackend();
    },

    // Görev sırasını değiştir (sürükle-bırak): sürüklenen görevi hedefin hemen ÖNÜNE koy.
    // Uygulama düzeyi manuel sıra (dosyadan bağımsız, dosyalar arası çalışır, kalıcı).
    reorderTask: async (fromId, toId) => {
      const s = get();
      const parse = (id: string) => {
        const sep = id.lastIndexOf(":");
        return { file: id.slice(0, sep), line: Number(id.slice(sep + 1)) };
      };
      const d = parse(fromId);
      const tg = parse(toId);
      const dTask = s.parsedTasks.find((p) => p.file === d.file && p.line === d.line);
      const tTask = s.parsedTasks.find((p) => p.file === tg.file && p.line === tg.line);
      if (!dTask || !tTask) return;
      const targetVal = taskSortVal(tTask, s.taskOrder);
      const taskOrder = { ...s.taskOrder, [taskOrderKey(dTask.file, dTask.description)]: targetVal - 0.5 };
      const today = todayISO();
      const { groups, unplannedTasks } = groupTasks(s.parsedTasks, today, taskOrder);
      set({ taskOrder, groups, unplannedTasks });
    },

    // — GitHub —
    ghBeginAuth: async () => {
      set({ ghStatus: null });
      const d = await gh.deviceStart();
      set({ ghDevice: d });
      gh.openUrl(d.verification_uri).catch(() => {});
    },
    ghCancelAuth: () => set({ ghDevice: null }),
    ghPoll: async () => {
      const d = get().ghDevice;
      if (!d) return "no_device";
      const res = await gh.devicePoll(d.device_code);
      if (res.status === "ok" && res.access_token) {
        const token = res.access_token;
        const user = await gh.user(token);
        set({ ghToken: token, ghUser: user, ghDevice: null, ghStatus: null });
        return "ok";
      }
      return res.status;
    },
    ghDisconnect: () => set({ ghToken: null, ghUser: null, ghRepo: null, ghDevice: null, ghStatus: null }),
    ghLoadRepos: async () => {
      const token = get().ghToken;
      if (!token) return [];
      return gh.listRepos(token);
    },
    ghCreateRepo: async (name, priv_) => {
      const token = get().ghToken;
      if (!token) return;
      const repo = await gh.createRepo(token, name, priv_);
      const s = get();
      if (s.vaultPath) get().setVaultRepo(s.vaultPath, repo);
      else set({ ghRepo: repo });
    },
    // Aktif kasaya repo ata (kasaya bağlı saklanır); kasa yoksa global ghRepo.
    ghSelectRepo: (repo) => {
      const s = get();
      if (s.vaultPath) get().setVaultRepo(s.vaultPath, repo);
      else set({ ghRepo: repo });
    },
    ghSync: async () => {
      const s = get();
      if (!s.ghToken || !s.ghRepo) {
        set({ ghStatus: "Bağlantı ve depo gerekli" });
        return;
      }
      if (!s.vaultPath) {
        set({ ghStatus: "needVault" });
        return;
      }
      set({ ghSyncing: true, ghStatus: null });
      try {
        const login = s.ghUser?.login ?? "loomen";
        const res = await gh.sync(
          s.vaultPath,
          s.ghRepo.clone_url,
          s.ghToken,
          login,
          `${login}@users.noreply.github.com`
        );
        set({
          ghSyncing: false,
          ghLastSync: new Date().toISOString(),
          ghStatus: res.pulled ? "pulledPushed" : "pushed",
        });
        await get().reloadVault();
      } catch (e) {
        set({ ghSyncing: false, ghStatus: String(e) });
      }
    },
    ghSetAutoSync: (ghAutoSync) => set({ ghAutoSync }),
      };
    },
    {
      name: "loomen.settings",
      // Rehydrate sonrası: kayıtlı kasayı backend olarak yeniden aç (HMR/yeniden başlatmada
      // vaultPath kaybolup "Kasa seç"e düşmesin).
      onRehydrateStorage: () => (state) => {
        if (state?.vaultPath && isTauri()) {
          queueMicrotask(() => void useAppStore.getState().reopenVault(state.vaultPath!));
        }
      },
      // Yalnızca kullanıcı tercihlerini + seçili kasa yolunu kalıcı yap (vault verisi türetilir).
      partialize: (s) => ({
        theme: s.theme,
        lang: s.lang,
        accent: s.accent,
        editorSettings: s.editorSettings,
        dailyTemplate: s.dailyTemplate,
        vaultPath: s.vaultPath,
        vaults: s.vaults,
        tabsByVault: s.tabsByVault,
        leftCollapsed: s.leftCollapsed,
        rightCollapsed: s.rightCollapsed,
        backlinksCollapsed: s.backlinksCollapsed,
        pomo: s.pomo,
        pomoSound: s.pomoSound,
        pomoHistory: s.pomoHistory,
        taskOrder: s.taskOrder,
        favorites: s.favorites,
        ghToken: s.ghToken,
        ghUser: s.ghUser,
        ghRepo: s.ghRepo,
        ghLastSync: s.ghLastSync,
        ghAutoSync: s.ghAutoSync,
      }),
    }
  )
);

/** "Bugüne Odaklan" sayaçları — gerçek vault verisinden. */
export function useFocusCounts(): FocusCounts {
  return useAppStore((s) => s.counts);
}

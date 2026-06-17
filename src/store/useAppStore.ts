import { create } from "zustand";
import type { TaskGroup } from "../data/sampleVault";
import type { ParsedTask, VaultBackend, VaultNote } from "../core/vault/types";
import {
  createSampleBackend,
  createTauriBackend,
  isTauri,
  pickVaultFolder,
  loadVaultData,
  todayISO,
  todayDailyPath,
  watchVaultRoot,
  ensureDailyNote,
} from "../core/vault";
import { groupTasks, focusCounts } from "../core/vault/grouping";
import { toggleTaskInContent, buildTaskLine, appendTaskToContent } from "../core/markdown/taskParser";

export type Theme = "light" | "dark";
export type Screen = "planner" | "editor" | "graph" | "settings";
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
  quickText: string;
  selectedDay: number;

  // Vault
  vaultPath: string | null; // null = tarayıcı/sample modu
  notes: VaultNote[];
  groups: TaskGroup[];
  counts: FocusCounts;
  parsedTasks: ParsedTask[];

  // Pomodoro
  pomo: PomodoroSettings;
  pomoRemaining: number;
  pomoRunning: boolean;
  pomoRound: number;

  // UI aksiyonları
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setScreen: (s: Screen) => void;
  setLayout: (l: PlannerLayout) => void;
  setLang: (l: Lang) => void;
  setEditorTab: (t: EditorTab) => void;
  openNote: (source: string) => void;
  setAccent: (hex: string) => void;
  toggleEditorSetting: (key: keyof EditorSettings) => void;
  toggleArabic: () => void;
  setQuick: (v: string) => void;
  selectDay: (n: number) => void;
  togglePomo: () => void;
  resetPomo: () => void;
  tickPomo: () => void;

  // Vault aksiyonları (dosyaya yazar)
  bootstrap: () => Promise<void>;
  openVault: () => Promise<void>;
  reloadVault: () => Promise<void>;
  addTask: () => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
}

const FOCUS_MIN = 25;
const VAULT_KEY = "loomen.vaultPath";

// Modül seviyesi: serileştirilemeyen backend + watcher (store dışında tutulur).
let backend: VaultBackend = createSampleBackend();
let unwatch: (() => void) | null = null;

export const useAppStore = create<AppState>((set, get) => {
  /** Backend'den yükle, gruplandır, state'e yaz. */
  async function loadFromBackend() {
    const { tasks, notes } = await loadVaultData(backend);
    const today = todayISO();
    const { groups } = groupTasks(tasks, today);
    const c = focusCounts(tasks, today);
    set({
      parsedTasks: tasks,
      notes,
      groups,
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
    quickText: "",
    selectedDay: Number(todayISO().slice(8, 10)),

    vaultPath: null,
    notes: [],
    groups: [],
    counts: { yapilacak: 0, geciken: 0, planlanmamis: 0 },
    parsedTasks: [],

    pomo: { focusMin: FOCUS_MIN, shortBreak: 5, longBreak: 15, rounds: 4 },
    pomoRemaining: FOCUS_MIN * 60,
    pomoRunning: false,
    pomoRound: 3,

    toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
    setTheme: (theme) => set({ theme }),
    setScreen: (screen) => set({ screen }),
    setLayout: (layout) => set({ layout }),
    setLang: (lang) => set({ lang }),
    setEditorTab: (editorTab) => set({ editorTab }),
    openNote: (source) => set({ screen: "editor", editorTab: noteToTab(source) }),
    setAccent: (accent) => set({ accent }),
    toggleEditorSetting: (key) =>
      set((s) => ({ editorSettings: { ...s.editorSettings, [key]: !s.editorSettings[key] } })),
    toggleArabic: () => set((s) => ({ lang: s.lang === "ar" ? "tr" : "ar" })),
    setQuick: (quickText) => set({ quickText }),
    selectDay: (selectedDay) => set({ selectedDay }),

    togglePomo: () => set((s) => ({ pomoRunning: !s.pomoRunning })),
    resetPomo: () => set((s) => ({ pomoRunning: false, pomoRemaining: s.pomo.focusMin * 60 })),
    tickPomo: () => {
      const { pomoRemaining } = get();
      if (pomoRemaining <= 1) set({ pomoRemaining: 0, pomoRunning: false });
      else set({ pomoRemaining: pomoRemaining - 1 });
    },

    // İlk yükleme: önce sample, sonra (Tauri'de) kayıtlı kasa varsa onu yükle.
    bootstrap: async () => {
      await loadFromBackend();
      if (isTauri()) {
        const saved = localStorage.getItem(VAULT_KEY);
        if (saved) {
          try {
            backend = createTauriBackend(saved);
            await loadFromBackend();
            set({ vaultPath: saved });
            unwatch?.();
            unwatch = await watchVaultRoot(saved, () => get().reloadVault());
          } catch {
            // kasa açılamadı (taşınmış/silinmiş): sample'a düş
            backend = createSampleBackend();
            await loadFromBackend();
            set({ vaultPath: null });
          }
        }
      }
    },

    openVault: async () => {
      if (!isTauri()) return; // tarayıcıda klasör seçici yok
      const path = await pickVaultFolder();
      if (!path) return;
      backend = createTauriBackend(path);
      await loadFromBackend();
      localStorage.setItem(VAULT_KEY, path);
      set({ vaultPath: path });
      unwatch?.();
      unwatch = await watchVaultRoot(path, () => get().reloadVault());
    },

    reloadVault: async () => {
      await loadFromBackend();
    },

    addTask: async () => {
      const text = get().quickText.trim();
      if (!text) return;
      const target = todayDailyPath();
      await ensureDailyNote(backend, target);
      const content = await backend.readNote(target);
      await backend.writeNote(target, appendTaskToContent(content, buildTaskLine(text, todayISO())));
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
  };
});

/** "Bugüne Odaklan" sayaçları — gerçek vault verisinden. */
export function useFocusCounts(): FocusCounts {
  return useAppStore((s) => s.counts);
}

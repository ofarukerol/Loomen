import { create } from "zustand";
import { persist } from "zustand/middleware";
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
  TODO_HEADING,
} from "../core/vault";
import { groupTasks, focusCounts } from "../core/vault/grouping";
import { toggleTaskInContent, buildTaskLine, insertTaskUnderHeading } from "../core/markdown/taskParser";

export type Theme = "light" | "dark";
export type Screen = "planner" | "editor" | "graph" | "reports" | "settings";
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
  counts: FocusCounts;
  parsedTasks: ParsedTask[];
  noteContents: Record<string, string>;

  // Editör
  openTabs: string[]; // açık not yolları
  activeNote: string | null; // aktif not yolu
  editing: boolean;
  draft: string;
  backlinksCollapsed: boolean;

  // Pomodoro
  pomo: PomodoroSettings;
  pomoRemaining: number;
  pomoRunning: boolean;
  pomoPhase: PomoPhase;
  pomoCompleted: number; // mevcut turda tamamlanan odak seansı (0..rounds)
  pomoHistory: Record<string, number>; // ISO tarih → tamamlanan odak seansı (rapor için, kalıcı)

  // UI aksiyonları
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setScreen: (s: Screen) => void;
  setLayout: (l: PlannerLayout) => void;
  setLang: (l: Lang) => void;
  setEditorTab: (t: EditorTab) => void;
  openNote: (nameOrPath: string) => void;
  setActiveTab: (path: string) => void;
  closeTab: (path: string) => void;
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
  createTodayNote: () => Promise<void>;
  todayNotePath: () => string;
  setQuick: (v: string) => void;
  selectDay: (n: number) => void;
  togglePomo: () => void;
  resetPomo: () => void;
  tickPomo: () => void;
  setPomo: (patch: Partial<PomodoroSettings>) => void;

  // Vault aksiyonları (dosyaya yazar)
  bootstrap: () => Promise<void>;
  openVault: () => Promise<void>;
  reloadVault: () => Promise<void>;
  addTask: () => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
}

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
    const { groups } = groupTasks(tasks, today);
    const c = focusCounts(tasks, today);
    set({
      parsedTasks: tasks,
      notes,
      noteContents: contents,
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

    leftCollapsed: false,
    rightCollapsed: false,
    focusExpanded: false,

    vaultPath: null,
    notes: [],
    groups: [],
    counts: { yapilacak: 0, geciken: 0, planlanmamis: 0 },
    parsedTasks: [],
    noteContents: {},

    openTabs: [],
    activeNote: null,
    editing: false,
    draft: "",
    backlinksCollapsed: false,

    pomo: { focusMin: FOCUS_MIN, shortBreak: 5, longBreak: 15, rounds: 4 },
    pomoRemaining: FOCUS_MIN * 60,
    pomoRunning: false,
    pomoPhase: "work",
    pomoCompleted: 0,
    pomoHistory: {},

    toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
    setTheme: (theme) => set({ theme }),
    setScreen: (screen) => set({ screen }),
    setLayout: (layout) => set({ layout }),
    setLang: (lang) => set({ lang }),
    setEditorTab: (editorTab) => set({ editorTab }),
    openNote: (nameOrPath) => {
      const s = get();
      // Yol mu yoksa ad mı? Önce yol, sonra ada göre çöz.
      const byPath = s.notes.find((n) => n.path === nameOrPath);
      const byName = s.notes.find((n) => n.name === nameOrPath);
      const note = byPath ?? byName;
      if (!note) return; // eksik/kırık link
      const openTabs = s.openTabs.includes(note.path) ? s.openTabs : [...s.openTabs, note.path];
      set({
        screen: "editor",
        activeNote: note.path,
        openTabs,
        editing: false,
        draft: s.noteContents[note.path] ?? "",
      });
    },
    setActiveTab: (path) =>
      set((s) => ({ activeNote: path, editing: false, draft: s.noteContents[path] ?? "" })),
    closeTab: (path) =>
      set((s) => {
        const openTabs = s.openTabs.filter((p) => p !== path);
        const activeNote =
          s.activeNote === path ? openTabs[openTabs.length - 1] ?? null : s.activeNote;
        return { openTabs, activeNote, draft: activeNote ? s.noteContents[activeNote] ?? "" : "" };
      }),
    setDraft: (draft) => set({ draft }),
    toggleEditing: () =>
      set((s) => ({ editing: !s.editing, draft: s.noteContents[s.activeNote ?? ""] ?? s.draft })),
    toggleBacklinks: () => set((s) => ({ backlinksCollapsed: !s.backlinksCollapsed })),
    saveNote: async () => {
      const s = get();
      if (!s.activeNote) return;
      await backend.writeNote(s.activeNote, s.draft);
      await loadFromBackend();
      set({ editing: false });
    },
    setAccent: (accent) => set({ accent }),
    toggleEditorSetting: (key) =>
      set((s) => ({ editorSettings: { ...s.editorSettings, [key]: !s.editorSettings[key] } })),
    toggleArabic: () => set((s) => ({ lang: s.lang === "ar" ? "tr" : "ar" })),
    toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
    toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
    setFocusExpanded: (focusExpanded) => set({ focusExpanded }),
    todayNotePath: () => todayDailyPath(),
    // "Günün Notu" — planner'a geç, bugünün notu yoksa şablonla oluştur.
    goToDayNote: async () => {
      set({ screen: "planner", focusExpanded: false });
      await ensureDailyNote(backend, todayDailyPath());
      await loadFromBackend();
    },
    createTodayNote: async () => {
      await ensureDailyNote(backend, todayDailyPath());
      await loadFromBackend();
    },
    setQuick: (quickText) => set({ quickText }),
    selectDay: (selectedDay) => set({ selectedDay }),

    togglePomo: () => set((s) => ({ pomoRunning: !s.pomoRunning })),
    resetPomo: () =>
      set((s) => ({ pomoRunning: false, pomoPhase: "work", pomoRemaining: s.pomo.focusMin * 60 })),
    tickPomo: () => {
      const s = get();
      if (s.pomoRemaining > 1) {
        set({ pomoRemaining: s.pomoRemaining - 1 });
        return;
      }
      // Faz bitti → bir sonraki faza geç (profesyonel döngü: odak → mola → odak…).
      const dur = (p: PomoPhase) =>
        (p === "work" ? s.pomo.focusMin : p === "short" ? s.pomo.shortBreak : s.pomo.longBreak) * 60;
      if (s.pomoPhase === "work") {
        const completed = s.pomoCompleted + 1;
        const next: PomoPhase = completed % s.pomo.rounds === 0 ? "long" : "short";
        // Tamamlanan odak seansını rapor geçmişine işle (bugünün ISO tarihi).
        const day = todayISO();
        const pomoHistory = { ...s.pomoHistory, [day]: (s.pomoHistory[day] ?? 0) + 1 };
        set({ pomoPhase: next, pomoCompleted: completed, pomoRemaining: dur(next), pomoRunning: false, pomoHistory });
      } else {
        // Mola bitti → odağa dön. Uzun moladan sonra tur sayacını sıfırla.
        const completed = s.pomoPhase === "long" ? 0 : s.pomoCompleted;
        set({ pomoPhase: "work", pomoCompleted: completed, pomoRemaining: dur("work"), pomoRunning: false });
      }
    },
    setPomo: (patch) =>
      set((s) => {
        const pomo = { ...s.pomo, ...patch };
        // Çalışmıyorken odak süresi değişirse kalan süreyi senkronla.
        const sync = !s.pomoRunning && s.pomoPhase === "work" && patch.focusMin != null;
        return { pomo, ...(sync ? { pomoRemaining: pomo.focusMin * 60 } : {}) };
      }),

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
      };
    },
    {
      name: "loomen.settings",
      // Yalnızca kullanıcı tercihlerini kalıcı yap (vault verisi her açılışta yeniden türetilir).
      partialize: (s) => ({
        theme: s.theme,
        lang: s.lang,
        accent: s.accent,
        editorSettings: s.editorSettings,
        leftCollapsed: s.leftCollapsed,
        rightCollapsed: s.rightCollapsed,
        backlinksCollapsed: s.backlinksCollapsed,
        pomo: s.pomo,
        pomoHistory: s.pomoHistory,
      }),
    }
  )
);

/** "Bugüne Odaklan" sayaçları — gerçek vault verisinden. */
export function useFocusCounts(): FocusCounts {
  return useAppStore((s) => s.counts);
}

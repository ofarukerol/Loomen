import { create } from "zustand";
import { sampleGroups, type TaskGroup } from "../data/sampleVault";

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

/** Kaynak not adını editör sekmesine eşler (görev/gezgin/wiki-link açılışı için). */
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

  groups: TaskGroup[];

  // Pomodoro
  pomo: PomodoroSettings;
  pomoRemaining: number; // saniye
  pomoRunning: boolean;
  pomoRound: number; // tamamlanan tur

  // aksiyonlar
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
  addTask: () => void;
  toggleTask: (id: string) => void;
  selectDay: (n: number) => void;
  togglePomo: () => void;
  resetPomo: () => void;
  tickPomo: () => void;
}

const FOCUS_MIN = 25;

export const useAppStore = create<AppState>((set, get) => ({
  theme: "light",
  screen: "planner",
  layout: "timeline",
  lang: "tr",
  editorTab: "daily",
  accent: ACCENTS[0],
  editorSettings: { livePreview: true, lineNumbers: false, spellCheck: true },
  quickText: "",
  selectedDay: 13,

  groups: sampleGroups,

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
  // Ribbon'daki "ع" hızlı geçişi: Arapça (RTL) ↔ Türkçe
  toggleArabic: () => set((s) => ({ lang: s.lang === "ar" ? "tr" : "ar" })),
  setQuick: (quickText) => set({ quickText }),

  addTask: () =>
    set((s) => {
      const v = s.quickText.trim();
      if (!v) return s;
      return {
        quickText: "",
        groups: s.groups.map((g) =>
          g.kind === "today"
            ? {
                ...g,
                tasks: [
                  {
                    id: "q" + Date.now(),
                    text: v,
                    done: false,
                    overdue: false,
                    rel: "bugün",
                    source: "2026-06-13-Cumartesi",
                    tag: "Planlanmamış",
                    pomos: 0,
                  },
                  ...g.tasks,
                ],
              }
            : g
        ),
      };
    }),

  toggleTask: (id) =>
    set((s) => ({
      groups: s.groups.map((g) => ({
        ...g,
        tasks: g.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      })),
    })),

  selectDay: (selectedDay) => set({ selectedDay }),

  togglePomo: () => set((s) => ({ pomoRunning: !s.pomoRunning })),
  resetPomo: () => set((s) => ({ pomoRunning: false, pomoRemaining: s.pomo.focusMin * 60 })),
  tickPomo: () => {
    const { pomoRemaining } = get();
    if (pomoRemaining <= 1) {
      set({ pomoRemaining: 0, pomoRunning: false });
    } else {
      set({ pomoRemaining: pomoRemaining - 1 });
    }
  },
}));

/** Türetilmiş sayaçlar — "Bugüne Odaklan" kartları (bkz docs 06 §4). */
export function useFocusCounts() {
  const groups = useAppStore((s) => s.groups);
  const openOf = (kinds: TaskGroup["kind"][]) =>
    groups
      .filter((g) => kinds.includes(g.kind))
      .flatMap((g) => g.tasks)
      .filter((t) => !t.done).length;

  // Prototiple aynı: küçük vault offset'leri (gerçek vault'ta tam sayım gelir)
  return {
    yapilacak: openOf(["today", "upcoming"]) + 2,
    geciken: openOf(["overdue"]) + 20,
    planlanmamis: 20,
  };
}

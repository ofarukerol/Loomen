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
import { gh, type DeviceStart, type GhUser, type GhRepo } from "../core/github";
import { toggleTaskInContent, buildTaskLine, insertTaskUnderHeading, applyTaskPatch, type TaskPatch } from "../core/markdown/taskParser";

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
  newNote: (folder?: string) => Promise<void>;
  newFolder: () => Promise<void>;
  newDraw: () => Promise<void>;
  saveDraw: (json: string) => Promise<void>;
  toggleFavorite: (path: string) => void;
  renameNote: (path: string, newName: string) => Promise<void>;
  renameFolder: (folderPath: string, newName: string) => Promise<void>;
  addTask: () => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  selectTask: (id: string | null) => void;
  updateTask: (id: string, patch: TaskPatch) => Promise<void>;

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
    openNote: (nameOrPath, edit = true) => {
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
      const openTabs = s.openTabs.includes(note.path) ? s.openTabs : [...s.openTabs, note.path];
      set({
        screen: "editor",
        activeNote: note.path,
        openTabs,
        editing: edit, // edit=true → doğrudan düzenleme modunda aç (önizlemeye uğramadan)
        draft: s.noteContents[note.path] ?? "",
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
      await loadFromBackend();
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
      await ensureDailyNote(backend, todayDailyPath());
      await loadFromBackend();
      get().openNote(todayDailyPath());
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
      set({ ghRepo: repo });
    },
    ghSelectRepo: (repo) => set({ ghRepo: repo }),
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
